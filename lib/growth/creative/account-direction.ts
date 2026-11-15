export const ACCOUNT_CREATIVE_DIRECTION = {
  SAYTWIST:
    "Utility and tool discovery: explain one practical transformation with clear before-and-after proof, restrained diagrams or educational illustration, strong teal hierarchy and an immediately useful takeaway.",
  SAYTWIST_IDEAS:
    "Inspiration and saving: warm ivory editorial art direction, tactile illustration or a magazine composition, a relatable communication scenario and save-worthy wording. Keep the supplied exact text. Avoid pretending a short comparison is a long list.",
  SAYTWIST_PLAYGROUND:
    "Entertainment and curiosity: playful conceptual illustration, high-contrast coral/sky accents, comic or game-like visual storytelling and a surprising transformation reveal. Invite exploration without inventing quiz results, unsupported claims or engagement rewards.",
} as const;
export type CreativePublicationRole = keyof typeof ACCOUNT_CREATIVE_DIRECTION;
