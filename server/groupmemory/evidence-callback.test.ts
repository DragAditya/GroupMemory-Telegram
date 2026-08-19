import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  answerTelegramCallback: vi.fn(),
  sendTelegramHtmlMessage: vi.fn(),
  formatSourceDetails: vi.fn(),
}));

vi.mock("../db", () => ({ ensureTelegramGroup: vi.fn(), hasStoredTelegramMessage: vi.fn(), persistGroupMessage: vi.fn() }));
vi.mock("./ai", () => ({ embedMemoryDocument: vi.fn() }));
vi.mock("./commands", () => ({ formatCommandHelp: vi.fn(), handleControlCommand: vi.fn(), parseBotCommand: vi.fn() }));
vi.mock("./metadata", () => ({ extractMessageMetadata: vi.fn() }));
vi.mock("./search", () => ({
  answerGroupQuestion: vi.fn(),
  buildSourceCallbackData: vi.fn(),
  formatGroupSearch: vi.fn(),
  formatSourceDetails: mocks.formatSourceDetails,
  parseSourceCallbackData: (value?: string) => value === "src:7,4" ? [7, 4] : [],
}));
vi.mock("./telegram", () => ({
  answerTelegramCallback: mocks.answerTelegramCallback,
  getTelegramBotUsername: vi.fn(),
  isVerifiedTelegramWebhook: vi.fn(),
  sendTelegramHtmlMessage: mocks.sendTelegramHtmlMessage,
}));

import { processTelegramUpdate } from "./webhook";

describe("evidence callback handling", () => {
  it("opens compact evidence details when the source button is pressed", async () => {
    mocks.formatSourceDetails.mockResolvedValue("<b>Evidence · 2 messages</b>");

    await processTelegramUpdate({
      update_id: 1,
      callback_query: {
        id: "callback-1",
        data: "src:7,4",
        from: { id: 5, first_name: "Maya" },
        message: { message_id: 90, date: 1, chat: { id: -100123, type: "supergroup" } },
      },
    });

    expect(mocks.answerTelegramCallback).toHaveBeenCalledWith("callback-1", "Opening evidence");
    expect(mocks.sendTelegramHtmlMessage).toHaveBeenCalledWith(-100123, "<b>Evidence · 2 messages</b>", 90);
  });
});
