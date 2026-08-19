import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { createHash, randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { getTelegramBotUsername } from "./groupmemory/telegram";

const LOGIN_CODE_TTL_MS = 10 * 60 * 1000;
const LOGIN_CODE_PATTERN = /^GM-[A-F0-9]{16}$/;

export type TelegramCodeIdentity = {
  telegramId: number;
  name: string;
  username?: string | null;
};

export function hashTelegramLoginSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeTelegramLoginCode(value: string | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized && LOGIN_CODE_PATTERN.test(normalized) ? normalized : undefined;
}

function createRawCode() {
  return `GM-${randomBytes(8).toString("hex").toUpperCase()}`;
}

function createPollToken() {
  return randomBytes(32).toString("base64url");
}

export async function createTelegramBotCodeLogin(ownerOpenId?: string) {
  const code = createRawCode();
  const pollToken = createPollToken();
  await db.createTelegramLoginCode({
    codeHash: hashTelegramLoginSecret(code),
    pollTokenHash: hashTelegramLoginSecret(pollToken),
    ownerOpenId: ownerOpenId ?? null,
    expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS),
  });
  const username = await getTelegramBotUsername();
  return {
    code,
    pollToken,
    expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS),
    deepLink: `https://t.me/${username}?start=${code}`,
  };
}

export async function confirmTelegramBotCodeLogin(code: string | undefined, identity: TelegramCodeIdentity) {
  const normalizedCode = normalizeTelegramLoginCode(code);
  if (!normalizedCode) return { status: "invalid" as const };
  const confirmation = await db.confirmTelegramLoginCode({
    codeHash: hashTelegramLoginSecret(normalizedCode),
    telegramId: identity.telegramId,
    telegramName: identity.name,
    telegramUsername: identity.username ?? null,
  });
  return confirmation;
}

async function createSessionFromCode(pollToken: string) {
  const code = await db.consumeConfirmedTelegramLoginCode(hashTelegramLoginSecret(pollToken));
  if (!code) return undefined;
  const identity = {
    telegramId: code.telegramId!,
    name: code.telegramName!,
    username: code.telegramUsername,
  };
  const user = code.ownerOpenId
    ? await db.linkTelegramIdentityToProjectOwner(code.ownerOpenId, identity)
    : await db.upsertTelegramDashboardUser(identity);
  if (!user) throw new Error("Linked Telegram dashboard user was not found");
  return {
    sessionToken: await sdk.createSessionToken(user.openId, { name: user.name ?? identity.name, expiresInMs: ONE_YEAR_MS }),
    user,
  };
}

export function registerTelegramBotCodeLoginRoutes(app: Express) {
  app.post("/api/auth/telegram/code/start", async (req: Request, res: Response) => {
    try {
      let ownerOpenId: string | undefined;
      try {
        const user = await sdk.authenticateRequest(req);
        if (user.isProjectOwner) ownerOpenId = user.openId;
      } catch {
        // Code login is primarily public. An authenticated owner gets an additional
        // durable-account binding without exposing that owner identity to the browser.
      }
      const login = await createTelegramBotCodeLogin(ownerOpenId);
      res.status(201).json({
        code: login.code,
        deepLink: login.deepLink,
        pollToken: login.pollToken,
        expiresAt: login.expiresAt.toISOString(),
        ownerLink: Boolean(ownerOpenId),
      });
    } catch (error) {
      console.error("[Telegram code login] Start failed", error);
      res.status(500).json({ error: "Unable to create a Telegram link code" });
    }
  });

  app.post("/api/auth/telegram/code/status", async (req: Request, res: Response) => {
    const pollToken = typeof req.body?.pollToken === "string" ? req.body.pollToken : undefined;
    if (!pollToken || pollToken.length < 32) {
      res.status(400).json({ error: "A valid link status token is required" });
      return;
    }
    try {
      const pollTokenHash = hashTelegramLoginSecret(pollToken);
      const currentStatus = await db.getTelegramLoginCodePollStatus(pollTokenHash);
      if (currentStatus !== "confirmed") {
        const statuses = {
          pending: { http: 202, message: undefined },
          expired: { http: 410, message: "This Telegram link code expired. Create a new code and try again." },
          consumed: { http: 409, message: "This Telegram link code has already been used. Create a new code if you need to sign in again." },
          invalid: { http: 404, message: "This Telegram link code is invalid. Create a new code and try again." },
        } as const;
        const outcome = statuses[currentStatus];
        res.status(outcome.http).json({ status: currentStatus, ...(outcome.message ? { error: outcome.message } : {}) });
        return;
      }
      const linked = await createSessionFromCode(pollToken);
      if (!linked) {
        // A competing request consumed the confirmed record after the state check.
        res.status(409).json({ status: "consumed", error: "This Telegram link code has already been used. Create a new code if you need to sign in again." });
        return;
      }
      res.cookie(COOKIE_NAME, linked.sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.status(200).json({ status: "linked", isProjectOwner: linked.user.isProjectOwner });
    } catch (error) {
      console.error("[Telegram code login] Status failed", error);
      res.status(500).json({ error: "Unable to complete the Telegram link" });
    }
  });
}
