import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getRetainedMessageCount: vi.fn(), getTopRetainedSender: vi.fn() }));
vi.mock("../db", () => ({
  ensureTelegramGroup: vi.fn(), getRetainedMessageCount: mocks.getRetainedMessageCount, getTopRetainedSender: mocks.getTopRetainedSender,
  hasStoredTelegramMessage: vi.fn(), persistGroupMessage: vi.fn(),
}));
vi.mock("./ai", () => ({ embedMemoryDocument: vi.fn() }));
vi.mock("./commands", () => ({ formatCommandHelp: () => "<b>GroupMemory guide</b>", handleControlCommand: vi.fn(), parseBotCommand: vi.fn() }));
vi.mock("./intents", async importOriginal => ({ ...(await importOriginal<typeof import("./intents")>()), formatCasualAcknowledgement: () => "<b>Thank you.</b>" }));
vi.mock("./metadata", () => ({ extractMessageMetadata: vi.fn() }));
vi.mock("./search", () => ({ answerGroupQuestion: vi.fn(), buildDeleteCallbackData: vi.fn(), buildSourceCallbackData: vi.fn(), formatGroupSearch: vi.fn(), formatSourceDetails: vi.fn(), parseDeleteCallbackData: vi.fn(), parseSourceCallbackData: vi.fn() }));
vi.mock("./telegram", () => ({ answerTelegramCallback: vi.fn(), clearTelegramInlineKeyboard: vi.fn(), deleteTelegramMessage: vi.fn(), getTelegramBotUsername: vi.fn(), isTelegramGroupAdmin: vi.fn(), isVerifiedTelegramWebhook: vi.fn(), sendTelegramHtmlMessage: vi.fn() }));

import { answerKnownIntent } from "./webhook";

describe("exact statistic responses", () => {
  it("reports a personal count directly from retained database facts", async () => {
    mocks.getRetainedMessageCount.mockResolvedValue(4);
    const response = await answerKnownIntent({ kind: "personalMessageCount" }, { id: 8, retentionDays: 30 }, 19);
    expect(response).toContain("<b>4</b> non-command messages from you");
    expect(response).toContain("30-day retained memory");
    expect(mocks.getRetainedMessageCount).toHaveBeenCalledWith(8, 19);
  });

  it("does not invent a conversation count", async () => {
    const response = await answerKnownIntent({ kind: "unsupportedConversationCount" }, { id: 8, retentionDays: 30 }, 19);
    expect(response).toContain("cannot count conversations exactly");
  });
});
