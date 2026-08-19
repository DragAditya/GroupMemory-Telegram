import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ answerTelegramCallback: vi.fn(), deleteTelegramMessage: vi.fn(), isTelegramGroupAdmin: vi.fn() }));
vi.mock("../db", () => ({ ensureTelegramGroup: vi.fn(), getRetainedMessageCount: vi.fn(), getTopRetainedSender: vi.fn(), hasStoredTelegramMessage: vi.fn(), persistGroupMessage: vi.fn() }));
vi.mock("./ai", () => ({ embedMemoryDocument: vi.fn() }));
vi.mock("./commands", () => ({ formatCommandHelp: vi.fn(), handleControlCommand: vi.fn(), parseBotCommand: vi.fn() }));
vi.mock("./intents", () => ({ classifyGroupMemoryIntent: vi.fn(), formatCasualAcknowledgement: vi.fn() }));
vi.mock("./metadata", () => ({ extractMessageMetadata: vi.fn() }));
vi.mock("./search", () => ({ answerGroupQuestion: vi.fn(), buildDeleteCallbackData: vi.fn(), buildSourceCallbackData: vi.fn(), formatGroupSearch: vi.fn(), formatSourceDetails: vi.fn(), parseDeleteCallbackData: (value?: string) => value === "del:5" ? 5 : null, parseSourceCallbackData: vi.fn() }));
vi.mock("./telegram", () => ({ answerTelegramCallback: mocks.answerTelegramCallback, clearTelegramInlineKeyboard: vi.fn(), deleteTelegramMessage: mocks.deleteTelegramMessage, getTelegramBotUsername: vi.fn(), isTelegramGroupAdmin: mocks.isTelegramGroupAdmin, isVerifiedTelegramWebhook: vi.fn(), sendTelegramHtmlMessage: vi.fn() }));

import { processTelegramUpdate } from "./webhook";

const callbackUpdate = (userId: number) => ({ update_id: 1, callback_query: { id: "delete-1", data: "del:5", from: { id: userId, first_name: "Member" }, message: { message_id: 90, date: 1, chat: { id: -100123, type: "supergroup" as const } } } });

describe("answer deletion authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows the requester to delete the bot response", async () => {
    await processTelegramUpdate(callbackUpdate(5));
    expect(mocks.deleteTelegramMessage).toHaveBeenCalledWith(-100123, 90);
    expect(mocks.answerTelegramCallback).toHaveBeenCalledWith("delete-1", "Message deleted");
  });

  it("blocks a non-admin who did not request the answer", async () => {
    mocks.isTelegramGroupAdmin.mockResolvedValue(false);
    await processTelegramUpdate(callbackUpdate(9));
    expect(mocks.deleteTelegramMessage).not.toHaveBeenCalled();
    expect(mocks.answerTelegramCallback).toHaveBeenCalledWith("delete-1", "Only the requester or a group admin can delete this.");
  });
});
