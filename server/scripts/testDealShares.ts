// v1.8.0 Deal Sharing — script-level test against a temp SQLite DB (spec §8).
//
//   npx tsx server/scripts/testDealShares.ts
//
// DATA_DIR is pointed at a fresh temp dir BEFORE storage is imported, so the
// real bootstrap DDL (users / deals / comp_hero_state / deal_snapshots /
// deal_shares) runs exactly as it does on boot. No network: the invite email
// sender is injected.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "pbq-shares-"));
  process.env.DATA_DIR = dir;
  delete process.env.RESEND_API_KEY;
  process.env.SHARE_BASE_URL = "https://app.propboxiq.com";

  const { storage, db } = await import("../storage");
  const shares = await import("../dealShares");
  const { dealShares, deals, defaultDealInputs } = await import("@shared/schema");
  const { calculateDeal } = await import("@/lib/calc");
  const { createDefaultBudget, normalizeBudget, budgetGrandTotal } = await import("@shared/budgetTemplate");
  const { DAY_MS, SHARE_ERRORS } = await import("@shared/dealShares");
  const { eq } = await import("drizzle-orm");

  type DealRow = typeof deals.$inferSelect;

  let passed = 0;
  let failed = 0;
  async function check(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      passed++;
      console.log(`PASS  ${name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL  ${name}\n      ${(e as Error).stack?.split("\n").slice(0, 3).join("\n      ")}`);
    }
  }

  const sentInvites: string[] = [];
  const okInvite = async (m: { to: string }) => {
    sentInvites.push(m.to);
    return { ok: true };
  };
  const failingInvite = async () => ({ ok: false, error: "resend 500" });

  function metrics(deal: DealRow) {
    const inputs = { ...defaultDealInputs, ...JSON.parse(deal.inputs) };
    const r = calculateDeal(inputs, { state: deal.state, city: deal.city });
    const budget = deal.budget ? budgetGrandTotal(normalizeBudget(JSON.parse(deal.budget))) : 0;
    return { arv: inputs.arv, profit: r.netProfit, budget, sourcesUses: inputs.sourcesUsesOverrides ?? null };
  }

  function valueOf<T>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T {
    if (!r.ok) throw new Error(`expected ok, got ${r.status} ${r.error}`);
    return r.value;
  }

  async function makeDeal(userId: number, address: string, arv = 651000) {
    const budget = createDefaultBudget();
    budget.categories.kitchen.items[0].amount = 18500;
    budget.categories.exterior.items[3].amount = 14200;
    budget.categories.trades.items[1].amount = 9800;
    return storage.createDeal(userId, {
      address,
      city: "Upper Marlboro",
      state: "MD",
      zip: "20772",
      sqft: 2061,
      beds: 4,
      baths: 2.5,
      inputs: JSON.stringify({
        ...defaultDealInputs,
        purchasePrice: 385000,
        arv,
        rehabBudget: 42500,
        sourcesUsesOverrides: { holding: 7200, buyClosingItems: { "Title insurance": 1650 } },
      }),
      notes: JSON.stringify({
        kind: "comps",
        version: 1,
        compsData: { subject: { address, sqft: 2061, style: "Colonial" }, comps: [{ id: "c1", price: 640000 }], arv },
        excludedCompIds: [],
      }),
      budget: JSON.stringify(budget),
    });
  }

  const { user: jordan } = await storage.upsertUser("jordan.rivera@example.com", "Jordan Rivera");
  const { user: marcus } = await storage.upsertUser("marcus@capitalpartners.com", "Marcus Lee");
  const { user: outsider } = await storage.upsertUser("sam.outsider@example.com", "Sam Outsider");

  // ── 1 ────────────────────────────────────────────────────────────────────
  await check("1. send → accept: recipient ARV, profit, budget, S&U, Comp Hero equal sender's at send time", async () => {
    const deal = await makeDeal(jordan.id, "16011 Tanyard Rd");
    await storage.upsertCompHeroState(deal.id, {
      selectedCompKeys: JSON.stringify(["c1", "c2"]),
      manualComps: JSON.stringify([{ id: "m1", source: "manual-address", address: "1 Main St" }]),
    });
    const atSend = metrics(deal);
    const sent = valueOf(await shares.createShare(jordan.id, deal.id, { email: " Marcus@CapitalPartners.com ", note: "Take a look at this one, comps are tight in Upper Marlboro." }, { sendInvite: okInvite }));
    assert.equal(sent.displayStatus, "PENDING");
    assert.match(sent.shareUrl, /^https:\/\/app\.propboxiq\.com\/s\/[A-Za-z0-9_-]{10}$/);
    assert.equal(sent.smsBody, undefined);

    const inbox = await shares.listInbox(marcus.id);
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].sender.name, "Jordan Rivera");
    assert.equal(inbox[0].summary.style, "Colonial");
    assert.equal(inbox[0].summary.arv, 651000);
    assert.equal(await shares.inboxCount(marcus.id), 1);

    const { dealId } = valueOf(await shares.acceptShare(marcus.id, sent.shareId));
    const copy = (await storage.getDeal(dealId, marcus.id))!;
    assert.ok(copy, "recipient owns the copy");
    assert.notEqual(copy.id, deal.id);
    assert.equal(copy.receivedFromUserId, jordan.id);
    assert.deepEqual(metrics(copy), atSend);
    assert.equal(copy.notes, deal.notes, "comps envelope copied");
    const ch = await storage.getCompHeroState(dealId);
    assert.equal(ch?.selectedCompKeys, JSON.stringify(["c1", "c2"]));
    assert.ok(ch?.manualComps.includes("1 Main St"));
    const snaps = await storage.listSnapshots(dealId);
    assert.equal(snaps.length, 1, "exactly one snapshot, history not copied");
    assert.equal(snaps[0].isOriginal, true);
    assert.equal(JSON.parse(snaps[0].payload).label, "Received from Jordan Rivera");
    assert.equal(await shares.inboxCount(marcus.id), 0);
    const sentList = await shares.listSent(jordan.id);
    assert.equal(sentList.find((s) => s.id === sent.shareId)?.displayStatus, "ACCEPTED");
    // Sender's deal untouched.
    assert.deepEqual(metrics((await storage.getDeal(deal.id, jordan.id))!), atSend);
  });

  // ── 2 ────────────────────────────────────────────────────────────────────
  await check("2. sender edits after sending → recipient copy unchanged", async () => {
    const deal = await makeDeal(jordan.id, "7725 Carroll Ave");
    const atSend = metrics(deal);
    const sent = valueOf(await shares.createShare(jordan.id, deal.id, { email: "marcus@capitalpartners.com" }, { sendInvite: okInvite }));
    const editedBudget = normalizeBudget(JSON.parse(deal.budget!));
    editedBudget.categories.kitchen.items[0].amount = 99999;
    await storage.updateDeal(deal.id, jordan.id, {
      inputs: JSON.stringify({ ...JSON.parse(deal.inputs), arv: 720000, purchasePrice: 300000 }),
      budget: JSON.stringify(editedBudget),
    });
    await storage.upsertCompHeroState(deal.id, { selectedCompKeys: JSON.stringify(["changed"]) });
    const { dealId } = valueOf(await shares.acceptShare(marcus.id, sent.shareId));
    const copy = (await storage.getDeal(dealId, marcus.id))!;
    assert.deepEqual(metrics(copy), atSend);
    assert.notDeepEqual(metrics((await storage.getDeal(deal.id, jordan.id))!), atSend);
    assert.equal(await storage.getCompHeroState(dealId), undefined, "no Comp Hero state at send time → none copied");
    // Editing the sender deal again leaves the accepted copy alone.
    await storage.updateDeal(deal.id, jordan.id, { address: "renamed" });
    assert.equal((await storage.getDeal(dealId, marcus.id))!.address, "7725 Carroll Ave");
  });

  // ── 3 ────────────────────────────────────────────────────────────────────
  await check("3. duplicate pending rejected; 26th send in 24h rejected; self-send rejected", async () => {
    const deal = await makeDeal(jordan.id, "1126 Chevron Rd");
    valueOf(await shares.createShare(jordan.id, deal.id, { email: "tony@dmvbuild.com" }, { sendInvite: okInvite }));
    const dup = await shares.createShare(jordan.id, deal.id, { email: "TONY@dmvbuild.com" }, { sendInvite: okInvite });
    assert.deepEqual(dup, { ok: false, status: 409, error: SHARE_ERRORS.duplicate });

    const self = await shares.createShare(jordan.id, deal.id, { email: "Jordan.Rivera@example.com" }, { sendInvite: okInvite });
    assert.deepEqual(self, { ok: false, status: 400, error: SHARE_ERRORS.self });

    const bad = await shares.createShare(jordan.id, deal.id, { email: "not-an-email" });
    assert.deepEqual(bad, { ok: false, status: 400, error: SHARE_ERRORS.invalidEmail });
    const phone = await shares.createShare(jordan.id, deal.id, { email: "p@x.com", phone: "555-0182" });
    assert.deepEqual(phone, { ok: false, status: 400, error: SHARE_ERRORS.phone });
    const note = await shares.createShare(jordan.id, deal.id, { email: "p@x.com", note: "x".repeat(281) });
    assert.deepEqual(note, { ok: false, status: 400, error: SHARE_ERRORS.note });
    const notMine = await shares.createShare(outsider.id, deal.id, { email: "p@x.com" });
    assert.deepEqual(notMine, { ok: false, status: 404, error: SHARE_ERRORS.cantShare });

    const texted = valueOf(await shares.createShare(jordan.id, deal.id, { email: "marcus@capitalpartners.com", phone: "(410) 555-0182" }, { sendInvite: okInvite }));
    assert.equal(texted.smsTo, "+14105550182");
    assert.ok(texted.smsBody?.startsWith("Hey, I just sent you a deal on PropBoxIQ:\n1126 Chevron Rd, Upper Marlboro\nARV $651K · Est. profit "));
    assert.ok(texted.smsBody?.endsWith(texted.shareUrl));
    const row = (await shares.listSent(jordan.id)).find((s) => s.id === texted.shareId)!;
    assert.equal(row.texted, true);
    const rawCols = db.select().from(dealShares).where(eq(dealShares.id, texted.shareId)).get()!;
    assert.ok(!JSON.stringify(rawCols).includes("5550182"), "phone number is never stored");

    // Rate limit: a fresh sender with 25 sends in the window.
    const { user: busy } = await storage.upsertUser("busy.sender@example.com", "Busy Sender");
    const busyDeal = await makeDeal(busy.id, "9 Rate Limit Ln");
    for (let i = 1; i <= 25; i++) {
      valueOf(await shares.createShare(busy.id, busyDeal.id, { email: `lead${i}@example.com` }, { sendInvite: okInvite }));
    }
    const over = await shares.createShare(busy.id, busyDeal.id, { email: "lead26@example.com" }, { sendInvite: okInvite });
    assert.deepEqual(over, { ok: false, status: 429, error: SHARE_ERRORS.dailyLimit });
    // Rolling window: once the oldest send is >24h old, sending works again.
    db.update(dealShares).set({ createdAt: Date.now() - DAY_MS - 1000 }).where(eq(dealShares.recipientEmail, "lead1@example.com")).run();
    valueOf(await shares.createShare(busy.id, busyDeal.id, { email: "lead26@example.com" }, { sendInvite: okInvite }));
  });

  // ── 4 ────────────────────────────────────────────────────────────────────
  await check("4. invite unknown email → INVITED; signup links it to inbox; 31-day-old invite → EXPIRED + accept 409", async () => {
    const deal = await makeDeal(jordan.id, "1254 Washington Dr");
    const before = sentInvites.length;
    const inv = valueOf(await shares.createShare(jordan.id, deal.id, { email: "dana.r@gmail.com" }, { sendInvite: okInvite }));
    assert.equal(inv.displayStatus, "INVITED");
    assert.equal(sentInvites.length, before + 1);
    assert.equal(sentInvites.at(-1), "dana.r@gmail.com");
    let row = (await shares.listSent(jordan.id)).find((s) => s.id === inv.shareId)!;
    assert.equal(row.displayStatus, "INVITED");
    assert.equal(row.expiresInDays, 30);

    const { user: dana, isNew } = await storage.upsertUser("Dana.R@gmail.com", "Dana Reyes");
    assert.equal(isNew, true);
    const danaInbox = await shares.listInbox(dana.id);
    assert.deepEqual(danaInbox.map((s) => s.id), [inv.shareId]);
    assert.equal(db.select().from(dealShares).where(eq(dealShares.id, inv.shareId)).get()!.recipientUserId, dana.id);
    row = (await shares.listSent(jordan.id)).find((s) => s.id === inv.shareId)!;
    assert.equal(row.displayStatus, "PENDING");

    const failedMail = await shares.createShare(jordan.id, deal.id, { email: "bounce@example.com" }, { sendInvite: failingInvite });
    assert.equal(valueOf(failedMail).inviteEmailFailed, true, "share still created when Resend fails");

    const old = valueOf(await shares.createShare(jordan.id, deal.id, { email: "old.invite@example.com" }, { sendInvite: okInvite }));
    db.update(dealShares).set({ createdAt: Date.now() - 31 * DAY_MS }).where(eq(dealShares.id, old.shareId)).run();
    row = (await shares.listSent(jordan.id)).find((s) => s.id === old.shareId)!;
    assert.equal(row.displayStatus, "EXPIRED");
    const { user: late } = await storage.upsertUser("old.invite@example.com", "Late Signup");
    assert.equal((await shares.listInbox(late.id)).length, 0, "expired invite does not appear");
    const acc = await shares.acceptShare(late.id, old.shareId);
    assert.deepEqual(acc, { ok: false, status: 409, error: SHARE_ERRORS.unavailable });
    const tok = await shares.resolveShareToken(late.id, old.token);
    assert.equal(tok.state, "unavailable");
    // Expired invites no longer block a fresh send to the same person.
    valueOf(await shares.createShare(jordan.id, deal.id, { email: "old.invite@example.com" }, { sendInvite: okInvite }));
  });

  // ── 5 ────────────────────────────────────────────────────────────────────
  await check("5. non-recipient accept or decline → 403", async () => {
    const deal = await makeDeal(jordan.id, "911 Hollis Ct");
    const s = valueOf(await shares.createShare(jordan.id, deal.id, { email: "marcus@capitalpartners.com" }, { sendInvite: okInvite }));
    assert.deepEqual(await shares.acceptShare(outsider.id, s.shareId), { ok: false, status: 403, error: SHARE_ERRORS.forbidden });
    assert.deepEqual(await shares.declineShare(outsider.id, s.shareId), { ok: false, status: 403, error: SHARE_ERRORS.forbidden });
    assert.deepEqual(await shares.acceptShare(jordan.id, s.shareId), { ok: false, status: 403, error: SHARE_ERRORS.forbidden }, "sender can't accept own share");
    const other = await shares.resolveShareToken(outsider.id, s.token);
    assert.deepEqual(other, { shareId: s.shareId, state: "other-account", maskedEmail: "m•••@capitalpartners.com" });
    const mine = await shares.resolveShareToken(marcus.id, s.token);
    assert.deepEqual(mine, { shareId: s.shareId, state: "mine" });
    assert.equal((await shares.resolveShareToken(marcus.id, "nope")).state, "unavailable");
    // Recipient declines → DECLINED for sender; further actions 409.
    assert.deepEqual(await shares.declineShare(marcus.id, s.shareId), { ok: true, value: { ok: true } });
    assert.equal((await shares.listSent(jordan.id)).find((x) => x.id === s.shareId)?.displayStatus, "DECLINED");
    assert.deepEqual(await shares.acceptShare(marcus.id, s.shareId), { ok: false, status: 409, error: SHARE_ERRORS.unavailable });
    assert.deepEqual(await shares.declineShare(marcus.id, s.shareId), { ok: false, status: 409, error: SHARE_ERRORS.unavailable });
    assert.equal((await shares.resolveShareToken(marcus.id, s.token)).state, "unavailable");
  });

  // ── 6 ────────────────────────────────────────────────────────────────────
  await check("6. deleting the source deal doesn't break accepting", async () => {
    const deal = await makeDeal(jordan.id, "42 Deleted Way", 512000);
    const atSend = metrics(deal);
    const s = valueOf(await shares.createShare(jordan.id, deal.id, { email: "marcus@capitalpartners.com" }, { sendInvite: okInvite }));
    assert.equal(await storage.deleteDeal(deal.id, jordan.id), true);
    const sentRow = (await shares.listSent(jordan.id)).find((x) => x.id === s.shareId)!;
    assert.equal(sentRow.summary.street, "42 Deleted Way", "Sent tab still renders from the frozen summary");
    const { dealId } = valueOf(await shares.acceptShare(marcus.id, s.shareId));
    assert.deepEqual(metrics((await storage.getDeal(dealId, marcus.id))!), atSend);
  });

  console.log(`\n${passed} passed, ${failed} failed  (temp DB: ${dir})`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
