import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTelegramGroupByChatId: vi.fn(),
  searchGroupMessagesByVector: vi.fn(),
  getGroupMessagesByIds: vi.fn(),
  embedMemoryQuery: vi.fn(),
  generateGroundedAnswer: vi.fn(),
}));

vi.mock("../db", () => ({
  getTelegramGroupByChatId: mocks.getTelegramGroupByChatId,
  searchGroupMessagesByVector: mocks.searchGroupMessagesByVector,
  getGroupMessagesByIds: mocks.getGroupMessagesByIds,
}));
vi.mock("./ai", () => ({
  embedMemoryQuery: mocks.embedMemoryQuery,
  generateGroundedAnswer: mocks.generateGroundedAnswer,
}));

import { answerGroupQuestion, formatGroupSearch, formatSourceDetails } from "./search";

const group = { id: 3, memoryEnabled: true, retentionDays: 30 };
const messageRow = {
  id: 7,
  senderName: "Rahul",
  senderUsername: "rahul",
  textContent: "The event date is Friday. https://example.com/event",
  sentAt: new Date(Date.UTC(2026, 7, 19, 14, 5)),
  links: ["https://example.com/event"],
  originalMessageLink: "https://t.me/c/123/7",
  distance: 0.12,
};

describe("Telegram answer presentation", () => {
  it("returns a compact answer with source IDs instead of embedding the source list", async () => {
    mocks.getTelegramGroupByChatId.mockResolvedValue(group);
    mocks.embedMemoryQuery.mockResolvedValue([0.1]);
    mocks.searchGroupMessagesByVector.mockResolvedValue([messageRow]);
    mocks.generateGroundedAnswer.mockResolvedValue({ hasEnoughEvidence: true, answer: "The event is on Friday.", usedMessageIds: [7] });

    const response = await answerGroupQuestion(-100123, "When is the event?");

    expect(response).toEqual({
      text: expect.stringContaining("Evidence is ready"),
      sourceIds: [7],
    });
    expect(response.text).not.toContain("https://t.me/c/123/7");
  });

  it("returns compact search output with an evidence button payload", async () => {
    mocks.getTelegramGroupByChatId.mockResolvedValue(group);
    mocks.embedMemoryQuery.mockResolvedValue([0.1]);
    mocks.searchGroupMessagesByVector.mockResolvedValue([messageRow]);

    const response = await formatGroupSearch(-100123, "event");

    expect(response.text).toContain("Search complete");
    expect(response.sourceIds).toEqual([7]);
  });

  it("formats evidence details with a readable UTC timestamp and direct source link", async () => {
    mocks.getTelegramGroupByChatId.mockResolvedValue(group);
    mocks.getGroupMessagesByIds.mockResolvedValue([messageRow]);

    const details = await formatSourceDetails(-100123, [7]);

    expect(details).toContain("Evidence · 1 message");
    expect(details).toContain("19 Aug 2026 · 14:05 UTC");
    expect(details).toContain("https://t.me/c/123/7");
  });
});
