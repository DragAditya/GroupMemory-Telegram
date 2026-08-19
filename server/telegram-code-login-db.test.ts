import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { telegramLoginCodes } from "../drizzle/schema";
import {
  confirmTelegramLoginCode,
  consumeConfirmedTelegramLoginCode,
  createTelegramLoginCode,
  getDb,
} from "./db";
import { hashTelegramLoginSecret } from "./telegram-code-login";

describe("Telegram bot-code persistence", () => {
  const code = `GM-${randomBytes(8).toString("hex").toUpperCase()}`;
  const pollToken = randomBytes(32).toString("base64url");

  afterEach(async () => {
    const db = await getDb();
    if (db) await db.delete(telegramLoginCodes).where(eq(telegramLoginCodes.codeHash, hashTelegramLoginSecret(code)));
  });

  it("confirms and consumes the code exactly once", async () => {
    await createTelegramLoginCode({
      codeHash: hashTelegramLoginSecret(code),
      pollTokenHash: hashTelegramLoginSecret(pollToken),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(confirmTelegramLoginCode({
      codeHash: hashTelegramLoginSecret(code),
      telegramId: 9001,
      telegramName: "Maya Singh",
      telegramUsername: "maya",
    })).resolves.toMatchObject({ status: "confirmed" });

    await expect(consumeConfirmedTelegramLoginCode(hashTelegramLoginSecret(pollToken))).resolves.toMatchObject({
      telegramId: 9001,
      telegramName: "Maya Singh",
      telegramUsername: "maya",
    });
    await expect(consumeConfirmedTelegramLoginCode(hashTelegramLoginSecret(pollToken))).resolves.toBeUndefined();
  }, 15_000);
});
