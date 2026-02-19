import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";

const cronSecret = defineSecret("CRON_SECRET");

const getBaseUrl = () => {
  // Allow local emulator testing.
  if (process.env.FUNCTIONS_EMULATOR) return "http://localhost:3000";
  return "https://connectcalaim.com";
};

async function triggerMembersCacheSync(params: { mode: "incremental" | "full" }) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl.replace(/\/$/, "")}/api/caspio/members-cache/sync`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25 * 60 * 1000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret.value()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: params.mode }),
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // ignore
    }

    if (!res.ok) {
      throw new Error(`members-cache sync failed (HTTP ${res.status}): ${text || res.statusText}`);
    }

    if (json && json.success === false) {
      throw new Error(`members-cache sync reported failure: ${json.error || text || "unknown error"}`);
    }

    return json || { success: true, raw: text };
  } finally {
    clearTimeout(timeout);
  }
}

// Every 15 minutes: incremental sync for SW portal freshness.
export const syncCaspioMembersCacheIncremental = onSchedule(
  {
    schedule: "*/15 * * * *",
    timeZone: "America/Los_Angeles",
    secrets: [cronSecret],
  },
  async () => {
    console.log("🔄 Starting Caspio members cache incremental sync...");
    const result = await triggerMembersCacheSync({ mode: "incremental" });
    console.log("✅ Caspio members cache incremental sync complete:", result);
  }
);

// Nightly: full sync as a safety net/backfill.
export const syncCaspioMembersCacheFull = onSchedule(
  {
    schedule: "35 2 * * *",
    timeZone: "America/Los_Angeles",
    secrets: [cronSecret],
  },
  async () => {
    console.log("🌙 Starting Caspio members cache FULL sync...");
    const result = await triggerMembersCacheSync({ mode: "full" });
    console.log("✅ Caspio members cache FULL sync complete:", result);
  }
);

