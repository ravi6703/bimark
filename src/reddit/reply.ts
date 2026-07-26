import { getLlm } from "../llm/index.js";

/**
 * Drafts a genuine, non-pitchy reply to a real Reddit thread — a starting
 * point for a human to read, edit, and post themselves (never auto-posted).
 * Explicitly instructed against being promotional, matching how Reddit
 * communities actually react to brand replies and Okara's own described
 * approach to this same problem.
 */
export async function draftRedditReply(input: {
  brandName: string;
  voiceGuide: string;
  threadTitle: string;
  threadExcerpt: string | null;
  subreddit: string;
}): Promise<{ reply: string; modelUsed: string }> {
  const result = await getLlm().complete({
    task: "reddit_reply",
    system:
      `You are drafting a Reddit comment reply on behalf of a real person from ${input.brandName}, ` +
      `posting in r/${input.subreddit}. Reddit communities react badly to blatant self-promotion — ` +
      "write a genuinely helpful, conversational reply that adds real value to the discussion. Only " +
      `mention ${input.brandName} if it's directly and naturally relevant to answering the thread — ` +
      "most good replies won't need to. No marketing language, no hashtags, no call-to-action. " +
      `Brand voice for reference: ${input.voiceGuide || "(none set)"}`,
    messages: [
      {
        role: "user",
        content: [
          `Thread title: ${input.threadTitle}`,
          input.threadExcerpt ? `Thread body: ${input.threadExcerpt}` : "",
          "Draft a short, genuine reply.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    maxTokens: 400,
  });
  return { reply: result.text.trim(), modelUsed: result.modelUsed };
}
