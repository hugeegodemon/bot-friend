export type ConversationRole = "user" | "assistant";

export interface ConversationMessage {
  role: ConversationRole;
  author: string;
  content: string;
  createdAt: number;
}

export type TriggerReason = "mention" | "reply" | "video" | "ambient" | "none";

export interface TriggerDecision {
  shouldReply: boolean;
  reason: TriggerReason;
}
