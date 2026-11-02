export function randomInteger(
  minimum: number,
  maximum: number,
  random = Math.random(),
): number {
  const min = Math.ceil(Math.min(minimum, maximum));
  const max = Math.floor(Math.max(minimum, maximum));
  const normalized = Math.min(Math.max(random, 0), 0.9999999999999999);
  return min + Math.floor(normalized * (max - min + 1));
}

interface ChannelCadence {
  count: number;
  target: number;
}

export class AmbientCadence {
  readonly #channels = new Map<string, ChannelCadence>();

  constructor(
    private readonly minimumMessages: number,
    private readonly maximumMessages: number,
    private readonly random: () => number = Math.random,
  ) {}

  recordHumanMessage(channelId: string): boolean {
    const current = this.#channels.get(channelId) ?? {
      count: 0,
      target: randomInteger(this.minimumMessages, this.maximumMessages, this.random()),
    };
    current.count += 1;

    if (current.count < current.target) {
      this.#channels.set(channelId, current);
      return false;
    }

    this.#channels.set(channelId, {
      count: 0,
      target: randomInteger(this.minimumMessages, this.maximumMessages, this.random()),
    });
    return true;
  }

  clear(channelId: string): void {
    this.#channels.delete(channelId);
  }
}
