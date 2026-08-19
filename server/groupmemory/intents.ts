export type GroupMemoryIntent =
  | { kind: "botHelp" }
  | { kind: "casual" }
  | { kind: "personalMessageCount" }
  | { kind: "groupMessageCount" }
  | { kind: "topContributor" }
  | { kind: "unsupportedConversationCount" }
  | null;

export function classifyGroupMemoryIntent(rawQuestion: string): GroupMemoryIntent {
  const question = rawQuestion.trim().toLowerCase().replace(/\s+/g, " ");
  if (!question) return null;

  if (/(?:what(?:'s| is) (?:your |the )?(?:all )?(?:commands?|features?)|(?:show|tell|list).{0,24}(?:commands?|features?)|how (?:do|can) (?:i|we) use (?:you|this bot))/.test(question)) {
    return { kind: "botHelp" };
  }
  if (/(?:how many|count).{0,24}(?:chats?|conversations?)/.test(question)) return { kind: "unsupportedConversationCount" };
  const asksMyMessageCount = /(?:how many|count).{0,30}(?:messages?|msgs?).{0,24}\b(?:i|me|my)\b/.test(question)
    || /\b(?:my|i)\b.{0,18}(?:messages?|msgs?).{0,16}(?:count|sent)/.test(question);
  if (asksMyMessageCount) {
    return { kind: "personalMessageCount" };
  }
  if (/(?:how many|count).{0,30}(?:messages?|msgs?)/.test(question)) return { kind: "groupMessageCount" };
  if (/(?:who|which (?:person|member)).{0,36}(?:chat|talk|message|send).{0,16}most/.test(question)) return { kind: "topContributor" };
  if (/^(?:smart ai|nice|cool|great|good bot|thank(?:s| you)?|awesome|love it)[!. ]*$/.test(question)) return { kind: "casual" };
  return null;
}

export function formatCasualAcknowledgement() {
  return "<b>Thank you.</b>\nI keep answers grounded in retained group messages, and I will say clearly when I do not have enough evidence.";
}
