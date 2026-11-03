import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SettingsStore } from "../src/store.js";

function createStore(requireChannelOptIn = false): SettingsStore {
  return new SettingsStore(":memory:", {
    autoReplyEnabled: true,
    autoReplyProbability: 0.15,
    autoReplyCooldownMs: 45_000,
    requireChannelOptIn,
  });
}

describe("SettingsStore", () => {
  it("returns defaults and persists guild overrides", () => {
    const store = createStore();
    try {
      assert.deepEqual(store.getGuildSettings("guild"), {
        autoReplyEnabled: true,
        autoReplyProbability: 0.15,
        autoReplyCooldownMs: 45_000,
      });
      const updated = store.updateGuildSettings("guild", {
        autoReplyEnabled: false,
        autoReplyProbability: 0.4,
      });
      assert.equal(updated.autoReplyEnabled, false);
      assert.equal(store.getGuildSettings("guild").autoReplyProbability, 0.4);
    } finally {
      store.close();
    }
  });

  it("supports channel opt-in and explicit overrides", () => {
    const store = createStore(true);
    try {
      assert.equal(store.isChannelEnabled("guild", "channel"), false);
      store.setChannelEnabled("guild", "channel", true);
      assert.equal(store.isChannelEnabled("guild", "channel"), true);
      store.setChannelEnabled("guild", "channel", false);
      assert.equal(store.isChannelEnabled("guild", "channel"), false);
    } finally {
      store.close();
    }
  });

  it("records and deletes daily usage", () => {
    const store = createStore();
    try {
      const date = new Date("2026-11-02T00:00:00Z");
      store.recordUsage("guild", "text", date);
      store.recordUsage("guild", "text", date);
      store.recordUsage("guild", "video", date);
      assert.deepEqual(store.getDailyUsage("guild", date), {
        textRequests: 2,
        videoRequests: 1,
        failures: 0,
      });
      store.deleteGuildData("guild");
      assert.deepEqual(store.getDailyUsage("guild", date), {
        textRequests: 0,
        videoRequests: 0,
        failures: 0,
      });
    } finally {
      store.close();
    }
  });

  it("stores personal memories per guild and user without duplicates", () => {
    const store = createStore();
    try {
      assert.equal(store.addUserMemories("guild-a", "user-a", ["喜歡玩輔助"]), 1);
      assert.equal(store.addUserMemories("guild-a", "user-a", ["喜歡玩輔助"]), 0);
      store.addUserMemories("guild-a", "user-b", ["喜歡玩中路"]);
      store.addUserMemories("guild-b", "user-a", ["喜歡玩上路"]);

      assert.deepEqual(
        store.getUserMemories("guild-a", "user-a").map((item) => item.content),
        ["喜歡玩輔助"],
      );
      assert.equal(store.deleteUserMemories("guild-a", "user-a"), 1);
      assert.deepEqual(store.getUserMemories("guild-a", "user-a"), []);
      assert.equal(store.getUserMemories("guild-a", "user-b").length, 1);
      assert.equal(store.getUserMemories("guild-b", "user-a").length, 1);
    } finally {
      store.close();
    }
  });

  it("caps each user's memory collection and deletes it with guild data", () => {
    const store = createStore();
    try {
      const memories = Array.from({ length: 25 }, (_, index) => `記憶 ${index}`);
      store.addUserMemories("guild", "user", memories);
      assert.equal(store.getUserMemories("guild", "user", 20).length, 20);
      store.deleteGuildData("guild");
      assert.deepEqual(store.getUserMemories("guild", "user"), []);
    } finally {
      store.close();
    }
  });
});
