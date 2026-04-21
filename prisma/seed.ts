import bcrypt from "bcryptjs";
import { FeaturedSource, PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const adminEmail = process.env.ADMIN_SEED_EMAIL || "admin@example.com";
const adminPassword = process.env.ADMIN_SEED_PASSWORD || "ChangeMe123!";

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function envInt(value: string | undefined, fallback: number, min = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

const categories = [
  {
    name: "Fancy",
    slug: "fancy",
    description: "Elegant and ornate writing transformations.",
    sortOrder: 1,
    iconKey: "sparkles",
  },
  {
    name: "Funny",
    slug: "funny",
    description: "Humorous rewrites and playful tone shifts.",
    sortOrder: 2,
    iconKey: "laugh",
  },
  {
    name: "Professional",
    slug: "professional",
    description: "Work-ready, polished, and concise language.",
    sortOrder: 3,
    iconKey: "briefcase",
  },
  {
    name: "Historical",
    slug: "historical",
    description: "Text styles inspired by historical eras.",
    sortOrder: 4,
    iconKey: "landmark",
  },
  {
    name: "Roleplay",
    slug: "roleplay",
    description: "Character and worldbuilding style conversions.",
    sortOrder: 5,
    iconKey: "masks",
  },
  {
    name: "Casual",
    slug: "casual",
    description: "Relaxed everyday language transformations.",
    sortOrder: 6,
    iconKey: "message-circle",
  },
  {
    name: "Social",
    slug: "social",
    description: "Social post and chat friendly rewrites.",
    sortOrder: 7,
    iconKey: "at-sign",
  },
  {
    name: "Marketing",
    slug: "marketing",
    description: "Promotional and conversion-focused copy styles.",
    sortOrder: 8,
    iconKey: "megaphone",
  },
];

async function seedAdmin() {
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {
      role: Role.ADMIN,
      passwordHash,
      name: "Platform Admin",
    },
    create: {
      email: adminEmail.toLowerCase(),
      name: "Platform Admin",
      role: Role.ADMIN,
      passwordHash,
    },
  });
}

async function seedCategories() {
  for (const item of categories) {
    await prisma.category.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        description: item.description,
        sortOrder: item.sortOrder,
        isActive: true,
        iconKey: item.iconKey,
        archivedAt: null,
      },
      create: {
        ...item,
        isActive: true,
      },
    });
  }
}

