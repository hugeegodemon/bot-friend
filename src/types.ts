export type ConversationRole = "user" | "assistant";

export interface ConversationMessage {
  role: ConversationRole;
  author: string;
  content: string;
  createdAt: number;
}

export type TriggerReason =
  | "mention"
  | "wake_word"
  | "reply"
  | "follow_up"
  | "video"
  | "ambient"
  | "none";

export interface TriggerDecision {
  shouldReply: boolean;
  reason: TriggerReason;
}
