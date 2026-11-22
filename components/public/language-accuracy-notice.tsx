export function LanguageAccuracyNotice({ name }: { name: string }) {
  return (
    <aside
      aria-label="Accuracy note"
      className="mx-auto mt-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8"
    >
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <p className="font-bold">About the accuracy of this translator</p>
        <p className="mt-1">
          {name} produces AI-generated text. Its output has not been checked by native speakers, and AI models can
          make mistakes with grammar, spelling, regional usage and cultural nuance, especially for less widely
          documented languages and dialects. Use it for creative, playful or learning purposes. Do not rely on it for
          legal, medical, official or other important communication without review by a fluent speaker.
        </p>
      </div>
    </aside>
  );
}
