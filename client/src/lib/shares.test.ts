import test from "node:test";
import assert from "node:assert/strict";
import { relativeTime, shareErrorMessage, truncateEmail } from "./shares";
import { buildSmsUri } from "./sms";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test("relativeTime matches the mockup wording", () => {
  const now = new Date("2026-10-21T17:00:00Z").getTime();
  assert.equal(relativeTime(now - 20_000, now), "Just now");
  assert.equal(relativeTime(now - 12 * MIN, now), "12 min ago");
  assert.equal(relativeTime(now - 2 * HOUR, now), "2h ago");
  assert.equal(relativeTime(now - 30 * HOUR, now), "Yesterday");
  assert.equal(relativeTime(now - 3 * DAY, now), "3d ago");
  assert.equal(relativeTime(new Date("2026-10-12T17:00:00Z").getTime(), now), "Oct 12");
});

test("shareErrorMessage unwraps apiRequest errors", () => {
  assert.equal(
    shareErrorMessage(new Error('409: {"error":"Already sent to this person — waiting on their response."}')),
    "Already sent to this person — waiting on their response.",
  );
  assert.equal(shareErrorMessage(new Error("500: Internal Server Error")), "Something went wrong. Try again.");
  assert.equal(shareErrorMessage(new Error("403: {}"), "You can't share this deal."), "You can't share this deal.");
});

test("truncateEmail for toasts", () => {
  assert.equal(truncateEmail("marcus@capitalpartners.com"), "marcus@…");
});

test("buildSmsUri uses the iOS+Android-safe ?&body= form", () => {
  assert.equal(buildSmsUri("+14105550182", "Hi there\nhttps://x.co/s/a"), "sms:+14105550182?&body=Hi%20there%0Ahttps%3A%2F%2Fx.co%2Fs%2Fa");
});
