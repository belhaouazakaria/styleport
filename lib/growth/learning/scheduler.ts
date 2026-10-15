import {
  GrowthLearningEvidenceQuality,
  GrowthPublicationTimingMode,
} from "@prisma/client";
import { createHash } from "node:crypto";

import {
  LEARNING_TIME_ZONE,
  MIN_SCHEDULE_IMPRESSIONS,
  MIN_SCHEDULE_PINS,
} from "@/lib/growth/learning/constants";

export type LearnedWindow = {
  localHour: number;
  samplePins: number;
  impressions: number;
  outboundClicks: number;
  saves: number;
  qualifiedConversions: number | null;
};

export function evaluateLearnedWindows(
  windows: LearnedWindow[],
  attributionAvailable: boolean,
) {
  return windows.map((window) => {
    const sufficient =
      window.samplePins >= MIN_SCHEDULE_PINS &&
      window.impressions >= MIN_SCHEDULE_IMPRESSIONS;
    return {
      ...window,
      timeZone: LEARNING_TIME_ZONE,
      mode: sufficient
        ? GrowthPublicationTimingMode.EXPLOIT
        : GrowthPublicationTimingMode.COLD_START,
      evidenceQuality: sufficient
        ? GrowthLearningEvidenceQuality.KNOWN
        : GrowthLearningEvidenceQuality.INSUFFICIENT_DATA,
      confidence: sufficient
        ? Math.min(90, 45 + window.samplePins * 5)
        : Math.min(35, window.samplePins * 8),
      reasonCodes: sufficient
        ? ["ACCOUNT_SPECIFIC_WINDOW", "EXPOSURE_NORMALIZED"]
        : ["COLD_START_INSUFFICIENT_EVIDENCE"],
      outboundRate: window.impressions
        ? Number((window.outboundClicks / window.impressions).toFixed(6))
        : null,
      conversionRate:
        attributionAvailable &&
        window.qualifiedConversions != null &&
        window.outboundClicks
          ? Number(
              (window.qualifiedConversions / window.outboundClicks).toFixed(6),
            )
          : null,
    };
  });
}

export function chooseLearnedWindow(input: {
  stableKey: string;
  windows: Array<{
    localHour: number;
    evidenceQuality: GrowthLearningEvidenceQuality;
    outboundRate: number | null;
    confidence: number;
  }>;
}) {
  const qualified = input.windows
    .filter(
      (window) =>
        window.evidenceQuality === GrowthLearningEvidenceQuality.KNOWN,
    )
    .sort(
      (a, b) =>
        (b.outboundRate || 0) - (a.outboundRate || 0) ||
        b.confidence - a.confidence ||
        a.localHour - b.localHour,
    );
  if (!qualified.length)
    return {
      localHour: null,
      mode: GrowthPublicationTimingMode.COLD_START,
      schedulerVersion: "learned_scheduler_v1",
      reasonCodes: ["USE_PUBLICATION_TIMING_V1_COLD_START"],
    };
  const seed = Number.parseInt(
    createHash("sha256").update(input.stableKey).digest("hex").slice(0, 8),
    16,
  );
  const explore = qualified.length > 1 && seed % 10 >= 8;
  return {
    localHour: explore
      ? qualified[1 + (seed % (qualified.length - 1))].localHour
      : qualified[0].localHour,
    mode: explore
      ? GrowthPublicationTimingMode.EXPLORE
      : GrowthPublicationTimingMode.EXPLOIT,
    schedulerVersion: "learned_scheduler_v1",
    reasonCodes: [
      explore ? "BOUNDED_EXPLORATION" : "ACCOUNT_SPECIFIC_EXPLOITATION",
    ],
  };
}
