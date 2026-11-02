import "dotenv/config";
import { z } from "zod";

const booleanText = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DEEPSEEK_API_KEY: z.string().min(1, "DEEPSEEK_API_KEY is required"),
  DEEPSEEK_BASE_URL: z.url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().min(1).default("deepseek-flash"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.8-flash"),
  PERSONA_FILE: z.string().min(1).default("personas/jiibao.md"),
  ALLOWED_CHANNEL_IDS: z.string().default(""),
  DATABASE_PATH: z.string().min(1).default("data/bot.sqlite"),
  REGISTER_COMMANDS: booleanText,
  REQUIRE_CHANNEL_OPT_IN: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  BOT_WAKE_WORDS: z.string().default("吉伊堡"),
  AUTO_REPLY_ENABLED: booleanText,
  AUTO_REPLY_PROBABILITY: z.coerce.number().min(0).max(1).default(1),
  AUTO_REPLY_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(15),
  MIN_MESSAGES_BEFORE_AUTO_REPLY: z.coerce.number().int().min(1).default(6),
  MAX_MESSAGES_BEFORE_AUTO_REPLY: z.coerce.number().int().min(1).default(12),
  MESSAGE_BATCH_WINDOW_MS: z.coerce.number().int().min(0).max(30_000).default(2_500),
  FOLLOW_UP_WINDOW_SECONDS: z.coerce.number().int().min(0).max(3_600).default(120),
  AMBIENT_REPLY_DELAY_MIN_MS: z.coerce.number().int().min(0).max(60_000).default(4_000),
  AMBIENT_REPLY_DELAY_MAX_MS: z.coerce.number().int().min(0).max(120_000).default(12_000),
  MEMORY_MESSAGES: z.coerce.number().int().min(2).max(100).default(24),
  MEMORY_TTL_MINUTES: z.coerce.number().int().min(1).default(30),
  MAX_VIDEO_MB: z.coerce.number().positive().max(100).default(25),
  VIDEO_PROCESSING_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(900).default(180),
  MAX_REPLY_CHARS: z.coerce.number().int().min(200).max(1950).default(1900),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const env = parsed.data;

export const config = {
  discordToken: env.DISCORD_TOKEN,
  deepSeekApiKey: env.DEEPSEEK_API_KEY,
  deepSeekBaseUrl: env.DEEPSEEK_BASE_URL.replace(/\/$/, ""),
  deepSeekModel: env.DEEPSEEK_MODEL,
  geminiApiKey: env.GEMINI_API_KEY?.trim() || undefined,
  geminiModel: env.GEMINI_MODEL,
  personaFile: env.PERSONA_FILE,
  databasePath: env.DATABASE_PATH,
  registerCommands: env.REGISTER_COMMANDS,
  requireChannelOptIn: env.REQUIRE_CHANNEL_OPT_IN,
  wakeWords: env.BOT_WAKE_WORDS.split(",")
    .map((word) => word.trim())
    .filter(Boolean),
  allowedChannelIds: new Set(
    env.ALLOWED_CHANNEL_IDS.split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  ),
  autoReplyEnabled: env.AUTO_REPLY_ENABLED,
  autoReplyProbability: env.AUTO_REPLY_PROBABILITY,
  autoReplyCooldownMs: env.AUTO_REPLY_COOLDOWN_SECONDS * 1_000,
  minMessagesBeforeAutoReply: env.MIN_MESSAGES_BEFORE_AUTO_REPLY,
  maxMessagesBeforeAutoReply: Math.max(
    env.MAX_MESSAGES_BEFORE_AUTO_REPLY,
    env.MIN_MESSAGES_BEFORE_AUTO_REPLY,
  ),
  messageBatchWindowMs: env.MESSAGE_BATCH_WINDOW_MS,
  followUpWindowMs: env.FOLLOW_UP_WINDOW_SECONDS * 1_000,
  ambientReplyDelayMinMs: env.AMBIENT_REPLY_DELAY_MIN_MS,
  ambientReplyDelayMaxMs: Math.max(
    env.AMBIENT_REPLY_DELAY_MAX_MS,
    env.AMBIENT_REPLY_DELAY_MIN_MS,
  ),
  memoryMessages: env.MEMORY_MESSAGES,
  memoryTtlMs: env.MEMORY_TTL_MINUTES * 60_000,
  maxVideoBytes: env.MAX_VIDEO_MB * 1024 * 1024,
  videoProcessingTimeoutMs: env.VIDEO_PROCESSING_TIMEOUT_SECONDS * 1_000,
  maxReplyChars: env.MAX_REPLY_CHARS,
} as const;
