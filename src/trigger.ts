import type { TriggerDecision } from "./types.js";

export interface TriggerInput {
  isMentioned: boolean;
  hasWakeWord: boolean;
  isReplyToBot: boolean;
  isFollowUp: boolean;
  hasVideo: boolean;
  videoAnalysisEnabled: boolean;
  autoReplyEnabled: boolean;
  ambientCheckDue: boolean;
  lastReplyAt?: number;
  cooldownMs: number;
  probability: number;
  now: number;
  random: number;
}

export function decideTrigger(input: TriggerInput): TriggerDecision {
  if (input.isMentioned) return { shouldReply: true, reason: "mention" };
  if (input.hasWakeWord) return { shouldReply: true, reason: "wake_word" };
  if (input.isReplyToBot) return { shouldReply: true, reason: "reply" };
  if (input.isFollowUp) return { shouldReply: true, reason: "follow_up" };
  if (input.hasVideo && input.videoAnalysisEnabled) {
    return { shouldReply: true, reason: "video" };
  }

  if (!input.autoReplyEnabled) return { shouldReply: false, reason: "none" };
  if (!input.ambientCheckDue) return { shouldReply: false, reason: "none" };
  if (
    input.lastReplyAt !== undefined &&
    input.now - input.lastReplyAt < input.cooldownMs
  ) {
    return { shouldReply: false, reason: "none" };
  }
  if (input.random >= input.probability) {
    return { shouldReply: false, reason: "none" };
  }

  return { shouldReply: true, reason: "ambient" };
}
