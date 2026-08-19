import { describe, expect, it } from "vitest";

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const geminiKey = process.env.GEMINI_API_KEY;

describe("provider credentials", () => {
  it("accepts the configured Telegram token, webhook secret, and Gemini API key", async () => {
    expect(telegramToken).toMatch(/^\d+:[A-Za-z0-9_-]+$/);
    expect(telegramWebhookSecret).toMatch(/^[A-Za-z0-9_-]{16,256}$/);
    expect(geminiKey).toMatch(/^[A-Za-z0-9_-]{16,}$/);

    const [telegramResponse, geminiResponse] = await Promise.all([
      fetch(`https://api.telegram.org/bot${telegramToken}/getMe`),
      fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2", {
        headers: { "x-goog-api-key": geminiKey! },
      }),
    ]);

    expect(telegramResponse.ok).toBe(true);
    expect((await telegramResponse.json()) as { ok: boolean }).toMatchObject({ ok: true });
    expect(geminiResponse.ok).toBe(true);
  }, 20_000);
});
