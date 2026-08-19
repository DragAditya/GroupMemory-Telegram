import type { MessageMetadata, TelegramChat, TelegramEntity, TelegramMessage } from "./types";

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function entitySlice(text: string, entity: TelegramEntity) {
  return text.slice(entity.offset, entity.offset + entity.length);
}

function normalizeUrl(value: string) {
  const trimmed = value.replace(/[),.!?]+$/g, "");
  return trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;
}

function findUrls(text: string, entities: TelegramEntity[]) {
  const entityUrls = entities.flatMap(entity => {
    if (entity.type === "text_link" && entity.url) return [entity.url];
    if (entity.type === "url") return [entitySlice(text, entity)];
    return [];
  });
  const inlineUrls = text.match(/(?:https?:\/\/|www\.)[^\s<>()]+/gi) ?? [];
  return unique([...entityUrls, ...inlineUrls].map(normalizeUrl));
}

function findMentions(text: string, entities: TelegramEntity[]) {
  const entityMentions = entities.flatMap(entity => {
    if (entity.type === "mention") return [entitySlice(text, entity)];
    if (entity.type === "text_mention" && entity.user?.username) return [`@${entity.user.username}`];
    return [];
  });
  const inlineMentions = text.match(/@[A-Za-z0-9_]{3,32}/g) ?? [];
  return unique([...entityMentions, ...inlineMentions]);
}

function extractMedia(message: TelegramMessage) {
  const media: MessageMetadata["media"] = [];
  const add = (type: string, item?: { file_id: string; file_name?: string }) => {
    if (item?.file_id) media.push({ fileId: item.file_id, type, fileName: item.file_name });
  };
  const photo = message.photo?.at(-1);
  add("photo", photo);
  add("document", message.document);
  add("video", message.video);
  add("audio", message.audio);
  add("animation", message.animation);
  add("voice", message.voice);
  add("video_note", message.video_note);
  add("sticker", message.sticker);
  return media;
}

export function buildTelegramMessageLink(chat: TelegramChat, messageId: number) {
  if (chat.username) return `https://t.me/${chat.username}/${messageId}`;
  if (chat.type === "supergroup" && String(chat.id).startsWith("-100")) {
    return `https://t.me/c/${String(chat.id).slice(4)}/${messageId}`;
  }
  return `tg://privatepost?chat=${chat.id}&post=${messageId}`;
}

export function extractMessageMetadata(message: TelegramMessage): MessageMetadata {
  const authoredText = message.text ?? message.caption ?? "";
  const entities = message.entities ?? message.caption_entities ?? [];
  const media = extractMedia(message);
  const fallbackText = media.length
    ? `[${media.map(item => item.type).join(", ")} attachment]`
    : "[Non-text Telegram message]";

  return {
    textContent: authoredText.trim() || fallbackText,
    links: findUrls(authoredText, entities),
    mentions: findMentions(authoredText, entities),
    media,
    originalMessageLink: buildTelegramMessageLink(message.chat, message.message_id),
  };
}
