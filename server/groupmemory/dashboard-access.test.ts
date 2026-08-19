import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getGroupDashboardStatuses: vi.fn().mockResolvedValue([]),
  getOwnerPlatformMetrics: vi.fn().mockResolvedValue({
    groupCount: 2,
    retainedMessageCount: 40,
    memoryEnabledGroupCount: 1,
    activeGroupCount: 1,
  }),
  getSystemJobByKey: vi.fn().mockResolvedValue(undefined),
  getUserDashboardAccesses: vi.fn().mockResolvedValue([{ groupId: 4, telegramChatId: -100123 }]),
  getUserDashboardGroups: vi.fn().mockResolvedValue([{ id: 4, title: "Scoped group", messageCount: 9 }]),
  markUserGroupAccessVerified: vi.fn().mockResolvedValue(undefined),
  removeUserGroupAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./telegram", () => ({
  getTelegramBotDashboardInfo: vi.fn().mockResolvedValue({
    username: "GroupMemoryBot",
    displayName: "GroupMemory",
    profileUrl: "https://t.me/GroupMemoryBot",
    addToGroupUrl: "https://t.me/GroupMemoryBot?startgroup=groupmemory",
    canJoinGroups: true,
    supportsInlineQueries: false,
    webhookConfigured: true,
    webhookUrl: "https://example.test/api/telegram/webhook",
    pendingUpdateCount: 0,
    lastErrorAt: null,
    lastErrorMessage: null,
  }),
  isTelegramGroupAdmin: vi.fn().mockResolvedValue(true),
}));

import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { removeUserGroupAccess } from "../db";
import { isTelegramGroupAdmin } from "./telegram";

describe("GroupMemory owner dashboard access", () => {
  it("allows an authenticated project admin to load dashboard data", async () => {
    const ctx = {
      user: {
        id: 1,
        openId: "authenticated-project-owner",
        name: "Project Owner",
        email: "owner@example.com",
        loginMethod: "manus",
        role: "admin",
        isProjectOwner: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    } as TrpcContext;

    await expect(appRouter.createCaller(ctx).groupMemory.dashboard()).resolves.toEqual({
      groups: [],
      metrics: {
        groupCount: 2,
        retainedMessageCount: 40,
        memoryEnabledGroupCount: 1,
        activeGroupCount: 1,
      },
      retentionJob: undefined,
      bot: expect.objectContaining({ username: "GroupMemoryBot", webhookConfigured: true }),
    });
  });

  it("rejects another admin who is not the project owner", async () => {
    const ctx = {
      user: {
        id: 2,
        openId: "other-admin",
        name: "Other Admin",
        email: "admin@example.com",
        loginMethod: "manus",
        role: "admin",
        isProjectOwner: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    } as TrpcContext;

    await expect(appRouter.createCaller(ctx).groupMemory.dashboard()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns only the caller’s verified Telegram group grants", async () => {
    const ctx = {
      user: {
        id: 7,
        openId: "telegram:9001",
        telegramId: 9001,
        telegramUsername: "scoped_admin",
        name: "Scoped Admin",
        email: null,
        loginMethod: "telegram",
        role: "user",
        isProjectOwner: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    } as TrpcContext;

    await expect(appRouter.createCaller(ctx).groupMemory.personalDashboard()).resolves.toEqual({
      requiresTelegramLogin: false,
      groups: [{ id: 4, title: "Scoped group", messageCount: 9 }],
    });
  });

  it("withholds a group during a Telegram API outage without permanently revoking the prior grant", async () => {
    vi.mocked(isTelegramGroupAdmin).mockRejectedValueOnce(new Error("Telegram unavailable"));
    const ctx = {
      user: {
        id: 7,
        openId: "telegram:9001",
        telegramId: 9001,
        telegramUsername: "scoped_admin",
        name: "Scoped Admin",
        email: null,
        loginMethod: "telegram",
        role: "user",
        isProjectOwner: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    } as TrpcContext;

    await expect(appRouter.createCaller(ctx).groupMemory.personalDashboard()).resolves.toEqual({
      requiresTelegramLogin: false,
      groups: [],
    });
    expect(removeUserGroupAccess).not.toHaveBeenCalled();
  });

  it("revokes a group grant when Telegram confirms the user is no longer an administrator", async () => {
    vi.mocked(removeUserGroupAccess).mockClear();
    vi.mocked(isTelegramGroupAdmin).mockResolvedValueOnce(false);
    const ctx = {
      user: {
        id: 7,
        openId: "telegram:9001",
        telegramId: 9001,
        telegramUsername: "scoped_admin",
        name: "Scoped Admin",
        email: null,
        loginMethod: "telegram",
        role: "user",
        isProjectOwner: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    } as TrpcContext;

    await expect(appRouter.createCaller(ctx).groupMemory.personalDashboard()).resolves.toEqual({
      requiresTelegramLogin: false,
      groups: [],
    });
    expect(removeUserGroupAccess).toHaveBeenCalledWith(7, 4);
  });
});
