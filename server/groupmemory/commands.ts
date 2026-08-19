import { recordVerifiedUserGroupAccess, setGroupMemoryEnabled, setGroupRetentionDays } from "../db";
import { isTelegramGroupAdmin, sendTelegramHtmlMessage } from "./telegram";
import type { TelegramMessage } from "./types";

const CONTROL_COMMANDS = new Set(["memory", "retention", "status"]);

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

export function parseBotCommand(text: string | undefined) {
  if (!text) return null;
  const match = text.trim().match(/^\/([a-z]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  return { command: match[1]!.toLowerCase(), argument: (match[2] ?? "").trim() };
}

function statusMessage(group: { memoryEnabled: boolean; retentionDays: number }) {
  const mode = group.memoryEnabled ? "<b>On</b>" : "<b>Off</b>";
  return [
    "<b>GroupMemory status</b>",
    `Memory: ${mode}`,
    `Retention: <b>${group.retentionDays} days</b>`,
    "Only messages recorded while memory is on are searchable.",
    "Ask with <code>/ask your question</code>, search with <code>/search words</code>, or reply to a GroupMemory answer with a follow-up.",
  ].join("\n");
}

export function formatCommandHelp() {
  return [
    "<b>GroupMemory guide</b>",
    "",
    "<b>Ask naturally</b>",
    "• <code>/ask What did we decide about the event?</code>",
    "• <code>/search React last week</code>",
    "• Reply to any GroupMemory answer with your next question.",
    "",
    "<b>Admins</b>",
    "• <code>/memory on</code> or <code>/memory off</code>",
    "• <code>/retention 7d</code>, <code>/retention 30d</code>, or <code>/retention 90d</code>",
    "• <code>/status</code> to check the group memory.",
  ].join("\n");
}

export async function handleControlCommand(message: TelegramMessage, group: { id: number; memoryEnabled: boolean; retentionDays: number }) {
  const parsed = parseBotCommand(message.text);
  if (!parsed || !CONTROL_COMMANDS.has(parsed.command)) return false;

  if (!message.from || !(await isTelegramGroupAdmin(message.chat.id, message.from.id))) {
    await sendTelegramHtmlMessage(
      message.chat.id,
      "<b>Admin permission needed</b>\nOnly a group administrator can change memory settings. You can still use <code>/ask</code> and <code>/search</code>.",
      message.message_id,
    );
    return true;
  }

  const senderName = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ").trim() || `Telegram user ${message.from.id}`;
  try {
    await recordVerifiedUserGroupAccess(
      { telegramId: message.from.id, name: senderName, username: message.from.username ?? null },
      group.id,
    );
  } catch (error) {
    // Do not block a legitimate in-chat admin command if dashboard synchronization is temporarily unavailable.
    console.error("[GroupMemory] Failed to synchronize verified dashboard group access", error);
  }

  if (parsed.command === "memory") {
    if (parsed.argument !== "on" && parsed.argument !== "off") {
      await sendTelegramHtmlMessage(message.chat.id, "<b>Choose a memory mode</b>\nUse <code>/memory on</code> to start recording, or <code>/memory off</code> to pause future recording.", message.message_id);
      return true;
    }
    const enabled = parsed.argument === "on";
    const updated = await setGroupMemoryEnabled(group.id, enabled);
    await sendTelegramHtmlMessage(
      message.chat.id,
      enabled ? "<b>Memory is on</b>\nNew group messages will be recorded and become searchable. Ask with <code>/ask</code> any time." : "<b>Memory is paused</b>\nNo new messages will be recorded. Existing retained memory remains available until it expires.",
      message.message_id,
    );
    group.memoryEnabled = updated?.memoryEnabled ?? enabled;
    return true;
  }

  if (parsed.command === "retention") {
    const allowed = new Set(["7d", "30d", "90d"]);
    if (!allowed.has(parsed.argument)) {
      await sendTelegramHtmlMessage(message.chat.id, "<b>Choose a retention window</b>\nUse <code>/retention 7d</code>, <code>/retention 30d</code>, or <code>/retention 90d</code>. Older messages are deleted automatically.", message.message_id);
      return true;
    }
    const retentionDays = Number.parseInt(parsed.argument, 10);
    const updated = await setGroupRetentionDays(group.id, retentionDays);
    await sendTelegramHtmlMessage(message.chat.id, `<b>Retention updated</b>\nMessages are kept for <b>${retentionDays} days</b>, then deleted automatically.`, message.message_id);
    group.retentionDays = updated?.retentionDays ?? retentionDays;
    return true;
  }

  await sendTelegramHtmlMessage(message.chat.id, statusMessage(group), message.message_id);
  return true;
}
