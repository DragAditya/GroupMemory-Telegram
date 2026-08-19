import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { deleteExpiredGroupMessages, getSystemJobByKey, getSystemJobByTaskUid, recordSystemJobRun } from "../db";
import { sdk } from "../_core/sdk";

export function isAuthorizedExternalCron(authorization: string | undefined) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function handleRetentionCleanup(req: Request, res: Response) {
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
    return res.json({ ok: true, deletedCount, completedAt: new Date().toISOString(), scheduler: externalCron ? "external" : "managed" });
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
