import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { ConversationMemory } from "./memory.js";
import { redactSecrets } from "./secrets.js";
import type { SettingsStore } from "./store.js";

export const companionCommand = new SlashCommandBuilder()
  .setName("companion")
  .setDescription("設定與管理 AI 群友")
  .addSubcommand((command) =>
    command.setName("status").setDescription("查看這個伺服器的 Bot 設定與今日用量"),
  )
  .addSubcommand((command) =>
    command
      .setName("channel")
      .setDescription("啟用或停用目前頻道")
      .addBooleanOption((option) =>
        option.setName("enabled").setDescription("是否在目前頻道運作").setRequired(true),
      ),
  )
  .addSubcommand((command) =>
    command
      .setName("autopilot")
      .setDescription("調整自然插話設定")
      .addBooleanOption((option) =>
        option.setName("enabled").setDescription("是否允許自然插話"),
      )
      .addNumberOption((option) =>
        option
          .setName("probability")
          .setDescription("候選插話機率，0 到 100%")
          .setMinValue(0)
          .setMaxValue(100),
      )
      .addIntegerOption((option) =>
        option
          .setName("cooldown")
          .setDescription("自然插話冷卻秒數")
          .setMinValue(0)
          .setMaxValue(3600),
      ),
  )
  .addSubcommand((command) =>
    command.setName("memories").setDescription("查看吉伊堡記得的你的個人資訊"),
  )
  .addSubcommand((command) =>
    command
      .setName("remember")
      .setDescription("明確要求吉伊堡記住一件關於你的事")
      .addStringOption((option) =>
        option
          .setName("content")
          .setDescription("要記住的內容，例如：我喜歡玩輔助")
          .setMinLength(1)
          .setMaxLength(160)
          .setRequired(true),
      ),
  )
  .addSubcommand((command) =>
    command
      .setName("forget-me")
      .setDescription("清除吉伊堡在這個伺服器記得的你的個人資訊")
      .addBooleanOption((option) =>
        option.setName("confirm").setDescription("確認清除").setRequired(true),
      ),
  )
  .addSubcommand((command) =>
    command.setName("forget").setDescription("清除目前頻道的短期對話記憶"),
  )
  .addSubcommand((command) =>
    command
      .setName("delete-data")
      .setDescription("刪除這個伺服器保存在 Bot 的所有設定與用量資料")
      .addBooleanOption((option) =>
        option.setName("confirm").setDescription("確認永久刪除").setRequired(true),
      ),
  );

interface CommandDependencies {
  store: SettingsStore;
  memory: ConversationMemory;
  videoEnabled: boolean;
  channelAllowed: boolean;
}

function canManageGuild(interaction: ChatInputCommandInteraction): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true;
}

async function deny(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({
    content: "這個操作需要「管理伺服器」權限。",
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleCompanionCommand(
  interaction: ChatInputCommandInteraction,
  dependencies: CommandDependencies,
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: "這個指令只能在 Discord 伺服器內使用。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const { store, memory } = dependencies;

  if (subcommand === "status") {
    const settings = store.getGuildSettings(interaction.guildId);
    const usage = store.getDailyUsage(interaction.guildId);
    await interaction.reply({
      content: [
        `目前頻道：${dependencies.channelAllowed ? "已啟用 ✅" : "已停用或被全域白名單阻擋 ⛔"}`,
        `自然插話：${settings.autoReplyEnabled ? "開啟" : "關閉"}`,
        `候選機率：${Math.round(settings.autoReplyProbability * 100)}%`,
        `冷卻：${Math.round(settings.autoReplyCooldownMs / 1_000)} 秒`,
        `影片理解：${dependencies.videoEnabled ? "已設定" : "未設定"}`,
        `今日用量：文字 ${usage.textRequests}、影片 ${usage.videoRequests}、失敗 ${usage.failures}`,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "memories") {
    const memories = store.getUserMemories(interaction.guildId, interaction.user.id, 10);
    await interaction.reply({
      content: memories.length === 0
        ? "吉伊堡目前沒有保存關於你的個人記憶。"
        : [
            `吉伊堡最近記得的 ${memories.length} 件事：`,
            ...memories.map((item) => `- ${item.content}`),
            "你可以用 `/companion forget-me` 全部清除。",
          ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "remember") {
    const content = interaction.options.getString("content", true).trim();
    const redacted = redactSecrets(content);
    if (redacted.detected.length > 0) {
      await interaction.reply({
        content: "這段內容看起來包含密鑰或 Token，沒有保存。請不要把憑證交給吉伊堡記住。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const added = store.addUserMemories(interaction.guildId, interaction.user.id, [content]);
    await interaction.reply({
      content: added > 0 ? `記住了：${content}` : "這件事已經記得了。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "forget-me") {
    if (!interaction.options.getBoolean("confirm", true)) {
      await interaction.reply({
        content: "未確認清除，個人記憶沒有變更。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const removed = store.deleteUserMemories(interaction.guildId, interaction.user.id);
    await interaction.reply({
      content: removed > 0
        ? `已清除吉伊堡在這個伺服器保存的 ${removed} 條你的個人記憶。`
        : "吉伊堡目前沒有保存關於你的個人記憶。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!canManageGuild(interaction)) {
    await deny(interaction);
    return;
  }

  if (subcommand === "channel") {
    const enabled = interaction.options.getBoolean("enabled", true);
    store.setChannelEnabled(interaction.guildId, interaction.channelId, enabled);
    if (!enabled) memory.clear(interaction.channelId);
    await interaction.reply({
      content: `這個頻道已${enabled ? "啟用" : "停用"} AI 群友。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "autopilot") {
    const enabled = interaction.options.getBoolean("enabled");
    const probability = interaction.options.getNumber("probability");
    const cooldownSeconds = interaction.options.getInteger("cooldown");
    if (enabled === null && probability === null && cooldownSeconds === null) {
      await interaction.reply({
        content: "請至少提供一個要修改的設定。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const settings = store.updateGuildSettings(interaction.guildId, {
      ...(enabled === null ? {} : { autoReplyEnabled: enabled }),
      ...(probability === null ? {} : { autoReplyProbability: probability / 100 }),
      ...(cooldownSeconds === null ? {} : { autoReplyCooldownMs: cooldownSeconds * 1_000 }),
    });
    await interaction.reply({
      content: `自然插話已更新：${settings.autoReplyEnabled ? "開啟" : "關閉"}、${Math.round(settings.autoReplyProbability * 100)}%、冷卻 ${Math.round(settings.autoReplyCooldownMs / 1_000)} 秒。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "forget") {
    memory.clear(interaction.channelId);
    await interaction.reply({
      content: "已清除目前頻道的短期對話記憶。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "delete-data") {
    if (!interaction.options.getBoolean("confirm", true)) {
      await interaction.reply({
        content: "未確認刪除，沒有變更任何資料。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    store.deleteGuildData(interaction.guildId);
    memory.clearMany(interaction.guild.channels.cache.keys());
    await interaction.reply({
      content: "已刪除這個伺服器的設定、用量統計與目前行程中的短期記憶。",
      flags: MessageFlags.Ephemeral,
    });
  }
}
