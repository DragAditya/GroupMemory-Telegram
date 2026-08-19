import { ensureTelegramGroup, hasStoredTelegramMessage, persistGroupMessage } from "../db";
import { embedMemoryDocument } from "./ai";
import { handleControlCommand, parseBotCommand } from "./commands";
import { extractMessageMetadata } from "./metadata";
import { answerGroupQuestion, formatGroupSearch } from "./search";
import { getTelegramBotUsername, isVerifiedTelegramWebhook, sendTelegramHtmlMessage } from "./telegram";
import type { TelegramUpdate } from "./types";

async function resolveUserQuery(message: NonNullable<TelegramUpdate["message"]>) {
  const command = parseBotCommand(message.text);
  if (command?.command === "ask" && command.argument) return { kind: "ask" as const, question: command.argument };
  if (command?.command === "search" && command.argument) return { kind: "search" as const, question: command.argument };
  if (!message.text?.trim().startsWith("@")) return null;
  const username = await getTelegramBotUsername();
  const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = message.text.trim().match(new RegExp(`^@${escapedUsername}\\s+([\\s\\S]+)$`, "i"));
  return match?.[1]?.trim() ? { kind: "ask" as const, question: match[1].trim() } : null;
}

export function verifyTelegramWebhook(secret: string | undefined) {
  return isVerifiedTelegramWebhook(secret);
}

export async function processTelegramUpdate(update: TelegramUpdate) {
  const message = update.message ?? update.edited_message;
  if (!message || (message.chat.type !== "group" && message.chat.type !== "supergroup")) return;
  const sender = message.from ?? (message.sender_chat
    ? { id: message.sender_chat.id, first_name: message.sender_chat.title ?? "Anonymous administrator", username: message.sender_chat.username }
    : null);
  if (!sender || sender.is_bot) return;

  const group = await ensureTelegramGroup({
    telegramChatId: message.chat.id,
    chatType: message.chat.type,
    title: message.chat.title,
    username: message.chat.username,
  });
  if (!group) throw new Error("Unable to initialize Telegram group memory");

  const handledControlCommand = await handleControlCommand(message, group);
  if (handledControlCommand) return;

  if (group.memoryEnabled) {
    const isEditedMessage = Boolean(update.edited_message);
    if (isEditedMessage || !(await hasStoredTelegramMessage(group.id, message.message_id))) {
      const metadata = extractMessageMetadata(message);
      const senderName = `${sender.first_name}${message.from?.last_name ? ` ${message.from.last_name}` : ""}`;
      const embedding = await embedMemoryDocument(metadata.textContent, `Telegram group message from ${senderName}`);
      await persistGroupMessage({
        groupId: group.id,
        telegramMessageId: message.message_id,
        senderTelegramUserId: sender.id,
        senderName,
        senderUsername: sender.username,
        textContent: metadata.textContent,
        sentAt: new Date(message.date * 1000),
        ...(isEditedMessage ? { editedAt: new Date() } : {}),
        replyToMessageId: message.reply_to_message?.message_id,
        links: metadata.links,
        media: metadata.media,
        mentions: metadata.mentions,
        topicThreadId: message.message_thread_id,
        originalMessageLink: metadata.originalMessageLink,
        embedding,
      });
    }
  }

  const query = await resolveUserQuery(message);
  if (!query) return;
  const response = query.kind === "ask"
    ? await answerGroupQuestion(message.chat.id, query.question)
    : await formatGroupSearch(message.chat.id, query.question);
  await sendTelegramHtmlMessage(message.chat.id, response, message.message_id);
}
