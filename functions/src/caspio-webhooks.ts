import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { createHash } from "node:crypto";

const caspioWebhookSecret = defineSecret("CASPIO_WEBHOOK_SECRET");
const WEBHOOK_LOGS_COLLECTION = "webhook-logs";
const WEBHOOK_EVENTS_COLLECTION = "caspio-webhook-events";
const MEMBERS_CACHE_COLLECTION = "caspio_members_cache";

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

const asChangedFields = (changedFields: unknown): string[] => {
  if (Array.isArray(changedFields)) {
    return changedFields.map((v) => String(v || "").trim()).filter(Boolean);
  }
  const raw = String(changedFields || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v || "").trim()).filter(Boolean);
    }
  } catch {
    // Ignore parse errors and fallback to token split.
  }
  return raw.split(/[,\n|;]/g).map((v) => v.trim()).filter(Boolean);
};

const parseDate = (value: unknown): Date | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
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

const buildEventId = (payload: any) => {
  const tableName = String(payload?.table_name || "").trim();
  const operation = String(payload?.operation || "").trim();
  const clientId = String(
    payload?.record_data?.client_ID2 ||
      payload?.record_data?.Client_ID2 ||
      payload?.record_data?.clientId2 ||
      ""
  ).trim();
  const modified = String(payload?.record_data?.Date_Modified || payload?.record_data?.last_updated || "").trim();
  const changedFields = asChangedFields(payload?.changed_fields).join("|");
  const explicitEventId = String(payload?.event_id || payload?.Event_ID || "").trim();
  if (explicitEventId) return explicitEventId.slice(0, 200);

  const hashBase = JSON.stringify({
    tableName,
    operation,
    clientId,
    modified,
    changedFields,
    record: payload?.record_data || {},
  });
  return createHash("sha256").update(hashBase).digest("hex");
};

const isStaleEvent = (incomingModifiedRaw: unknown, existingModifiedRaw: unknown) => {
  const incomingDate = parseDate(incomingModifiedRaw);
  const existingDate = parseDate(existingModifiedRaw);
  if (!incomingDate || !existingDate) return false;
  return incomingDate.getTime() < existingDate.getTime();
};

const mapCaspioRecordToCacheFields = (recordData: Record<string, any>) => {
  const firstName = String(recordData.Senior_First || "").trim();
  const lastName = String(recordData.Senior_Last || "").trim();
  const memberName = `${firstName} ${lastName}`.trim();
  const clientId = String(recordData.client_ID2 || recordData.Client_ID2 || recordData.clientId2 || "").trim();
  return {
    Client_ID2: clientId,
    client_ID2: clientId,
    memberFirstName: firstName,
    memberLastName: lastName,
    memberName,
    memberCounty: String(recordData.Member_County || "").trim(),
    memberMrn: String(recordData.MCP_CIN || "").trim(),
    Kaiser_Status: String(recordData.Kaiser_Status || "").trim(),
    CalAIM_Status: String(recordData.CalAIM_Status || "").trim(),
    kaiser_user_assignment: String(recordData.Kaiser_User_Assignment || "").trim(),
    Social_Worker_Assigned: String(recordData.Social_Worker_Assigned || "").trim(),
    pathway: String(recordData.SNF_Diversion_or_Transition || recordData.Pathway || "").trim(),
    Date_Modified: String(recordData.Date_Modified || "").trim(),
    last_updated: String(recordData.Date_Modified || recordData.last_updated || new Date().toISOString()).trim(),
  };
};

const hasWebhookTestMarker = (...values: Array<unknown>) =>
  values.some((value) => String(value || "").toUpperCase().includes("WEBHOOK_TEST"));

