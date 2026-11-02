import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { ConversationMemory } from "./memory.js";
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
