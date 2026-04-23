import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { createHash } from "node:crypto";

const caspioWebhookSecret = defineSecret("CASPIO_WEBHOOK_SECRET");
const WEBHOOK_LOGS_COLLECTION = "webhook-logs";
const WEBHOOK_EVENTS_COLLECTION = "caspio-webhook-events";
const MEMBERS_CACHE_COLLECTION = "caspio_members_cache";
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

const buildEventIdentity = (
  payload: any
): { eventId: string; hasExplicitEventId: boolean; explicitEventId: string } => {
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
  const hashBase = JSON.stringify({
    tableName,
    operation,
    clientId,
    modified,
    changedFields,
    record: payload?.record_data || {},
  });
  if (explicitEventId) {
    // Some Caspio setups accidentally send a constant event_id.
    // Include payload fingerprint so real updates are still processed.
    const dedupeId = createHash("sha256")
      .update(`${explicitEventId.slice(0, 200)}::${hashBase}`)
      .digest("hex");
    return { eventId: dedupeId, hasExplicitEventId: true, explicitEventId: explicitEventId.slice(0, 200) };
  }
  return { eventId: createHash("sha256").update(hashBase).digest("hex"), hasExplicitEventId: false, explicitEventId: "" };
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
    caspioCalAIMStatus: String(recordData.CalAIM_Status || "").trim(),
    kaiser_user_assignment: String(recordData.Kaiser_User_Assignment || "").trim(),
    Social_Worker_Assigned: String(recordData.Social_Worker_Assigned || "").trim(),
    pathway: String(recordData.SNF_Diversion_or_Transition || recordData.Pathway || "").trim(),
    Date_Modified: String(recordData.Date_Modified || "").trim(),
    last_updated: String(recordData.Date_Modified || recordData.last_updated || new Date().toISOString()).trim(),
  };
};

const cleanComparable = (value: unknown) => String(value ?? "").trim();
const canonicalComparable = (value: unknown) => cleanComparable(value).toLowerCase();

const docMatchesClientId = (docData: Record<string, any>, clientIdRaw: string) => {
  const target = canonicalComparable(clientIdRaw);
  if (!target) return false;
  const candidates = [
    docData?.client_ID2,
    docData?.clientId2,
    docData?.Client_ID2,
    docData?.caspioClientId2,
  ];
  return candidates.some((candidate) => canonicalComparable(candidate) === target);
};

async function findApplicationDocRefsByClientId(db: FirebaseFirestore.Firestore, clientIdRaw: string) {
  const clientId = cleanComparable(clientIdRaw);
  if (!clientId) return [] as FirebaseFirestore.DocumentReference[];

  const refsByPath = new Map<string, FirebaseFirestore.DocumentReference>();
  const fieldVariants = ["client_ID2", "clientId2", "Client_ID2", "caspioClientId2"];
  const queryValues: Array<string | number> = [clientId];
  if (/^-?\d+(\.\d+)?$/.test(clientId)) {
    const numericClientId = Number(clientId);
    if (Number.isFinite(numericClientId)) {
      queryValues.push(numericClientId);
    }
  }

  for (const field of fieldVariants) {
    for (const queryValue of queryValues) {
      // Fast path: root applications collection (no collection-group index dependency).
      try {
        const rootSnap = await db.collection("applications").where(field, "==", queryValue).limit(200).get();
        rootSnap.docs.forEach((doc) => refsByPath.set(doc.ref.path, doc.ref));
      } catch {
        // best effort; continue to collection-group attempt
      }

      try {
        const snap = await db.collectionGroup("applications").where(field, "==", queryValue).limit(200).get();
        snap.docs.forEach((doc) => refsByPath.set(doc.ref.path, doc.ref));
      } catch {
        // best effort across field variants / value types
      }
    }
  }

  // Final fallback: indexless scan and normalized in-code matching.
  // Handles subtle formatting drifts (e.g. numeric/string, casing, whitespace).
  if (refsByPath.size === 0) {
    try {
      const rootScan = await db.collection("applications").limit(2000).get();
      rootScan.docs
        .filter((doc) => docMatchesClientId((doc.data() || {}) as Record<string, any>, clientId))
        .forEach((doc) => refsByPath.set(doc.ref.path, doc.ref));
    } catch {
      // best effort fallback only
    }

    if (refsByPath.size === 0) {
      try {
        const groupScan = await db.collectionGroup("applications").limit(2000).get();
        groupScan.docs
          .filter((doc) => docMatchesClientId((doc.data() || {}) as Record<string, any>, clientId))
          .forEach((doc) => refsByPath.set(doc.ref.path, doc.ref));
      } catch {
        // best effort fallback only
      }
    }
  }

  return Array.from(refsByPath.values());
}

