import type { Request, Response } from "express";
import { deleteExpiredGroupMessages, getSystemJobByTaskUid, recordSystemJobRun } from "../db";
import { sdk } from "../_core/sdk";

export async function handleRetentionCleanup(req: Request, res: Response) {
  try {
    const caller = await sdk.authenticateRequest(req);
    if (!caller.isCron || !caller.taskUid) return res.status(403).json({ error: "cron-only" });
    const job = await getSystemJobByTaskUid(caller.taskUid);
    if (!job) return res.json({ ok: true, skipped: "orphaned-or-unconfigured-job" });

    const deletedCount = await deleteExpiredGroupMessages();
    await recordSystemJobRun(job.id, deletedCount);
    return res.json({ ok: true, deletedCount, completedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown retention cleanup error";
    console.error("[GroupMemory] Retention cleanup failed", error);
    return res.status(500).json({
      error: message,
      context: { path: "/api/scheduled/groupmemory-retention" },
      timestamp: new Date().toISOString(),
    });
  }
}
