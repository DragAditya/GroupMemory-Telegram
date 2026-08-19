// server/app.ts
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
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
  varchar
} from "drizzle-orm/mysql-core";
var vector768 = customType({
  dataType() {
    return "VECTOR(768)";
  },
  toDriver(value) {
    return JSON.stringify(value);
  },
  fromDriver(value) {
    return typeof value === "string" ? JSON.parse(value) : value;
  }
});
var users = mysqlTable("users", {
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
  /** Verified Telegram OIDC subject. Nullable for existing Manus-only accounts. */
  telegramId: bigint("telegramId", { mode: "number" }),
  telegramUsername: varchar("telegramUsername", { length: 128 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  isProjectOwner: boolean("isProjectOwner").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
}, (table) => [uniqueIndex("users_telegram_id_unique").on(table.telegramId)]);
var telegramGroups = mysqlTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
  },
  (table) => [uniqueIndex("telegram_groups_chat_id_unique").on(table.telegramChatId)]
);
var groupMessages = mysqlTable(
  "group_messages",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    groupId: bigint("groupId", { mode: "number" }).notNull().references(() => telegramGroups.id, { onDelete: "cascade" }),
    telegramMessageId: int("telegramMessageId").notNull(),
    senderTelegramUserId: bigint("senderTelegramUserId", { mode: "number" }).notNull(),
    senderName: varchar("senderName", { length: 512 }).notNull(),
    senderUsername: varchar("senderUsername", { length: 128 }),
    textContent: text("textContent").notNull(),
    sentAt: timestamp("sentAt").notNull(),
    editedAt: timestamp("editedAt"),
    replyToMessageId: int("replyToMessageId"),
    links: json("links").$type().notNull(),
    media: json("media").$type().notNull(),
    mentions: json("mentions").$type().notNull(),
    topicThreadId: int("topicThreadId"),
    originalMessageLink: varchar("originalMessageLink", { length: 1024 }).notNull(),
    embedding: vector768("embedding").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
  },
  (table) => [
    uniqueIndex("group_messages_group_telegram_message_unique").on(table.groupId, table.telegramMessageId),
    index("group_messages_group_sent_at_idx").on(table.groupId, table.sentAt),
    index("group_messages_sender_sent_at_idx").on(table.senderTelegramUserId, table.sentAt)
  ]
);
var userGroupAccess = mysqlTable(
  "user_group_access",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    groupId: bigint("groupId", { mode: "number" }).notNull().references(() => telegramGroups.id, { onDelete: "cascade" }),
    grantedAt: timestamp("grantedAt").defaultNow().notNull(),
    lastVerifiedAt: timestamp("lastVerifiedAt").defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("user_group_access_user_group_unique").on(table.userId, table.groupId),
    index("user_group_access_user_verified_idx").on(table.userId, table.lastVerifiedAt),
    index("user_group_access_group_idx").on(table.groupId)
  ]
);
var telegramLoginCodes = mysqlTable(
  "telegram_login_codes",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    codeHash: varchar("codeHash", { length: 64 }).notNull(),
    pollTokenHash: varchar("pollTokenHash", { length: 64 }).notNull(),
    ownerOpenId: varchar("ownerOpenId", { length: 64 }),
    telegramId: bigint("telegramId", { mode: "number" }),
    telegramName: varchar("telegramName", { length: 512 }),
    telegramUsername: varchar("telegramUsername", { length: 128 }),
    confirmedAt: timestamp("confirmedAt"),
    consumedAt: timestamp("consumedAt"),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("telegram_login_codes_code_hash_unique").on(table.codeHash),
    uniqueIndex("telegram_login_codes_poll_token_hash_unique").on(table.pollTokenHash),
    index("telegram_login_codes_expires_idx").on(table.expiresAt)
  ]
);
var systemJobs = mysqlTable("system_jobs", {
  id: int("id").autoincrement().primaryKey(),
  jobKey: varchar("jobKey", { length: 64 }).notNull().unique(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  lastRunAt: timestamp("lastRunAt"),
  lastRunDeletedCount: int("lastRunDeletedCount").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  telegramOidcClientId: process.env.TELEGRAM_OIDC_CLIENT_ID ?? "",
  telegramOidcClientSecret: process.env.TELEGRAM_OIDC_CLIENT_SECRET ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (user.openId === ENV.ownerOpenId) {
      values.isProjectOwner = true;
      updateSet.isProjectOwner = true;
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getUserByTelegramId(telegramId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
  return result[0];
}
async function upsertTelegramDashboardUser(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const existing = await getUserByTelegramId(input.telegramId);
  const values = {
    name: input.name,
    telegramUsername: input.username ?? null,
    loginMethod: "telegram",
    lastSignedIn: /* @__PURE__ */ new Date()
  };
  if (existing) {
    await db.update(users).set(values).where(eq(users.id, existing.id));
    return getUserByTelegramId(input.telegramId);
  }
  await db.insert(users).values({
    openId: `telegram:${input.telegramId}`,
    telegramId: input.telegramId,
    ...values
  });
  return getUserByTelegramId(input.telegramId);
}
async function linkTelegramIdentityToProjectOwner(ownerOpenId, identity) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const owner = await getUserByOpenId(ownerOpenId);
  if (!owner?.isProjectOwner) throw new Error("Project owner record was not found");
  const existingTelegramUser = await getUserByTelegramId(identity.telegramId);
  if (existingTelegramUser && existingTelegramUser.id !== owner.id) {
    await db.execute(sql`
      INSERT IGNORE INTO user_group_access (userId, groupId, grantedAt, lastVerifiedAt)
      SELECT ${owner.id}, groupId, grantedAt, lastVerifiedAt
      FROM user_group_access
      WHERE userId = ${existingTelegramUser.id}
    `);
    await db.delete(users).where(eq(users.id, existingTelegramUser.id));
  }
  await db.update(users).set({
    telegramId: identity.telegramId,
    telegramUsername: identity.username ?? null,
    name: identity.name,
    loginMethod: "telegram",
    lastSignedIn: /* @__PURE__ */ new Date()
  }).where(eq(users.id, owner.id));
  return getUserByOpenId(ownerOpenId);
}
async function recordVerifiedUserGroupAccess(identity, groupId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const user = await upsertTelegramDashboardUser(identity);
  if (!user) throw new Error("Telegram dashboard user was not created");
  const now = /* @__PURE__ */ new Date();
  await db.insert(userGroupAccess).values({ userId: user.id, groupId, grantedAt: now, lastVerifiedAt: now }).onDuplicateKeyUpdate({
    set: { lastVerifiedAt: now }
  });
  return user;
}
async function removeUserGroupAccess(userId, groupId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.delete(userGroupAccess).where(and(eq(userGroupAccess.userId, userId), eq(userGroupAccess.groupId, groupId)));
}
async function markUserGroupAccessVerified(userId, groupId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(userGroupAccess).set({ lastVerifiedAt: /* @__PURE__ */ new Date() }).where(and(eq(userGroupAccess.userId, userId), eq(userGroupAccess.groupId, groupId)));
}
async function createTelegramLoginCode(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(telegramLoginCodes).values({
    codeHash: input.codeHash,
    pollTokenHash: input.pollTokenHash,
    ownerOpenId: input.ownerOpenId ?? null,
    expiresAt: input.expiresAt
  });
}
async function confirmTelegramLoginCode(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const now = /* @__PURE__ */ new Date();
  const record = (await db.select().from(telegramLoginCodes).where(eq(telegramLoginCodes.codeHash, input.codeHash)).limit(1))[0];
  if (!record || record.expiresAt <= now) return { status: "expired" };
  if (record.confirmedAt) {
    return record.telegramId === input.telegramId ? { status: "confirmed", record } : { status: "used" };
  }
  await db.update(telegramLoginCodes).set({
    telegramId: input.telegramId,
    telegramName: input.telegramName,
    telegramUsername: input.telegramUsername ?? null,
    confirmedAt: now
  }).where(and(eq(telegramLoginCodes.id, record.id), sql`${telegramLoginCodes.confirmedAt} IS NULL`));
  const confirmed = (await db.select().from(telegramLoginCodes).where(eq(telegramLoginCodes.id, record.id)).limit(1))[0];
  if (!confirmed?.confirmedAt || confirmed.telegramId !== input.telegramId) return { status: "used" };
  return { status: "confirmed", record: confirmed };
}
async function consumeConfirmedTelegramLoginCode(pollTokenHash) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const now = /* @__PURE__ */ new Date();
  const record = (await db.select().from(telegramLoginCodes).where(eq(telegramLoginCodes.pollTokenHash, pollTokenHash)).limit(1))[0];
  if (!record || record.expiresAt <= now || !record.confirmedAt || record.consumedAt || !record.telegramId || !record.telegramName) return void 0;
  const result = await db.update(telegramLoginCodes).set({ consumedAt: now }).where(and(
    eq(telegramLoginCodes.id, record.id),
    sql`${telegramLoginCodes.consumedAt} IS NULL`,
    sql`${telegramLoginCodes.expiresAt} > ${now}`
  ));
  const affectedRows = Number(
    result.affectedRows ?? result[0]?.affectedRows ?? 0
  );
  if (affectedRows !== 1) return void 0;
  return record;
}
async function getTelegramLoginCodePollStatus(pollTokenHash) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const record = (await db.select().from(telegramLoginCodes).where(eq(telegramLoginCodes.pollTokenHash, pollTokenHash)).limit(1))[0];
  if (!record) return "invalid";
  if (record.expiresAt <= /* @__PURE__ */ new Date()) return "expired";
  if (record.consumedAt) return "consumed";
  if (!record.confirmedAt) return "pending";
  return "confirmed";
}
async function ensureTelegramGroup(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const now = /* @__PURE__ */ new Date();
  await db.insert(telegramGroups).values({
    telegramChatId: input.telegramChatId,
    chatType: input.chatType,
    title: input.title ?? null,
    username: input.username ?? null,
    lastActivityAt: now
  }).onDuplicateKeyUpdate({
    set: { chatType: input.chatType, title: input.title ?? null, username: input.username ?? null, lastActivityAt: now }
  });
  return getTelegramGroupByChatId(input.telegramChatId);
}
async function getTelegramGroupByChatId(telegramChatId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.select().from(telegramGroups).where(eq(telegramGroups.telegramChatId, telegramChatId)).limit(1);
  return result[0];
}
async function setGroupMemoryEnabled(groupId, memoryEnabled) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(telegramGroups).set({ memoryEnabled }).where(eq(telegramGroups.id, groupId));
  const result = await db.select().from(telegramGroups).where(eq(telegramGroups.id, groupId)).limit(1);
  return result[0];
}
async function setGroupRetentionDays(groupId, retentionDays) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(telegramGroups).set({ retentionDays }).where(eq(telegramGroups.id, groupId));
  const result = await db.select().from(telegramGroups).where(eq(telegramGroups.id, groupId)).limit(1);
  return result[0];
}
async function hasStoredTelegramMessage(groupId, telegramMessageId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.select({ id: groupMessages.id }).from(groupMessages).where(and(eq(groupMessages.groupId, groupId), eq(groupMessages.telegramMessageId, telegramMessageId))).limit(1);
  return result.length > 0;
}
async function persistGroupMessage(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const values = {
    ...input,
    senderUsername: input.senderUsername ?? null,
    editedAt: input.editedAt ?? null,
    replyToMessageId: input.replyToMessageId ?? null,
    topicThreadId: input.topicThreadId ?? null
  };
  await db.insert(groupMessages).values(values).onDuplicateKeyUpdate({
    set: {
      senderName: values.senderName,
      senderUsername: values.senderUsername,
      textContent: values.textContent,
      editedAt: values.editedAt,
      replyToMessageId: values.replyToMessageId,
      links: values.links,
      media: values.media,
      mentions: values.mentions,
      topicThreadId: values.topicThreadId,
      originalMessageLink: values.originalMessageLink,
      embedding: values.embedding
    }
  });
}
async function searchGroupMessagesByVector(groupId, queryEmbedding, cutoff, limit) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const vectorLiteral = JSON.stringify(queryEmbedding);
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 20);
  const result = await db.execute(sql`
    SELECT
      id, senderName, senderUsername, textContent, sentAt, links, originalMessageLink,
      VEC_COSINE_DISTANCE(embedding, ${vectorLiteral}) AS distance
    FROM group_messages
    WHERE groupId = ${groupId} AND sentAt >= ${cutoff}
    ORDER BY VEC_COSINE_DISTANCE(embedding, ${vectorLiteral})
    LIMIT ${boundedLimit}
  `);
  return result[0];
}
async function getGroupMessagesByIds(groupId, messageIds) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const normalizedIds = Array.from(new Set(messageIds.filter((id) => Number.isInteger(id) && id > 0))).slice(0, 4);
  if (normalizedIds.length === 0) return [];
  const rows = await db.select({
    id: groupMessages.id,
    senderName: groupMessages.senderName,
    senderUsername: groupMessages.senderUsername,
    textContent: groupMessages.textContent,
    sentAt: groupMessages.sentAt,
    links: groupMessages.links,
    originalMessageLink: groupMessages.originalMessageLink
  }).from(groupMessages).where(and(eq(groupMessages.groupId, groupId), inArray(groupMessages.id, normalizedIds)));
  return normalizedIds.map((id) => rows.find((row) => Number(row.id) === id)).filter((row) => Boolean(row));
}
async function getRetainedMessageCount(groupId, senderTelegramUserId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const filters = [eq(groupMessages.groupId, groupId)];
  if (senderTelegramUserId !== void 0) filters.push(eq(groupMessages.senderTelegramUserId, senderTelegramUserId));
  const result = await db.execute(sql`SELECT COUNT(*) AS messageCount FROM group_messages WHERE ${and(...filters)}`);
  return Number(result[0][0]?.messageCount ?? 0);
}
async function getTopRetainedSender(groupId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.execute(sql`
    SELECT senderName, senderUsername, COUNT(*) AS messageCount
    FROM group_messages
    WHERE groupId = ${groupId}
    GROUP BY senderTelegramUserId, senderName, senderUsername
    ORDER BY messageCount DESC, senderName ASC
    LIMIT 1
  `);
  const row = result[0][0];
  return row ? { senderName: String(row.senderName ?? "Unknown member"), senderUsername: row.senderUsername ? String(row.senderUsername) : null, messageCount: Number(row.messageCount ?? 0) } : null;
}
async function deleteExpiredGroupMessages(now = /* @__PURE__ */ new Date(), batchSize = 500, maxBatchesPerGroup = 40) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const groups = await db.select({ id: telegramGroups.id, retentionDays: telegramGroups.retentionDays }).from(telegramGroups);
  let deletedCount = 0;
  for (const group of groups) {
    const cutoff = new Date(now.getTime() - group.retentionDays * 24 * 60 * 60 * 1e3);
    let groupDeletedCount = 0;
    for (let batch = 0; batch < maxBatchesPerGroup; batch++) {
      const result = await db.execute(sql`
        DELETE FROM group_messages
        WHERE groupId = ${group.id} AND sentAt < ${cutoff}
        LIMIT ${Math.min(Math.max(Math.floor(batchSize), 1), 1e3)}
      `);
      const affectedRows = Number(result[0].affectedRows ?? 0);
      groupDeletedCount += affectedRows;
      if (affectedRows < batchSize) break;
    }
    deletedCount += groupDeletedCount;
    if (groupDeletedCount > 0) console.info(`[GroupMemory] Retention removed ${groupDeletedCount} messages for group ${group.id}`);
  }
  return deletedCount;
}
async function getSystemJobByTaskUid(taskUid) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.select().from(systemJobs).where(eq(systemJobs.scheduleCronTaskUid, taskUid)).limit(1);
  return result[0];
}
async function recordSystemJobRun(jobId, deletedCount) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(systemJobs).set({ lastRunAt: /* @__PURE__ */ new Date(), lastRunDeletedCount: deletedCount }).where(eq(systemJobs.id, jobId));
}
async function getSystemJobByKey(jobKey) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.select().from(systemJobs).where(eq(systemJobs.jobKey, jobKey)).limit(1);
  return result[0];
}
async function getGroupDashboardStatuses() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.execute(sql`
    SELECT
      g.id, g.telegramChatId, g.title, g.username, g.memoryEnabled, g.retentionDays, g.lastActivityAt,
      COUNT(m.id) AS messageCount
    FROM telegram_groups g
    LEFT JOIN group_messages m ON m.groupId = g.id
    GROUP BY g.id, g.telegramChatId, g.title, g.username, g.memoryEnabled, g.retentionDays, g.lastActivityAt
    ORDER BY g.lastActivityAt DESC
  `);
  return result[0];
}
async function getUserDashboardGroups(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.execute(sql`
    SELECT
      g.id, g.telegramChatId, g.title, g.username, g.memoryEnabled, g.retentionDays, g.lastActivityAt,
      a.lastVerifiedAt,
      COUNT(m.id) AS messageCount
    FROM user_group_access a
    INNER JOIN telegram_groups g ON g.id = a.groupId
    LEFT JOIN group_messages m ON m.groupId = g.id
    WHERE a.userId = ${userId}
    GROUP BY g.id, g.telegramChatId, g.title, g.username, g.memoryEnabled, g.retentionDays, g.lastActivityAt, a.lastVerifiedAt
    ORDER BY g.lastActivityAt DESC
  `);
  return result[0];
}
async function getUserDashboardAccesses(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select({ groupId: userGroupAccess.groupId, telegramChatId: telegramGroups.telegramChatId }).from(userGroupAccess).innerJoin(telegramGroups, eq(userGroupAccess.groupId, telegramGroups.id)).where(eq(userGroupAccess.userId, userId));
}
async function getOwnerPlatformMetrics() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.execute(sql`
    SELECT
      COUNT(DISTINCT g.id) AS groupCount,
      COUNT(m.id) AS retainedMessageCount,
      COUNT(DISTINCT CASE WHEN g.memoryEnabled = 1 THEN g.id END) AS memoryEnabledGroupCount,
      COUNT(DISTINCT CASE WHEN g.lastActivityAt >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY) THEN g.id END) AS activeGroupCount
    FROM telegram_groups g
    LEFT JOIN group_messages m ON m.groupId = g.id
  `);
  const row = result[0][0] ?? {};
  return {
    groupCount: Number(row.groupCount ?? 0),
    retainedMessageCount: Number(row.retainedMessageCount ?? 0),
    memoryEnabledGroupCount: Number(row.memoryEnabledGroupCount ?? 0),
    activeGroupCount: Number(row.activeGroupCount ?? 0)
  };
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/groupmemory/telegram.ts
import { timingSafeEqual } from "node:crypto";
var telegramToken = process.env.TELEGRAM_BOT_TOKEN;
var webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
var cachedBotUsername = null;
var cachedBotDashboardInfo = null;
var botDashboardInfoExpiresAt = 0;
function requireTelegramToken() {
  if (!telegramToken) throw new Error("Telegram bot token is not configured");
  return telegramToken;
}
function isVerifiedTelegramWebhook(receivedSecret) {
  if (!webhookSecret || !receivedSecret) return false;
  const expected = Buffer.from(webhookSecret);
  const received = Buffer.from(receivedSecret);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
async function callTelegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${requireTelegramToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.description ?? `Telegram ${method} failed`);
  return data.result;
}
async function isTelegramGroupAdmin(chatId, userId) {
  const member = await callTelegram("getChatMember", {
    chat_id: chatId,
    user_id: userId
  });
  return member.status === "creator" || member.status === "owner" || member.status === "administrator";
}
async function sendTelegramHtmlMessage(chatId, text2, replyToMessageId, replyMarkup) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text: text2,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : {},
    ...replyMarkup ? { reply_markup: replyMarkup } : {}
  });
}
async function answerTelegramCallback(callbackQueryId, text2) {
  return callTelegram("answerCallbackQuery", { callback_query_id: callbackQueryId, ...text2 ? { text: text2, show_alert: false } : {} });
}
async function deleteTelegramMessage(chatId, messageId) {
  return callTelegram("deleteMessage", { chat_id: chatId, message_id: messageId });
}
async function clearTelegramInlineKeyboard(chatId, messageId) {
  return callTelegram("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
}
async function getTelegramBotUsername() {
  if (cachedBotUsername) return cachedBotUsername;
  const bot = await callTelegram("getMe", {});
  if (!bot.username) throw new Error("The Telegram bot does not have a username");
  cachedBotUsername = bot.username;
  return cachedBotUsername;
}
async function getTelegramBotDashboardInfo() {
  if (cachedBotDashboardInfo && Date.now() < botDashboardInfoExpiresAt) return cachedBotDashboardInfo;
  const [bot, webhook] = await Promise.all([
    callTelegram("getMe", {}),
    callTelegram("getWebhookInfo", {})
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
    lastErrorAt: webhook.last_error_date ? new Date(webhook.last_error_date * 1e3) : null,
    lastErrorMessage: webhook.last_error_message ?? null
  };
  botDashboardInfoExpiresAt = Date.now() + 6e4;
  return cachedBotDashboardInfo;
}

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  groupMemory: router({
    personalDashboard: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.telegramId) {
        return { requiresTelegramLogin: true, groups: [] };
      }
      const accesses = await getUserDashboardAccesses(ctx.user.id);
      const liveGroupIds = /* @__PURE__ */ new Set();
      await Promise.all(accesses.map(async (access) => {
        try {
          const isAdmin = await isTelegramGroupAdmin(Number(access.telegramChatId), ctx.user.telegramId);
          if (isAdmin) {
            await markUserGroupAccessVerified(ctx.user.id, Number(access.groupId));
            liveGroupIds.add(Number(access.groupId));
          } else {
            await removeUserGroupAccess(ctx.user.id, Number(access.groupId));
          }
        } catch (error) {
          console.warn("[GroupMemory] Dashboard access verification unavailable", error);
        }
      }));
      const allGrantedGroups = await getUserDashboardGroups(ctx.user.id);
      const groups = allGrantedGroups.filter((group) => liveGroupIds.has(Number(group.id)));
      return { requiresTelegramLogin: false, groups };
    }),
    // A dashboard visitor must be both an admin and the durable project owner record.
    ownerDashboard: adminProcedure.query(async ({ ctx }) => {
      if (!ctx.user.isProjectOwner) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "This dashboard is restricted to the bot owner." });
      }
      const [groups, metrics, retentionJob, bot] = await Promise.all([
        getGroupDashboardStatuses(),
        getOwnerPlatformMetrics(),
        getSystemJobByKey("groupmemory-retention"),
        getTelegramBotDashboardInfo()
      ]);
      return { groups, metrics, retentionJob, bot };
    }),
    // Kept temporarily for owner-console compatibility while the client is upgraded.
    dashboard: adminProcedure.query(async ({ ctx }) => {
      if (!ctx.user.isProjectOwner) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "This dashboard is restricted to the bot owner." });
      }
      const [groups, metrics, retentionJob, bot] = await Promise.all([
        getGroupDashboardStatuses(),
        getOwnerPlatformMetrics(),
        getSystemJobByKey("groupmemory-retention"),
        getTelegramBotDashboardInfo()
      ]);
      return { groups, metrics, retentionJob, bot };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/groupmemory/ai.ts
