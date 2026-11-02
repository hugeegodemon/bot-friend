import type { ConversationMessage } from "./types.js";

export class ConversationMemory {
  readonly #channels = new Map<string, ConversationMessage[]>();

  constructor(
    private readonly maxMessages: number,
    private readonly ttlMs: number,
  ) {}

  add(channelId: string, message: ConversationMessage): void {
    const now = message.createdAt;
    const current = this.get(channelId, now);
    current.push(message);
    this.#channels.set(channelId, current.slice(-this.maxMessages));
  }

  get(channelId: string, now = Date.now()): ConversationMessage[] {
    const cutoff = now - this.ttlMs;
    const current = this.#channels.get(channelId) ?? [];
    const fresh = current.filter((message) => message.createdAt >= cutoff);

    if (fresh.length === 0) {
      this.#channels.delete(channelId);
    } else if (fresh.length !== current.length) {
      this.#channels.set(channelId, fresh);
    }

    return [...fresh];
  }

  clear(channelId: string): void {
    this.#channels.delete(channelId);
  }

  clearMany(channelIds: Iterable<string>): void {
    for (const channelId of channelIds) this.clear(channelId);
  }
}
