import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  groupMessages,
  InsertUser,
  systemJobs,
  telegramGroups,
  users,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    if (user.openId === ENV.ownerOpenId) {
      values.isProjectOwner = true;
      updateSet.isProjectOwner = true;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export type EnsureTelegramGroupInput = {
  telegramChatId: number;
  chatType: "group" | "supergroup";
  title?: string;
  username?: string;
};

export async function ensureTelegramGroup(input: EnsureTelegramGroupInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const now = new Date();
  await db
    .insert(telegramGroups)
    .values({
      telegramChatId: input.telegramChatId,
      chatType: input.chatType,
      title: input.title ?? null,
      username: input.username ?? null,
      lastActivityAt: now,
    })
    .onDuplicateKeyUpdate({
      set: { chatType: input.chatType, title: input.title ?? null, username: input.username ?? null, lastActivityAt: now },
    });
  return getTelegramGroupByChatId(input.telegramChatId);
}

export async function getTelegramGroupByChatId(telegramChatId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.select().from(telegramGroups).where(eq(telegramGroups.telegramChatId, telegramChatId)).limit(1);
  return result[0];
}

export async function setGroupMemoryEnabled(groupId: number, memoryEnabled: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(telegramGroups).set({ memoryEnabled }).where(eq(telegramGroups.id, groupId));
  const result = await db.select().from(telegramGroups).where(eq(telegramGroups.id, groupId)).limit(1);
  return result[0];
}

export async function setGroupRetentionDays(groupId: number, retentionDays: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(telegramGroups).set({ retentionDays }).where(eq(telegramGroups.id, groupId));
  const result = await db.select().from(telegramGroups).where(eq(telegramGroups.id, groupId)).limit(1);
  return result[0];
}

export async function hasStoredTelegramMessage(groupId: number, telegramMessageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db
    .select({ id: groupMessages.id })
    .from(groupMessages)
    .where(and(eq(groupMessages.groupId, groupId), eq(groupMessages.telegramMessageId, telegramMessageId)))
    .limit(1);
  return result.length > 0;
}

export type PersistGroupMessageInput = {
  groupId: number;
  telegramMessageId: number;
  senderTelegramUserId: number;
  senderName: string;
  senderUsername?: string;
  textContent: string;
  sentAt: Date;
  editedAt?: Date;
  replyToMessageId?: number;
  links: string[];
  media: Array<{ fileId: string; type: string; fileName?: string }>;
  mentions: string[];
  topicThreadId?: number;
  originalMessageLink: string;
  embedding: number[];
};

export async function persistGroupMessage(input: PersistGroupMessageInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const values = {
    ...input,
    senderUsername: input.senderUsername ?? null,
    editedAt: input.editedAt ?? null,
    replyToMessageId: input.replyToMessageId ?? null,
    topicThreadId: input.topicThreadId ?? null,
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
      embedding: values.embedding,
    },
  });
}

export async function searchGroupMessagesByVector(groupId: number, queryEmbedding: number[], cutoff: Date, limit: number) {
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
  return result[0] as unknown as Array<Record<string, unknown>>;
}

export async function getGroupMessagesByIds(groupId: number, messageIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const normalizedIds = Array.from(new Set(messageIds.filter(id => Number.isInteger(id) && id > 0))).slice(0, 4);
  if (normalizedIds.length === 0) return [];
  const rows = await db.select({
    id: groupMessages.id,
    senderName: groupMessages.senderName,
    senderUsername: groupMessages.senderUsername,
    textContent: groupMessages.textContent,
    sentAt: groupMessages.sentAt,
    links: groupMessages.links,
    originalMessageLink: groupMessages.originalMessageLink,
  }).from(groupMessages).where(and(eq(groupMessages.groupId, groupId), inArray(groupMessages.id, normalizedIds)));
  return normalizedIds.map(id => rows.find(row => Number(row.id) === id)).filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export async function getRetainedMessageCount(groupId: number, senderTelegramUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const filters = [eq(groupMessages.groupId, groupId)];
  if (senderTelegramUserId !== undefined) filters.push(eq(groupMessages.senderTelegramUserId, senderTelegramUserId));
  const result = await db.execute(sql`SELECT COUNT(*) AS messageCount FROM group_messages WHERE ${and(...filters)}`);
  return Number((result[0] as unknown as Array<{ messageCount?: number }>)[0]?.messageCount ?? 0);
}

export async function getTopRetainedSender(groupId: number) {
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
  const row = (result[0] as unknown as Array<{ senderName?: string; senderUsername?: string | null; messageCount?: number }>)[0];
  return row ? { senderName: String(row.senderName ?? "Unknown member"), senderUsername: row.senderUsername ? String(row.senderUsername) : null, messageCount: Number(row.messageCount ?? 0) } : null;
}

export async function deleteExpiredGroupMessages(now = new Date(), batchSize = 500, maxBatchesPerGroup = 40) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const groups = await db.select({ id: telegramGroups.id, retentionDays: telegramGroups.retentionDays }).from(telegramGroups);
  let deletedCount = 0;
  for (const group of groups) {
    const cutoff = new Date(now.getTime() - group.retentionDays * 24 * 60 * 60 * 1000);
    let groupDeletedCount = 0;
    for (let batch = 0; batch < maxBatchesPerGroup; batch++) {
      const result = await db.execute(sql`
        DELETE FROM group_messages
        WHERE groupId = ${group.id} AND sentAt < ${cutoff}
        LIMIT ${Math.min(Math.max(Math.floor(batchSize), 1), 1000)}
      `);
      const affectedRows = Number((result[0] as unknown as { affectedRows?: number }).affectedRows ?? 0);
      groupDeletedCount += affectedRows;
      if (affectedRows < batchSize) break;
    }
    deletedCount += groupDeletedCount;
    if (groupDeletedCount > 0) console.info(`[GroupMemory] Retention removed ${groupDeletedCount} messages for group ${group.id}`);
  }
  return deletedCount;
}

export async function getSystemJobByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.select().from(systemJobs).where(eq(systemJobs.scheduleCronTaskUid, taskUid)).limit(1);
  return result[0];
}

export async function recordSystemJobRun(jobId: number, deletedCount: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(systemJobs).set({ lastRunAt: new Date(), lastRunDeletedCount: deletedCount }).where(eq(systemJobs.id, jobId));
}

export async function getSystemJobByKey(jobKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.select().from(systemJobs).where(eq(systemJobs.jobKey, jobKey)).limit(1);
  return result[0];
}

export async function getGroupDashboardStatuses() {
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
  return result[0] as unknown as Array<{
    id: number;
    telegramChatId: number;
    title: string | null;
    username: string | null;
    memoryEnabled: boolean | number;
    retentionDays: number;
    lastActivityAt: Date | string | null;
    messageCount: number | string;
  }>;
}

export async function upsertSystemJob(jobKey: string, scheduleCronTaskUid: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(systemJobs).values({ jobKey, scheduleCronTaskUid }).onDuplicateKeyUpdate({ set: { scheduleCronTaskUid } });
}
