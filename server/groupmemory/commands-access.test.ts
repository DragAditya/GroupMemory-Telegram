import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  recordVerifiedUserGroupAccess: vi.fn().mockResolvedValue(undefined),
  setGroupMemoryEnabled: vi.fn(),
  setGroupRetentionDays: vi.fn(),
}));
vi.mock("./telegram", () => ({
  isTelegramGroupAdmin: vi.fn(),
  sendTelegramHtmlMessage: vi.fn().mockResolvedValue(undefined),
}));

import { recordVerifiedUserGroupAccess } from "../db";
import { handleControlCommand } from "./commands";
import { isTelegramGroupAdmin } from "./telegram";

const group = { id: 22, memoryEnabled: true, retentionDays: 30 };
const message = {
  message_id: 81,
  date: 1,
  chat: { id: -100123, type: "supergroup" as const, title: "Engineering" },
  from: { id: 904, first_name: "Maya", last_name: "Singh", username: "maya" },
  text: "/status",
};

describe("dashboard group access from Telegram commands", () => {
  it("records access after Telegram confirms the admin command sender", async () => {
    vi.mocked(isTelegramGroupAdmin).mockResolvedValueOnce(true);

    await expect(handleControlCommand(message, { ...group })).resolves.toBe(true);

    expect(recordVerifiedUserGroupAccess).toHaveBeenCalledWith(
      { telegramId: 904, name: "Maya Singh", username: "maya" },
      22,
    );
  });

  it("does not grant dashboard access to a non-administrator", async () => {
    vi.mocked(isTelegramGroupAdmin).mockResolvedValueOnce(false);

    await expect(handleControlCommand(message, { ...group })).resolves.toBe(true);

    expect(recordVerifiedUserGroupAccess).toHaveBeenCalledTimes(1);
  });
});
