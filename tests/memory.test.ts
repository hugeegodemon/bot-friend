import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConversationMemory } from "../src/memory.js";

describe("ConversationMemory", () => {
  it("keeps only the configured number of messages", () => {
    const memory = new ConversationMemory(2, 60_000);
    for (let index = 0; index < 3; index += 1) {
      memory.add("channel", {
        role: "user",
        author: "member",
        content: String(index),
        createdAt: index + 1,
      });
    }
    assert.deepEqual(memory.get("channel", 3).map((item) => item.content), ["1", "2"]);
  });

  it("expires stale messages", () => {
    const memory = new ConversationMemory(10, 100);
    memory.add("channel", {
      role: "user",
      author: "member",
      content: "old",
      createdAt: 1,
    });
    assert.deepEqual(memory.get("channel", 200), []);
  });
});