async function upsertTranslators() {
  const categoryMap = new Map(
    (
      await prisma.category.findMany({
        select: { id: true, slug: true },
      })
    ).map((c) => [c.slug, c.id]),
  );

  const translators = [
    {
      slug: "regal-rewrite",
      name: "Regal Rewrite",
      title: "Make Everyday English Sound Utterly Refined",
      subtitle:
        "Transform plain wording into elegant, old-world prose without losing meaning.",
      shortDescription: "Turn straightforward text into polished fancy English in seconds.",
      sourceLabel: "Plain English",
      targetLabel: "Refined Output",
      iconName: "sparkles",
      promptSystem: "You are Regal Rewrite, an expert stylistic English rewriter.",
      promptInstructions:
        "Rewrite modern plain English into refined fancy English while preserving semantic intent, names, and facts. Keep output plain text only.",
      seoTitle: "Regal Rewrite Fancy English Translator",
      seoDescription:
        "Convert ordinary English into elegant fancy prose using configurable tones.",
      modelOverride: "",
      isActive: true,
      isFeatured: true,
      showModeSelector: false,
      showSwap: false,
      showExamples: false,
      sortOrder: 1,
      categorySlugs: ["fancy", "historical"],
    },
    {
      slug: "boardroom-brief",
      name: "Boardroom Brief",
      title: "Convert Draft Notes into Professional Messaging",
      subtitle: "Craft clearer executive-ready communication in one pass.",
      shortDescription:
        "Ideal for updates, stakeholder emails, and internal leadership communication.",
      sourceLabel: "Draft Text",
      targetLabel: "Professional Version",
      iconName: "briefcase",
      promptSystem:
        "You are a senior communications editor for business and enterprise writing.",
      promptInstructions:
        "Rewrite text to be concise, clear, professional, and actionable while preserving intent and key details.",
      seoTitle: "Boardroom Brief Professional Translator",
      seoDescription: "Turn rough drafts into polished professional communication.",
      modelOverride: "",
      isActive: true,
      isFeatured: true,
      showModeSelector: false,
      showSwap: true,
      showExamples: false,
      sortOrder: 2,
      categorySlugs: ["professional", "marketing"],
    },
    {
      slug: "comedy-bender",
      name: "Comedy Bender",
      title: "Rewrite Messages with Comic Flair",
      subtitle: "Inject humor without changing your core message.",
      shortDescription: "Great for playful captions, witty replies, and fun intros.",
      sourceLabel: "Original Text",
      targetLabel: "Funny Rewrite",
      iconName: "laugh",
      promptSystem: "You are a humor-focused copywriter.",
      promptInstructions:
        "Rewrite text with tasteful humor, clear punch, and readable flow. Keep core meaning intact.",
      seoTitle: "Comedy Bender Funny Translator",
      seoDescription: "Add humor and wit to your writing while preserving meaning.",
      modelOverride: "",
      isActive: true,
      isFeatured: false,
      showModeSelector: false,
      showSwap: true,
      showExamples: false,
      sortOrder: 3,
      categorySlugs: ["funny", "social", "casual"],
    },
  ];

  for (const item of translators) {
    const primaryCategorySlug = item.categorySlugs[0];
    const primaryCategoryId = primaryCategorySlug
      ? categoryMap.get(primaryCategorySlug) || null
      : null;

    const translator = await prisma.translator.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        title: item.title,
        subtitle: item.subtitle,
        shortDescription: item.shortDescription,
        sourceLabel: item.sourceLabel,
        targetLabel: item.targetLabel,
        iconName: item.iconName,
        promptSystem: item.promptSystem,
        promptInstructions: item.promptInstructions,
        seoTitle: item.seoTitle,
        seoDescription: item.seoDescription,
        modelOverride: item.modelOverride || null,
        isActive: item.isActive,
        isFeatured: item.isFeatured,
        featuredRank: null,
        featuredSource: FeaturedSource.MANUAL,
        shareImagePath: null,
        shareImageHash: null,
        shareImageUpdatedAt: null,
        showModeSelector: item.showModeSelector,
        showSwap: item.showSwap,
        showExamples: item.showExamples,
        sortOrder: item.sortOrder,
        archivedAt: null,
        primaryCategoryId,
      },
      create: {
        slug: item.slug,
        name: item.name,
        title: item.title,
        subtitle: item.subtitle,
        shortDescription: item.shortDescription,
        sourceLabel: item.sourceLabel,
        targetLabel: item.targetLabel,
        iconName: item.iconName,
        promptSystem: item.promptSystem,
        promptInstructions: item.promptInstructions,
        seoTitle: item.seoTitle,
        seoDescription: item.seoDescription,
        modelOverride: item.modelOverride || null,
        isActive: item.isActive,
        isFeatured: item.isFeatured,
        featuredRank: null,
        featuredSource: FeaturedSource.MANUAL,
        shareImagePath: null,
        shareImageHash: null,
        shareImageUpdatedAt: null,
        showModeSelector: item.showModeSelector,
        showSwap: item.showSwap,
        showExamples: item.showExamples,
        sortOrder: item.sortOrder,
        primaryCategoryId,
      },
    });

    await prisma.translationMode.deleteMany({ where: { translatorId: translator.id } });
    await prisma.translatorExample.deleteMany({ where: { translatorId: translator.id } });
    await prisma.translatorCategory.deleteMany({ where: { translatorId: translator.id } });

    await prisma.translationMode.createMany({
      data: [
        {
          translatorId: translator.id,
          key: "classic",
          label: "Classic",
          description: "Balanced default style",
          instruction: "Use balanced tone and readability.",
          sortOrder: 1,
        },
      ],
    });

    await prisma.translatorExample.createMany({
      data: [
        {
          translatorId: translator.id,
          label: "Starter",
          value: "Rewrite this sentence in a different style.",
          sortOrder: 1,
        },
      ],
    });

    for (const [index, slug] of item.categorySlugs.entries()) {
      const categoryId = categoryMap.get(slug);
      if (!categoryId) continue;
      await prisma.translatorCategory.create({
        data: {
          translatorId: translator.id,
          categoryId,
          sortOrder: index + 1,
        },
      });
    }
  }
}

