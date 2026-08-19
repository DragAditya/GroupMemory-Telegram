import { setGroupMemoryEnabled, setGroupRetentionDays } from "../db";
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
  ].join("\n");
}

export async function handleControlCommand(message: TelegramMessage, group: { id: number; memoryEnabled: boolean; retentionDays: number }) {
  const parsed = parseBotCommand(message.text);
  if (!parsed || !CONTROL_COMMANDS.has(parsed.command)) return false;

  if (!message.from || !(await isTelegramGroupAdmin(message.chat.id, message.from.id))) {
    await sendTelegramHtmlMessage(
      message.chat.id,
      "<b>GroupMemory</b>\nOnly a group administrator can change memory settings.",
      message.message_id,
    );
    return true;
  }

  if (parsed.command === "memory") {
    if (parsed.argument !== "on" && parsed.argument !== "off") {
      await sendTelegramHtmlMessage(message.chat.id, "Usage: <code>/memory on</code> or <code>/memory off</code>", message.message_id);
      return true;
    }
    const enabled = parsed.argument === "on";
    const updated = await setGroupMemoryEnabled(group.id, enabled);
    await sendTelegramHtmlMessage(
      message.chat.id,
      enabled ? "<b>GroupMemory enabled.</b>\nNew group messages will be recorded and searchable." : "<b>GroupMemory paused.</b>\nExisting retained memory remains available until it expires.",
      message.message_id,
    );
    group.memoryEnabled = updated?.memoryEnabled ?? enabled;
    return true;
  }

  if (parsed.command === "retention") {
    const allowed = new Set(["7d", "30d", "90d"]);
    if (!allowed.has(parsed.argument)) {
      await sendTelegramHtmlMessage(message.chat.id, "Usage: <code>/retention 7d</code>, <code>/retention 30d</code>, or <code>/retention 90d</code>", message.message_id);
      return true;
    }
    const retentionDays = Number.parseInt(parsed.argument, 10);
    const updated = await setGroupRetentionDays(group.id, retentionDays);
    await sendTelegramHtmlMessage(message.chat.id, `<b>Retention updated.</b>\nMessages are retained for <b>${retentionDays} days</b>.`, message.message_id);
    group.retentionDays = updated?.retentionDays ?? retentionDays;
    return true;
  }

  await sendTelegramHtmlMessage(message.chat.id, statusMessage(group), message.message_id);
  return true;
}
