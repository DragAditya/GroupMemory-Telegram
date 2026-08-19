import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { Express, Request, Response } from "express";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";

const TELEGRAM_AUTHORIZATION_ENDPOINT = "https://oauth.telegram.org/auth";
const TELEGRAM_TOKEN_ENDPOINT = "https://oauth.telegram.org/token";
const TELEGRAM_ISSUER = "https://oauth.telegram.org";
const TELEGRAM_JWKS = createRemoteJWKSet(new URL("https://oauth.telegram.org/.well-known/jwks.json"));
const TELEGRAM_OIDC_STATE_COOKIE = "__Host-telegram_oidc_state";
const OIDC_STATE_MAX_AGE_MS = 10 * 60 * 1000;

type LoginIntent = "login" | "owner-link";

type OidcState = {
  state: string;
  verifier: string;
  redirectUri: string;
  intent: LoginIntent;
  ownerOpenId?: string;
  returnTo: string;
  createdAt: number;
};

export type TelegramIdentity = {
  telegramId: number;
  name: string;
  username: string | null;
};

function firstHeaderValue(value: string | string[] | undefined) {
  const resolved = Array.isArray(value) ? value[0] : value;
  return resolved?.split(",")[0]?.trim();
}

function requestOrigin(req: Request) {
  const forwardedProto = firstHeaderValue(req.headers["x-forwarded-proto"]);
  const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : req.protocol;
  const host = firstHeaderValue(req.headers["x-forwarded-host"]) ?? req.get("host");
  if (!host || /[\s/\\]/.test(host)) throw new Error("Unable to determine a safe callback origin");
  return `${protocol}://${host}`;
}

