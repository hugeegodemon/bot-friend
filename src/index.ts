import {
  Client,
  Events,
  GatewayIntentBits,
  type Attachment,
  type Message,
} from "discord.js";
import { companionCommand, handleCompanionCommand } from "./commands.js";
import { config } from "./config.js";
import { generateReply } from "./deepseek.js";
import { ConversationMemory } from "./memory.js";
import { loadPersonaPrompt } from "./persona.js";
import { SettingsStore } from "./store.js";
import { sanitizeDiscordText, splitDiscordMessage } from "./text.js";
import { decideTrigger } from "./trigger.js";
import { VideoAnalyzer, type VideoAttachment } from "./video.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const memory = new ConversationMemory(config.memoryMessages, config.memoryTtlMs);
const personaPrompt = await loadPersonaPrompt(config.personaFile);
const store = new SettingsStore(config.databasePath, {
  autoReplyEnabled: config.autoReplyEnabled,
  autoReplyProbability: config.autoReplyProbability,
  autoReplyCooldownMs: config.autoReplyCooldownMs,
  requireChannelOptIn: config.requireChannelOptIn,
});
const videoAnalyzer = new VideoAnalyzer();
const lastReplyByChannel = new Map<string, number>();
const activeChannels = new Set<string>();

function channelIsAllowed(guildId: string, channelId: string): boolean {
  if (config.allowedChannelIds.size > 0 && !config.allowedChannelIds.has(channelId)) {
    return false;
  }
  return store.isChannelEnabled(guildId, channelId);
}

function getVideoAttachment(message: Message): VideoAttachment | undefined {
  const attachment = message.attachments.find((item: Attachment) =>
    item.contentType?.startsWith("video/"),
  );
  if (!attachment?.contentType) return undefined;

  return {
    url: attachment.url,
    name: attachment.name,
    contentType: attachment.contentType,
    size: attachment.size,
  };
}

async function handleMessage(message: Message): Promise<void> {
  if (!client.user || !message.inGuild() || message.author.bot || message.webhookId) return;
  if (!channelIsAllowed(message.guildId, message.channelId)) return;

  const guildSettings = store.getGuildSettings(message.guildId);

  const cleanContent = sanitizeDiscordText(message.content, client.user.id);
  const video = getVideoAttachment(message);
  const describedContent = [
    cleanContent,
    video ? `[附上一段影片：${video.name}]` : "",
  ].filter(Boolean).join(" ");

  if (!describedContent) return;

  memory.add(message.channelId, {
    role: "user",
    author: message.member?.displayName ?? message.author.displayName,
    content: describedContent,
    createdAt: message.createdTimestamp,
  });

  const now = Date.now();
  const recent = memory.get(message.channelId, now);
  const lastReplyAt = lastReplyByChannel.get(message.channelId);
  const decision = decideTrigger({
    isMentioned: message.mentions.has(client.user),
    isReplyToBot: message.mentions.repliedUser?.id === client.user.id,
    hasVideo: video !== undefined,
    videoAnalysisEnabled: videoAnalyzer.enabled,
    autoReplyEnabled: guildSettings.autoReplyEnabled,
    recentMessageCount: recent.filter((item) => item.role === "user").length,
    minimumRecentMessages: config.minMessagesBeforeAutoReply,
    ...(lastReplyAt === undefined ? {} : { lastReplyAt }),
    cooldownMs: guildSettings.autoReplyCooldownMs,
    probability: guildSettings.autoReplyProbability,
    now,
    random: Math.random(),
  });

  if (!decision.shouldReply || activeChannels.has(message.channelId)) return;

  activeChannels.add(message.channelId);
  lastReplyByChannel.set(message.channelId, now);

  try {
    await message.channel.sendTyping();

    let videoAnalysis: string | undefined;
    if (video && videoAnalyzer.enabled) {
      store.recordUsage(message.guildId, "video");
      videoAnalysis = await videoAnalyzer.analyze(video);
    }

    store.recordUsage(message.guildId, "text");
    const reply = await generateReply({
      personaPrompt,
      history: memory.get(message.channelId),
      reason: decision.reason,
      ...(videoAnalysis ? { videoAnalysis } : {}),
    });

    if (!reply) return;

    const chunks = splitDiscordMessage(reply, config.maxReplyChars);
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      if (!chunk) continue;
      if (index === 0) {
        await message.reply({ content: chunk, allowedMentions: { repliedUser: false } });
      } else {
        await message.channel.send(chunk);
      }
    }

    memory.add(message.channelId, {
      role: "assistant",
      author: client.user.displayName,
      content: reply,
      createdAt: Date.now(),
    });
  } catch (error) {
    store.recordUsage(message.guildId, "failure");
    console.error(`[message:${message.id}]`, error);
    if (decision.reason !== "ambient") {
      await message.reply({
        content: "我剛剛腦袋卡住了，等一下再叫我一次 😵‍💫",
        allowedMentions: { repliedUser: false },
      }).catch(() => undefined);
    }
  } finally {
    activeChannels.delete(message.channelId);
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Video analysis: ${videoAnalyzer.enabled ? "enabled" : "disabled"}`);
  console.log(`Persona: ${config.personaFile}`);
  if (config.registerCommands) {
    try {
      const commands = await readyClient.application.commands.fetch();
      const existing = commands.find((command) => command.name === companionCommand.name);
      if (existing) {
        await readyClient.application.commands.edit(existing.id, companionCommand.toJSON());
      } else {
        await readyClient.application.commands.create(companionCommand.toJSON());
      }
      console.log("Registered /companion command globally without replacing other commands");
    } catch (error) {
      console.error("Could not register application commands", error);
    }
  }
});

client.on(Events.MessageCreate, (message) => {
  void handleMessage(message);
});

client.on(Events.InteractionCreate, (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== companionCommand.name) {
    return;
  }
  void handleCompanionCommand(interaction, {
    store,
    memory,
    videoEnabled: videoAnalyzer.enabled,
    channelAllowed:
      interaction.guildId === null
        ? false
        : channelIsAllowed(interaction.guildId, interaction.channelId),
  }).catch(async (error) => {
    console.error(`[interaction:${interaction.id}]`, error);
    const response = {
      content: "設定操作失敗，請稍後再試。",
      ephemeral: true,
    } as const;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response).catch(() => undefined);
    } else {
      await interaction.reply(response).catch(() => undefined);
    }
  });
});

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}; shutting down.`);
  client.destroy();
  store.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await client.login(config.discordToken);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("disallowed intents")) {
    console.error(
      "Discord refused the configured gateway intents. Open Developer Portal → Bot → Privileged Gateway Intents, enable Message Content Intent, save, and restart the bot.",
    );
  } else {
    console.error("Discord login failed", error);
  }
  client.destroy();
  store.close();
  process.exitCode = 1;
}
