export const ACCOUNT_CREATIVE_DIRECTION = {
  SAYTWIST:
    "Utility and tool discovery: explain one practical transformation with clear before-and-after proof, restrained diagrams or educational illustration, strong teal hierarchy and an immediately useful takeaway.",
  SAYTWIST_IDEAS:
    "Inspiration and saving: warm ivory editorial art direction, tactile illustration or a magazine composition, a relatable communication scenario and save-worthy wording. Keep the supplied exact text. Avoid pretending a short comparison is a long list.",
  SAYTWIST_PLAYGROUND:
    "Entertainment and curiosity: playful conceptual illustration, high-contrast coral/sky accents, comic or game-like visual storytelling and a surprising transformation reveal. Invite exploration without inventing quiz results, unsupported claims or engagement rewards.",
} as const;
export type CreativePublicationRole = keyof typeof ACCOUNT_CREATIVE_DIRECTION;

/** Source discoveries have no verified translation pair. Their visual identity
 * must not inherit native campaign instructions to demonstrate a result. */
export const ACCOUNT_SOURCE_CREATIVE_DIRECTION: Record<CreativePublicationRole, string> = {
  SAYTWIST: "Utility and tool discovery: original conceptual illustration, strong teal hierarchy, clear topic identity and a restrained editorial composition.",
  SAYTWIST_IDEAS: "Inspiration and saving: warm ivory editorial art direction, tactile illustration or a magazine composition, and a save-worthy visual metaphor for the topic.",
  SAYTWIST_PLAYGROUND: "Entertainment and curiosity: playful conceptual illustration, high-contrast coral/sky accents and comic or game-like visual storytelling about the topic.",
};
