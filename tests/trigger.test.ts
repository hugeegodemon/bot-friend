import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideTrigger, type TriggerInput } from "../src/trigger.js";

const base: TriggerInput = {
  isMentioned: false,
  hasWakeWord: false,
  isReplyToBot: false,
  isFollowUp: false,
  hasVideo: false,
  videoAnalysisEnabled: false,
  autoReplyEnabled: true,
  ambientCheckDue: true,
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

  it("always replies when called by name without a Discord mention", () => {
    assert.deepEqual(decideTrigger({ ...base, hasWakeWord: true }), {
      shouldReply: true,
      reason: "wake_word",
    });
  });

  it("replies to video only when video analysis is enabled", () => {
    assert.equal(decideTrigger({ ...base, hasVideo: true }).shouldReply, false);
    assert.deepEqual(
      decideTrigger({ ...base, hasVideo: true, videoAnalysisEnabled: true }),
      { shouldReply: true, reason: "video" },
    );
  });

  it("keeps talking to the same person during a follow-up window", () => {
    assert.deepEqual(decideTrigger({ ...base, isFollowUp: true }), {
      shouldReply: true,
      reason: "follow_up",
    });
  });

  it("does not evaluate ambient chat before its message target", () => {
    assert.equal(decideTrigger({ ...base, ambientCheckDue: false, random: 0 }).shouldReply, false);
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
