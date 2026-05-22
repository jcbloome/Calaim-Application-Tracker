import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { createHash } from "node:crypto";
import { Resend } from "resend";

const caspioWebhookSecret = defineSecret("CASPIO_WEBHOOK_SECRET");
const resendApiKey = defineSecret("RESEND_API_KEY");
const USERSREG_CACHE_COLLECTION = "caspio_usersregistration_cache";
const WEBHOOK_EVENTS_COLLECTION = "caspio-webhook-events";
const WEBHOOK_LOGS_COLLECTION = "webhook-logs";
const SYSTEM_SETTINGS_COLLECTION = "system_settings";
const WELCOME_SETTINGS_DOC_ID = "welcoming_user_email";
const DEDUPE_RETRY_WINDOW_MS = 15 * 1000;

const normalizeCaspioBlankValue = (value: any): any => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    return value
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/\u00a0/g, " ")
      .trim();
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeCaspioBlankValue(entry));
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    Object.entries(value as Record<string, any>).forEach(([k, v]) => {
      out[k] = normalizeCaspioBlankValue(v);
    });
    return out;
  }
  return value;
};

const verifyWebhookSecret = (requestBody: any, headerValue: string | undefined) => {
  let expectedSecret = "";
  try {
    expectedSecret = String(caspioWebhookSecret.value() || "").trim();
  } catch {
    expectedSecret = String(process.env.CASPIO_WEBHOOK_SECRET || "").trim();
  }
  if (!expectedSecret) return { ok: true, reason: "secret_not_configured" };

  const payloadSecret = String(requestBody?.secret || requestBody?.Secret || "").trim();
  const headerSecret = String(headerValue || "").trim();
  const receivedSecret = payloadSecret || headerSecret;
  if (!receivedSecret) return { ok: false, reason: "missing_secret" };
  if (receivedSecret !== expectedSecret) return { ok: false, reason: "invalid_secret" };
  return { ok: true, reason: "secret_valid" };
};

const getOperation = (payload: Record<string, any>) => {
  const direct = String(payload?.operation || "").trim();
  if (direct) return direct.toUpperCase();
  const eventType = String(payload?.event_type || payload?.eventType || "").trim().toLowerCase();
  if (eventType.includes("insert")) return "INSERT";
  if (eventType.includes("update")) return "UPDATE";
  if (eventType.includes("delete")) return "DELETE";
  return "";
};

const getTableName = (payload: Record<string, any>) =>
  String(payload?.table_name || payload?.tableName || payload?.object_name || payload?.objectName || "").trim();

const getRecordData = (payload: Record<string, any>) => {
  if (payload?.record_data && typeof payload.record_data === "object") return payload.record_data;
  if (payload?.record && typeof payload.record === "object") return payload.record;
  if (payload?.newRecord && typeof payload.newRecord === "object") return payload.newRecord;
  if (payload?.data && typeof payload.data === "object") return payload.data;
  const metaKeys = new Set([
    "secret",
    "Secret",
    "table_name",
    "tableName",
    "object_name",
    "objectName",
    "operation",
    "event_type",
    "eventType",
    "changed_fields",
    "changedFields",
    "event_id",
    "Event_ID",
  ]);
  const out: Record<string, any> = {};
  Object.entries(payload || {}).forEach(([k, v]) => {
    if (!metaKeys.has(k)) out[k] = v;
  });
  return out;
};

const asChangedFields = (changedFields: unknown): string[] => {
  if (Array.isArray(changedFields)) return changedFields.map((v) => String(v || "").trim()).filter(Boolean);
  const raw = String(changedFields || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v || "").trim()).filter(Boolean);
  } catch {
    // ignore
  }
  return raw.split(/[,\n|;]/g).map((v) => v.trim()).filter(Boolean);
};

const toDocId = (recordData: Record<string, any>) => {
  const preferred = String(recordData?.User_ID || recordData?.Table_ID || recordData?.table_ID || recordData?.Email || "").trim();
  return `userreg_${preferred.replace(/[^\w.\-@]+/g, "_").slice(0, 240)}`;
};

