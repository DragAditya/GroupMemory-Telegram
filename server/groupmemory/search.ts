import { getTelegramGroupByChatId, searchGroupMessagesByVector } from "../db";
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
  const sentAt = Number.isNaN(item.sentAt.getTime()) ? "unknown time" : item.sentAt.toISOString().replace(".000Z", "Z");
  const links = item.links.length ? ` · ${item.links.map(link => `<a href="${escapeHtml(link)}">link</a>`).join(", ")}` : "";
  const excerpt = includeExcerpt ? `\n${escapeHtml(item.textContent.slice(0, 700))}` : "";
  return `• <a href="${escapeHtml(item.originalMessageLink)}">${escapeHtml(identity)} — ${sentAt}</a>${links}${excerpt}`;
}

export async function answerGroupQuestion(telegramChatId: number, question: string) {
  const { group, evidence } = await findRelevantGroupMemory(telegramChatId, question);
  if (!group?.memoryEnabled) return "<b>GroupMemory is paused.</b>\nAn administrator can enable it with <code>/memory on</code>.";
  if (evidence.length === 0) return "<b>Insufficient evidence.</b>\nI couldn’t find retained messages that answer that question.";
  const promptEvidence = evidence
    .map(item => `[message_id=${item.id}]\nSender: ${item.senderName}${item.senderUsername ? ` (@${item.senderUsername.replace(/^@/, "")})` : ""}\nTime: ${item.sentAt.toISOString()}\nText: ${item.textContent.slice(0, 1200)}\nLinks: ${item.links.join(", ") || "none"}\nSource: ${item.originalMessageLink}`)
    .join("\n\n");
  const assessment = await generateGroundedAnswer(question, promptEvidence, evidence.map(item => item.id));
  if (!assessment.hasEnoughEvidence) {
    return `<b>Insufficient evidence.</b>\n${escapeHtml(assessment.answer || "I don’t have enough reliable retained evidence to answer that.")}`;
  }
  const sources = assessment.usedMessageIds
    .map(id => evidence.find(item => item.id === id))
    .filter((item): item is SearchEvidence => Boolean(item))
    .map(item => sourceLine(item, false))
    .join("\n");
  return `<b>GroupMemory answer</b>\n${escapeHtml(assessment.answer)}\n\n<b>Sources</b>\n${sources}`;
}

export async function formatGroupSearch(telegramChatId: number, query: string) {
  const { group, evidence } = await findRelevantGroupMemory(telegramChatId, query);
  if (!group?.memoryEnabled) return "<b>GroupMemory is paused.</b>\nAn administrator can enable it with <code>/memory on</code>.";
  if (evidence.length === 0) return "<b>No matching retained messages.</b>\nTry a different phrase or a broader time range.";
  return `<b>Search results</b>\n${evidence.slice(0, 8).map(item => sourceLine(item, true)).join("\n\n")}`;
}
