import { timingSafeEqual } from "node:crypto";

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
let cachedBotUsername: string | null = null;
let cachedBotDashboardInfo: TelegramBotDashboardInfo | null = null;
let botDashboardInfoExpiresAt = 0;

type TelegramResult<T> = { ok: boolean; result: T; description?: string };
type TelegramBotProfile = {
  id: number;
  username?: string;
  first_name: string;
  can_join_groups?: boolean;
  supports_inline_queries?: boolean;
};
type TelegramWebhookInfo = {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
};
export type TelegramBotDashboardInfo = {
  username: string;
  displayName: string;
  profileUrl: string;
  addToGroupUrl: string;
  canJoinGroups: boolean;
  supportsInlineQueries: boolean;
  webhookConfigured: boolean;
  webhookUrl: string | null;
  pendingUpdateCount: number;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
};

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

export async function getTelegramBotDashboardInfo(): Promise<TelegramBotDashboardInfo> {
  if (cachedBotDashboardInfo && Date.now() < botDashboardInfoExpiresAt) return cachedBotDashboardInfo;
  const [bot, webhook] = await Promise.all([
    callTelegram<TelegramBotProfile>("getMe", {}),
    callTelegram<TelegramWebhookInfo>("getWebhookInfo", {}),
  ]);
  if (!bot.username) throw new Error("The Telegram bot does not have a username");
  cachedBotUsername = bot.username;
  cachedBotDashboardInfo = {
    username: bot.username,
    displayName: bot.first_name,
    profileUrl: `https://t.me/${bot.username}`,
    addToGroupUrl: `https://t.me/${bot.username}?startgroup=groupmemory`,
    canJoinGroups: Boolean(bot.can_join_groups),
    supportsInlineQueries: Boolean(bot.supports_inline_queries),
    webhookConfigured: Boolean(webhook.url),
    webhookUrl: webhook.url ?? null,
    pendingUpdateCount: webhook.pending_update_count ?? 0,
    lastErrorAt: webhook.last_error_date ? new Date(webhook.last_error_date * 1000) : null,
    lastErrorMessage: webhook.last_error_message ?? null,
  };
  botDashboardInfoExpiresAt = Date.now() + 60_000;
  return cachedBotDashboardInfo;
}
