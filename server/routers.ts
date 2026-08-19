import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { getGroupDashboardStatuses, getSystemJobByKey } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { getTelegramBotDashboardInfo } from "./groupmemory/telegram";

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
    // A dashboard visitor must be both an admin and the durable project owner record.
    dashboard: adminProcedure.query(async ({ ctx }) => {
      if (!ctx.user.isProjectOwner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This dashboard is restricted to the bot owner." });
      }
      const [groups, retentionJob, bot] = await Promise.all([
        getGroupDashboardStatuses(),
        getSystemJobByKey("groupmemory-retention"),
        getTelegramBotDashboardInfo(),
      ]);
      return { groups, retentionJob, bot };
    }),
  }),
});

export type AppRouter = typeof appRouter;
