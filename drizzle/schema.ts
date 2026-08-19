import {
  bigint,
  boolean,
  customType,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** TiDB VECTOR values are transferred by the MySQL driver as JSON vector literals. */
const vector768 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "VECTOR(768)";
  },
  toDriver(value) {
    return JSON.stringify(value);
  },
  fromDriver(value) {
    return typeof value === "string" ? (JSON.parse(value) as number[]) : (value as number[]);
  },
});

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  isProjectOwner: boolean("isProjectOwner").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const telegramGroups = mysqlTable(
  "telegram_groups",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    telegramChatId: bigint("telegramChatId", { mode: "number" }).notNull(),
    chatType: varchar("chatType", { length: 24 }).notNull(),
    title: text("title"),
    username: varchar("username", { length: 128 }),
    memoryEnabled: boolean("memoryEnabled").notNull().default(true),
    retentionDays: int("retentionDays").notNull().default(30),
    lastActivityAt: timestamp("lastActivityAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("telegram_groups_chat_id_unique").on(table.telegramChatId)],
);

export const groupMessages = mysqlTable(
  "group_messages",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    groupId: bigint("groupId", { mode: "number" })
      .notNull()
      .references(() => telegramGroups.id, { onDelete: "cascade" }),
    telegramMessageId: int("telegramMessageId").notNull(),
    senderTelegramUserId: bigint("senderTelegramUserId", { mode: "number" }).notNull(),
    senderName: varchar("senderName", { length: 512 }).notNull(),
    senderUsername: varchar("senderUsername", { length: 128 }),
    textContent: text("textContent").notNull(),
    sentAt: timestamp("sentAt").notNull(),
    editedAt: timestamp("editedAt"),
    replyToMessageId: int("replyToMessageId"),
    links: json("links").$type<string[]>().notNull(),
    media: json("media").$type<Array<{ fileId: string; type: string; fileName?: string }>>().notNull(),
    mentions: json("mentions").$type<string[]>().notNull(),
    topicThreadId: int("topicThreadId"),
    originalMessageLink: varchar("originalMessageLink", { length: 1024 }).notNull(),
    embedding: vector768("embedding").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("group_messages_group_telegram_message_unique").on(table.groupId, table.telegramMessageId),
    index("group_messages_group_sent_at_idx").on(table.groupId, table.sentAt),
    index("group_messages_sender_sent_at_idx").on(table.senderTelegramUserId, table.sentAt),
  ],
);

export const systemJobs = mysqlTable("system_jobs", {
  id: int("id").autoincrement().primaryKey(),
  jobKey: varchar("jobKey", { length: 64 }).notNull().unique(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  lastRunAt: timestamp("lastRunAt"),
  lastRunDeletedCount: int("lastRunDeletedCount").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type TelegramGroup = typeof telegramGroups.$inferSelect;
export type GroupMessage = typeof groupMessages.$inferSelect;
