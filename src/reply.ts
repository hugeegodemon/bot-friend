import { randomInteger } from "./cadence.js";
import { NO_REPLY_TOKEN } from "./persona.js";

export const MAX_REPLY_BUBBLES = 3;
export const MIN_BUBBLE_DELAY_MS = 600;
export const MAX_BUBBLE_DELAY_MS = 1_400;
export const MAX_LEARNED_MEMORIES_PER_TURN = 2;
export const MAX_MEMORY_LENGTH = 160;

export interface GeneratedReply {
  messages: string[];
  memories: string[];
}

function normalizeMessages(value: unknown, maximumMessages: number): string[] | null {
  if (!Array.isArray(value)) return null;

  const messages = value
    .filter((item): item is string => typeof item === "string")
    .flatMap((item) => item.split(/\n\s*\n/))
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !item.includes(NO_REPLY_TOKEN))
    .slice(0, maximumMessages);

  return messages.length > 0 ? messages : [];
}

function normalizeMemories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().replace(/\s+/g, " "))
      .filter((item) => item.length > 0 && item.length <= MAX_MEMORY_LENGTH),
  )].slice(0, MAX_LEARNED_MEMORIES_PER_TURN);
}

export function parseGeneratedReply(
  content: string | null | undefined,
  maximumMessages = MAX_REPLY_BUBBLES,
): GeneratedReply | null {
  const trimmed = content?.trim();
  if (!trimmed || trimmed.includes(NO_REPLY_TOKEN)) return null;

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const objectStart = withoutFence.indexOf("{");
  const objectEnd = withoutFence.lastIndexOf("}");

  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      const parsed = JSON.parse(withoutFence.slice(objectStart, objectEnd + 1)) as {
        messages?: unknown;
        memories?: unknown;
      };
      const messages = normalizeMessages(parsed.messages, maximumMessages);
      if (messages !== null) {
        return messages.length > 0
          ? { messages, memories: normalizeMemories(parsed.memories) }
          : null;
      }
    } catch {
      // Keep one plain-text bubble if the model did not produce valid JSON.
    }
  }

  return { messages: [withoutFence], memories: [] };
}

export function parseGeneratedMessages(
  content: string | null | undefined,
  maximumMessages = MAX_REPLY_BUBBLES,
): string[] | null {
  return parseGeneratedReply(content, maximumMessages)?.messages ?? null;
}

export function replyBubbleDelay(random = Math.random()): number {
  return randomInteger(MIN_BUBBLE_DELAY_MS, MAX_BUBBLE_DELAY_MS, random);
}