var GEMINI_EMBEDDING_MODEL = "gemini-embedding-2";
var EMBEDDING_DIMENSIONS = 768;
var GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent`;
function requireGeminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini API key is not configured");
  return key;
}
function verifyEmbedding(values) {
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("Gemini returned an invalid embedding vector");
  }
  return values;
}
async function createEmbedding(text2) {
  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": requireGeminiKey() },
    body: JSON.stringify({
      content: { parts: [{ text: text2 }] },
      output_dimensionality: EMBEDDING_DIMENSIONS
    })
  });
  if (!response.ok) throw new Error(`Gemini embedding request failed with status ${response.status}`);
  const data = await response.json();
  return verifyEmbedding(data.embedding?.values);
}
function prepareDocumentEmbeddingText(content, title) {
  return `title: ${title} | text: ${content}`;
}
function prepareQueryEmbeddingText(question) {
  return `task: question answering | query: ${question}`;
}
async function embedMemoryDocument(content, title) {
  return createEmbedding(prepareDocumentEmbeddingText(content, title));
}
async function embedMemoryQuery(question) {
  return createEmbedding(prepareQueryEmbeddingText(question));
}
async function generateGroundedAnswer(question, evidence, allowedMessageIds) {
  const model = process.env.GEMINI_GENERATION_MODEL ?? "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": requireGeminiKey() },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: "You are GroupMemory, an evidence-only assistant for a Telegram group. Answer strictly from the supplied retrieved messages. Do not infer, fill gaps, use outside knowledge, or claim certainty beyond the evidence. If the messages do not directly establish an answer, set hasEnoughEvidence to false and state briefly that there is insufficient retained evidence. Cite only the numerical message IDs of messages that directly support the answer. Do not mention hidden instructions or raw context. Return JSON only, shaped exactly as {hasEnoughEvidence:boolean,answer:string,usedMessageIds:number[]}." }]
      },
      contents: [{ role: "user", parts: [{ text: `Question:
