import { describe, expect, it } from "vitest";
import { prepareDocumentEmbeddingText, prepareQueryEmbeddingText } from "./ai";
import { parseBotCommand } from "./commands";
import { extractMessageMetadata } from "./metadata";
import { isVerifiedTelegramWebhook } from "./telegram";
import type { TelegramMessage } from "./types";
import { formatStartMessage } from "./webhook";

describe("GroupMemory message normalization", () => {
  it("captures text, Telegram entities, media IDs, reply metadata, and a durable source link", () => {
    const message: TelegramMessage = {
      message_id: 84,
      date: 1_765_662_400,
      chat: { id: -1001234567890, type: "supergroup", title: "Engineering" },
      from: { id: 44, first_name: "Rahul", username: "rahul" },
      text: "@Maya shared https://github.com/acme/groupmemory and a docs link",
      entities: [
        { type: "mention", offset: 0, length: 5 },
        { type: "url", offset: 13, length: 35 },
      ],
      reply_to_message: { message_id: 83 },
      message_thread_id: 12,
      photo: [{ file_id: "small-photo" }, { file_id: "large-photo" }],
      document: { file_id: "design-file", file_name: "design.pdf" },
    };

    const metadata = extractMessageMetadata(message);

    expect(metadata.textContent).toContain("github.com/acme/groupmemory");
    expect(metadata.mentions).toEqual(["@Maya"]);
    expect(metadata.links).toEqual(["https://github.com/acme/groupmemory"]);
    expect(metadata.media).toEqual([
      { fileId: "large-photo", type: "photo", fileName: undefined },
      { fileId: "design-file", type: "document", fileName: "design.pdf" },
    ]);
    expect(metadata.originalMessageLink).toBe("https://t.me/c/1234567890/84");
    expect(message.reply_to_message?.message_id).toBe(83);
    expect(message.message_thread_id).toBe(12);
  });

  it("uses non-text media context when a message has no visible text", () => {
    const metadata = extractMessageMetadata({
      message_id: 7,
      date: 1,
      chat: { id: -100777, type: "supergroup" },
      from: { id: 1, first_name: "Sam" },
      voice: { file_id: "voice-file" },
    });

    expect(metadata.textContent).toBe("[voice attachment]");
    expect(metadata.media).toEqual([{ fileId: "voice-file", type: "voice", fileName: undefined }]);
  });
});

describe("GroupMemory command and retrieval guards", () => {
  it("parses command aliases and only accepts the explicit command body", () => {
    expect(parseBotCommand("/retention@GroupMemory 30d")).toEqual({ command: "retention", argument: "30d" });
    expect(parseBotCommand("/ask What did they decide?")).toEqual({ command: "ask", argument: "What did they decide?" });
    expect(parseBotCommand("ask without slash")).toBeNull();
  });

  it("constructs asymmetric Gemini retrieval inputs", () => {
    expect(prepareDocumentEmbeddingText("React event notes", "Telegram group message")).toBe("title: Telegram group message | text: React event notes");
    expect(prepareQueryEmbeddingText("What did they decide?")).toBe("task: question answering | query: What did they decide?");
  });

  it("rejects an incorrect Telegram webhook secret", () => {
    expect(isVerifiedTelegramWebhook(process.env.TELEGRAM_WEBHOOK_SECRET)).toBe(true);
    expect(isVerifiedTelegramWebhook("incorrect-webhook-secret")).toBe(false);
  });

  it("provides useful start guidance in direct chats and in groups", () => {
    expect(formatStartMessage("private")).toContain("<code>/memory on</code>");
    expect(formatStartMessage("private")).toContain("BotFather");
    expect(formatStartMessage("supergroup")).toContain("<code>/search your words</code>");
  });
});
