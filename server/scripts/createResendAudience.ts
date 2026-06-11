// One-time setup: create the "PropBoxIQ Users" Resend audience.
//
// Run once after deploy:   tsx server/scripts/createResendAudience.ts
// It is idempotent — if an audience with this name already exists, it logs
// that one's ID instead of creating a duplicate. Copy the printed ID into the
// RESEND_AUDIENCE_ID env var on Render.

import "dotenv/config";

const RESEND_API = "https://api.resend.com";
const AUDIENCE_NAME = "PropBoxIQ Users";

async function main(): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("RESEND_API_KEY is not set. Add it to the environment and re-run.");
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  // Reuse an existing audience if one already matches the name.
  const listResp = await fetch(`${RESEND_API}/audiences`, { headers });
  if (listResp.ok) {
    const list = (await listResp.json()) as { data?: Array<{ id: string; name: string }> };
    const existing = list.data?.find((a) => a.name === AUDIENCE_NAME);
    if (existing) {
      console.log(`Audience "${AUDIENCE_NAME}" already exists.`);
      console.log(`RESEND_AUDIENCE_ID=${existing.id}`);
      return;
    }
  } else {
    console.warn(`Could not list audiences (${listResp.status}); attempting to create anyway.`);
  }

  const createResp = await fetch(`${RESEND_API}/audiences`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: AUDIENCE_NAME }),
  });
  if (!createResp.ok) {
    const t = await createResp.text();
    console.error(`Failed to create audience (${createResp.status}): ${t}`);
    process.exit(1);
  }
  const created = (await createResp.json()) as { id: string };
  console.log(`Created audience "${AUDIENCE_NAME}".`);
  console.log(`RESEND_AUDIENCE_ID=${created.id}`);
}

main().catch((e) => {
  console.error("createResendAudience failed:", e);
  process.exit(1);
});
