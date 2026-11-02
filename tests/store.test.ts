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
});
