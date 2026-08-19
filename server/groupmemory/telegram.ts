import { timingSafeEqual } from "node:crypto";

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
let cachedBotUsername: string | null = null;

type TelegramResult<T> = { ok: boolean; result: T; description?: string };

function requireTelegramToken() {
  if (!telegramToken) throw new Error("Telegram bot token is not configured");
  return telegramToken;
}

export function isVerifiedTelegramWebhook(receivedSecret: string | undefined) {
  if (!webhookSecret || !receivedSecret) return false;
  const expected = Buffer.from(webhookSecret);
  const received = Buffer.from(receivedSecret);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function callTelegram<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${requireTelegramToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as TelegramResult<T>;
  if (!response.ok || !data.ok) throw new Error(data.description ?? `Telegram ${method} failed`);
  return data.result;
}

export async function isTelegramGroupAdmin(chatId: number, userId: number) {
  const member = await callTelegram<{ status: string }>("getChatMember", {
    chat_id: chatId,
    user_id: userId,
  });
  return member.status === "creator" || member.status === "owner" || member.status === "administrator";
}

export async function sendTelegramHtmlMessage(chatId: number, text: string, replyToMessageId?: number) {
  return callTelegram<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : {}),
  });
}

export async function getTelegramBotUsername() {
  if (cachedBotUsername) return cachedBotUsername;
  const bot = await callTelegram<{ username?: string }>("getMe", {});
  if (!bot.username) throw new Error("The Telegram bot does not have a username");
  cachedBotUsername = bot.username;
  return cachedBotUsername;
}
