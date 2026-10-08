import { GrowthCreativeArchetype } from "@prisma/client";

export const CREATIVE_LAB_VERSION = "creative_lab_v1";
export const CREATIVE_SIMILARITY_VERSION = "creative_similarity_v1";
export const CREATIVE_EXPERIMENT_VERSION = "creative_experiment_v1";
export const CREATIVE_RENDERER_VERSION = "creative_static_v2";
export const CONTROL_RENDERER_KEY = "v1-control";
export const CONTROL_RENDERER_VERSION = "share_image_v1";
export const CREATIVE_RENDERER_KEY = "creative-static";
export const CREATIVE_WIDTH = 1000;
export const CREATIVE_HEIGHT = 1500;
export const MAX_CREATIVE_BYTES = 10 * 1024 * 1024;
export const MAX_CREATIVE_COMPARISONS = 100;

export const DETERMINISTIC_ARCHETYPES = [
  GrowthCreativeArchetype.V1_CONTROL,
  GrowthCreativeArchetype.TYPOGRAPHY_LED,
  GrowthCreativeArchetype.EDITORIAL_LIST,
  GrowthCreativeArchetype.CONVERSATION_CHAT,
  GrowthCreativeArchetype.MINIMAL_STATEMENT,
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
    templateId: "minimal-statement-v1",
    headlinePattern: "single-statement",
    ctaPattern: "see-full-destination",
    visualTreatment: "minimal-high-contrast",
  },
} as const;
