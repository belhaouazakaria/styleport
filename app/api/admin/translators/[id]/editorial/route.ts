import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { getAdminTranslatorById } from "@/lib/data/translators";
import { getAppSettings } from "@/lib/settings";
import { generateTranslatorEditorialContent } from "@/lib/translator-editorial";
import { z } from "zod";

const inputSchema = z.object({
  section: z.enum(["about", "whatItDoes", "bestUses", "howToUse", "tips", "examples", "faq", "differenceDescription", "full"]),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const translator = await getAdminTranslatorById(id);
  if (!translator) return apiError(404, "NOT_FOUND", "Translator not found.");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = inputSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Choose a valid editorial generation mode.");
  }

  try {
    const settings = await getAppSettings();
    const section = parsed.data.section;
    const category = translator.categories[0]?.category.name || translator.primaryCategoryId || null;
    const editorial = await generateTranslatorEditorialContent({
      model: settings.defaultModelOverride || translator.modelOverride || undefined,
      context: {
        name: translator.name,
        description: `${translator.title}. ${translator.subtitle} ${translator.shortDescription}`,
        category,
        tone: translator.promptSystem,
        style: translator.promptInstructions,
        promptSystem: translator.promptSystem,
        promptInstructions: translator.promptInstructions,
        existingAbout: translator.editorialContent?.about || translator.shortDescription,
        focus: section === "full" ? undefined : section,
      },
    });

    if (section === "full") return apiOk({ section, editorial });
    return apiOk({ section, value: editorial[section] });
  } catch {
    return apiError(502, "UPSTREAM_ERROR", "Unable to generate editorial content right now.");
  }
}
