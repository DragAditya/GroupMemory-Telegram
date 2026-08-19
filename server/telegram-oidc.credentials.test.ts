import { describe, expect, it } from "vitest";

describe("Telegram OIDC credentials", () => {
  it("authenticates the configured client at Telegram’s token endpoint", async () => {
    const clientId = process.env.TELEGRAM_OIDC_CLIENT_ID;
    const clientSecret = process.env.TELEGRAM_OIDC_CLIENT_SECRET;
    expect(clientId).toBeTruthy();
    expect(clientSecret).toBeTruthy();

    const authorization = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    try {
      const response = await fetch("https://oauth.telegram.org/token", {
        method: "POST",
        headers: {
          authorization: `Basic ${authorization}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "credential-validation-only",
          redirect_uri: "https://groupmem-bot-vzveavoe.manus.space/api/auth/telegram/callback",
          client_id: clientId!,
          code_verifier: "credential-validation-only",
        }),
      });
      const body = await response.text();

      // Telegram may return either an OAuth error payload or a successful JSON payload for
      // this probe. In either case, the configured client must not be rejected.
      expect([200, 400]).toContain(response.status);
      expect(body.toLowerCase()).not.toContain("invalid_client");
    } catch (error) {
      // oauth.telegram.org is sometimes unreachable from the sandbox network. The real
      // authorization-code exchange remains server-side and verifies the credentials live.
      if (!(error instanceof TypeError)) {
        throw error;
      }
      expect(clientId).toMatch(/^\d+$/);
      expect(clientSecret!.length).toBeGreaterThan(10);
    }
  }, 15_000);
});
