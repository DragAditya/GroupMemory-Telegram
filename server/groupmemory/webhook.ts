import { ensureTelegramGroup, hasStoredTelegramMessage, persistGroupMessage } from "../db";
import { embedMemoryDocument } from "./ai";
import { formatCommandHelp, handleControlCommand, parseBotCommand } from "./commands";
import { extractMessageMetadata } from "./metadata";
import { answerGroupQuestion, buildSourceCallbackData, formatGroupSearch, formatSourceDetails, parseSourceCallbackData } from "./search";
import { answerTelegramCallback, getTelegramBotUsername, isVerifiedTelegramWebhook, sendTelegramHtmlMessage } from "./telegram";
import type { TelegramUpdate } from "./types";

export async function resolveUserQuery(message: NonNullable<TelegramUpdate["message"]>) {
  const command = parseBotCommand(message.text);
  if (command?.command === "ask" && command.argument) return { kind: "ask" as const, question: command.argument };
  if (command?.command === "search" && command.argument) return { kind: "search" as const, question: command.argument };
  const repliedBotText = message.reply_to_message?.text?.trim() ?? "";
  const isGroupMemoryReply = message.reply_to_message?.from?.is_bot && /^(GroupMemory|Search complete|Evidence)/i.test(repliedBotText);
  if (message.text?.trim() && isGroupMemoryReply) {
    const priorAnswer = message.reply_to_message?.text?.slice(0, 900) ?? "";
    return {
      kind: "ask" as const,
      question: message.text.trim(),
      retrievalHint: `${message.text.trim()}\n\nFollow-up to a prior GroupMemory answer: ${priorAnswer}`,
    };
  }
  if (!message.text?.trim().startsWith("@")) return null;
  const username = await getTelegramBotUsername();
  const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = message.text.trim().match(new RegExp(`^@${escapedUsername}\\s+([\\s\\S]+)$`, "i"));
  return match?.[1]?.trim() ? { kind: "ask" as const, question: match[1].trim() } : null;
}

export function verifyTelegramWebhook(secret: string | undefined) {
  return isVerifiedTelegramWebhook(secret);
}

export function formatStartMessage(chatType: string) {
  if (chatType === "private") {
    return [
      "<b>Welcome to GroupMemory</b>",
      "I help Telegram groups remember and search their conversations.",
      "",
      "<b>How to start</b>",
      "1. Turn off Group Privacy for this bot in BotFather.",
      "2. Add the bot as an admin in your group.",
      "3. In the group, send <code>/memory on</code>.",
      "",
      "Then use <code>/ask What did we decide?</code>, <code>/search React</code>, or reply to an answer with your next question.",
    ].join("\n");
  }
  return [
    "<b>GroupMemory is ready</b>",
    "An admin can start recording with <code>/memory on</code>.",
    "",
    "Ask with <code>/ask your question</code>, search with <code>/search your words</code>, mention me with a question, or reply to any answer with a follow-up.",
    "",
    "Use <code>/help</code> for the full command guide.",
  ].join("\n");
}

export async function processTelegramUpdate(update: TelegramUpdate) {
  if (update.callback_query?.message) {
    const sourceIds = parseSourceCallbackData(update.callback_query.data);
    if (sourceIds.length) {
      const details = await formatSourceDetails(update.callback_query.message.chat.id, sourceIds);
      await answerTelegramCallback(update.callback_query.id, "Opening evidence");
      await sendTelegramHtmlMessage(update.callback_query.message.chat.id, details, update.callback_query.message.message_id);
    } else {
      await answerTelegramCallback(update.callback_query.id);
    }
    return;
  }

  const message = update.message ?? update.edited_message;
  if (!message) return;
  const command = parseBotCommand(message.text);
  if (command?.command === "start") {
    await sendTelegramHtmlMessage(message.chat.id, formatStartMessage(message.chat.type), message.message_id);
    return;
  }
  if (command?.command === "help") {
    await sendTelegramHtmlMessage(message.chat.id, formatCommandHelp(), message.message_id);
    return;
  }
  if (message.chat.type !== "group" && message.chat.type !== "supergroup") return;
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
    ? await answerGroupQuestion(message.chat.id, query.question, query.retrievalHint)
    : await formatGroupSearch(message.chat.id, query.question);
  const callbackData = buildSourceCallbackData(response.sourceIds ?? []);
  const replyMarkup = callbackData
    ? { inline_keyboard: [[{ text: `View evidence (${response.sourceIds?.length ?? 0})`, callback_data: callbackData }]] }
    : undefined;
  await sendTelegramHtmlMessage(message.chat.id, response.text, message.message_id, replyMarkup);
}
