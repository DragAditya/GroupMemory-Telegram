import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./_core/oauth";
import { registerStorageProxy } from "./_core/storageProxy";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { processTelegramUpdate, verifyTelegramWebhook } from "./groupmemory/webhook";
import { handleRetentionCleanup } from "./groupmemory/retention";
import { registerTelegramOidcRoutes } from "./telegram-oidc";

export function createGroupMemoryApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerTelegramOidcRoutes(app);
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
