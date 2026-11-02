import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface GuildSettings {
  autoReplyEnabled: boolean;
  autoReplyProbability: number;
  autoReplyCooldownMs: number;
}

export interface DailyUsage {
  textRequests: number;
  videoRequests: number;
  failures: number;
}

type UsageKind = "text" | "video" | "failure";

interface StoreDefaults extends GuildSettings {
  requireChannelOptIn: boolean;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

export class SettingsStore {
  readonly #database: DatabaseSync;

  constructor(
    path: string,
    private readonly defaults: StoreDefaults,
  ) {
    const databasePath = path === ":memory:" ? path : resolve(path);
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });

    this.#database = new DatabaseSync(databasePath, { timeout: 5_000 });
    this.#database.exec("PRAGMA foreign_keys = ON");
    if (databasePath !== ":memory:") this.#database.exec("PRAGMA journal_mode = WAL");
    this.#migrate();
  }

  #migrate(): void {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        auto_reply_enabled INTEGER NOT NULL,
        auto_reply_probability REAL NOT NULL,
        auto_reply_cooldown_ms INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS channel_settings (
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, channel_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS daily_usage (
        usage_date TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        text_requests INTEGER NOT NULL DEFAULT 0,
        video_requests INTEGER NOT NULL DEFAULT 0,
        failures INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (usage_date, guild_id)
      ) STRICT;
    `);
  }

  getGuildSettings(guildId: string): GuildSettings {
    const row = this.#database
      .prepare(`
        SELECT auto_reply_enabled, auto_reply_probability, auto_reply_cooldown_ms
        FROM guild_settings
        WHERE guild_id = ?
      `)
      .get(guildId);

    if (!row) {
      return {
        autoReplyEnabled: this.defaults.autoReplyEnabled,
        autoReplyProbability: this.defaults.autoReplyProbability,
        autoReplyCooldownMs: this.defaults.autoReplyCooldownMs,
      };
    }

    return {
      autoReplyEnabled: row.auto_reply_enabled === 1,
      autoReplyProbability: asNumber(
        row.auto_reply_probability,
        this.defaults.autoReplyProbability,
      ),
      autoReplyCooldownMs: asNumber(
        row.auto_reply_cooldown_ms,
        this.defaults.autoReplyCooldownMs,
      ),
    };
  }

  updateGuildSettings(guildId: string, patch: Partial<GuildSettings>): GuildSettings {
    const current = this.getGuildSettings(guildId);
    const next = { ...current, ...patch };
    if (next.autoReplyProbability < 0 || next.autoReplyProbability > 1) {
      throw new RangeError("autoReplyProbability must be between 0 and 1");
    }
    if (next.autoReplyCooldownMs < 0) {
      throw new RangeError("autoReplyCooldownMs cannot be negative");
    }

    this.#database
      .prepare(`
        INSERT INTO guild_settings (
          guild_id, auto_reply_enabled, auto_reply_probability,
          auto_reply_cooldown_ms, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          auto_reply_enabled = excluded.auto_reply_enabled,
          auto_reply_probability = excluded.auto_reply_probability,
          auto_reply_cooldown_ms = excluded.auto_reply_cooldown_ms,
          updated_at = excluded.updated_at
      `)
      .run(
        guildId,
        next.autoReplyEnabled ? 1 : 0,
        next.autoReplyProbability,
        next.autoReplyCooldownMs,
        Date.now(),
      );
    return next;
  }

  isChannelEnabled(guildId: string, channelId: string): boolean {
    const row = this.#database
      .prepare("SELECT enabled FROM channel_settings WHERE guild_id = ? AND channel_id = ?")
      .get(guildId, channelId);
    if (!row) return !this.defaults.requireChannelOptIn;
    return row.enabled === 1;
  }

  setChannelEnabled(guildId: string, channelId: string, enabled: boolean): void {
    this.#database
      .prepare(`
        INSERT INTO channel_settings (guild_id, channel_id, enabled, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(guild_id, channel_id) DO UPDATE SET
          enabled = excluded.enabled,
          updated_at = excluded.updated_at
      `)
      .run(guildId, channelId, enabled ? 1 : 0, Date.now());
  }

  recordUsage(guildId: string, kind: UsageKind, now = new Date()): void {
    const column = {
      text: "text_requests",
      video: "video_requests",
      failure: "failures",
    }[kind];
    const usageDate = now.toISOString().slice(0, 10);
    this.#database
      .prepare(`
        INSERT INTO daily_usage (usage_date, guild_id, ${column})
        VALUES (?, ?, 1)
        ON CONFLICT(usage_date, guild_id) DO UPDATE SET
          ${column} = ${column} + 1
      `)
      .run(usageDate, guildId);
  }

  getDailyUsage(guildId: string, now = new Date()): DailyUsage {
    const usageDate = now.toISOString().slice(0, 10);
    const row = this.#database
      .prepare(`
        SELECT text_requests, video_requests, failures
        FROM daily_usage WHERE usage_date = ? AND guild_id = ?
      `)
      .get(usageDate, guildId);
    return {
      textRequests: asNumber(row?.text_requests, 0),
      videoRequests: asNumber(row?.video_requests, 0),
      failures: asNumber(row?.failures, 0),
    };
  }

  deleteGuildData(guildId: string): void {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database.prepare("DELETE FROM channel_settings WHERE guild_id = ?").run(guildId);
      this.#database.prepare("DELETE FROM guild_settings WHERE guild_id = ?").run(guildId);
      this.#database.prepare("DELETE FROM daily_usage WHERE guild_id = ?").run(guildId);
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.#database.close();
  }
}
