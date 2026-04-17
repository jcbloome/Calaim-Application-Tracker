import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { createHash } from "node:crypto";

const caspioWebhookSecret = defineSecret("CASPIO_WEBHOOK_SECRET");
const RCFE_CACHE_COLLECTION = "caspio_rcfe_registration_cache";
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

const buildEventId = (payload: Record<string, any>, recordData: Record<string, any>) => {
  const tableName = getTableName(payload);
  const operation = getOperation(payload);
  const changedFields = asChangedFields(payload?.changed_fields ?? payload?.changedFields);
  const rcfeId = String(recordData?.RCFE_Registered_ID || "").trim();
  const tableId = String(recordData?.table_ID || recordData?.Table_ID || "").trim();
  const modified = String(recordData?.Timestamp || recordData?.Create_Date || "").trim();
  const explicitEventId = String(payload?.event_id || payload?.Event_ID || "").trim();
  if (explicitEventId) return explicitEventId.slice(0, 200);
  const hashBase = JSON.stringify({ tableName, operation, changedFields, rcfeId, tableId, modified, recordData });
  return createHash("sha256").update(hashBase).digest("hex");
};

const hasWebhookTestMarker = (...values: Array<unknown>) =>
  values.some((value) => String(value || "").toUpperCase().includes("WEBHOOK_TEST"));

const toRcfeDocId = (recordData: Record<string, any>) => {
  const preferred = String(
    recordData?.RCFE_Registered_ID || recordData?.CalAIM__RCFE_Connect_Home_ID || recordData?.table_ID || recordData?.Table_ID || ""
  ).trim();
  return `rcfe_${preferred.replace(/[^\w.\-]+/g, "_").slice(0, 240)}`;
};

export const caspioRcfeRegistrationWebhook = onRequest(
  {
    cors: true,
    secrets: [caspioWebhookSecret],
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
      const expected = "CalAIM_tbl_New_RCFE_Registration".toLowerCase().replace(/_+/g, "_");
      if (tableName && normalizedTableName !== expected) {
        res.status(200).json({ message: "Webhook received but ignored", tableName });
        return;
      }

      const operation = getOperation(payload);
      const recordData = normalizeCaspioBlankValue(getRecordData(payload));
      const changedFields = asChangedFields(payload?.changed_fields ?? payload?.changedFields ?? payload?.object_fields);
      if (hasWebhookTestMarker(recordData?.RCFE_Registered_ID, recordData?.RCFE_Name, recordData?.table_ID, recordData?.Table_ID)) {
        res.status(200).json({ message: "Webhook test marker ignored" });
        return;
      }
      const docId = toRcfeDocId(recordData);
      if (!docId || docId === "rcfe_") {
        res.status(200).json({ message: "Missing RCFE identifier; webhook ignored" });
        return;
      }

      const eventId = buildEventId(payload, recordData);
      eventRef = db.collection(WEBHOOK_EVENTS_COLLECTION).doc(eventId);
      try {
        await eventRef.create({
          source: "caspio",
          table: "CalAIM_tbl_New_RCFE_Registration",
          operation,
          rcfeRegisteredId: String(recordData?.RCFE_Registered_ID || "").trim() || null,
          docId,
          changedFields,
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          status: "processing",
        });
      } catch (e: any) {
        if (e?.code === 6 || String(e?.message || "").toLowerCase().includes("already exists")) {
          res.status(200).json({ message: "Duplicate webhook ignored", eventId, docId });
          return;
        }
        throw e;
      }

      const ref = db.collection(RCFE_CACHE_COLLECTION).doc(docId);
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
        await ref.set(
          {
            ...recordData,
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
        table: "CalAIM_tbl_New_RCFE_Registration",
        operation: operation || null,
        eventId,
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
        message: "RCFE registration webhook processed successfully",
        docId,
        operation: operation || null,
      });
    } catch (error: any) {
      await db.collection(WEBHOOK_LOGS_COLLECTION).add({
        source: "caspio",
        table: "CalAIM_tbl_New_RCFE_Registration",
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

