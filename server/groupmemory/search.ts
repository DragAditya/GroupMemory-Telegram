import { getGroupMessagesByIds, getTelegramGroupByChatId, searchGroupMessagesByVector } from "../db";
import { embedMemoryQuery, generateGroundedAnswer } from "./ai";

export type SearchEvidence = {
  id: number;
  senderName: string;
  senderUsername: string | null;
  textContent: string;
  sentAt: Date;
  links: string[];
  originalMessageLink: string;
  distance: number;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

function parseLinks(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((link): link is string => typeof link === "string");
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((link): link is string => typeof link === "string") : [];
  } catch {
    return [];
  }
}

function dateFilter(question: string) {
  const lower = question.toLowerCase();
  const now = new Date();
  if (lower.includes("yesterday")) return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (lower.includes("last week")) return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const days = lower.match(/(?:last|past)\s+(\d{1,3})\s+days?/);
  return days ? new Date(now.getTime() - Number(days[1]) * 24 * 60 * 60 * 1000) : undefined;
}

export async function findRelevantGroupMemory(telegramChatId: number, question: string) {
  const group = await getTelegramGroupByChatId(telegramChatId);
  if (!group || !group.memoryEnabled) return { group, evidence: [] as SearchEvidence[] };
  const queryEmbedding = await embedMemoryQuery(question);
  const retentionCutoff = new Date(Date.now() - group.retentionDays * 24 * 60 * 60 * 1000);
  const requestedCutoff = dateFilter(question);
  const cutoff = requestedCutoff && requestedCutoff > retentionCutoff ? requestedCutoff : retentionCutoff;
  const rows = await searchGroupMessagesByVector(group.id, queryEmbedding, cutoff, 12);
  return {
    group,
    evidence: rows.map(row => ({
      id: Number(row.id),
      senderName: String(row.senderName),
      senderUsername: row.senderUsername ? String(row.senderUsername) : null,
      textContent: String(row.textContent),
      sentAt: new Date(String(row.sentAt)),
      links: parseLinks(row.links),
      originalMessageLink: String(row.originalMessageLink),
      distance: Number(row.distance),
    })),
  };
}

function sourceLine(item: SearchEvidence, includeExcerpt: boolean) {
  const identity = item.senderUsername ? `${item.senderName} (@${item.senderUsername.replace(/^@/, "")})` : item.senderName;
  const sentAt = formatSourceTimestamp(item.sentAt);
  const excerpt = includeExcerpt ? `\n<i>${escapeHtml(item.textContent.slice(0, 360))}</i>` : "";
  return `<a href="${escapeHtml(item.originalMessageLink)}"><b>${escapeHtml(identity)}</b></a>\n<code>${sentAt}</code>${excerpt}`;
}

export function formatSourceTimestamp(value: Date) {
  if (Number.isNaN(value.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(value).replace(",", " ·") + " UTC";
}

export function buildSourceCallbackData(sourceIds: number[]) {
  const ids = Array.from(new Set(sourceIds.filter(id => Number.isInteger(id) && id > 0))).slice(0, 4);
  return ids.length ? `src:${ids.join(",")}` : null;
}

export function parseSourceCallbackData(value: string | undefined) {
  if (!value?.startsWith("src:")) return [];
  return value.slice(4).split(",").map(Number).filter(id => Number.isInteger(id) && id > 0).slice(0, 4);
}

export type TelegramResponse = { text: string; sourceIds?: number[] };

export async function answerGroupQuestion(telegramChatId: number, question: string, retrievalHint = question): Promise<TelegramResponse> {
  const { group, evidence } = await findRelevantGroupMemory(telegramChatId, retrievalHint);
  if (!group?.memoryEnabled) return { text: "<b>GroupMemory is paused</b>\nAn administrator can turn memory on with <code>/memory on</code>." };
  if (evidence.length === 0) return { text: "<b>No retained evidence found</b>\nTry a different phrase, a wider time range, or ask after more messages have been recorded." };
  const promptEvidence = evidence
    .map(item => `[message_id=${item.id}]\nSender: ${item.senderName}${item.senderUsername ? ` (@${item.senderUsername.replace(/^@/, "")})` : ""}\nTime: ${item.sentAt.toISOString()}\nText: ${item.textContent.slice(0, 1200)}\nLinks: ${item.links.join(", ") || "none"}\nSource: ${item.originalMessageLink}`)
    .join("\n\n");
  const assessment = await generateGroundedAnswer(question, promptEvidence, evidence.map(item => item.id));
  if (!assessment.hasEnoughEvidence) {
    return { text: `<b>Evidence is not strong enough</b>\n${escapeHtml(assessment.answer || "I don’t have enough reliable retained evidence to answer that.")}\n\n<i>Try a more specific question or a broader time range.</i>` };
  }
  const sourceIds = assessment.usedMessageIds.filter(id => evidence.some(item => item.id === id)).slice(0, 4);
  return { text: `<b>GroupMemory</b>\n${escapeHtml(assessment.answer)}\n\n<i>Evidence is ready. Tap the button to view the exact messages, or reply here to ask a follow-up.</i>`, sourceIds };
}

export async function formatGroupSearch(telegramChatId: number, query: string): Promise<TelegramResponse> {
  const { group, evidence } = await findRelevantGroupMemory(telegramChatId, query);
  if (!group?.memoryEnabled) return { text: "<b>GroupMemory is paused</b>\nAn administrator can turn memory on with <code>/memory on</code>." };
  if (evidence.length === 0) return { text: "<b>No matching retained messages</b>\nTry a different phrase, a person’s name, or a broader time range." };
  const sourceIds = evidence.slice(0, 4).map(item => item.id);
  return { text: `<b>Search complete</b>\nFound <b>${evidence.length}</b> relevant retained message${evidence.length === 1 ? "" : "s"}.\n\n<i>Tap the evidence button to open the best matches.</i>`, sourceIds };
}

export async function formatSourceDetails(telegramChatId: number, sourceIds: number[]) {
  const group = await getTelegramGroupByChatId(telegramChatId);
  if (!group) return "<b>Evidence unavailable</b>\nThis group is not configured in GroupMemory.";
  const rows = await getGroupMessagesByIds(group.id, sourceIds);
  const evidence = rows.map(row => ({
    id: Number(row.id), senderName: String(row.senderName), senderUsername: row.senderUsername ? String(row.senderUsername) : null,
    textContent: String(row.textContent), sentAt: new Date(String(row.sentAt)), links: parseLinks(row.links), originalMessageLink: String(row.originalMessageLink), distance: 0,
  }));
  if (!evidence.length) return "<b>Evidence expired</b>\nThose source messages are no longer retained under this group’s policy.";
  return `<b>Evidence · ${evidence.length} message${evidence.length === 1 ? "" : "s"}</b>\n\n${evidence.map((item, index) => `<b>${index + 1}</b>  ${sourceLine(item, true)}`).join("\n\n")}`;
}
