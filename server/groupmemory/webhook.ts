import { ensureTelegramGroup, getRetainedMessageCount, getTopRetainedSender, hasStoredTelegramMessage, persistGroupMessage } from "../db";
import { embedMemoryDocument } from "./ai";
import { formatCommandHelp, handleControlCommand, parseBotCommand } from "./commands";
import { classifyGroupMemoryIntent, formatCasualAcknowledgement, type GroupMemoryIntent } from "./intents";
import { extractMessageMetadata } from "./metadata";
import { answerGroupQuestion, buildDeleteCallbackData, buildSourceCallbackData, formatGroupSearch, formatSourceDetails, parseDeleteCallbackData, parseSourceCallbackData } from "./search";
import { answerTelegramCallback, clearTelegramInlineKeyboard, deleteTelegramMessage, getTelegramBotUsername, isTelegramGroupAdmin, isVerifiedTelegramWebhook, sendTelegramHtmlMessage } from "./telegram";
import { confirmTelegramBotCodeLogin } from "../telegram-code-login";
import type { TelegramUpdate } from "./types";

export async function resolveUserQuery(message: NonNullable<TelegramUpdate["message"]>) {
  const command = parseBotCommand(message.text);
  if (command?.command === "ask" && command.argument) return { kind: "ask" as const, question: command.argument };
  if (command?.command === "search" && command.argument) return { kind: "search" as const, question: command.argument };
  const repliedBotText = message.reply_to_message?.text?.trim() ?? "";
  const isGroupMemoryReply = message.reply_to_message?.from?.is_bot && /^(GroupMemory|Search complete|Evidence|Your retained message count|Group retained messages|Most active retained sender)/i.test(repliedBotText);
  if (message.text?.trim() && isGroupMemoryReply) {
    const priorAnswer = message.reply_to_message?.text?.slice(0, 900) ?? "";
    return { kind: "ask" as const, question: message.text.trim(), retrievalHint: `${message.text.trim()}\n\nFollow-up to a prior GroupMemory answer: ${priorAnswer}` };
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

export async function answerKnownIntent(intent: GroupMemoryIntent, group: { id: number; retentionDays: number }, senderTelegramUserId?: number) {
  if (!intent) return null;
  if (intent.kind === "botHelp") return formatCommandHelp();
  if (intent.kind === "casual") return formatCasualAcknowledgement();
  if (intent.kind === "unsupportedConversationCount") {
    return "<b>I cannot count conversations exactly.</b>\nA conversation has no fixed start or end. I can count retained messages, or identify the member with the most retained messages.";
  }
  if (intent.kind === "personalMessageCount") {
    if (!senderTelegramUserId) return "<b>I cannot identify the sender for this message.</b>\nPlease ask again from your normal Telegram account.";
    const count = await getRetainedMessageCount(group.id, senderTelegramUserId);
    return `<b>Your retained message count</b>\nI have <b>${count}</b> non-command message${count === 1 ? "" : "s"} from you in this group.\n\n<i>This reflects only the current ${group.retentionDays}-day retained memory. Messages from before memory was enabled or already deleted are not included.</i>`;
  }
  if (intent.kind === "groupMessageCount") {
    const count = await getRetainedMessageCount(group.id);
    return `<b>Group retained messages</b>\nI currently have <b>${count}</b> non-command message${count === 1 ? "" : "s"} in this group’s retained memory.\n\n<i>This reflects the current ${group.retentionDays}-day retention window.</i>`;
  }
  if (intent.kind === "topContributor") {
    const topSender = await getTopRetainedSender(group.id);
    if (!topSender) return "<b>No retained messages yet.</b>\nI need recorded group messages before I can calculate this.";
    const identity = topSender.senderUsername ? `${escapeHtml(topSender.senderName)} (@${escapeHtml(topSender.senderUsername.replace(/^@/, ""))})` : escapeHtml(topSender.senderName);
    return `<b>Most active retained sender</b>\n${identity} has <b>${topSender.messageCount}</b> retained non-command message${topSender.messageCount === 1 ? "" : "s"} in the current memory window.`;
  }
  return null;
}

export async function processTelegramUpdate(update: TelegramUpdate) {
  const callbackMessage = update.callback_query?.message;
  if (update.callback_query && callbackMessage) {
    const callback = update.callback_query;
    const deleteRequesterId = parseDeleteCallbackData(callback.data);
    if (deleteRequesterId) {
      const isRequester = callback.from.id === deleteRequesterId;
      const isAdmin = !isRequester && await isTelegramGroupAdmin(callbackMessage.chat.id, callback.from.id);
      if (!isRequester && !isAdmin) {
        await answerTelegramCallback(callback.id, "Only the requester or a group admin can delete this.");
        return;
      }
      await deleteTelegramMessage(callbackMessage.chat.id, callbackMessage.message_id);
      await answerTelegramCallback(callback.id, "Message deleted");
      return;
    }
    const sourceIds = parseSourceCallbackData(callback.data);
    if (sourceIds.length) {
      const details = await formatSourceDetails(callbackMessage.chat.id, sourceIds);
      await answerTelegramCallback(callback.id, "Opening evidence");
      await clearTelegramInlineKeyboard(callbackMessage.chat.id, callbackMessage.message_id);
      const deleteData = buildDeleteCallbackData(callback.from.id);
      const replyMarkup = deleteData ? { inline_keyboard: [[{ text: "Delete evidence", callback_data: deleteData }]] } : undefined;
      await sendTelegramHtmlMessage(callbackMessage.chat.id, details, callbackMessage.message_id, replyMarkup);
    } else {
      await answerTelegramCallback(callback.id);
    }
    return;
  }

  const message = update.message ?? update.edited_message;
  if (!message) return;
  const command = parseBotCommand(message.text);
  if (command?.command === "start") {
    if (message.chat.type === "private" && message.from && command.argument) {
      const senderName = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ").trim() || `Telegram user ${message.from.id}`;
      const confirmation = await confirmTelegramBotCodeLogin(command.argument, {
        telegramId: message.from.id,
        name: senderName,
        username: message.from.username ?? null,
      });
      if (confirmation.status === "confirmed") {
        await sendTelegramHtmlMessage(
          message.chat.id,
          "<b>Dashboard linked</b>\nReturn to GroupMemory in your browser. This one-time code works only for the Telegram account that opened it.",
          message.message_id,
        );
        return;
      }
      if (confirmation.status === "used") {
        await sendTelegramHtmlMessage(message.chat.id, "<b>Code already used</b>\nThis dashboard link was confirmed by a different Telegram account. Create a new code in the dashboard if you need to sign in.", message.message_id);
        return;
      }
      if (confirmation.status === "expired" || confirmation.status === "invalid") {
        await sendTelegramHtmlMessage(message.chat.id, "<b>Link code expired or invalid</b>\nCreate a fresh Telegram link code in the GroupMemory dashboard, then open its new link here.", message.message_id);
        return;
      }
    }
    await sendTelegramHtmlMessage(message.chat.id, formatStartMessage(message.chat.type), message.message_id);
    return;
  }
  if (command?.command === "help") {
    await sendTelegramHtmlMessage(message.chat.id, formatCommandHelp(), message.message_id);
    return;
  }
  if (message.chat.type !== "group" && message.chat.type !== "supergroup") return;
  const sender = message.from ?? (message.sender_chat ? { id: message.sender_chat.id, first_name: message.sender_chat.title ?? "Anonymous administrator", username: message.sender_chat.username } : null);
  if (!sender || sender.is_bot) return;

  const group = await ensureTelegramGroup({ telegramChatId: message.chat.id, chatType: message.chat.type, title: message.chat.title, username: message.chat.username });
  if (!group) throw new Error("Unable to initialize Telegram group memory");

  const handledControlCommand = await handleControlCommand(message, group);
  if (handledControlCommand) return;

  const query = await resolveUserQuery(message);
  const directIntent = !query && message.text?.trim() ? classifyGroupMemoryIntent(message.text) : null;
  const selfAwareDirectIntent = directIntent?.kind === "botHelp" || directIntent?.kind === "casual" ? directIntent : null;
  if (group.memoryEnabled && !query && !selfAwareDirectIntent && !command) {
    const isEditedMessage = Boolean(update.edited_message);
    if (isEditedMessage || !(await hasStoredTelegramMessage(group.id, message.message_id))) {
      const metadata = extractMessageMetadata(message);
      const senderName = `${sender.first_name}${message.from?.last_name ? ` ${message.from.last_name}` : ""}`;
      const embedding = await embedMemoryDocument(metadata.textContent, `Telegram group message from ${senderName}`);
      await persistGroupMessage({
        groupId: group.id, telegramMessageId: message.message_id, senderTelegramUserId: sender.id, senderName, senderUsername: sender.username,
        textContent: metadata.textContent, sentAt: new Date(message.date * 1000), ...(isEditedMessage ? { editedAt: new Date() } : {}),
        replyToMessageId: message.reply_to_message?.message_id, links: metadata.links, media: metadata.media, mentions: metadata.mentions,
        topicThreadId: message.message_thread_id, originalMessageLink: metadata.originalMessageLink, embedding,
      });
    }
  }

  if (!query && !selfAwareDirectIntent) return;
  const question = query?.question ?? message.text!.trim();
  const intentResponse = await answerKnownIntent(selfAwareDirectIntent ?? classifyGroupMemoryIntent(question), group, message.from?.id);
  if (intentResponse) {
    const deleteData = message.from ? buildDeleteCallbackData(message.from.id) : null;
    const replyMarkup = deleteData ? { inline_keyboard: [[{ text: "Delete answer", callback_data: deleteData }]] } : undefined;
    await sendTelegramHtmlMessage(message.chat.id, intentResponse, message.message_id, replyMarkup);
    return;
  }
  if (!query) return;
  const response = query.kind === "ask" ? await answerGroupQuestion(message.chat.id, query.question, query.retrievalHint) : await formatGroupSearch(message.chat.id, query.question);
  const callbackData = buildSourceCallbackData(response.sourceIds ?? []);
  const deleteData = message.from ? buildDeleteCallbackData(message.from.id) : null;
  const buttons = [
    ...(callbackData ? [{ text: `View evidence (${response.sourceIds?.length ?? 0})`, callback_data: callbackData }] : []),
    ...(deleteData ? [{ text: "Delete answer", callback_data: deleteData }] : []),
  ];
  const replyMarkup = buttons.length ? { inline_keyboard: [buttons] } : undefined;
  await sendTelegramHtmlMessage(message.chat.id, response.text, message.message_id, replyMarkup);
}
