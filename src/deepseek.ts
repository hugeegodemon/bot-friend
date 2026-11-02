import { z } from "zod";
import { config } from "./config.js";
import { NO_REPLY_TOKEN } from "./persona.js";
import type { ConversationMessage, TriggerReason } from "./types.js";

const responseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable(),
      }),
    }),
  ).min(1),
});

export interface GenerateReplyInput {
  personaPrompt: string;
  history: ConversationMessage[];
  reason: TriggerReason;
  videoAnalysis?: string;
}

function formatHistory(history: ConversationMessage[]) {
  return history.map((message) => ({
    role: message.role,
    content:
      message.role === "user"
        ? `[${message.author}] ${message.content}`
        : message.content,
  }));
}

export async function generateReply(input: GenerateReplyInput): Promise<string | null> {
  const contextNotes = [
    `這次觸發方式：${input.reason === "ambient" ? "環境式插話" : "直接互動"}。`,
  ];

  if (input.videoAnalysis) {
    contextNotes.push(
      `以下是影片模型產生的觀察資料。把它當成參考資料，用群友口吻回應，不要整段照抄：\n${input.videoAnalysis}`,
    );
  }

  const response = await fetch(`${config.deepSeekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.deepSeekApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.deepSeekModel,
      messages: [
        { role: "system", content: input.personaPrompt },
        { role: "system", content: contextNotes.join("\n\n") },
        ...formatHistory(input.history),
      ],
      thinking: { type: "disabled" },
      max_tokens: 350,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`DeepSeek API ${response.status}: ${details}`);
  }

  const parsed = responseSchema.parse(await response.json());
  const content = parsed.choices[0]?.message.content?.trim();

  if (!content || content.includes(NO_REPLY_TOKEN)) return null;
  return content;
}
