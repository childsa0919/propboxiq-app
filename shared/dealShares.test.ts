import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUsPhone,
  formatUsPhone,
  toE164,
  maskEmail,
  deriveDisplayStatus,
  isInviteExpired,
  inviteExpiresInDays,
  fmtShortUsd,
  buildSmsBody,
  displayNameOf,
  initialsOf,
  normalizeShareEmail,
  isValidShareEmail,
  DAY_MS,
} from "./dealShares";

test("normalizeUsPhone accepts 10 digits and an optional leading 1", () => {
  assert.equal(normalizeUsPhone("(410) 555-0182"), "4105550182");
  assert.equal(normalizeUsPhone("+1 410.555.0182"), "4105550182");
  assert.equal(normalizeUsPhone("555-0182"), null);
  assert.equal(normalizeUsPhone("24105550182"), null);
  assert.equal(toE164("4105550182"), "+14105550182");
});

test("formatUsPhone formats as you type", () => {
  assert.equal(formatUsPhone("410"), "(410");
  assert.equal(formatUsPhone("41055"), "(410) 55");
  assert.equal(formatUsPhone("4105550182"), "(410) 555-0182");
  assert.equal(formatUsPhone("14105550182999"), "(410) 555-0182");
});

test("email normalize, validate and mask", () => {
  assert.equal(normalizeShareEmail("  Marcus@CapitalPartners.com "), "marcus@capitalpartners.com");
  assert.equal(isValidShareEmail("marcus@capitalpartners.com"), true);
  assert.equal(isValidShareEmail("marcus@"), false);
  assert.equal(maskEmail("marcus@capitalpartners.com"), "m•••@capitalpartners.com");
});

test("display status derivation", () => {
  const now = 100 * DAY_MS;
  const base = { status: "pending", invited: false, recipientUserId: 7, createdAt: now - DAY_MS };
  assert.equal(deriveDisplayStatus(base, now), "PENDING");
  assert.equal(deriveDisplayStatus({ ...base, status: "accepted" }, now), "ACCEPTED");
  assert.equal(deriveDisplayStatus({ ...base, status: "declined" }, now), "DECLINED");
  const invite = { ...base, invited: true, recipientUserId: null };
  assert.equal(deriveDisplayStatus(invite, now), "INVITED");
  assert.equal(deriveDisplayStatus({ ...invite, createdAt: now - 31 * DAY_MS }, now), "EXPIRED");
  assert.equal(isInviteExpired({ ...invite, createdAt: now - 31 * DAY_MS }, now), true);
  // A claimed invite is a normal pending share and never expires.
  assert.equal(deriveDisplayStatus({ ...invite, recipientUserId: 9, createdAt: now - 31 * DAY_MS }, now), "PENDING");
  assert.equal(inviteExpiresInDays(now - 3 * DAY_MS, now), 27);
});

test("short money and SMS body", () => {
  assert.equal(fmtShortUsd(651000), "$651K");
  assert.equal(fmtShortUsd(1_250_000), "$1.3M");
  assert.equal(fmtShortUsd(-12_400), "-$12K");
  assert.equal(
    buildSmsBody({ street: "16011 Tanyard Rd", city: "Upper Marlboro", arv: 651000, profit: 88000, shareUrl: "https://app.propboxiq.com/s/7Kq2Xa" }),
    "Hey, I just sent you a deal on PropBoxIQ:\n16011 Tanyard Rd, Upper Marlboro\nARV $651K · Est. profit $88K\nhttps://app.propboxiq.com/s/7Kq2Xa",
  );
});

test("names and initials", () => {
  assert.equal(displayNameOf("Jordan Rivera", "j@x.com"), "Jordan Rivera");
  assert.equal(displayNameOf(null, "dana.r@gmail.com"), "Dana R");
  assert.equal(initialsOf("Jordan Rivera"), "JR");
  assert.equal(initialsOf("marcus"), "M");
});