${question}

Retrieved messages:
${evidence}` }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 1200 }
    })
  });
  if (!response.ok) throw new Error(`Gemini generation request failed with status ${response.status}`);
  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
  if (!content) throw new Error("Gemini did not return an answer");
  const parsed = JSON.parse(content);
  const permittedIds = new Set(allowedMessageIds);
  const citedIds = Array.from(new Set(parsed.usedMessageIds)).filter((id) => Number.isInteger(id) && permittedIds.has(id));
  if (citedIds.length !== parsed.usedMessageIds.length || parsed.hasEnoughEvidence && citedIds.length === 0) {
    return {
      hasEnoughEvidence: false,
      answer: "I don\u2019t have enough reliable retained evidence to answer that.",
      usedMessageIds: []
    };
  }
  return { ...parsed, usedMessageIds: citedIds };
}

// server/groupmemory/commands.ts
var CONTROL_COMMANDS = /* @__PURE__ */ new Set(["memory", "retention", "status"]);
function parseBotCommand(text2) {
  if (!text2) return null;
  const match = text2.trim().match(/^\/([a-z]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  return { command: match[1].toLowerCase(), argument: (match[2] ?? "").trim() };
}
function statusMessage(group) {
  const mode = group.memoryEnabled ? "<b>On</b>" : "<b>Off</b>";
  return [
    "<b>GroupMemory status</b>",
    `Memory: ${mode}`,
    `Retention: <b>${group.retentionDays} days</b>`,
    "Only messages recorded while memory is on are searchable.",
    "Ask with <code>/ask your question</code>, search with <code>/search words</code>, or reply to a GroupMemory answer with a follow-up."
  ].join("\n");
}
function formatCommandHelp() {
  return [
    "<b>GroupMemory guide</b>",
    "",
    "<b>Ask naturally</b>",
    "\u2022 <code>/ask What did we decide about the event?</code>",
    "\u2022 <code>/search React last week</code>",
    "\u2022 Reply to any GroupMemory answer with your next question.",
    "",
    "<b>Admins</b>",
    "\u2022 <code>/memory on</code> or <code>/memory off</code>",
    "\u2022 <code>/retention 7d</code>, <code>/retention 30d</code>, or <code>/retention 90d</code>",
    "\u2022 <code>/status</code> to check the group memory."
  ].join("\n");
}
async function handleControlCommand(message, group) {
  const parsed = parseBotCommand(message.text);
  if (!parsed || !CONTROL_COMMANDS.has(parsed.command)) return false;
  if (!message.from || !await isTelegramGroupAdmin(message.chat.id, message.from.id)) {
    await sendTelegramHtmlMessage(
      message.chat.id,
      "<b>Admin permission needed</b>\nOnly a group administrator can change memory settings. You can still use <code>/ask</code> and <code>/search</code>.",
      message.message_id
    );
    return true;
  }
  const senderName = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ").trim() || `Telegram user ${message.from.id}`;
  try {
    await recordVerifiedUserGroupAccess(
      { telegramId: message.from.id, name: senderName, username: message.from.username ?? null },
      group.id
    );
  } catch (error) {
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
      message.message_id
    );
    group.memoryEnabled = updated?.memoryEnabled ?? enabled;
    return true;
  }
  if (parsed.command === "retention") {
    const allowed = /* @__PURE__ */ new Set(["7d", "30d", "90d"]);
    if (!allowed.has(parsed.argument)) {
      await sendTelegramHtmlMessage(message.chat.id, "<b>Choose a retention window</b>\nUse <code>/retention 7d</code>, <code>/retention 30d</code>, or <code>/retention 90d</code>. Older messages are deleted automatically.", message.message_id);
      return true;
    }
    const retentionDays = Number.parseInt(parsed.argument, 10);
    const updated = await setGroupRetentionDays(group.id, retentionDays);
    await sendTelegramHtmlMessage(message.chat.id, `<b>Retention updated</b>
