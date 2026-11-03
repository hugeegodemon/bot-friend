import { z } from "zod";
import { config } from "./config.js";
import { NO_REPLY_TOKEN } from "./persona.js";
import { parseGeneratedReply, type GeneratedReply } from "./reply.js";
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
  participantName: string;
  participantMemories: string[];
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

export async function generateReply(input: GenerateReplyInput): Promise<GeneratedReply | null> {
  const triggerDescription = input.reason === "ambient"
    ? "群聊中的自然插話候選；只有真的接得上話題才回答，不適合就只輸出 <NO_REPLY>"
    : input.reason === "follow_up"
      ? "同一位群友正在延續剛才和你的對話，請自然接著回答"
      : "有人直接叫你、回覆你或傳內容給你，請回答";
  const contextNotes = [
    `這次觸發方式：${triggerDescription}。`,
    `請只輸出 JSON：{"messages":["第一則訊息","第二則訊息"],"memories":[]}。不要輸出 Markdown code fence 或其他欄位。
- messages 必須是 0 到 3 則真正會分開送出的 Discord 訊息。
- 簡單招呼、確認、單一反應：1 則。
- 玩笑、示愛或有「先反應、再補一句」兩個節奏：通常 1 到 2 則。
- 只有認真解釋或確實有多個重點時才能到 3 則。
- 日常閒聊全部加起來通常不超過 60 個中文字；知識解釋才可以較長。
- 每則必須能獨立成立，不要把同一句話硬切開，也不要為了湊數重複意思。
- 回應必須直接接住最新訊息；除非上下文真的相關，不要突然叫人吃飯、睡覺或加油。
- memories 只能記錄這次回覆對象「${input.participantName}」在最新訊息中親口說出的低敏感度、長期穩定事實，例如偏好的稱呼、興趣、喜歡或討厭的遊戲與食物、持續中的專案。
- 不保存問候、玩笑、示愛、當下情緒、短期行程、推測、其他人的資訊、密鑰、聯絡方式、精確位置、醫療、財務、政治、宗教、性與其他敏感資料。沒有明確值得長期記住的事就輸出空陣列。每次最多 2 條，每條必須是不依賴上下文也看得懂的簡短事實。
- 不適合插話時輸出 {"messages":[],"memories":[]}。`,
  ];

  if (input.participantMemories.length > 0) {
    contextNotes.push(
      `以下是已保存、可能過時的「${input.participantName}」個人記憶。只在與當前話題直接相關時自然使用，不要逐條複述，也不要說自己查了資料庫：\n${input.participantMemories.map((item) => `- ${item}`).join("\n")}`,
    );
  }

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
      max_tokens: 320,
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
  return parseGeneratedReply(content, input.reason === "ambient" ? 1 : 3);
}
