import { GrowthCreativeArchetype } from "@prisma/client";

export const CREATIVE_LAB_VERSION = "creative_lab_v1";
export const CREATIVE_SIMILARITY_VERSION = "creative_similarity_v2";
export const CREATIVE_EXPERIMENT_VERSION = "creative_experiment_v1";
export const CREATIVE_RENDERER_VERSION = "creative_static_v4";
export const CREATIVE_AI_COMPOSITE_VERSION = "creative_ai_composite_v1";
export const CREATIVE_AI_COMPOSITE_KEY = "creative-ai-composite";
export const CONTROL_RENDERER_KEY = "v1-control";
export const CONTROL_RENDERER_VERSION = "share_image_v1";
export const CREATIVE_RENDERER_KEY = "creative-static";
export const CREATIVE_WIDTH = 1000;
export const CREATIVE_HEIGHT = 1500;
export const MAX_CREATIVE_BYTES = 10 * 1024 * 1024;
export const MAX_CREATIVE_COMPARISONS = 100;

export const CREATIVE_DIRECTIONS = [
  "EDITORIAL_SPLIT",
  "CHAT_FOCUS",
  "BOLD_POSTER",
  "COLLAGE",
  "MAGAZINE_FRAME",
] as const;

export type CreativeDirection = typeof CREATIVE_DIRECTIONS[number];

export const CREATIVE_DIRECTION_TEMPLATES: Record<CreativeDirection, string> = {
  EDITORIAL_SPLIT: "before-after-ai-v1-editorial-split",
  CHAT_FOCUS: "before-after-ai-v1-chat-focus",
  BOLD_POSTER: "before-after-ai-v1-bold-poster",
  COLLAGE: "before-after-ai-v1-collage",
  MAGAZINE_FRAME: "before-after-ai-v1-magazine-frame",
};

export const CREATIVE_TEMPLATE_DIRECTIONS = Object.fromEntries(
  Object.entries(CREATIVE_DIRECTION_TEMPLATES).map(([direction, template]) => [template, direction]),
) as Record<string, CreativeDirection>;

export const DETERMINISTIC_ARCHETYPES = [
  GrowthCreativeArchetype.V1_CONTROL,
  GrowthCreativeArchetype.MINIMAL_STATEMENT,
  GrowthCreativeArchetype.BEFORE_AFTER,
] as const;

export const STATIC_RENDERER_DEFINITIONS = {
  [GrowthCreativeArchetype.V1_CONTROL]: {
    rendererKey: CONTROL_RENDERER_KEY,
    rendererVersion: CONTROL_RENDERER_VERSION,
    templateId: "translator-share-control-v1",
    headlinePattern: "translate-your-text-to-style",
    ctaPattern: "try-it-with-your-own-text",
    visualTreatment: "existing-translator-share-control",
  },
  [GrowthCreativeArchetype.TYPOGRAPHY_LED]: {
    rendererKey: CREATIVE_RENDERER_KEY,
    rendererVersion: CREATIVE_RENDERER_VERSION,
    templateId: "typography-led-v1",
    headlinePattern: "topic-led-promise",
    ctaPattern: "destination-action",
    visualTreatment: "bold-type-color-field",
  },
  [GrowthCreativeArchetype.EDITORIAL_LIST]: {
    rendererKey: CREATIVE_RENDERER_KEY,
    rendererVersion: CREATIVE_RENDERER_VERSION,
    templateId: "editorial-list-v1",
    headlinePattern: "editorial-list-preview",
    ctaPattern: "explore-full-version",
    visualTreatment: "editorial-card-list",
  },
  [GrowthCreativeArchetype.CONVERSATION_CHAT]: {
    rendererKey: CREATIVE_RENDERER_KEY,
    rendererVersion: CREATIVE_RENDERER_VERSION,
    templateId: "conversation-chat-v1",
    headlinePattern: "conversation-example",
    ctaPattern: "try-with-your-message",
    visualTreatment: "safe-chat-bubbles",
  },
  [GrowthCreativeArchetype.MINIMAL_STATEMENT]: {
    rendererKey: CREATIVE_RENDERER_KEY,
    rendererVersion: CREATIVE_RENDERER_VERSION,
    templateId: "minimal-poster-v2",
    headlinePattern: "single-statement-v2",
    ctaPattern: "see-full-destination",
    visualTreatment: "minimal-brand-poster",
  },
  [GrowthCreativeArchetype.BEFORE_AFTER]: {
    rendererKey: CREATIVE_RENDERER_KEY,
    rendererVersion: CREATIVE_RENDERER_VERSION,
    templateId: "before-after-showcase-v1",
    headlinePattern: "transformation-proof",
    ctaPattern: "see-the-transformation",
    visualTreatment: "transformation-cards",
  },
} as const;