Messages are kept for <b>${retentionDays} days</b>, then deleted automatically.`, message.message_id);
    group.retentionDays = updated?.retentionDays ?? retentionDays;
    return true;
  }
  await sendTelegramHtmlMessage(message.chat.id, statusMessage(group), message.message_id);
  return true;
}

// server/groupmemory/intents.ts
function classifyGroupMemoryIntent(rawQuestion) {
  const question = rawQuestion.trim().toLowerCase().replace(/\s+/g, " ");
  if (!question) return null;
  if (/(?:what(?:'s| is) (?:your |the )?(?:all )?(?:commands?|features?)|(?:show|tell|list).{0,24}(?:commands?|features?)|how (?:do|can) (?:i|we) use (?:you|this bot))/.test(question)) {
    return { kind: "botHelp" };
  }
  if (/(?:how many|count).{0,24}(?:chats?|conversations?)/.test(question)) return { kind: "unsupportedConversationCount" };
  const asksMyMessageCount = /(?:how many|count).{0,30}(?:messages?|msgs?).{0,24}\b(?:i|me|my)\b/.test(question) || /\b(?:my|i)\b.{0,18}(?:messages?|msgs?).{0,16}(?:count|sent)/.test(question);
  if (asksMyMessageCount) {
    return { kind: "personalMessageCount" };
  }
  if (/(?:how many|count).{0,30}(?:messages?|msgs?)/.test(question)) return { kind: "groupMessageCount" };
  if (/(?:who|which (?:person|member)).{0,36}(?:chat|talk|message|send).{0,16}most/.test(question)) return { kind: "topContributor" };
  if (/^(?:smart ai|nice|cool|great|good bot|thank(?:s| you)?|awesome|love it)[!. ]*$/.test(question)) return { kind: "casual" };
  return null;
}
function formatCasualAcknowledgement() {
  return "<b>Thank you.</b>\nI keep answers grounded in retained group messages, and I will say clearly when I do not have enough evidence.";
}

// server/groupmemory/metadata.ts
function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
function entitySlice(text2, entity) {
  return text2.slice(entity.offset, entity.offset + entity.length);
}
function normalizeUrl(value) {
  const trimmed = value.replace(/[),.!?]+$/g, "");
  return trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;
}
function findUrls(text2, entities) {
  const entityUrls = entities.flatMap((entity) => {
    if (entity.type === "text_link" && entity.url) return [entity.url];
    if (entity.type === "url") return [entitySlice(text2, entity)];
    return [];
  });
  const inlineUrls = text2.match(/(?:https?:\/\/|www\.)[^\s<>()]+/gi) ?? [];
  return unique([...entityUrls, ...inlineUrls].map(normalizeUrl));
}
function findMentions(text2, entities) {
  const entityMentions = entities.flatMap((entity) => {
    if (entity.type === "mention") return [entitySlice(text2, entity)];
    if (entity.type === "text_mention" && entity.user?.username) return [`@${entity.user.username}`];
    return [];
  });
  const inlineMentions = text2.match(/@[A-Za-z0-9_]{3,32}/g) ?? [];
  return unique([...entityMentions, ...inlineMentions]);
}
function extractMedia(message) {
  const media = [];
  const add = (type, item) => {
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
function buildTelegramMessageLink(chat, messageId) {
  if (chat.username) return `https://t.me/${chat.username}/${messageId}`;
  if (chat.type === "supergroup" && String(chat.id).startsWith("-100")) {
    return `https://t.me/c/${String(chat.id).slice(4)}/${messageId}`;
  }
  return `tg://privatepost?chat=${chat.id}&post=${messageId}`;
}
function extractMessageMetadata(message) {
  const authoredText = message.text ?? message.caption ?? "";
  const entities = message.entities ?? message.caption_entities ?? [];
  const media = extractMedia(message);
  const fallbackText = media.length ? `[${media.map((item) => item.type).join(", ")} attachment]` : "[Non-text Telegram message]";
  return {
    textContent: authoredText.trim() || fallbackText,
    links: findUrls(authoredText, entities),
    mentions: findMentions(authoredText, entities),
    media,
    originalMessageLink: buildTelegramMessageLink(message.chat, message.message_id)
  };
}

