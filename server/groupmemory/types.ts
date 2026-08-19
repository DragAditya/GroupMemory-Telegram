export type TelegramEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: { id: number; username?: string; first_name?: string; last_name?: string };
};

export type TelegramMedia = {
  file_id: string;
  file_name?: string;
};

export type TelegramChat = {
  id: number;
  type: "group" | "supergroup" | "private" | "channel";
  title?: string;
  username?: string;
};

export type TelegramMessage = {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: { id: number; is_bot?: boolean; first_name: string; last_name?: string; username?: string };
  sender_chat?: { id: number; title?: string; username?: string };
  text?: string;
  caption?: string;
  entities?: TelegramEntity[];
  caption_entities?: TelegramEntity[];
  reply_to_message?: { message_id: number; text?: string; from?: { id: number; is_bot?: boolean; first_name: string; username?: string } };
  message_thread_id?: number;
  photo?: TelegramMedia[];
  document?: TelegramMedia;
  video?: TelegramMedia;
  audio?: TelegramMedia;
  animation?: TelegramMedia;
  voice?: TelegramMedia;
  video_note?: TelegramMedia;
  sticker?: TelegramMedia;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: {
    id: string;
    data?: string;
    message?: TelegramMessage;
    from: { id: number; is_bot?: boolean; first_name: string; username?: string };
  };
};

export type MessageMetadata = {
  textContent: string;
  links: string[];
  mentions: string[];
  media: Array<{ fileId: string; type: string; fileName?: string }>;
  originalMessageLink: string;
};
