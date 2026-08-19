import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTelegramLoginCode: vi.fn(),
  getTelegramLoginCodePollStatus: vi.fn(),
  consumeConfirmedTelegramLoginCode: vi.fn(),
  upsertTelegramDashboardUser: vi.fn(),
  linkTelegramIdentityToProjectOwner: vi.fn(),
  getTelegramBotUsername: vi.fn(),
  authenticateRequest: vi.fn(),
  createSessionToken: vi.fn(),
}));
vi.mock("./db", () => ({
  createTelegramLoginCode: mocks.createTelegramLoginCode,
  getTelegramLoginCodePollStatus: mocks.getTelegramLoginCodePollStatus,
  consumeConfirmedTelegramLoginCode: mocks.consumeConfirmedTelegramLoginCode,
  upsertTelegramDashboardUser: mocks.upsertTelegramDashboardUser,
  linkTelegramIdentityToProjectOwner: mocks.linkTelegramIdentityToProjectOwner,
}));
vi.mock("./groupmemory/telegram", () => ({ getTelegramBotUsername: mocks.getTelegramBotUsername }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest, createSessionToken: mocks.createSessionToken } }));

import { registerTelegramBotCodeLoginRoutes } from "./telegram-code-login";

describe("Telegram bot-code login routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerTelegramBotCodeLoginRoutes(app);
    server = await new Promise<Server>(resolve => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateRequest.mockRejectedValue(new Error("unauthenticated"));
    mocks.getTelegramBotUsername.mockResolvedValue("GroupMemory_Bot");
  });

  it("creates a short-lived bot code without returning the stored hashes", async () => {
    const response = await fetch(`${baseUrl}/api/auth/telegram/code/start`, { method: "POST" });
    const data = await response.json() as { code: string; pollToken: string; deepLink: string };

    expect(response.status).toBe(201);
    expect(data.code).toMatch(/^GM-[A-F0-9]{16}$/);
    expect(data.pollToken).toHaveLength(43);
    expect(data.deepLink).toBe(`https://t.me/GroupMemory_Bot?start=${data.code}`);
    expect(mocks.createTelegramLoginCode).toHaveBeenCalledWith(expect.objectContaining({
      codeHash: expect.not.stringMatching(data.code),
      pollTokenHash: expect.not.stringMatching(data.pollToken),
    }));
  });

  it.each([
    ["pending", 202, undefined],
    ["expired", 410, "expired"],
    ["consumed", 409, "already been used"],
    ["invalid", 404, "invalid"],
  ] as const)("returns %s without trying to create a session", async (status, expectedHttp, expectedMessage) => {
    mocks.getTelegramLoginCodePollStatus.mockResolvedValue(status);
    const response = await fetch(`${baseUrl}/api/auth/telegram/code/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pollToken: "a".repeat(43) }),
    });
    const data = await response.json() as { status: string; error?: string };

    expect(response.status).toBe(expectedHttp);
    expect(data.status).toBe(status);
    if (expectedMessage) expect(data.error).toContain(expectedMessage);
    expect(mocks.consumeConfirmedTelegramLoginCode).not.toHaveBeenCalled();
  });

  it("issues a session only after a confirmed code is atomically consumed", async () => {
    mocks.getTelegramLoginCodePollStatus.mockResolvedValue("confirmed");
    mocks.consumeConfirmedTelegramLoginCode.mockResolvedValue({ telegramId: 9001, telegramName: "Maya Singh", telegramUsername: "maya", ownerOpenId: null });
    mocks.upsertTelegramDashboardUser.mockResolvedValue({ openId: "telegram:9001", name: "Maya Singh", isProjectOwner: false });
    mocks.createSessionToken.mockResolvedValue("signed-session");

    const response = await fetch(`${baseUrl}/api/auth/telegram/code/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pollToken: "a".repeat(43) }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "linked", isProjectOwner: false });
    expect(response.headers.get("set-cookie")).toContain("app_session_id=signed-session");
  });
});
