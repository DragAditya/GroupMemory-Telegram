import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import {
  getGroupDashboardStatuses,
  getOwnerPlatformMetrics,
  getSystemJobByKey,
  getUserDashboardAccesses,
  getUserDashboardGroups,
  markUserGroupAccessVerified,
  removeUserGroupAccess,
} from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getTelegramBotDashboardInfo, isTelegramGroupAdmin } from "./groupmemory/telegram";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  groupMemory: router({
    personalDashboard: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.telegramId) {
        return { requiresTelegramLogin: true, groups: [] };
      }

      const accesses = await getUserDashboardAccesses(ctx.user.id);
      const liveGroupIds = new Set<number>();
      await Promise.all(accesses.map(async access => {
        try {
          const isAdmin = await isTelegramGroupAdmin(Number(access.telegramChatId), ctx.user.telegramId!);
          if (isAdmin) {
            await markUserGroupAccessVerified(ctx.user.id, Number(access.groupId));
            liveGroupIds.add(Number(access.groupId));
          } else {
            await removeUserGroupAccess(ctx.user.id, Number(access.groupId));
          }
        } catch (error) {
          // A Telegram API outage must never turn into a cross-tenant data grant.
          // Keep the historic grant for a later retry, but do not return the group this time.
          console.warn("[GroupMemory] Dashboard access verification unavailable", error);
        }
      }));

      const allGrantedGroups = await getUserDashboardGroups(ctx.user.id);
      const groups = allGrantedGroups.filter(group => liveGroupIds.has(Number(group.id)));
      return { requiresTelegramLogin: false, groups };
    }),
    // A dashboard visitor must be both an admin and the durable project owner record.
    ownerDashboard: adminProcedure.query(async ({ ctx }) => {
      if (!ctx.user.isProjectOwner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This dashboard is restricted to the bot owner." });
      }
      const [groups, metrics, retentionJob, bot] = await Promise.all([
        getGroupDashboardStatuses(),
        getOwnerPlatformMetrics(),
        getSystemJobByKey("groupmemory-retention"),
        getTelegramBotDashboardInfo(),
      ]);
      return { groups, metrics, retentionJob, bot };
    }),
    // Kept temporarily for owner-console compatibility while the client is upgraded.
    dashboard: adminProcedure.query(async ({ ctx }) => {
      if (!ctx.user.isProjectOwner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This dashboard is restricted to the bot owner." });
      }
      const [groups, metrics, retentionJob, bot] = await Promise.all([
        getGroupDashboardStatuses(),
        getOwnerPlatformMetrics(),
        getSystemJobByKey("groupmemory-retention"),
        getTelegramBotDashboardInfo(),
      ]);
      return { groups, metrics, retentionJob, bot };
    }),
  }),
});

export type AppRouter = typeof appRouter;
