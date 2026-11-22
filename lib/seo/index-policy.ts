/**
 * Translators that stay publicly reachable (and keep working) but are kept out
 * of search indexing and the sitemap. Reasons: placeholder or invented
 * pseudo-languages that cannot be verified, real people or public figures, and
 * pages about groups where a generated "style" would be a stereotype.
 *
 * This is a reversible editorial decision, not a deletion. Remove a slug to
 * restore indexing. Review additions with a human editor.
 */
const REAL_PEOPLE_OR_PUBLIC_FIGURES = [
  "the-real-barrack-obamna-translator",
  "cupcakke-translator",
  "meri-brown-translator",
  "meri-brown-sister-wives-translator",
  "christine-brown-translator",
  "janelle-brown-translator",
  "kody-brown-translator",
  "kelly-jo-bates-translator",
  "danielle-busby-translator",
  "karen-derrico-translator",
  "deon-derrico-translator",
  "7-little-johnstons-translator",
  "outdaughtered-translator",
  "matthew-and-nick-translator",
  "gill-bates-translator",
];

const STEREOTYPE_RISK = [
  "uncontacted-tribal-translator",
  "south-american-tribal-translator",
  "asian-parent-translator",
  "language-but-gay-translator",
  "stereotypic-furry-translator",
  "indescribeable-gang-language-translator",
  "rednese-translator",
];

const UNVERIFIABLE_OR_PLACEHOLDER = [
  "p-translator",
  "qwertyuiopasdfghjklzxcvbnm-translator",
  "what-is-this-translator",
  "ahhhhh-translator",
  "sicksuckish-translator",
  "xong-translator",
  "lxil-translator",
  "hyo-translator",
  "jino-translator",
  "grason-translator",
  "chusten-translator",
  "eggalog-translator",
  "winstonees-translator",
  "ytph-language-translator",
];

export const POLICY_NOINDEX_SLUGS: ReadonlySet<string> = new Set([
  ...REAL_PEOPLE_OR_PUBLIC_FIGURES,
  ...STEREOTYPE_RISK,
  ...UNVERIFIABLE_OR_PLACEHOLDER,
]);

export function isPolicyNoindex(slug: string) {
  return POLICY_NOINDEX_SLUGS.has(slug.trim().toLowerCase());
}

/** Real or regional languages and dialects whose AI output is not verified by native speakers. */
export const LANGUAGE_ACCURACY_NOTICE_SLUGS: ReadonlySet<string> = new Set([
  "punjabi-translator", "russian-translator", "russian-translator-2", "russian-2-0-translator",
  "dutch-sint-maarten-translator", "french-sint-maarten-translator", "french-saint-martin-translator",
  "french-montserrat-translator", "french-southern-antarctic-lands-creole-translator",
  "guadeloupean-creole-guadeloupe-translator", "dominican-spanish-translator", "latin-american-spanish-translator",
  "comanche-translator", "blackfoot-translator", "cahuilla-translator", "cupeno-translator", "cora-translator",
  "huave-translator", "tepehua-translator", "pame-translator", "nahuatl-translator", "classic-maya-translator",
  "kalinago-island-carib-translator", "krahn-translator", "hani-translator", "tai-lue-translator",
  "ladakhi-translator", "nko-translator", "old-frankish-salian-translator", "old-limburgish-translator",
  "gothic-language-translator", "glosa-translator", "wilamowicki-translator", "mazowiecki-translator",
  "bicol-translator", "kapampangan-translator", "cebuano-bisaya-translator", "tagalog-bicol-translator",
  "fijian-translator", "samoan-translator", "tongan-translator", "maori-translator", "tulu-translator",
  "zomi-translator", "low-german-translator", "galican-translator", "platta-translator",
  "dakhini-translator", "hyderabadi-slang-language-translator", "hyderabadi-urdu-language-translator",
  "kcr-style-telangana-slang-translator", "malvi-translator", "ngai-kua-translator", "b6-turkish-translator",
  "arabic-swahili-translator", "swahili-arabic-translator", "swahili-ajami-translator",
  "bohairic-coptic-latin-translator", "arabian-palestine-translator", "baltic-translator",
  "sapo-liberia-translator", "sarpo-liberia-translator", "sapo-translator", "sarpo-translator",
  "suki-japan-translator", "suki-papua-new-guinea-translator", "a1-croatia-audio-languages-translator",
  "bht1-bosnia-translator", "english-portuguese-japanese-translator", "japanese-pronouns-translator",
  "medieval-old-west-norse-nordvestur-translator", "franceis-translator", "latin-fancy-translator",
  "casyian-syllabary-translator", "kenzi-egypt-translator",
]);

export function needsLanguageAccuracyNotice(slug: string) {
  return LANGUAGE_ACCURACY_NOTICE_SLUGS.has(slug.trim().toLowerCase());
}
