import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTelegramLoginCode: vi.fn(),
  confirmTelegramLoginCode: vi.fn(),
  consumeConfirmedTelegramLoginCode: vi.fn(),
  getTelegramBotUsername: vi.fn(),
  upsertTelegramDashboardUser: vi.fn(),
  linkTelegramIdentityToProjectOwner: vi.fn(),
  createSessionToken: vi.fn(),
}));
vi.mock("./db", () => ({
  createTelegramLoginCode: mocks.createTelegramLoginCode,
  confirmTelegramLoginCode: mocks.confirmTelegramLoginCode,
  consumeConfirmedTelegramLoginCode: mocks.consumeConfirmedTelegramLoginCode,
  upsertTelegramDashboardUser: mocks.upsertTelegramDashboardUser,
  linkTelegramIdentityToProjectOwner: mocks.linkTelegramIdentityToProjectOwner,
}));
vi.mock("./groupmemory/telegram", () => ({ getTelegramBotUsername: mocks.getTelegramBotUsername }));
vi.mock("./_core/sdk", () => ({ sdk: { createSessionToken: mocks.createSessionToken } }));

import { confirmTelegramBotCodeLogin, createTelegramBotCodeLogin, hashTelegramLoginSecret, normalizeTelegramLoginCode } from "./telegram-code-login";

describe("Telegram bot-code dashboard login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTelegramBotUsername.mockResolvedValue("GroupMemory_Bot");
  });

  it("creates a high-entropy code and stores only its hashes", async () => {
    const login = await createTelegramBotCodeLogin();

    expect(login.code).toMatch(/^GM-[A-F0-9]{16}$/);
    expect(login.pollToken).toHaveLength(43);
    expect(login.deepLink).toBe(`https://t.me/GroupMemory_Bot?start=${login.code}`);
    expect(mocks.createTelegramLoginCode).toHaveBeenCalledWith(expect.objectContaining({
      codeHash: hashTelegramLoginSecret(login.code),
      pollTokenHash: hashTelegramLoginSecret(login.pollToken),
      ownerOpenId: null,
    }));
  });

  it("accepts a valid direct-message code only after normalizing it and binds it to the sender identity", async () => {
    mocks.confirmTelegramLoginCode.mockResolvedValue({ status: "confirmed" });

    await expect(confirmTelegramBotCodeLogin(" gm-a1b2c3d4e5f60708 ", {
      telegramId: 9001,
      name: "Maya Singh",
      username: "maya",
    })).resolves.toEqual({ status: "confirmed" });

    expect(mocks.confirmTelegramLoginCode).toHaveBeenCalledWith({
      codeHash: hashTelegramLoginSecret("GM-A1B2C3D4E5F60708"),
      telegramId: 9001,
      telegramName: "Maya Singh",
      telegramUsername: "maya",
    });
  });

  it("rejects malformed codes before any database lookup", async () => {
    expect(normalizeTelegramLoginCode("GM-not-a-valid-code")).toBeUndefined();
    await expect(confirmTelegramBotCodeLogin("not-a-code", { telegramId: 1, name: "Maya" })).resolves.toEqual({ status: "invalid" });
    expect(mocks.confirmTelegramLoginCode).not.toHaveBeenCalled();
  });
});
