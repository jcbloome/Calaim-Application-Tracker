import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { createHash } from "node:crypto";

const caspioWebhookSecret = defineSecret("CASPIO_WEBHOOK_SECRET");

const CLAIMS_H2022_COLLECTION = "h2022_claim_checker_claims";
const CLAIMS_T2038_COLLECTION = "t2038_claims_cache";
const WEBHOOK_EVENTS_COLLECTION = "caspio-webhook-events";
const WEBHOOK_LOGS_COLLECTION = "webhook-logs";

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
  // Fallback: treat payload as data minus known metadata keys.
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

const claimIdCandidates = (recordData: Record<string, any>) => {
  const candidates = [
    recordData?.PK_ID,
    recordData?.Record_ID,
    recordData?.ID,
    recordData?.Claim_ID,
    recordData?.Claim_Number,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  return Array.from(new Set(candidates));
};

const hasWebhookTestMarker = (...values: Array<unknown>) =>
  values.some((value) => String(value || "").toUpperCase().includes("WEBHOOK_TEST"));

const toClaimDocId = (prefix: string, raw: string) =>
  `${prefix}_${String(raw || "")
    .trim()
    .slice(0, 240)
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 240)}`;

const buildEventId = (payload: any) => {
  const tableName = String(payload?.table_name || "").trim();
  const operation = String(payload?.operation || "").trim();
  const recordData = payload?.record_data || {};
  const ids = claimIdCandidates(recordData);
  const clientId2 = String(recordData?.Client_ID2 || recordData?.client_ID2 || "").trim();
  const modified = String(recordData?.Date_Modified || recordData?.Timestamp || "").trim();
  const changedFields = asChangedFields(payload?.changed_fields).join("|");
  const explicitEventId = String(payload?.event_id || payload?.Event_ID || "").trim();
  if (explicitEventId) return explicitEventId.slice(0, 200);

  const hashBase = JSON.stringify({ tableName, operation, ids, clientId2, modified, changedFields, recordData });
  return createHash("sha256").update(hashBase).digest("hex");
};

async function processClaimsWebhook(params: {
  req: any;
  res: any;
  expectedTableNames: string[];
  collectionName: string;
  docPrefix: string;
}) {
  const { req, res, expectedTableNames, collectionName, docPrefix } = params;
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
    const normalizedIncomingTable = tableName.toLowerCase().replace(/_+/g, "_");
    const normalizedExpected = expectedTableNames.map((name) => name.toLowerCase().replace(/_+/g, "_"));
    if (tableName && !normalizedExpected.includes(normalizedIncomingTable)) {
      res.status(200).json({ message: "Webhook received but ignored", tableName });
      return;
    }

    const operation = getOperation(payload);
    const changedFields = asChangedFields(payload?.changed_fields ?? payload?.changedFields ?? payload?.object_fields);
    const recordData = normalizeCaspioBlankValue(getRecordData(payload));
    const ids = claimIdCandidates(recordData);
    const claimRecordId = ids[0] || "";
    const clientId2 = String(recordData?.Client_ID2 || recordData?.client_ID2 || "").trim();

    if (!claimRecordId && !clientId2) {
      res.status(200).json({ message: "No claim identifier found; webhook ignored" });
      return;
    }

    if (hasWebhookTestMarker(claimRecordId, clientId2, ...ids)) {
      res.status(200).json({ message: "Webhook test marker ignored", claimRecordId, clientId2 });
      return;
    }

    const eventId = buildEventId(payload);
    eventRef = db.collection(WEBHOOK_EVENTS_COLLECTION).doc(eventId);
    try {
      await eventRef.create({
        source: "caspio",
        table: expectedTableNames[0],
        operation,
        claimRecordId,
        clientId2,
        changedFields,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "processing",
      });
    } catch (e: any) {
      if (e?.code === 6 || String(e?.message || "").toLowerCase().includes("already exists")) {
        res.status(200).json({ message: "Duplicate webhook ignored", eventId, claimRecordId, clientId2 });
        return;
      }
      throw e;
    }

    const docId = toClaimDocId(docPrefix, claimRecordId || clientId2);
    const claimRef = db.collection(collectionName).doc(docId);

    if (operation === "DELETE") {
      await claimRef.set(
        {
          claimRecordId: claimRecordId || null,
          clientId2: clientId2 || null,
          deletedFromCaspio: true,
          deletedFromCaspioAt: admin.firestore.FieldValue.serverTimestamp(),
          caspioWebhookOperation: operation,
          caspioWebhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } else {
      await claimRef.set(
        {
          ...recordData,
          claimRecordId: claimRecordId || null,
          clientId2: clientId2 || null,
          deletedFromCaspio: false,
          caspioWebhookOperation: operation || "UPDATE",
          caspioWebhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    await db.collection(WEBHOOK_LOGS_COLLECTION).add({
      source: "caspio",
      table: expectedTableNames[0],
      operation: operation || null,
      eventId,
      claimRecordId: claimRecordId || null,
      clientId2: clientId2 || null,
      changedFields,
      recordData,
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
      message: "Webhook processed successfully",
      table: expectedTableNames[0],
      claimRecordId: claimRecordId || null,
      clientId2: clientId2 || null,
      operation: operation || null,
    });
  } catch (error: any) {
    await db.collection(WEBHOOK_LOGS_COLLECTION).add({
      source: "caspio",
      table: expectedTableNames[0],
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

// CalAIM RCFE claims (H2022) submitted by facilities.
export const caspioH2022ClaimsWebhook = onRequest(
  {
    cors: true,
    secrets: [caspioWebhookSecret],
  },
  async (req, res) => {
    await processClaimsWebhook({
      req,
      res,
      expectedTableNames: ["CalAIM_Claim_Submit_RCFE_H2022", "CalAIM_Claim_Submit__RCFE_H2022"],
      collectionName: CLAIMS_H2022_COLLECTION,
      docPrefix: "claim",
    });
  }
);

// CalAIM direct service claims (T2038) submitted by our team.
export const caspioT2038ClaimsWebhook = onRequest(
  {
    cors: true,
    secrets: [caspioWebhookSecret],
  },
  async (req, res) => {
    await processClaimsWebhook({
      req,
      res,
      expectedTableNames: ["CalAIM_Claim_Submit_T2038"],
      collectionName: CLAIMS_T2038_COLLECTION,
      docPrefix: "t2038_claim",
    });
  }
);

