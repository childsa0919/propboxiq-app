// v1.8.0 Deal Sharing — HTTP contract smoke test for server/dealShareRoutes.ts.
//
//   npx tsx server/scripts/testDealShareRoutes.ts
//
// Mounts only the share routes on a bare Express app with a test-only
// middleware that sets req.userId from an `x-test-user` header (stands in for
// sessionMiddleware), against a temp SQLite DB.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "pbq-share-routes-"));
  process.env.DATA_DIR = dir;
  delete process.env.RESEND_API_KEY;
  delete process.env.ENABLE_AUTH;

  const express = (await import("express")).default;
  const { storage } = await import("../storage");
  const { registerDealShareRoutes } = await import("../dealShareRoutes");
  const { defaultDealInputs } = await import("@shared/schema");
  const { SHARE_ERRORS } = await import("@shared/dealShares");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = Number(req.headers["x-test-user"]);
    next();
  });
  registerDealShareRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function call(user: number, method: string, url: string, body?: unknown) {
    const res = await fetch(base + url, {
      method,
      redirect: "manual",
      headers: { "x-test-user": String(user), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* redirect/html */ }
    return { status: res.status, json, location: res.headers.get("location") };
  }

  let failed = 0;
  try {
    const { user: a } = await storage.upsertUser("jordan.rivera@example.com", "Jordan Rivera");
    const { user: b } = await storage.upsertUser("marcus@capitalpartners.com", "Marcus Lee");
    const deal = await storage.createDeal(a.id, {
      address: "16011 Tanyard Rd", city: "Upper Marlboro", state: "MD", zip: "20772",
      inputs: JSON.stringify({ ...defaultDealInputs, purchasePrice: 385000, arv: 651000, rehabBudget: 60000 }),
    });

    let r = await call(a.id, "POST", `/api/deals/${deal.id}/share`, { email: "marcus@capitalpartners.com", phone: "410-555-0182", note: "Comps are tight." });
    assert.equal(r.status, 201);
    assert.equal(r.json.displayStatus, "PENDING");
    assert.equal(r.json.smsTo, "+14105550182");
    const { shareId, token } = r.json;

    r = await call(a.id, "POST", `/api/deals/${deal.id}/share`, { email: "marcus@capitalpartners.com" });
    assert.deepEqual([r.status, r.json.error], [409, SHARE_ERRORS.duplicate]);
    r = await call(b.id, "POST", `/api/deals/${deal.id}/share`, { email: "x@y.com" });
    assert.deepEqual([r.status, r.json.error], [404, SHARE_ERRORS.cantShare]);

    r = await call(b.id, "GET", "/api/shares/inbox/count");
    assert.deepEqual(r.json, { count: 1 });
    r = await call(b.id, "GET", "/api/shares/inbox");
    assert.equal(r.json[0].sender.name, "Jordan Rivera");
    assert.equal(r.json[0].note, "Comps are tight.");
    r = await call(a.id, "GET", "/api/shares/sent");
    assert.equal(r.json[0].texted, true);
    assert.equal(r.json[0].displayStatus, "PENDING");

    r = await call(a.id, "GET", `/api/shares/by-token/${token}`);
    assert.deepEqual(r.json, { shareId, state: "other-account", maskedEmail: "m•••@capitalpartners.com" });
    r = await call(b.id, "GET", `/api/shares/by-token/${token}`);
    assert.deepEqual(r.json, { shareId, state: "mine" });

    r = await call(a.id, "POST", `/api/shares/${shareId}/accept`);
    assert.equal(r.status, 403);
    r = await call(b.id, "POST", `/api/shares/${shareId}/accept`);
    assert.equal(r.status, 200);
    assert.ok(Number.isInteger(r.json.dealId));
    r = await call(b.id, "POST", `/api/shares/${shareId}/decline`);
    assert.deepEqual([r.status, r.json.error], [409, SHARE_ERRORS.unavailable]);

    r = await call(b.id, "GET", `/s/${token}`);
    assert.equal(r.status, 302);
    assert.equal(r.location, `/#/s/${token}`);
    console.log("PASS  share routes: status codes, payload shapes, /s/:token redirect");
  } catch (e) {
    failed = 1;
    console.log("FAIL  share routes\n", e);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
  process.exit(failed);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