function safeReturnPath(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function stateCookieOptions(req: Request) {
  const session = getSessionCookieOptions(req);
  return { ...session, sameSite: "lax" as const, maxAge: OIDC_STATE_MAX_AGE_MS };
}

function encodeStateCookie(state: OidcState) {
  if (!ENV.cookieSecret) throw new Error("Dashboard session secret is not configured");
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", ENV.cookieSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function decodeStateCookie(value: string | undefined): OidcState | null {
  if (!value) return null;
  try {
    if (!ENV.cookieSecret) return null;
    const [payload, signature, extra] = value.split(".");
    if (!payload || !signature || extra) return null;
    const expectedSignature = createHmac("sha256", ENV.cookieSecret).update(payload).digest();
    const receivedSignature = Buffer.from(signature, "base64url");
    if (expectedSignature.length !== receivedSignature.length || !timingSafeEqual(expectedSignature, receivedSignature)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<OidcState>;
    if (
      typeof parsed.state !== "string" ||
      typeof parsed.verifier !== "string" ||
      typeof parsed.redirectUri !== "string" ||
      typeof parsed.createdAt !== "number" ||
      (parsed.intent !== "login" && parsed.intent !== "owner-link")
    ) {
      return null;
    }
    return {
      state: parsed.state,
      verifier: parsed.verifier,
      redirectUri: parsed.redirectUri,
      intent: parsed.intent,
      ownerOpenId: typeof parsed.ownerOpenId === "string" ? parsed.ownerOpenId : undefined,
      returnTo: safeReturnPath(parsed.returnTo),
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

function buildAuthorizationUrl(state: OidcState) {
  const challenge = createHash("sha256").update(state.verifier).digest("base64url");
  const url = new URL(TELEGRAM_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", ENV.telegramOidcClientId);
  url.searchParams.set("redirect_uri", state.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile");
  url.searchParams.set("state", state.state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function exchangeAuthorizationCode(code: string, state: OidcState) {
  if (!ENV.telegramOidcClientId || !ENV.telegramOidcClientSecret) {
    throw new Error("Telegram Login credentials are not configured");
  }
  const authorization = Buffer.from(`${ENV.telegramOidcClientId}:${ENV.telegramOidcClientSecret}`).toString("base64");
  const response = await fetch(TELEGRAM_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Basic ${authorization}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: state.redirectUri,
      client_id: ENV.telegramOidcClientId,
      code_verifier: state.verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => null)) as { id_token?: unknown; error?: unknown } | null;
  if (!response.ok || typeof body?.id_token !== "string") {
    console.warn("[Telegram OIDC] Token exchange rejected", { status: response.status, error: body?.error ?? "missing_id_token" });
    throw new Error("Telegram Login code exchange was rejected");
  }
  return body.id_token;
}

function requiredClaim(payload: JWTPayload, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function verifyTelegramIdentityToken(idToken: string): Promise<TelegramIdentity> {
  if (!ENV.telegramOidcClientId) throw new Error("Telegram Login client ID is not configured");
  const { payload } = await jwtVerify(idToken, TELEGRAM_JWKS, {
    issuer: TELEGRAM_ISSUER,
    audience: ENV.telegramOidcClientId,
  });
  const subject = requiredClaim(payload, "sub");
  const telegramId = typeof payload.id === "number" || typeof payload.id === "string"
    ? Number(payload.id)
    : Number.NaN;
  if (!subject || !Number.isSafeInteger(telegramId) || telegramId <= 0) {
    throw new Error("Telegram Login token is missing a valid Telegram user identity");
  }
  const username = requiredClaim(payload, "preferred_username") ?? requiredClaim(payload, "username") ?? null;
  const name = requiredClaim(payload, "name")
    ?? [requiredClaim(payload, "given_name"), requiredClaim(payload, "family_name")].filter(Boolean).join(" ")
    ?? username
    ?? `Telegram user ${telegramId}`;
  return { telegramId, name, username };
}

async function startTelegramLogin(req: Request, res: Response, intent: LoginIntent, ownerOpenId?: string) {
  if (!ENV.telegramOidcClientId || !ENV.telegramOidcClientSecret) {
    res.status(503).json({ error: "Telegram Login is not configured" });
    return;
  }
  const redirectUri = `${requestOrigin(req)}/api/auth/telegram/callback`;
  const state: OidcState = {
    state: randomBytes(32).toString("base64url"),
    verifier: randomBytes(64).toString("base64url"),
    redirectUri,
    intent,
    ownerOpenId,
    returnTo: safeReturnPath(req.query.returnTo),
    createdAt: Date.now(),
  };
  res.cookie(TELEGRAM_OIDC_STATE_COOKIE, encodeStateCookie(state), stateCookieOptions(req));
  res.redirect(302, buildAuthorizationUrl(state));
}

export function registerTelegramOidcRoutes(app: Express) {
  app.get("/api/auth/telegram/login", async (req, res) => {
    try {
      await startTelegramLogin(req, res, "login");
    } catch (error) {
      console.error("[Telegram OIDC] Login start failed", error);
      res.status(400).json({ error: "Unable to start Telegram Login" });
    }
  });

  app.get("/api/auth/telegram/link-owner", async (req, res) => {
    try {
      const owner = await sdk.authenticateRequest(req);
      if (!owner.isProjectOwner) {
        res.status(403).json({ error: "Project owner access is required" });
        return;
      }
      await startTelegramLogin(req, res, "owner-link", owner.openId);
    } catch (error) {
      console.error("[Telegram OIDC] Owner-link start failed", error);
      res.status(403).json({ error: "A signed-in project owner is required" });
    }
  });

  app.get("/api/auth/telegram/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const stateValue = typeof req.query.state === "string" ? req.query.state : undefined;
    const cookieValue = parseCookieHeader(req.headers.cookie ?? "")[TELEGRAM_OIDC_STATE_COOKIE];
    const state = decodeStateCookie(cookieValue);
    const { maxAge: _maxAge, ...clearStateCookieOptions } = stateCookieOptions(req);
    res.clearCookie(TELEGRAM_OIDC_STATE_COOKIE, clearStateCookieOptions);

    if (!code || !stateValue || !state || state.state !== stateValue || Date.now() - state.createdAt > OIDC_STATE_MAX_AGE_MS) {
      res.status(403).json({ error: "Invalid or expired Telegram Login state" });
      return;
    }

    try {
      const idToken = await exchangeAuthorizationCode(code, state);
      const identity = await verifyTelegramIdentityToken(idToken);
      const user = state.intent === "owner-link"
        ? await db.linkTelegramIdentityToProjectOwner(state.ownerOpenId ?? "", identity)
        : await db.upsertTelegramDashboardUser(identity);
      if (!user) throw new Error("Telegram dashboard user was not found");

      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? identity.name, expiresInMs: ONE_YEAR_MS });
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, state.returnTo);
    } catch (error) {
      console.error("[Telegram OIDC] Callback failed", error);
      res.status(401).json({ error: "Telegram Login could not be verified" });
    }
  });
}

export const telegramOidcInternals = {
  buildAuthorizationUrl,
  decodeStateCookie,
  encodeStateCookie,
  safeReturnPath,
};