const buildEventIdentity = (
  payload: Record<string, any>,
  recordData: Record<string, any>
): { eventId: string; hasExplicitEventId: boolean; explicitEventId: string } => {
  const explicitEventId = String(payload?.event_id || payload?.Event_ID || "").trim();
  const hashBase = JSON.stringify({
    tableName: getTableName(payload),
    operation: getOperation(payload),
    changedFields: asChangedFields(payload?.changed_fields ?? payload?.changedFields),
    userId: String(recordData?.User_ID || "").trim(),
    email: String(recordData?.Email || "").trim().toLowerCase(),
    timestamp: String(recordData?.Timestamp || recordData?.Create_Date || "").trim(),
    recordData,
  });
  if (explicitEventId) {
    const dedupeId = createHash("sha256")
      .update(`${explicitEventId.slice(0, 200)}::${hashBase}`)
      .digest("hex");
    return { eventId: dedupeId, hasExplicitEventId: true, explicitEventId: explicitEventId.slice(0, 200) };
  }
  return { eventId: createHash("sha256").update(hashBase).digest("hex"), hasExplicitEventId: false, explicitEventId: "" };
};

const hasWebhookTestMarker = (...values: Array<unknown>) =>
  values.some((value) => String(value || "").toUpperCase().includes("WEBHOOK_TEST"));

type WelcomeEmailSettings = {
  enabled: boolean;
  subjectTemplate: string;
  bodyTemplate: string;
  portalUrl: string;
  portalHintWord: string;
  loginRoleLabel: string;
  rcfeInstruction: string;
  footerText: string;
  fromName: string;
  fromEmail: string;
};
const LEGACY_GREETING_LINE = "Hello {{firstName}},";
const SUPPORT_LINE = "If you have questions, please email us at calaim@carehomefinders.com.";
const LEGACY_RCFE_PREFIX = "For RCFE billers:";
const LEGACY_RCFE_SINGLE_LINE = "For RCFE billers: after logging in, select \"Add CalAIM RCFE\" to register your RCFE(s).";
const RCFE_INSTRUCTION_BLOCK = [
  "For RCFE billers submitting Health Net claims: after logging in, select \"Add CalAIM RCFE\" to register your RCFE(s).",
  "To register RCFEs, you will need an NPI number.",
  "NPPES login: https://nppes.cms.hhs.gov/login",
  "RCFEs should use Taxonomy Code: 310400000X",
].join("\n");

const DEFAULT_WELCOME_SETTINGS: WelcomeEmailSettings = {
  enabled: true,
  subjectTemplate: "Welcome to Connections CalAIM Provider Portal",
  bodyTemplate: [
    "Welcome to Connections CalAIM.",
    "",
    "Your account is now active. Please go to {{portalUrl}} and open the CalAIM / CalAIM Provider Portal.",
    "",
    "Use the word \"{{portalHintWord}}\" to access the site, then log in as {{loginRoleLabel}}.",
    "",
    "{{rcfeInstruction}}",
    "",
    SUPPORT_LINE,
    "",
    "Thank you,",
    "Connections Care Home Consultants",
  ].join("\n"),
  portalUrl: "https://carehomefinders.com",
  portalHintWord: "bluesky",
  loginRoleLabel: "Provider",
  rcfeInstruction: RCFE_INSTRUCTION_BLOCK,
  footerText: "This is an automated welcome email from Connections CalAIM.",
  fromName: "Connections CalAIM",
  fromEmail: "noreply@carehomefinders.com",
};
const LEGACY_SUBJECTS = new Set([
  "Welcome to CalAIM Provider Portal - {{fullName}}",
  "Welcome to CalAIM Provider Portal",
]);

const normalizeSubjectTemplate = (value: unknown): string => {
  const subject = String(value || "").trim();
  if (!subject || LEGACY_SUBJECTS.has(subject)) return DEFAULT_WELCOME_SETTINGS.subjectTemplate;
  return subject;
};
const normalizeBodyTemplate = (value: unknown): string => {
  let body = String(value || DEFAULT_WELCOME_SETTINGS.bodyTemplate);
  body = body
    .split("If you need help, please reply to this email and our team will assist you.").join(SUPPORT_LINE)
    .split("If you need help, please email us at info@carehomefinders.com.").join(SUPPORT_LINE)
    .split("For RCFE billers: after logging in, select \"Add CalAIM RCFE\" to register your RCFE(s).").join("{{rcfeInstruction}}");
  let lines = body.split("\n").map((line) => {
    const trimmed = String(line || "").trim();
    if (trimmed.startsWith(LEGACY_RCFE_PREFIX)) return "{{rcfeInstruction}}";
    return line;
  });
  if (String(lines[0] || "").trim() === LEGACY_GREETING_LINE) {
    const next = lines.slice(1);
    lines = String(next[0] || "").trim() === "" ? next.slice(1) : next;
  }
  let normalized = lines.join("\n").trim() || DEFAULT_WELCOME_SETTINGS.bodyTemplate;
  if (!normalized.includes("{{rcfeInstruction}}") && !normalized.includes("Taxonomy Code: 310400000X")) {
    normalized = `${normalized}\n\n{{rcfeInstruction}}`;
  }
  return normalized;
};
const normalizeRcfeInstruction = (value: unknown): string => {
  const rcfeInstruction = String(value || "").trim();
  if (!rcfeInstruction || rcfeInstruction === LEGACY_RCFE_SINGLE_LINE) {
    return RCFE_INSTRUCTION_BLOCK;
  }
  return rcfeInstruction;
};