// Webhook endpoint for Caspio to notify us of member changes.
export const caspioWebhook = onRequest(
  {
    cors: true,
    secrets: [caspioWebhookSecret],
  },
  async (req, res) => {
    let eventRef: FirebaseFirestore.DocumentReference | null = null;
    const db = admin.firestore();
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const webhookData = normalizeCaspioBlankValue(req.body || {});
      const secretCheck = verifyWebhookSecret(webhookData, req.headers["x-caspio-webhook-secret"] as string | undefined);
      if (!secretCheck.ok) {
        res.status(401).json({ error: "Unauthorized webhook" });
        return;
      }

      const { table_name, operation, record_data, changed_fields } = webhookData;
      if (table_name !== "CalAIM_tbl_Members") {
        res.status(200).json({ message: "Webhook received but ignored" });
        return;
      }

      const normalizedRecordData = normalizeCaspioBlankValue(record_data || {});
      const clientId = String(
        normalizedRecordData?.client_ID2 ||
          normalizedRecordData?.Client_ID2 ||
          normalizedRecordData?.clientId2 ||
          ""
      ).trim();
      if (!clientId) {
        res.status(200).json({ message: "No client_ID2 found" });
        return;
      }

      if (hasWebhookTestMarker(clientId, normalizedRecordData?.MCP_CIN, normalizedRecordData?.Senior_First, normalizedRecordData?.Senior_Last)) {
        res.status(200).json({ message: "Webhook test marker ignored", clientId });
        return;
      }

      const changedFields = asChangedFields(changed_fields);
      const eventId = buildEventId({ ...webhookData, record_data: normalizedRecordData });
      eventRef = db.collection(WEBHOOK_EVENTS_COLLECTION).doc(eventId);
      try {
        await eventRef.create({
          source: "caspio",
          table: table_name,
          operation: String(operation || "").trim(),
          clientId,
          changedFields,
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          status: "processing",
        });
      } catch (e: any) {
        if (e?.code === 6 || String(e?.message || "").toLowerCase().includes("already exists")) {
          res.status(200).json({ message: "Duplicate webhook ignored", eventId, clientId });
          return;
        }
        throw e;
      }

      const cacheRef = db.collection(MEMBERS_CACHE_COLLECTION).doc(clientId);
      const cacheSnapshot = await cacheRef.get();
      const cacheData = cacheSnapshot.exists ? (cacheSnapshot.data() as any) : null;

      const incomingModifiedRaw = normalizedRecordData?.Date_Modified || normalizedRecordData?.last_updated || "";
      const existingModifiedRaw = cacheData?.Date_Modified || cacheData?.last_updated || cacheData?.caspioLastModifiedRaw || "";
      const stale = isStaleEvent(incomingModifiedRaw, existingModifiedRaw);
      if (stale) {
        await eventRef.set(
          {
            status: "ignored_stale",
            incomingModifiedRaw,
            existingModifiedRaw,
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        res.status(200).json({ message: "Stale webhook ignored", clientId, eventId });
        return;
      }

      switch (String(operation || "").toUpperCase()) {
        case "UPDATE":
        case "INSERT": {
          const mappedCacheFields = mapCaspioRecordToCacheFields(normalizedRecordData);
          await cacheRef.set(
            {
              ...normalizedRecordData,
              ...mappedCacheFields,
              deletedFromCaspio: false,
              needsReview: false,
              caspioWebhookOperation: String(operation || "").toUpperCase(),
              caspioWebhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
              caspioLastModifiedRaw: String(incomingModifiedRaw || "").trim(),
              lastSyncedFromCaspio: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          // Keep legacy applications mirror in sync for critical fields.
          const applicationsSnapshot = await db.collection("applications").where("client_ID2", "==", clientId).limit(1).get();
          if (!applicationsSnapshot.empty) {
            await handleCaspioUpdate(applicationsSnapshot.docs[0].id, normalizedRecordData, changedFields);
          }
          break;
        }
        case "DELETE":
          await cacheRef.set(
            {
              deletedFromCaspio: true,
              needsReview: true,
              deletedFromCaspioAt: admin.firestore.FieldValue.serverTimestamp(),
              caspioWebhookOperation: "DELETE",
              caspioWebhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          await handleCaspioDelete(clientId);
          break;
        default:
          console.log(`⚠️ Unknown operation: ${operation}`);
      }

      await db.collection(WEBHOOK_LOGS_COLLECTION).add({
        source: "caspio",
        table: table_name,
        operation: operation,
        eventId,
        clientId,
        changedFields,
        recordData: normalizedRecordData,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        success: true,
      });

      await eventRef.set(
        {
          status: "processed",
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      res.status(200).json({
        message: "Webhook processed successfully",
        eventId,
        clientId,
        operation,
      });
    } catch (error: any) {
      console.error("❌ Error processing Caspio webhook:", error);
      await db.collection(WEBHOOK_LOGS_COLLECTION).add({
        source: "caspio",
        error: error.message,
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
        message: error.message,
      });
    }
  }
);

// Handle Caspio UPDATE operations
async function handleCaspioUpdate(applicationId: string, caspioData: any, changedFields: string[]) {
  const db = admin.firestore();

  const fieldMapping: Record<string, string> = {
    Kaiser_Status: "Kaiser_Status",
    CalAIM_Status: "CalAIM_Status",
    Kaiser_User_Assignment: "kaiser_user_assignment",
    Senior_First: "memberFirstName",
    Senior_Last: "memberLastName",
    MCP_CIN: "memberMrn",
    Member_County: "memberCounty",
    SNF_Diversion_or_Transition: "pathway",
  };

  const updateData: any = {
    lastSyncedFromCaspio: admin.firestore.FieldValue.serverTimestamp(),
    caspioWebhookReceived: admin.firestore.FieldValue.serverTimestamp(),
  };

  changedFields.forEach((caspioField) => {
    const firestoreField = fieldMapping[caspioField];
    if (firestoreField && caspioData[caspioField] !== undefined) {
      updateData[firestoreField] = normalizeCaspioBlankValue(caspioData[caspioField]);
    }
  });

  // If changed fields were not provided, still upsert mapped fields.
  if (Object.keys(updateData).length <= 2) {
    Object.entries(fieldMapping).forEach(([caspioField, firestoreField]) => {
      if (caspioData[caspioField] !== undefined) {
        updateData[firestoreField] = normalizeCaspioBlankValue(caspioData[caspioField]);
      }
    });
  }

  await db.collection("applications").doc(applicationId).update(updateData);

  const clientId = String(caspioData.client_ID2 || caspioData.Client_ID2 || "").trim();
  if (clientId) {
    await db.collection("sync-status").doc(clientId).set(
      {
        lastSyncedFromCaspio: admin.firestore.FieldValue.serverTimestamp(),
        caspioChangedFields: changedFields,
        syncDirection: "caspio_to_firestore",
      },
      { merge: true }
    );
  }
}

// Handle Caspio DELETE operations
async function handleCaspioDelete(clientId: string) {
  const db = admin.firestore();
  const applicationsSnapshot = await db.collection("applications").where("client_ID2", "==", clientId).limit(1).get();

  if (!applicationsSnapshot.empty) {
    await applicationsSnapshot.docs[0].ref.update({
      deletedFromCaspio: admin.firestore.FieldValue.serverTimestamp(),
      needsReview: true,
    });
  }

  await db.collection("sync-status").doc(clientId).set(
    {
      lastSyncedFromCaspio: admin.firestore.FieldValue.serverTimestamp(),
      deletedFromCaspio: true,
      syncDirection: "caspio_to_firestore",
    },
    { merge: true }
  );
}
