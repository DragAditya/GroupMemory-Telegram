import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getGroupDashboardStatuses: vi.fn().mockResolvedValue([]),
  getSystemJobByKey: vi.fn().mockResolvedValue(undefined),
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
}));

import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

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
});
