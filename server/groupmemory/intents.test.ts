import { describe, expect, it } from "vitest";
import { classifyGroupMemoryIntent } from "./intents";

describe("GroupMemory intent classifier", () => {
  it("routes bot help, casual messages, and verifiable group statistics before retrieval", () => {
    expect(classifyGroupMemoryIntent("What's your all commands?")).toEqual({ kind: "botHelp" });
    expect(classifyGroupMemoryIntent("Smart ai")).toEqual({ kind: "casual" });
    expect(classifyGroupMemoryIntent("How many message I send?")).toEqual({ kind: "personalMessageCount" });
    expect(classifyGroupMemoryIntent("How many messages are retained in this group?")).toEqual({ kind: "groupMessageCount" });
    expect(classifyGroupMemoryIntent("How many chats happen today?")).toEqual({ kind: "unsupportedConversationCount" });
    expect(classifyGroupMemoryIntent("Who chats most in group?")).toEqual({ kind: "topContributor" });
  });
});
