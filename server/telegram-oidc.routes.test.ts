import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  linkTelegramIdentityToProjectOwner: vi.fn(),
  upsertTelegramDashboardUser: vi.fn(),
}));
vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(),
    createSessionToken: vi.fn(),
  },
}));
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => vi.fn()),
  jwtVerify: vi.fn(),
}));

import * as db from "./db";
import { sdk } from "./_core/sdk";
import { jwtVerify } from "jose";
import { registerTelegramOidcRoutes, telegramOidcInternals } from "./telegram-oidc";

describe("Telegram OIDC callback routes", () => {
  let server: Server;
  let baseUrl: string;
  const nativeFetch = globalThis.fetch;

  beforeAll(async () => {
    const app = express();
    registerTelegramOidcRoutes(app);
    server = await new Promise<Server>(resolve => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.linkTelegramIdentityToProjectOwner).mockResolvedValue({ openId: "existing-owner", name: "Owner" } as never);
    vi.mocked(sdk.createSessionToken).mockResolvedValue("signed-dashboard-session");
    vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: "9001", name: "Owner Telegram", preferred_username: "owner" } } as never);
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "https://oauth.telegram.org/token") {
        return Promise.resolve(new Response(JSON.stringify({ id_token: "verified-id-token" }), { status: 200, headers: { "content-type": "application/json" } }));
      }
      return nativeFetch(input, init);
    }));
  });

  it("rejects a callback whose signed owner-link state metadata was altered", async () => {
    const encoded = telegramOidcInternals.encodeStateCookie({
      state: "expected-state",
      verifier: "pkce-verifier",
      redirectUri: `${baseUrl}/api/auth/telegram/callback`,
      intent: "owner-link",
      ownerOpenId: "existing-owner",
      returnTo: "/",
      createdAt: Date.now(),
    });
    const [, signature] = encoded.split(".");
    const alteredPayload = Buffer.from(JSON.stringify({
      state: "expected-state",
      verifier: "pkce-verifier",
      redirectUri: `${baseUrl}/api/auth/telegram/callback`,
      intent: "owner-link",
      ownerOpenId: "attacker-owner",
      returnTo: "/",
      createdAt: Date.now(),
    })).toString("base64url");

    const response = await nativeFetch(`${baseUrl}/api/auth/telegram/callback?code=code&state=expected-state`, {
      headers: { cookie: `__Host-telegram_oidc_state=${alteredPayload}.${signature}` },
      redirect: "manual",
    });

    expect(response.status).toBe(403);
    expect(db.linkTelegramIdentityToProjectOwner).not.toHaveBeenCalled();
  });

  it("binds a verified Telegram identity only to the owner encoded in a valid signed owner-link state", async () => {
    const encoded = telegramOidcInternals.encodeStateCookie({
      state: "expected-state",
      verifier: "pkce-verifier",
      redirectUri: `${baseUrl}/api/auth/telegram/callback`,
      intent: "owner-link",
      ownerOpenId: "existing-owner",
      returnTo: "/",
      createdAt: Date.now(),
    });

    const response = await nativeFetch(`${baseUrl}/api/auth/telegram/callback?code=code&state=expected-state`, {
      headers: { cookie: `__Host-telegram_oidc_state=${encoded}` },
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(db.linkTelegramIdentityToProjectOwner).toHaveBeenCalledWith("existing-owner", {
      telegramId: 9001,
      name: "Owner Telegram",
      username: "owner",
    });
    expect(response.headers.get("set-cookie")).toContain("app_session_id=signed-dashboard-session");
  });
});
