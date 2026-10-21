// v1.8.0 Deal Sharing — HTTP routes. Thin wrappers over ./dealShares; all
// business rules and guards live there (and are covered by
// server/scripts/testDealShares.ts).
import type { Express, Response } from "express";
import { requireAuth } from "./auth";
import {
  acceptShare,
  createShare,
  declineShare,
  inboxCount,
  listInbox,
  listSent,
  resolveShareToken,
  type ShareResult,
} from "./dealShares";

function send<T>(res: Response, r: ShareResult<T>, okStatus = 200) {
  if (!r.ok) return res.status(r.status).json({ error: r.error });
  return res.status(okStatus).json(r.value);
}

const uid = (req: unknown) => (req as { userId: number }).userId;

export function registerDealShareRoutes(app: Express) {
  // Public share link. The SPA uses hash routing, so hand off to /#/s/:token;
  // ShareLinkPage resolves the state (and the auth gate stashes the token
  // across Google sign-in).
  app.get("/s/:token", (req, res) => {
    const token = String(req.params.token ?? "").replace(/[^A-Za-z0-9_-]/g, "");
    res.redirect(302, `/#/s/${token}`);
  });

  app.post("/api/deals/:id/share", requireAuth, async (req, res) => {
    send(res, await createShare(uid(req), Number(req.params.id), req.body ?? {}), 201);
  });

  app.get("/api/shares/inbox", requireAuth, async (req, res) => {
    res.json(await listInbox(uid(req)));
  });

  app.get("/api/shares/inbox/count", requireAuth, async (req, res) => {
    res.json({ count: await inboxCount(uid(req)) });
  });

  app.get("/api/shares/sent", requireAuth, async (req, res) => {
    res.json(await listSent(uid(req)));
  });

  app.post("/api/shares/:id/accept", requireAuth, async (req, res) => {
    send(res, await acceptShare(uid(req), Number(req.params.id)));
  });

  app.post("/api/shares/:id/decline", requireAuth, async (req, res) => {
    send(res, await declineShare(uid(req), Number(req.params.id)));
  });

  app.get("/api/shares/by-token/:token", requireAuth, async (req, res) => {
    res.json(await resolveShareToken(uid(req), String(req.params.token)));
  });
}
