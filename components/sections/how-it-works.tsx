const steps = [
  {
    title: "Find a Translator",
    copy: "Search and filter by category to find the style profile that fits your intent.",
  },
  {
    title: "Enter Your Text",
    copy: "Paste source text and run translation with one tap or Ctrl/Cmd + Enter.",
  },
  {
    title: "Use the Result",
    copy: "Review, refine, and copy the transformed output instantly.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto mt-10 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <h2 className="font-display text-center text-3xl font-semibold text-ink">How It Works</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <article key={step.title} className="rounded-2xl border border-border bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Step {index + 1}</p>
            <h3 className="mt-1 text-lg font-semibold text-ink">{step.title}</h3>
            <p className="mt-2 text-sm text-muted-ink">{step.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