// server/groupmemory/search.ts
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}
function parseLinks(value) {
  if (Array.isArray(value)) return value.filter((link) => typeof link === "string");
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((link) => typeof link === "string") : [];
  } catch {
    return [];
  }
}
function dateFilter(question) {
  const lower = question.toLowerCase();
  const now = /* @__PURE__ */ new Date();
  if (lower.includes("yesterday")) return new Date(now.getTime() - 24 * 60 * 60 * 1e3);
  if (lower.includes("last week")) return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1e3);
  const days = lower.match(/(?:last|past)\s+(\d{1,3})\s+days?/);
  return days ? new Date(now.getTime() - Number(days[1]) * 24 * 60 * 60 * 1e3) : void 0;
}
async function findRelevantGroupMemory(telegramChatId, question) {
  const group = await getTelegramGroupByChatId(telegramChatId);
  if (!group || !group.memoryEnabled) return { group, evidence: [] };
  const queryEmbedding = await embedMemoryQuery(question);
  const retentionCutoff = new Date(Date.now() - group.retentionDays * 24 * 60 * 60 * 1e3);
  const requestedCutoff = dateFilter(question);
  const cutoff = requestedCutoff && requestedCutoff > retentionCutoff ? requestedCutoff : retentionCutoff;
  const rows = await searchGroupMessagesByVector(group.id, queryEmbedding, cutoff, 12);
  return {
    group,
    evidence: rows.map((row) => ({
      id: Number(row.id),
      senderName: String(row.senderName),
      senderUsername: row.senderUsername ? String(row.senderUsername) : null,
      textContent: String(row.textContent),
      sentAt: new Date(String(row.sentAt)),
      links: parseLinks(row.links),
      originalMessageLink: String(row.originalMessageLink),
      distance: Number(row.distance)
    }))
  };
}
function sourceLine(item, includeExcerpt) {
  const identity = item.senderUsername ? `${item.senderName} (@${item.senderUsername.replace(/^@/, "")})` : item.senderName;
  const sentAt = formatSourceTimestamp(item.sentAt);
  const excerpt = includeExcerpt ? `
<i>${escapeHtml(item.textContent.slice(0, 360))}</i>` : "";
  return `<a href="${escapeHtml(item.originalMessageLink)}"><b>${escapeHtml(identity)}</b></a>
<code>${sentAt}</code>${excerpt}`;
}
function formatSourceTimestamp(value) {
  if (Number.isNaN(value.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(value).replace(",", " \xB7") + " IST";
}
function buildSourceCallbackData(sourceIds) {
  const ids = Array.from(new Set(sourceIds.filter((id) => Number.isInteger(id) && id > 0))).slice(0, 4);
  return ids.length ? `src:${ids.join(",")}` : null;
}
function parseSourceCallbackData(value) {
  if (!value?.startsWith("src:")) return [];
  return value.slice(4).split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 4);
}
function buildDeleteCallbackData(requesterTelegramUserId) {
  return Number.isInteger(requesterTelegramUserId) && requesterTelegramUserId > 0 ? `del:${requesterTelegramUserId}` : null;
}
function parseDeleteCallbackData(value) {
  if (!value?.startsWith("del:")) return null;
  const requesterTelegramUserId = Number(value.slice(4));
  return Number.isInteger(requesterTelegramUserId) && requesterTelegramUserId > 0 ? requesterTelegramUserId : null;
}
async function answerGroupQuestion(telegramChatId, question, retrievalHint = question) {
  const { group, evidence } = await findRelevantGroupMemory(telegramChatId, retrievalHint);
  if (!group?.memoryEnabled) return { text: "<b>GroupMemory is paused</b>\nAn administrator can turn memory on with <code>/memory on</code>." };
  if (evidence.length === 0) return { text: "<b>No retained evidence found</b>\nTry a different phrase, a wider time range, or ask after more messages have been recorded." };
  const promptEvidence = evidence.map((item) => `[message_id=${item.id}]
Sender: ${item.senderName}${item.senderUsername ? ` (@${item.senderUsername.replace(/^@/, "")})` : ""}
Time: ${item.sentAt.toISOString()}
Text: ${item.textContent.slice(0, 1200)}
Links: ${item.links.join(", ") || "none"}
Source: ${item.originalMessageLink}`).join("\n\n");
  const assessment = await generateGroundedAnswer(question, promptEvidence, evidence.map((item) => item.id));
  if (!assessment.hasEnoughEvidence) {
    return { text: `<b>Evidence is not strong enough</b>
${escapeHtml(assessment.answer || "I don\u2019t have enough reliable retained evidence to answer that.")}

<i>Try a more specific question or a broader time range.</i>` };
  }
  const sourceIds = assessment.usedMessageIds.filter((id) => evidence.some((item) => item.id === id)).slice(0, 4);
  return { text: `<b>GroupMemory</b>
${escapeHtml(assessment.answer)}

<i>Evidence is ready. Tap the button to view the exact messages, or reply here to ask a follow-up.</i>`, sourceIds };
}
async function formatGroupSearch(telegramChatId, query) {
  const { group, evidence } = await findRelevantGroupMemory(telegramChatId, query);
  if (!group?.memoryEnabled) return { text: "<b>GroupMemory is paused</b>\nAn administrator can turn memory on with <code>/memory on</code>." };
  if (evidence.length === 0) return { text: "<b>No matching retained messages</b>\nTry a different phrase, a person\u2019s name, or a broader time range." };
  const sourceIds = evidence.slice(0, 4).map((item) => item.id);
  return { text: `<b>Search complete</b>
Found <b>${evidence.length}</b> relevant retained message${evidence.length === 1 ? "" : "s"}.

<i>Tap the evidence button to open the best matches.</i>`, sourceIds };
}
async function formatSourceDetails(telegramChatId, sourceIds) {
  const group = await getTelegramGroupByChatId(telegramChatId);
  if (!group) return "<b>Evidence unavailable</b>\nThis group is not configured in GroupMemory.";
  const rows = await getGroupMessagesByIds(group.id, sourceIds);
  const evidence = rows.map((row) => ({
    id: Number(row.id),
    senderName: String(row.senderName),
    senderUsername: row.senderUsername ? String(row.senderUsername) : null,
    textContent: String(row.textContent),
    sentAt: new Date(String(row.sentAt)),
    links: parseLinks(row.links),
    originalMessageLink: String(row.originalMessageLink),
    distance: 0
  }));
  if (!evidence.length) return "<b>Evidence expired</b>\nThose source messages are no longer retained under this group\u2019s policy.";
  return `<b>Evidence \xB7 ${evidence.length} message${evidence.length === 1 ? "" : "s"}</b>

${evidence.map((item, index2) => `<b>${index2 + 1}</b>  ${sourceLine(item, true)}`).join("\n\n")}`;
}

// server/telegram-code-login.ts
import { createHash, randomBytes } from "node:crypto";
var LOGIN_CODE_TTL_MS = 10 * 60 * 1e3;
var LOGIN_CODE_PATTERN = /^GM-[A-F0-9]{16}$/;
function hashTelegramLoginSecret(value) {
  return createHash("sha256").update(value).digest("hex");
}
function normalizeTelegramLoginCode(value) {
  const normalized = value?.trim().toUpperCase();
  return normalized && LOGIN_CODE_PATTERN.test(normalized) ? normalized : void 0;
}
function createRawCode() {
  return `GM-${randomBytes(8).toString("hex").toUpperCase()}`;
}
function createPollToken() {
  return randomBytes(32).toString("base64url");
}
async function createTelegramBotCodeLogin(ownerOpenId) {
  const code = createRawCode();
  const pollToken = createPollToken();
  await createTelegramLoginCode({
    codeHash: hashTelegramLoginSecret(code),
    pollTokenHash: hashTelegramLoginSecret(pollToken),
    ownerOpenId: ownerOpenId ?? null,
    expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS)
  });
  const username = await getTelegramBotUsername();
  return {
    code,
    pollToken,
    expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS),
    deepLink: `https://t.me/${username}?start=${code}`
  };
}
async function confirmTelegramBotCodeLogin(code, identity) {
  const normalizedCode = normalizeTelegramLoginCode(code);
  if (!normalizedCode) return { status: "invalid" };
  const confirmation = await confirmTelegramLoginCode({
    codeHash: hashTelegramLoginSecret(normalizedCode),
    telegramId: identity.telegramId,
    telegramName: identity.name,
    telegramUsername: identity.username ?? null
  });
  return confirmation;
}
async function createSessionFromCode(pollToken) {
  const code = await consumeConfirmedTelegramLoginCode(hashTelegramLoginSecret(pollToken));
  if (!code) return void 0;
  const identity = {
    telegramId: code.telegramId,
    name: code.telegramName,
    username: code.telegramUsername
  };
  const user = code.ownerOpenId ? await linkTelegramIdentityToProjectOwner(code.ownerOpenId, identity) : await upsertTelegramDashboardUser(identity);
  if (!user) throw new Error("Linked Telegram dashboard user was not found");
  return {
    sessionToken: await sdk.createSessionToken(user.openId, { name: user.name ?? identity.name, expiresInMs: ONE_YEAR_MS }),
    user
  };
}
function registerTelegramBotCodeLoginRoutes(app) {
  app.post("/api/auth/telegram/code/start", async (req, res) => {
    try {
      let ownerOpenId;
      try {
        const user = await sdk.authenticateRequest(req);
        if (user.isProjectOwner) ownerOpenId = user.openId;
      } catch {
      }
      const login = await createTelegramBotCodeLogin(ownerOpenId);
      res.status(201).json({
        code: login.code,
        deepLink: login.deepLink,
        pollToken: login.pollToken,
        expiresAt: login.expiresAt.toISOString(),
        ownerLink: Boolean(ownerOpenId)
      });
    } catch (error) {
      console.error("[Telegram code login] Start failed", error);
      res.status(500).json({ error: "Unable to create a Telegram link code" });
    }
  });
  app.post("/api/auth/telegram/code/status", async (req, res) => {
    const pollToken = typeof req.body?.pollToken === "string" ? req.body.pollToken : void 0;
    if (!pollToken || pollToken.length < 32) {
      res.status(400).json({ error: "A valid link status token is required" });
      return;
    }
    try {
      const pollTokenHash = hashTelegramLoginSecret(pollToken);
      const currentStatus = await getTelegramLoginCodePollStatus(pollTokenHash);
      if (currentStatus !== "confirmed") {
        const statuses = {
          pending: { http: 202, message: void 0 },
          expired: { http: 410, message: "This Telegram link code expired. Create a new code and try again." },
          consumed: { http: 409, message: "This Telegram link code has already been used. Create a new code if you need to sign in again." },
          invalid: { http: 404, message: "This Telegram link code is invalid. Create a new code and try again." }
        };
        const outcome = statuses[currentStatus];
        res.status(outcome.http).json({ status: currentStatus, ...outcome.message ? { error: outcome.message } : {} });
        return;
      }
      const linked = await createSessionFromCode(pollToken);
      if (!linked) {
        res.status(409).json({ status: "consumed", error: "This Telegram link code has already been used. Create a new code if you need to sign in again." });
        return;
      }
      res.cookie(COOKIE_NAME, linked.sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.status(200).json({ status: "linked", isProjectOwner: linked.user.isProjectOwner });
    } catch (error) {
      console.error("[Telegram code login] Status failed", error);
      res.status(500).json({ error: "Unable to complete the Telegram link" });
    }
  });
}

// server/groupmemory/webhook.ts
async function resolveUserQuery(message) {
  const command = parseBotCommand(message.text);
  if (command?.command === "ask" && command.argument) return { kind: "ask", question: command.argument };
  if (command?.command === "search" && command.argument) return { kind: "search", question: command.argument };
  const repliedBotText = message.reply_to_message?.text?.trim() ?? "";
  const isGroupMemoryReply = message.reply_to_message?.from?.is_bot && /^(GroupMemory|Search complete|Evidence|Your retained message count|Group retained messages|Most active retained sender)/i.test(repliedBotText);
  if (message.text?.trim() && isGroupMemoryReply) {
    const priorAnswer = message.reply_to_message?.text?.slice(0, 900) ?? "";
    return { kind: "ask", question: message.text.trim(), retrievalHint: `${message.text.trim()}

Follow-up to a prior GroupMemory answer: ${priorAnswer}` };
  }
  if (!message.text?.trim().startsWith("@")) return null;
  const username = await getTelegramBotUsername();
  const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = message.text.trim().match(new RegExp(`^@${escapedUsername}\\s+([\\s\\S]+)$`, "i"));
  return match?.[1]?.trim() ? { kind: "ask", question: match[1].trim() } : null;
}
function verifyTelegramWebhook(secret) {
  return isVerifiedTelegramWebhook(secret);
}
function formatStartMessage(chatType) {
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
      "Then use <code>/ask What did we decide?</code>, <code>/search React</code>, or reply to an answer with your next question."
    ].join("\n");
  }
  return [
    "<b>GroupMemory is ready</b>",
    "An admin can start recording with <code>/memory on</code>.",
    "",
    "Ask with <code>/ask your question</code>, search with <code>/search your words</code>, mention me with a question, or reply to any answer with a follow-up.",
    "",
    "Use <code>/help</code> for the full command guide."
  ].join("\n");
}
function escapeHtml2(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}
async function answerKnownIntent(intent, group, senderTelegramUserId) {
  if (!intent) return null;
  if (intent.kind === "botHelp") return formatCommandHelp();
  if (intent.kind === "casual") return formatCasualAcknowledgement();
  if (intent.kind === "unsupportedConversationCount") {
    return "<b>I cannot count conversations exactly.</b>\nA conversation has no fixed start or end. I can count retained messages, or identify the member with the most retained messages.";
  }
  if (intent.kind === "personalMessageCount") {
    if (!senderTelegramUserId) return "<b>I cannot identify the sender for this message.</b>\nPlease ask again from your normal Telegram account.";
    const count = await getRetainedMessageCount(group.id, senderTelegramUserId);
    return `<b>Your retained message count</b>
I have <b>${count}</b> non-command message${count === 1 ? "" : "s"} from you in this group.

<i>This reflects only the current ${group.retentionDays}-day retained memory. Messages from before memory was enabled or already deleted are not included.</i>`;
  }
  if (intent.kind === "groupMessageCount") {
    const count = await getRetainedMessageCount(group.id);
    return `<b>Group retained messages</b>
I currently have <b>${count}</b> non-command message${count === 1 ? "" : "s"} in this group\u2019s retained memory.

<i>This reflects the current ${group.retentionDays}-day retention window.</i>`;
  }
  if (intent.kind === "topContributor") {
    const topSender = await getTopRetainedSender(group.id);
    if (!topSender) return "<b>No retained messages yet.</b>\nI need recorded group messages before I can calculate this.";
    const identity = topSender.senderUsername ? `${escapeHtml2(topSender.senderName)} (@${escapeHtml2(topSender.senderUsername.replace(/^@/, ""))})` : escapeHtml2(topSender.senderName);
    return `<b>Most active retained sender</b>
${identity} has <b>${topSender.messageCount}</b> retained non-command message${topSender.messageCount === 1 ? "" : "s"} in the current memory window.`;
  }
  return null;
}
async function processTelegramUpdate(update) {
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
      const deleteData2 = buildDeleteCallbackData(callback.from.id);
      const replyMarkup2 = deleteData2 ? { inline_keyboard: [[{ text: "Delete evidence", callback_data: deleteData2 }]] } : void 0;
      await sendTelegramHtmlMessage(callbackMessage.chat.id, details, callbackMessage.message_id, replyMarkup2);
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
        username: message.from.username ?? null
      });
      if (confirmation.status === "confirmed") {
        await sendTelegramHtmlMessage(
          message.chat.id,
          "<b>Dashboard linked</b>\nReturn to GroupMemory in your browser. This one-time code works only for the Telegram account that opened it.",
          message.message_id
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
    if (isEditedMessage || !await hasStoredTelegramMessage(group.id, message.message_id)) {
      const metadata = extractMessageMetadata(message);
      const senderName = `${sender.first_name}${message.from?.last_name ? ` ${message.from.last_name}` : ""}`;
      const embedding = await embedMemoryDocument(metadata.textContent, `Telegram group message from ${senderName}`);
      await persistGroupMessage({
        groupId: group.id,
        telegramMessageId: message.message_id,
        senderTelegramUserId: sender.id,
        senderName,
        senderUsername: sender.username,
        textContent: metadata.textContent,
        sentAt: new Date(message.date * 1e3),
        ...isEditedMessage ? { editedAt: /* @__PURE__ */ new Date() } : {},
        replyToMessageId: message.reply_to_message?.message_id,
        links: metadata.links,
        media: metadata.media,
        mentions: metadata.mentions,
        topicThreadId: message.message_thread_id,
        originalMessageLink: metadata.originalMessageLink,
        embedding
      });
    }
  }
  if (!query && !selfAwareDirectIntent) return;
  const question = query?.question ?? message.text.trim();
  const intentResponse = await answerKnownIntent(selfAwareDirectIntent ?? classifyGroupMemoryIntent(question), group, message.from?.id);
  if (intentResponse) {
    const deleteData2 = message.from ? buildDeleteCallbackData(message.from.id) : null;
    const replyMarkup2 = deleteData2 ? { inline_keyboard: [[{ text: "Delete answer", callback_data: deleteData2 }]] } : void 0;
    await sendTelegramHtmlMessage(message.chat.id, intentResponse, message.message_id, replyMarkup2);
    return;
  }
  if (!query) return;
  const response = query.kind === "ask" ? await answerGroupQuestion(message.chat.id, query.question, query.retrievalHint) : await formatGroupSearch(message.chat.id, query.question);
  const callbackData = buildSourceCallbackData(response.sourceIds ?? []);
  const deleteData = message.from ? buildDeleteCallbackData(message.from.id) : null;
  const buttons = [
    ...callbackData ? [{ text: `View evidence (${response.sourceIds?.length ?? 0})`, callback_data: callbackData }] : [],
    ...deleteData ? [{ text: "Delete answer", callback_data: deleteData }] : []
  ];
  const replyMarkup = buttons.length ? { inline_keyboard: [buttons] } : void 0;
  await sendTelegramHtmlMessage(message.chat.id, response.text, message.message_id, replyMarkup);
}

