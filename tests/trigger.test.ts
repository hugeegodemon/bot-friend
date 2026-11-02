import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideTrigger, type TriggerInput } from "../src/trigger.js";

const base: TriggerInput = {
  isMentioned: false,
  isReplyToBot: false,
  hasVideo: false,
  videoAnalysisEnabled: false,
  autoReplyEnabled: true,
  recentMessageCount: 5,
  minimumRecentMessages: 3,
  cooldownMs: 45_000,
  probability: 0.15,
  now: 100_000,
  random: 0.9,
};

describe("decideTrigger", () => {
  it("always replies to a mention", () => {
    assert.deepEqual(decideTrigger({ ...base, isMentioned: true }), {
      shouldReply: true,
      reason: "mention",
    });
  });

  it("replies to video only when video analysis is enabled", () => {
    assert.equal(decideTrigger({ ...base, hasVideo: true }).shouldReply, false);
    assert.deepEqual(
      decideTrigger({ ...base, hasVideo: true, videoAnalysisEnabled: true }),
      { shouldReply: true, reason: "video" },
    );
  });

  it("respects the ambient cooldown", () => {
    const decision = decideTrigger({
      ...base,
      random: 0,
      lastReplyAt: 80_000,
    });
    assert.equal(decision.shouldReply, false);
  });

  it("can participate in an active conversation", () => {
    assert.deepEqual(decideTrigger({ ...base, random: 0.1 }), {
      shouldReply: true,
      reason: "ambient",
    });
  });
});