async function seedAdPlacements() {
  const placements = [
    {
      key: "homepage_top",
      name: "Homepage Top",
      description: "Top banner on discovery home page.",
      pageType: "HOMEPAGE" as const,
      deviceType: "ALL" as const,
      placementType: "HOMEPAGE_TOP" as const,
    },
    {
      key: "homepage_between_sections",
      name: "Homepage Between Sections",
      description: "Inline slot between featured and listing sections.",
      pageType: "HOMEPAGE" as const,
      deviceType: "ALL" as const,
      placementType: "HOMEPAGE_BETWEEN_SECTIONS" as const,
    },
    {
      key: "translator_above_tool",
      name: "Translator Above Tool",
      description: "Placement above translator card.",
      pageType: "TRANSLATOR" as const,
      deviceType: "ALL" as const,
      placementType: "TRANSLATOR_ABOVE_TOOL" as const,
    },
    {
      key: "translator_below_tool",
      name: "Translator Below Tool",
      description: "Placement below translator card.",
      pageType: "TRANSLATOR" as const,
      deviceType: "ALL" as const,
      placementType: "TRANSLATOR_BELOW_TOOL" as const,
    },
    {
      key: "sidebar_slot",
      name: "Sidebar Slot",
      description: "Sidebar ad slot.",
      pageType: "ALL" as const,
      deviceType: "DESKTOP" as const,
      placementType: "SIDEBAR_SLOT" as const,
    },
    {
      key: "footer_slot",
      name: "Footer Slot",
      description: "Footer placement across pages.",
      pageType: "ALL" as const,
      deviceType: "ALL" as const,
      placementType: "FOOTER_SLOT" as const,
    },
    {
      key: "mobile_sticky_slot",
      name: "Mobile Sticky Slot",
      description: "Sticky bottom mobile ad slot.",
      pageType: "ALL" as const,
      deviceType: "MOBILE" as const,
      placementType: "MOBILE_STICKY_SLOT" as const,
    },
  ];

  for (const [index, item] of placements.entries()) {
    await prisma.adPlacement.upsert({
      where: { key: item.key },
      update: {
        name: item.name,
        description: item.description,
        pageType: item.pageType,
        deviceType: item.deviceType,
        placementType: item.placementType,
        providerType: "ADSENSE",
        isActive: false,
        sortOrder: index + 1,
        archivedAt: null,
      },
      create: {
        ...item,
        providerType: "ADSENSE",
        isActive: false,
        sortOrder: index + 1,
      },
    });
  }
}

async function seedSettings() {
  const settings = [
    { key: "platformName", value: "StylePort" },
    {
      key: "homepageTitle",
      value: "Discover Translators for Every Style",
    },
    {
      key: "homepageSubtitle",
      value:
        "Browse, filter, and use specialized translators for tone, style, and creative intent.",
    },
    {
      key: "catalogIntro",
      value:
        "Find the right translator by category, compare styles, and launch instantly.",
    },
    {
      key: "footerDisclaimer",
      value:
        "StylePort provides AI-assisted rewriting for drafting purposes. Always review outputs before critical use.",
    },
    { key: "defaultTranslatorSlug", value: "regal-rewrite" },
    { key: "featuredTranslatorsEnabled", value: true },
    { key: "autoFeaturedEnabled", value: true },
    { key: "autoFeaturedWindowDays", value: 30 },
    { key: "autoFeaturedLastRecalculatedAt", value: "" },
    { key: "defaultModelOverride", value: "" },
    { key: "discoveryPageSize", value: 12 },
    { key: "adsEnabled", value: false },
    { key: "adSenseClientId", value: "" },
  ];

  for (const setting of settings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }
}

async function seedUsageProtection() {
  const usageProtectionEnabled = envBool(process.env.USAGE_PROTECTION_ENABLED, true);
  const ipLimitPerMinute = envInt(process.env.IP_RATE_LIMIT_PER_MINUTE, 5);
  const ipLimitPerHour = envInt(process.env.IP_RATE_LIMIT_PER_HOUR, 50);
  const ipLimitPerDay = envInt(process.env.IP_RATE_LIMIT_PER_DAY, 200);
  const globalDailyTokenCap = envInt(process.env.GLOBAL_DAILY_TOKEN_CAP, 200000, 1000);
  const autoEmergencyShutdownEnabled = envBool(process.env.AUTO_EMERGENCY_SHUTDOWN_ENABLED, true);
  const alertEmail = process.env.ALERT_ADMIN_EMAIL?.trim() || adminEmail.toLowerCase();

  await prisma.usageProtectionState.upsert({
    where: { id: "global" },
    update: {
      usageProtectionEnabled,
      ipLimitPerMinute,
      ipLimitPerHour,
      ipLimitPerDay,
      globalDailyTokenCap,
      autoEmergencyShutdownEnabled,
      alertEmail,
    },
    create: {
      id: "global",
      usageProtectionEnabled,
      ipLimitPerMinute,
      ipLimitPerHour,
      ipLimitPerDay,
      globalDailyTokenCap,
      autoEmergencyShutdownEnabled,
      translationsEnabled: true,
      alertEmail,
    },
  });
}

async function main() {
  await seedAdmin();
  await seedCategories();
  await upsertTranslators();
  await seedAdPlacements();
  await seedSettings();
  await seedUsageProtection();

  console.log("Database seeded successfully.");
  console.log(`Admin user: ${adminEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