// server/groupmemory/retention.ts
import { timingSafeEqual as timingSafeEqual2 } from "node:crypto";
function isAuthorizedExternalCron(authorization) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual2(expected, received);
}
async function handleRetentionCleanup(req, res) {
  try {
    const externalCron = isAuthorizedExternalCron(req.header("authorization"));
    let job;
    if (externalCron) {
      job = await getSystemJobByKey("groupmemory-retention");
    } else {
      const caller = await sdk.authenticateRequest(req);
      if (!caller.isCron || !caller.taskUid) return res.status(403).json({ error: "cron-only" });
      job = await getSystemJobByTaskUid(caller.taskUid);
      if (!job) return res.json({ ok: true, skipped: "orphaned-or-unconfigured-job" });
    }
    const deletedCount = await deleteExpiredGroupMessages();
    if (job) await recordSystemJobRun(job.id, deletedCount);
    return res.json({ ok: true, deletedCount, completedAt: (/* @__PURE__ */ new Date()).toISOString(), scheduler: externalCron ? "external" : "managed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown retention cleanup error";
    console.error("[GroupMemory] Retention cleanup failed", error);
    return res.status(500).json({
      error: message,
      context: { path: "/api/scheduled/groupmemory-retention" },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
}

// server/telegram-oidc.ts
import { createHash as createHash2, createHmac, randomBytes as randomBytes2, timingSafeEqual as timingSafeEqual3 } from "node:crypto";
import { parse as parseCookieHeader3 } from "cookie";
import { createRemoteJWKSet, jwtVerify as jwtVerify2 } from "jose";
var TELEGRAM_AUTHORIZATION_ENDPOINT = "https://oauth.telegram.org/auth";
var TELEGRAM_TOKEN_ENDPOINT = "https://oauth.telegram.org/token";
var TELEGRAM_ISSUER = "https://oauth.telegram.org";
var TELEGRAM_JWKS = createRemoteJWKSet(new URL("https://oauth.telegram.org/.well-known/jwks.json"));
var TELEGRAM_OIDC_STATE_COOKIE = "__Host-telegram_oidc_state";
var OIDC_STATE_MAX_AGE_MS = 10 * 60 * 1e3;
function firstHeaderValue(value) {
  const resolved = Array.isArray(value) ? value[0] : value;
  return resolved?.split(",")[0]?.trim();
}
function requestOrigin(req) {
  const forwardedProto = firstHeaderValue(req.headers["x-forwarded-proto"]);
  const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : req.protocol;
  const host = firstHeaderValue(req.headers["x-forwarded-host"]) ?? req.get("host");
  if (!host || /[\s/\\]/.test(host)) throw new Error("Unable to determine a safe callback origin");
  return `${protocol}://${host}`;
}
function safeReturnPath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
function stateCookieOptions(req) {
  const session = getSessionCookieOptions(req);
  return { ...session, sameSite: "lax", maxAge: OIDC_STATE_MAX_AGE_MS };
}
function encodeStateCookie(state) {
  if (!ENV.cookieSecret) throw new Error("Dashboard session secret is not configured");
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", ENV.cookieSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
function decodeStateCookie(value) {
  if (!value) return null;
  try {
    if (!ENV.cookieSecret) return null;
    const [payload, signature, extra] = value.split(".");
    if (!payload || !signature || extra) return null;
    const expectedSignature = createHmac("sha256", ENV.cookieSecret).update(payload).digest();
    const receivedSignature = Buffer.from(signature, "base64url");
    if (expectedSignature.length !== receivedSignature.length || !timingSafeEqual3(expectedSignature, receivedSignature)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed.state !== "string" || typeof parsed.verifier !== "string" || typeof parsed.redirectUri !== "string" || typeof parsed.createdAt !== "number" || parsed.intent !== "login" && parsed.intent !== "owner-link") {
      return null;
    }
    return {
      state: parsed.state,
      verifier: parsed.verifier,
      redirectUri: parsed.redirectUri,
      intent: parsed.intent,
      ownerOpenId: typeof parsed.ownerOpenId === "string" ? parsed.ownerOpenId : void 0,
      returnTo: safeReturnPath(parsed.returnTo),
      createdAt: parsed.createdAt
    };
  } catch {
    return null;
  }
}
function buildAuthorizationUrl(state) {
  const challenge = createHash2("sha256").update(state.verifier).digest("base64url");
  const url = new URL(TELEGRAM_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", ENV.telegramOidcClientId);
  url.searchParams.set("redirect_uri", state.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile");
  url.searchParams.set("state", state.state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}
async function exchangeAuthorizationCode(code, state) {
  if (!ENV.telegramOidcClientId || !ENV.telegramOidcClientSecret) {
    throw new Error("Telegram Login credentials are not configured");
  }
  const authorization = Buffer.from(`${ENV.telegramOidcClientId}:${ENV.telegramOidcClientSecret}`).toString("base64");
  const response = await fetch(TELEGRAM_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Basic ${authorization}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: state.redirectUri,
      client_id: ENV.telegramOidcClientId,
      code_verifier: state.verifier
    }),
    signal: AbortSignal.timeout(15e3)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.id_token !== "string") {
    console.warn("[Telegram OIDC] Token exchange rejected", { status: response.status, error: body?.error ?? "missing_id_token" });
    throw new Error("Telegram Login code exchange was rejected");
  }
  return body.id_token;
}
function requiredClaim(payload, key) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
async function verifyTelegramIdentityToken(idToken) {
  if (!ENV.telegramOidcClientId) throw new Error("Telegram Login client ID is not configured");
  const { payload } = await jwtVerify2(idToken, TELEGRAM_JWKS, {
    issuer: TELEGRAM_ISSUER,
    audience: ENV.telegramOidcClientId
  });
  const subject = requiredClaim(payload, "sub");
  const telegramId = typeof payload.id === "number" || typeof payload.id === "string" ? Number(payload.id) : Number.NaN;
  if (!subject || !Number.isSafeInteger(telegramId) || telegramId <= 0) {
    throw new Error("Telegram Login token is missing a valid Telegram user identity");
  }
  const username = requiredClaim(payload, "preferred_username") ?? requiredClaim(payload, "username") ?? null;
  const name = requiredClaim(payload, "name") ?? [requiredClaim(payload, "given_name"), requiredClaim(payload, "family_name")].filter(Boolean).join(" ") ?? username ?? `Telegram user ${telegramId}`;
  return { telegramId, name, username };
}
async function startTelegramLogin(req, res, intent, ownerOpenId) {
  if (!ENV.telegramOidcClientId || !ENV.telegramOidcClientSecret) {
    res.status(503).json({ error: "Telegram Login is not configured" });
    return;
  }
  const redirectUri = `${requestOrigin(req)}/api/auth/telegram/callback`;
  const state = {
    state: randomBytes2(32).toString("base64url"),
    verifier: randomBytes2(64).toString("base64url"),
    redirectUri,
    intent,
    ownerOpenId,
    returnTo: safeReturnPath(req.query.returnTo),
    createdAt: Date.now()
  };
  res.cookie(TELEGRAM_OIDC_STATE_COOKIE, encodeStateCookie(state), stateCookieOptions(req));
  res.redirect(302, buildAuthorizationUrl(state));
}
function registerTelegramOidcRoutes(app) {
  app.get("/api/auth/telegram/login", async (req, res) => {
    try {
      await startTelegramLogin(req, res, "login");
    } catch (error) {
      console.error("[Telegram OIDC] Login start failed", error);
      res.status(400).json({ error: "Unable to start Telegram Login" });
    }
  });
  app.get("/api/auth/telegram/link-owner", async (req, res) => {
    try {
      const owner = await sdk.authenticateRequest(req);
      if (!owner.isProjectOwner) {
        res.status(403).json({ error: "Project owner access is required" });
        return;
      }
      await startTelegramLogin(req, res, "owner-link", owner.openId);
    } catch (error) {
      console.error("[Telegram OIDC] Owner-link start failed", error);
      res.status(403).json({ error: "A signed-in project owner is required" });
    }
  });
  app.get("/api/auth/telegram/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : void 0;
    const stateValue = typeof req.query.state === "string" ? req.query.state : void 0;
    const cookieValue = parseCookieHeader3(req.headers.cookie ?? "")[TELEGRAM_OIDC_STATE_COOKIE];
    const state = decodeStateCookie(cookieValue);
    const { maxAge: _maxAge, ...clearStateCookieOptions } = stateCookieOptions(req);
    res.clearCookie(TELEGRAM_OIDC_STATE_COOKIE, clearStateCookieOptions);
    if (!code || !stateValue || !state || state.state !== stateValue || Date.now() - state.createdAt > OIDC_STATE_MAX_AGE_MS) {
      res.status(403).json({ error: "Invalid or expired Telegram Login state" });
      return;
    }
    try {
      const idToken = await exchangeAuthorizationCode(code, state);
      const identity = await verifyTelegramIdentityToken(idToken);
      const user = state.intent === "owner-link" ? await linkTelegramIdentityToProjectOwner(state.ownerOpenId ?? "", identity) : await upsertTelegramDashboardUser(identity);
      if (!user) throw new Error("Telegram dashboard user was not found");
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? identity.name, expiresInMs: ONE_YEAR_MS });
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, state.returnTo);
    } catch (error) {
      console.error("[Telegram OIDC] Callback failed", error);
      res.status(401).json({ error: "Telegram Login could not be verified" });
    }
  });
}

// server/app.ts
function createGroupMemoryApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerTelegramOidcRoutes(app);
  registerTelegramBotCodeLoginRoutes(app);
  app.get("/api/health", (_req, res) => res.status(200).json({ ok: true, service: "groupmemory" }));
  app.post("/api/telegram/webhook", async (req, res) => {
    if (!verifyTelegramWebhook(req.header("x-telegram-bot-api-secret-token"))) {
      return res.status(401).json({ ok: false, error: "unverified Telegram webhook" });
    }
    try {
      await processTelegramUpdate(req.body);
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("[GroupMemory] Telegram webhook processing failed", error);
      return res.status(500).json({ ok: false, error: "webhook processing failed" });
    }
  });
  app.all("/api/scheduled/groupmemory-retention", handleRetentionCleanup);
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  return app;
}

// server/vercel-entry.ts
var vercel_entry_default = createGroupMemoryApp();
export {
  vercel_entry_default as default
};
