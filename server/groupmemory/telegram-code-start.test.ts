import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmTelegramBotCodeLogin: vi.fn(),
  sendTelegramHtmlMessage: vi.fn(),
}));
vi.mock("../db", () => ({ ensureTelegramGroup: vi.fn(), getRetainedMessageCount: vi.fn(), getTopRetainedSender: vi.fn(), hasStoredTelegramMessage: vi.fn(), persistGroupMessage: vi.fn() }));
vi.mock("../telegram-code-login", () => ({ confirmTelegramBotCodeLogin: mocks.confirmTelegramBotCodeLogin }));
vi.mock("./ai", () => ({ embedMemoryDocument: vi.fn() }));
vi.mock("./commands", () => ({ formatCommandHelp: vi.fn(), handleControlCommand: vi.fn(), parseBotCommand: (text?: string) => text?.startsWith("/start") ? { command: "start", argument: text.slice(6).trim() } : null }));
vi.mock("./intents", () => ({ classifyGroupMemoryIntent: vi.fn(), formatCasualAcknowledgement: vi.fn() }));
vi.mock("./metadata", () => ({ extractMessageMetadata: vi.fn() }));
vi.mock("./search", () => ({ answerGroupQuestion: vi.fn(), buildDeleteCallbackData: vi.fn(), buildSourceCallbackData: vi.fn(), formatGroupSearch: vi.fn(), formatSourceDetails: vi.fn(), parseDeleteCallbackData: vi.fn(), parseSourceCallbackData: vi.fn() }));
vi.mock("./telegram", () => ({ answerTelegramCallback: vi.fn(), clearTelegramInlineKeyboard: vi.fn(), deleteTelegramMessage: vi.fn(), getTelegramBotUsername: vi.fn(), isTelegramGroupAdmin: vi.fn(), isVerifiedTelegramWebhook: vi.fn(), sendTelegramHtmlMessage: mocks.sendTelegramHtmlMessage }));

import { processTelegramUpdate } from "./webhook";

describe("Telegram `/start <code>` dashboard confirmation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("binds a private-chat start code to the actual Telegram sender", async () => {
    mocks.confirmTelegramBotCodeLogin.mockResolvedValue({ status: "confirmed" });
    await processTelegramUpdate({
      update_id: 1,
      message: { message_id: 12, date: 1, chat: { id: 9001, type: "private" }, from: { id: 9001, first_name: "Maya", last_name: "Singh", username: "maya" }, text: "/start GM-A1B2C3D4E5F60708" },
    });

    expect(mocks.confirmTelegramBotCodeLogin).toHaveBeenCalledWith("GM-A1B2C3D4E5F60708", { telegramId: 9001, name: "Maya Singh", username: "maya" });
    expect(mocks.sendTelegramHtmlMessage).toHaveBeenCalledWith(9001, expect.stringContaining("Dashboard linked"), 12);
  });

  it("does not treat a group start parameter as a dashboard-link attempt", async () => {
    await processTelegramUpdate({
      update_id: 2,
      message: { message_id: 13, date: 1, chat: { id: -100123, type: "supergroup" }, from: { id: 9001, first_name: "Maya" }, text: "/start GM-A1B2C3D4E5F60708" },
    });

    expect(mocks.confirmTelegramBotCodeLogin).not.toHaveBeenCalled();
  });
});