const normalizeBool = (value: unknown): boolean => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "y", "on", "checked", "active"].includes(normalized);
};

const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const titleCase = (value: string): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getUserName = (recordData: Record<string, any>) => {
  const first = String(recordData?.First_Name || recordData?.FirstName || "").trim();
  const last = String(recordData?.Last_Name || recordData?.LastName || "").trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return titleCase(combined);
  const fallback = String(recordData?.Full_Name_UserNames || recordData?.User_Last_First || "").trim();
  return fallback ? titleCase(fallback) : "Provider";
};

const getFirstName = (fullName: string) => {
  const token = String(fullName || "").trim().split(/\s+/)[0];
  if (!token) return "there";
  return titleCase(token);
};

const renderTemplate = (template: string, vars: Record<string, string>) => {
  let rendered = String(template || "");
  Object.entries(vars).forEach(([key, value]) => {
    rendered = rendered.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), String(value || ""));
  });
  return rendered;
};

const htmlEscape = (value: string) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const textToHtml = (bodyText: string, footerText: string) => {
  const lines = String(bodyText || "").split("\n");
  const htmlLines = lines.map((rawLine) => {
    const line = String(rawLine || "").trim();
    if (!line) return '<div style="height: 8px;"></div>';
    if (line.startsWith("- ")) {
      return `<li style="margin: 6px 0;">${htmlEscape(line.slice(2).trim())}</li>`;
    }
    return `<p style="margin: 0 0 10px;">${htmlEscape(line)}</p>`;
  });
  const merged = htmlLines.join("");
  const withListsClosed = merged.replace(/(<li[^>]*>.*?<\/li>)+/g, (liBlock) => {
    return `<ul style="margin: 8px 0 12px 20px; padding: 0;">${liBlock}</ul>`;
  });
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.6; max-width: 640px;">
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 18px; margin-bottom: 16px;">
        <h2 style="margin: 0; color: #1d4ed8;">Welcome to Connections CalAIM Provider Portal</h2>
      </div>
      ${withListsClosed}
      <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="margin: 0; font-size: 12px; color: #64748b;">${htmlEscape(footerText)}</p>
    </div>
  `;
};

const getWelcomeEmailSettings = async (db: FirebaseFirestore.Firestore): Promise<WelcomeEmailSettings> => {
  const snap = await db.collection(SYSTEM_SETTINGS_COLLECTION).doc(WELCOME_SETTINGS_DOC_ID).get();
  const data = (snap.exists ? snap.data() : null) || {};
  return {
    enabled: data.enabled !== false,
    subjectTemplate: normalizeSubjectTemplate(data.subjectTemplate),
    bodyTemplate: normalizeBodyTemplate(data.bodyTemplate),
    portalUrl: String(data.portalUrl || DEFAULT_WELCOME_SETTINGS.portalUrl),
    portalHintWord: String(data.portalHintWord || DEFAULT_WELCOME_SETTINGS.portalHintWord),
    loginRoleLabel: String(data.loginRoleLabel || DEFAULT_WELCOME_SETTINGS.loginRoleLabel),
    rcfeInstruction: normalizeRcfeInstruction(data.rcfeInstruction),
    footerText: String(data.footerText || DEFAULT_WELCOME_SETTINGS.footerText),
    fromName: String(data.fromName || DEFAULT_WELCOME_SETTINGS.fromName),
    fromEmail: String(data.fromEmail || DEFAULT_WELCOME_SETTINGS.fromEmail),
  };
};

const shouldSendWelcomeEmail = (
  operation: string,
  recordData: Record<string, any>,
  previousCacheData: Record<string, any> | null
) => {
  const currentActive = normalizeBool(recordData?.Account_Activation);
  const previousActive = normalizeBool(previousCacheData?.Account_Activation);
  if (!currentActive) return false;
  if (operation === "INSERT") return true;
  return !previousActive;
};

export const caspioUsersRegistrationWebhook = onRequest(
  {
    cors: true,
    secrets: [caspioWebhookSecret, resendApiKey],
  },
  async (req, res) => {
    const db = admin.firestore();
    let eventRef: FirebaseFirestore.DocumentReference | null = null;

    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const payload = normalizeCaspioBlankValue(req.body || {});
      const secretCheck = verifyWebhookSecret(payload, req.headers["x-caspio-webhook-secret"] as string | undefined);
      if (!secretCheck.ok) {
        res.status(401).json({ error: "Unauthorized webhook" });
        return;
      }

      const tableName = getTableName(payload);
      const normalizedTableName = tableName.toLowerCase().replace(/_+/g, "_");
      const expected = "connect_tbl_userregistration".toLowerCase().replace(/_+/g, "_");
      const expectedLegacy = "connect_tbl_usersregistration".toLowerCase().replace(/_+/g, "_");
      if (tableName && normalizedTableName !== expected) {
        if (normalizedTableName !== expectedLegacy) {
          res.status(200).json({ message: "Webhook received but ignored", tableName });
          return;
        }
      }

      const operation = getOperation(payload);
      const recordData = normalizeCaspioBlankValue(getRecordData(payload));
      const changedFields = asChangedFields(payload?.changed_fields ?? payload?.changedFields ?? payload?.object_fields);
      if (hasWebhookTestMarker(recordData?.User_ID, recordData?.Email, recordData?.Table_ID, recordData?.table_ID)) {
        res.status(200).json({ message: "Webhook test marker ignored" });
        return;
      }
      const docId = toDocId(recordData);
      if (!docId || docId === "userreg_") {
        res.status(200).json({ message: "Missing user registration identifier; webhook ignored" });
        return;
      }

      const { eventId: baseEventId, hasExplicitEventId, explicitEventId } = buildEventIdentity(payload, recordData);
      let eventId = hasExplicitEventId ? baseEventId : `${baseEventId}:${Date.now()}`;
      eventRef = db.collection(WEBHOOK_EVENTS_COLLECTION).doc(eventId);
      try {
        await eventRef.create({
          source: "caspio",
          table: "connect_tbl_userregistration",
          operation,
          userId: String(recordData?.User_ID || "").trim() || null,
          email: String(recordData?.Email || "").trim().toLowerCase() || null,
          docId,
          changedFields,
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          status: "processing",
          hasExplicitEventId,
          explicitEventId: explicitEventId || null,
        });
      } catch (e: any) {
        if (hasExplicitEventId && (e?.code === 6 || String(e?.message || "").toLowerCase().includes("already exists"))) {
          const existingEventSnap = await eventRef.get();
          const existingData = existingEventSnap.exists ? (existingEventSnap.data() as any) : null;
          const existingReceivedAt = existingData?.receivedAt?.toDate?.() as Date | undefined;
          const ageMs = existingReceivedAt ? Date.now() - existingReceivedAt.getTime() : Number.POSITIVE_INFINITY;
          if (ageMs <= DEDUPE_RETRY_WINDOW_MS) {
            res.status(200).json({ message: "Duplicate webhook ignored", eventId, docId });
            return;
          }

          const replayEventId = `${eventId}:${Date.now()}`;
          eventId = replayEventId;
          eventRef = db.collection(WEBHOOK_EVENTS_COLLECTION).doc(replayEventId);
          await eventRef.create({
            source: "caspio",
            table: "connect_tbl_userregistration",
            operation,
            userId: String(recordData?.User_ID || "").trim() || null,
            email: String(recordData?.Email || "").trim().toLowerCase() || null,
            docId,
            changedFields,
            receivedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: "processing",
            hasExplicitEventId,
            explicitEventId: explicitEventId || null,
            replayOfEventId: baseEventId,
          });
        } else {
          throw e;
        }
      }

      const ref = db.collection(USERSREG_CACHE_COLLECTION).doc(docId);
      const existingRefSnap = await ref.get();
      const previousCacheData = existingRefSnap.exists ? ((existingRefSnap.data() as Record<string, any>) || null) : null;
      if (operation === "DELETE") {
        await ref.set(
          {
            deletedFromCaspio: true,
            deletedFromCaspioAt: admin.firestore.FieldValue.serverTimestamp(),
            caspioWebhookOperation: "DELETE",
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else {
        const safeRecordData = { ...recordData };
        // Never persist credential-like columns even if Caspio sends them.
        delete (safeRecordData as any).Password;
        delete (safeRecordData as any).Show_Password;

        await ref.set(
          {
            ...safeRecordData,
            deletedFromCaspio: false,
            caspioWebhookOperation: operation || "UPDATE",
            caspioWebhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      const shouldSendWelcome = shouldSendWelcomeEmail(operation, recordData, previousCacheData);
      if (shouldSendWelcome) {
        const toEmail = String(recordData?.Email || "").trim().toLowerCase();
        if (isValidEmail(toEmail)) {
          try {
            const settings = await getWelcomeEmailSettings(db);
            if (settings.enabled) {
              const userFullName = getUserName(recordData);
              const userFirstName = getFirstName(userFullName);
              const templateVars = {
                firstName: userFirstName,
                fullName: userFullName,
                email: toEmail,
                portalUrl: settings.portalUrl,
                portalHintWord: settings.portalHintWord,
                loginRoleLabel: settings.loginRoleLabel,
                rcfeInstruction: settings.rcfeInstruction,
              };
              const subject = renderTemplate(settings.subjectTemplate, templateVars).trim();
              const bodyText = renderTemplate(settings.bodyTemplate, templateVars).trim();
              const htmlBody = textToHtml(bodyText, settings.footerText);
              const apiKey = String(resendApiKey.value() || process.env.RESEND_API_KEY || "").trim();
              if (apiKey) {
                const resend = new Resend(apiKey);
                const sendResult = await resend.emails.send({
                  from: `${settings.fromName} <${settings.fromEmail}>`,
                  to: [toEmail],
                  subject: subject || DEFAULT_WELCOME_SETTINGS.subjectTemplate,
                  html: htmlBody,
                  text: bodyText,
                });
                const sendError = (sendResult as any)?.error;
                if (sendError) {
                  throw new Error(String(sendError?.message || "Welcome email send failed"));
                }
                const providerMessageId = String((sendResult as any)?.data?.id || "").trim() || null;
                await db.collection("emailLogs").add({
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  status: "success",
                  template: "welcoming_user_email",
                  source: "functions/caspioUsersRegistrationWebhook",
                  from: `${settings.fromName} <${settings.fromEmail}>`,
                  to: [toEmail],
                  subject,
                  provider: "resend",
                  providerMessageId,
                  metadata: {
                    userId: String(recordData?.User_ID || "").trim() || null,
                    tableId: String(recordData?.Table_ID || recordData?.table_ID || "").trim() || null,
                    operation: operation || "UPDATE",
                    accountActivation: true,
                  },
                });
                await ref.set(
                  {
                    welcomeUserPortalEmailLastSentAt: admin.firestore.FieldValue.serverTimestamp(),
                    welcomeUserPortalEmailRecipient: toEmail,
                    welcomeUserPortalEmailSubject: subject,
                  },
                  { merge: true }
                );
              }
            }
          } catch (welcomeEmailError: any) {
            await db.collection("emailLogs").add({
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              status: "failure",
              template: "welcoming_user_email",
              source: "functions/caspioUsersRegistrationWebhook",
              from: null,
              to: [toEmail],
              subject: null,
              provider: "resend",
              providerMessageId: null,
              errorMessage: String(welcomeEmailError?.message || welcomeEmailError),
              metadata: {
                userId: String(recordData?.User_ID || "").trim() || null,
                tableId: String(recordData?.Table_ID || recordData?.table_ID || "").trim() || null,
                operation: operation || "UPDATE",
                accountActivation: true,
              },
            });
          }
        }
      }

      await db.collection(WEBHOOK_LOGS_COLLECTION).add({
        source: "caspio",
        table: "connect_tbl_userregistration",
        operation: operation || null,
        eventId,
        changedFields,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        success: true,
      });

      if (eventRef) {
        await eventRef.set(
          {
            status: "processed",
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      res.status(200).json({
        message: "Users registration webhook processed successfully",
        docId,
        operation: operation || null,
      });
    } catch (error: any) {
      await db.collection(WEBHOOK_LOGS_COLLECTION).add({
        source: "caspio",
        table: "connect_tbl_userregistration",
        error: error?.message || String(error),
        requestBody: req.body,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        success: false,
      });

      if (eventRef) {
        await eventRef.set(
          {
            status: "failed",
            error: String(error?.message || error),
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      res.status(500).json({
        error: "Webhook processing failed",
        message: error?.message || String(error),
      });
    }
  }
);
