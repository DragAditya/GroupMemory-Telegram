import { COOKIE_NAME } from "@shared/const";
import { getGroupDashboardStatuses, getSystemJobByKey } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";

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
    // The project owner is provisioned as the sole admin by the authenticated account flow.
    // Keep this dashboard behind the role guard rather than duplicating a deployment-sensitive ID check.
    dashboard: adminProcedure.query(async () => {
      const [groups, retentionJob] = await Promise.all([
        getGroupDashboardStatuses(),
        getSystemJobByKey("groupmemory-retention"),
      ]);
      return { groups, retentionJob };
    }),
  }),
});

export type AppRouter = typeof appRouter;
