import { describe, expect, it } from "vitest";
import { telegramOidcInternals } from "./telegram-oidc";

describe("Telegram OIDC state helpers", () => {
  it("keeps the PKCE verifier and callback intent in a tamper-resistant cookie payload shape", () => {
    const encoded = telegramOidcInternals.encodeStateCookie({
      state: "state-value",
      verifier: "pkce-verifier",
      redirectUri: "https://groupmem-bot-vzveavoe.manus.space/api/auth/telegram/callback",
      intent: "owner-link",
      ownerOpenId: "project-owner",
      returnTo: "/",
      createdAt: Date.now(),
    });

    expect(telegramOidcInternals.decodeStateCookie(encoded)).toMatchObject({
      state: "state-value",
      verifier: "pkce-verifier",
      intent: "owner-link",
      ownerOpenId: "project-owner",
    });
  });

  it("rejects malformed state cookies and open redirects", () => {
    expect(telegramOidcInternals.decodeStateCookie("not-a-valid-cookie")).toBeNull();
    expect(telegramOidcInternals.safeReturnPath("https://attacker.example")).toBe("/");
    expect(telegramOidcInternals.safeReturnPath("//attacker.example")).toBe("/");
    expect(telegramOidcInternals.safeReturnPath("/groups")).toBe("/groups");
  });

  it("rejects state metadata when its signed payload is altered", () => {
    const encoded = telegramOidcInternals.encodeStateCookie({
      state: "state-value",
      verifier: "pkce-verifier",
      redirectUri: "https://groupmem-bot-vzveavoe.manus.space/api/auth/telegram/callback",
      intent: "login",
      returnTo: "/",
      createdAt: Date.now(),
    });
    const [payload, signature] = encoded.split(".");
    const alteredPayload = Buffer.from(JSON.stringify({
      state: "state-value",
      verifier: "pkce-verifier",
      redirectUri: "https://groupmem-bot-vzveavoe.manus.space/api/auth/telegram/callback",
      intent: "owner-link",
      ownerOpenId: "attacker-selected-owner",
      returnTo: "/",
      createdAt: Date.now(),
    })).toString("base64url");

    expect(telegramOidcInternals.decodeStateCookie(`${alteredPayload}.${signature}`)).toBeNull();
    expect(telegramOidcInternals.decodeStateCookie(`${payload}.altered-signature`)).toBeNull();
  });
});
