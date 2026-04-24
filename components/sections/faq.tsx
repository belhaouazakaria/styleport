const items = [
  {
    q: "How accurate are translations?",
    a: "What Type Of | Translator aims to preserve meaning while changing tone or style. Always review output before high-stakes use.",
  },
  {
    q: "Can I manage translators myself?",
    a: "Yes. Admin users can create and edit translators, categories, models, and ad placements from the dashboard.",
  },
  {
    q: "Does What Type Of | Translator support many translation styles?",
    a: "Yes. The platform is built for multiple categories such as professional, funny, historical, social, and more.",
  },
];

export function Faq() {
  return (
    <section className="mx-auto mt-10 w-full max-w-5xl px-4 sm:px-6 lg:px-8">
      <h2 className="font-display text-center text-3xl font-semibold text-ink">FAQ</h2>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <article key={item.q} className="rounded-2xl border border-border bg-white p-5">
            <h3 className="font-semibold text-ink">{item.q}</h3>
            <p className="mt-2 text-sm text-muted-ink">{item.a}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
