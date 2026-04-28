import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users — one row per signed-in identity. Email is the natural key.
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: integer("created_at").notNull(),
  lastLoginAt: integer("last_login_at"),
});

export type User = typeof users.$inferSelect;

// Single-use magic-link tokens.
export const magicTokens = sqliteTable("magic_tokens", {
  token: text("token").primaryKey(),
  email: text("email").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull(),
});

export type MagicToken = typeof magicTokens.$inferSelect;

// Long-lived session cookies. Stored server-side so we can revoke.
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export type Session = typeof sessions.$inferSelect;

// Saved deal model. Inputs persist as JSON for forward compatibility.
export const deals = sqliteTable("deals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  address: text("address").notNull(),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  lat: real("lat"),
  lon: real("lon"),
  // Property details (best-effort, may be null)
  beds: real("beds"),
  baths: real("baths"),
  sqft: integer("sqft"),
  yearBuilt: integer("year_built"),
  // Deal financial inputs (full input snapshot as JSON)
  inputs: text("inputs").notNull(),
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const insertDealSchema = createInsertSchema(deals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDeal = z.infer<typeof insertDealSchema>;
export type Deal = typeof deals.$inferSelect;

// Zod schema for the runtime inputs object stored as JSON in `inputs`
export const dealInputsSchema = z.object({
  purchasePrice: z.number().nonnegative(),
  arv: z.number().nonnegative(),
  rehabBudget: z.number().nonnegative(),
  rehabContingencyPct: z.number().min(0).max(100),
  holdingMonths: z.number().min(0).max(60),
  monthlyHoldingCosts: z.number().nonnegative(), // taxes, insurance, utilities
  // Closing
  buyClosingPct: z.number().min(0).max(15),
  sellClosingPct: z.number().min(0).max(15),
  agentCommissionPct: z.number().min(0).max(15),
  // Financing — hard money
  financingType: z.enum(["hard_money", "cash"]),
  loanLtcPct: z.number().min(0).max(100), // % of total cost financed (purchase + rehab)
  loanRatePct: z.number().min(0).max(30),
  loanPointsPct: z.number().min(0).max(10),
  loanFees: z.number().nonnegative(),
  // Optional rule-of-thumb override
  desiredProfitPct: z.number().min(0).max(100), // for max allowable offer (MAO) calc
  // Post-rehab target specs — used to match comps when rehab is changing the footprint
  finalSqft: z.number().nonnegative().optional(),
  finalBeds: z.number().nonnegative().optional(),
  finalBaths: z.number().nonnegative().optional(),
  // Teardown flag — existing structure is being demolished; comps should target new build
  isTeardown: z.boolean().optional(),
  // Lot size from RentCast property lookup (display only)
  lotSqft: z.number().nonnegative().optional(),
  lotAcres: z.number().nonnegative().optional(),
});

export type DealInputs = z.infer<typeof dealInputsSchema>;

export const defaultDealInputs: DealInputs = {
  purchasePrice: 0,
  arv: 0,
  rehabBudget: 0,
  rehabContingencyPct: 10,
  holdingMonths: 6,
  monthlyHoldingCosts: 600,
  buyClosingPct: 2,
  sellClosingPct: 1,
  agentCommissionPct: 5,
  financingType: "hard_money",
  loanLtcPct: 90,
  loanRatePct: 10.5,
  loanPointsPct: 2,
  loanFees: 1500,
  desiredProfitPct: 15,
};
