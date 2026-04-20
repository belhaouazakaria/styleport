interface FooterProps {
  platformName: string;
  disclaimer: string;
}

export function Footer({ platformName, disclaimer }: FooterProps) {
  return (
    <footer className="border-t border-border bg-white/70 py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 text-center text-sm text-muted-ink sm:px-6 lg:px-8">
        <p>{disclaimer}</p>
        <p>Need a new style? Use the Request button in the top navigation.</p>
        <p>Built for style discovery, experimentation, and high-velocity drafting workflows.</p>
        <p className="text-xs text-muted-ink/80">{platformName} platform admin dashboard enabled.</p>
      </div>
    </footer>
  );
}
