import { prisma } from "@/lib/prisma";
import { parseTranslatorPage, type TranslatorPage } from "@/lib/translator-page";

/**
 * Structured page blocks live in the payload of the translator's latest
 * PUBLISHED editorial draft. Translators without blocks keep the classic layout.
 */
export async function getPublishedTranslatorPage(translatorId: string): Promise<TranslatorPage | null> {
  try {
    const draft = await prisma.translatorEditorialDraft.findFirst({
      where: { translatorId, status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: { payload: true },
    });
    const payload = draft?.payload as { page?: unknown } | null;
    return parseTranslatorPage(payload?.page);
  } catch {
    return null;
  }
}