async function findApplicationDocRefsByMrn(db: FirebaseFirestore.Firestore, mrnRaw: string) {
  const mrn = cleanComparable(mrnRaw);
  if (!mrn) return [] as FirebaseFirestore.DocumentReference[];

  const refsByPath = new Map<string, FirebaseFirestore.DocumentReference>();
  const fieldVariants = ["memberMrn", "memberMRN", "mrn", "medicalRecordNumber", "MCP_CIN"];
  const queryValues: Array<string | number> = [mrn];
  if (/^-?\d+(\.\d+)?$/.test(mrn)) {
    const numericMrn = Number(mrn);
    if (Number.isFinite(numericMrn)) {
      queryValues.push(numericMrn);
    }
  }

  for (const field of fieldVariants) {
    for (const queryValue of queryValues) {
      // Fast path: root applications collection (no collection-group index dependency).
      try {
        const rootSnap = await db.collection("applications").where(field, "==", queryValue).limit(200).get();
        rootSnap.docs.forEach((doc) => refsByPath.set(doc.ref.path, doc.ref));
      } catch {
        // best effort; continue to collection-group attempt
      }

      try {
        const snap = await db.collectionGroup("applications").where(field, "==", queryValue).limit(200).get();
        snap.docs.forEach((doc) => refsByPath.set(doc.ref.path, doc.ref));
      } catch {
        // best effort across MRN field variants / value types
      }
    }
  }

  return Array.from(refsByPath.values());
}

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
        console.log("[caspioWebhook] ignored_method", { method: req.method });
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const webhookData = normalizeCaspioBlankValue(req.body || {});
      const secretCheck = verifyWebhookSecret(webhookData, req.headers["x-caspio-webhook-secret"] as string | undefined);
      if (!secretCheck.ok) {
        console.warn("[caspioWebhook] unauthorized", {
          reason: secretCheck.reason,
          hasHeaderSecret: Boolean(req.headers["x-caspio-webhook-secret"]),
          hasBodySecret: Boolean(webhookData?.secret || webhookData?.Secret),
        });
        res.status(401).json({ error: "Unauthorized webhook" });
        return;
      }

      const { table_name, operation, record_data, changed_fields } = webhookData;
      if (table_name !== "CalAIM_tbl_Members") {
        console.log("[caspioWebhook] ignored_table", {
          tableName: table_name,
          operation: String(operation || "").trim(),
        });
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
        console.warn("[caspioWebhook] missing_client_id2", {
          operation: String(operation || "").trim(),
          tableName: table_name,
        });
        res.status(200).json({ message: "No client_ID2 found" });
        return;
      }

      if (hasWebhookTestMarker(clientId, normalizedRecordData?.MCP_CIN, normalizedRecordData?.Senior_First, normalizedRecordData?.Senior_Last)) {
        console.log("[caspioWebhook] ignored_test_marker", { clientId, operation: String(operation || "").trim() });
        res.status(200).json({ message: "Webhook test marker ignored", clientId });
        return;
      }

      const changedFields = asChangedFields(changed_fields);
      console.log("[caspioWebhook] received", {
        tableName: table_name,
        operation: String(operation || "").trim().toUpperCase(),
        clientId,
        changedFieldsCount: changedFields.length,
        changedFieldsPreview: changedFields.slice(0, 12),
      });
      const { eventId: derivedEventId, hasExplicitEventId, explicitEventId } = buildEventIdentity({
        ...webhookData,
        record_data: normalizedRecordData,
      });
      const eventId = hasExplicitEventId ? derivedEventId : `${derivedEventId}:${Date.now()}`;
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
            console.log("[caspioWebhook] duplicate_ignored", {
              eventId,
              explicitEventId: explicitEventId || null,
              clientId,
              ageMs,
            });
            res.status(200).json({ message: "Duplicate webhook ignored", eventId, clientId });
            return;
          }

          // Same payload can legitimately recur later (e.g. status toggled back).
          // Keep processing by creating a time-suffixed event document.
          const replayEventId = `${eventId}:${Date.now()}`;
          eventRef = db.collection(WEBHOOK_EVENTS_COLLECTION).doc(replayEventId);
          await eventRef.create({
            source: "caspio",
            table: table_name,
            operation: String(operation || "").trim(),
            clientId,
            changedFields,
            receivedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: "processing",
            hasExplicitEventId,
            explicitEventId: explicitEventId || null,
            replayOfEventId: eventId,
          });
          // Handled duplicate collision; continue processing using replay eventRef.
        } else {
          throw e;
        }
      }

      const cacheRef = db.collection(MEMBERS_CACHE_COLLECTION).doc(clientId);
      const cacheSnapshot = await cacheRef.get();
      const cacheData = cacheSnapshot.exists ? (cacheSnapshot.data() as any) : null;

      const incomingModifiedRaw = normalizedRecordData?.Date_Modified || normalizedRecordData?.last_updated || "";
      const existingModifiedRaw = cacheData?.Date_Modified || cacheData?.last_updated || cacheData?.caspioLastModifiedRaw || "";
      const stale = isStaleEvent(incomingModifiedRaw, existingModifiedRaw);
      if (stale) {
        console.log("[caspioWebhook] ignored_stale", {
          clientId,
          eventId,
          incomingModifiedRaw: String(incomingModifiedRaw || ""),
          existingModifiedRaw: String(existingModifiedRaw || ""),
        });
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

      let updateResult: { applicationDocsMatched: number; applicationDocsUpdated: number } | null = null;
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

          // Keep application docs (root + user subcollections) in sync for critical fields.
          updateResult = await handleCaspioUpdate(clientId, normalizedRecordData, changedFields);
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
          updateResult = await handleCaspioDelete(clientId);
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
      console.log("[caspioWebhook] processed", {
        clientId,
        eventId,
        operation: String(operation || "").trim().toUpperCase(),
        appDocsMatched: updateResult?.applicationDocsMatched ?? 0,
        appDocsUpdated: updateResult?.applicationDocsUpdated ?? 0,
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
async function handleCaspioUpdate(clientId: string, caspioData: any, changedFields: string[]) {
  const db = admin.firestore();

  const fieldMapping: Record<string, string> = {
    Kaiser_Status: "kaiserStatus",
    CalAIM_Status: "caspioCalAIMStatus",
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
    client_ID2: cleanComparable(clientId),
    clientId2: cleanComparable(clientId),
    Client_ID2: cleanComparable(clientId),
  };

  let mappedFieldApplied = false;
  changedFields.forEach((caspioField) => {
    const firestoreField = fieldMapping[caspioField];
    if (firestoreField && caspioData[caspioField] !== undefined) {
      updateData[firestoreField] = normalizeCaspioBlankValue(caspioData[caspioField]);
      mappedFieldApplied = true;
    }
  });

  // If changed fields were not provided (or none matched mapping), still upsert mapped fields.
  if (!mappedFieldApplied) {
    Object.entries(fieldMapping).forEach(([caspioField, firestoreField]) => {
      if (caspioData[caspioField] !== undefined) {
        updateData[firestoreField] = normalizeCaspioBlankValue(caspioData[caspioField]);
      }
    });
  }

  if (caspioData?.Kaiser_Status !== undefined) {
    updateData.Kaiser_Status = normalizeCaspioBlankValue(caspioData.Kaiser_Status);
  }
  if (caspioData?.CalAIM_Status !== undefined) {
    const normalizedCalAIMStatus = normalizeCaspioBlankValue(caspioData.CalAIM_Status);
    updateData.CalAIM_Status = normalizedCalAIMStatus;
    updateData.caspioCalAIMStatus = normalizedCalAIMStatus;
  }

  let refs = await findApplicationDocRefsByClientId(db, clientId);
  if (refs.length === 0) {
    const mrnCandidate = cleanComparable(caspioData?.MCP_CIN || caspioData?.MediCal_Number);
    if (mrnCandidate) {
      refs = await findApplicationDocRefsByMrn(db, mrnCandidate);
    }
  }
  let applicationDocsUpdated = 0;
  if (refs.length > 0) {
    for (let i = 0; i < refs.length; i += 500) {
      const chunk = refs.slice(i, i + 500);
      const batch = db.batch();
      chunk.forEach((ref) => batch.set(ref, updateData, { merge: true }));
      await batch.commit();
      applicationDocsUpdated += chunk.length;
    }
  }

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

  return {
    applicationDocsMatched: refs.length,
    applicationDocsUpdated,
  };
}

// Handle Caspio DELETE operations
async function handleCaspioDelete(clientId: string) {
  const db = admin.firestore();
  const refs = await findApplicationDocRefsByClientId(db, clientId);
  let applicationDocsUpdated = 0;
  if (refs.length > 0) {
    for (let i = 0; i < refs.length; i += 500) {
      const chunk = refs.slice(i, i + 500);
      const batch = db.batch();
      chunk.forEach((ref) =>
        batch.set(
          ref,
          {
            deletedFromCaspio: admin.firestore.FieldValue.serverTimestamp(),
            needsReview: true,
          },
          { merge: true }
        )
      );
      await batch.commit();
      applicationDocsUpdated += chunk.length;
    }
  }

  await db.collection("sync-status").doc(clientId).set(
    {
      lastSyncedFromCaspio: admin.firestore.FieldValue.serverTimestamp(),
      deletedFromCaspio: true,
      syncDirection: "caspio_to_firestore",
    },
    { merge: true }
  );

  return {
    applicationDocsMatched: refs.length,
    applicationDocsUpdated,
  };
}
