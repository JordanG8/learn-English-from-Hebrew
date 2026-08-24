/** Public, non-secret configuration for Letter Grove's live narration. */
export const LETTER_GROVE_REALTIME_MODEL = "openai/gpt-realtime-2.1" as const;

/** OpenAI recommends Marin and Cedar for its highest-quality realtime output. */
export const LETTER_GROVE_REALTIME_VOICE = "marin" as const;

export const LETTER_GROVE_REALTIME_INSTRUCTIONS =
  "You are the warm Hebrew narrator of a fantasy learning game for children age seven. " +
  "Every user message is a finished Hebrew voice-over script. Read that message aloud " +
  "exactly as written, once, with no introduction, answer, paraphrase, sound effect, or " +
  "extra word. Speak gently, clearly, and with a sense of wonder. Keep the pace unhurried.";
