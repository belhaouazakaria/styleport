import { Button } from "@/components/ui/button";
import type { PublicExample } from "@/lib/types";

interface SeedButtonsProps {
  examples: PublicExample[];
  onSelect: (value: string) => void;
}

export function SeedButtons({ examples, onSelect }: SeedButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {examples.map((seed) => (
        <Button
          key={`${seed.label}-${seed.sortOrder}`}
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full border border-border bg-surface text-muted-ink hover:border-brand-300 hover:bg-muted-surface"
          onClick={() => onSelect(seed.value)}
        >
          {seed.label}
        </Button>
      ))}
    </div>
  );
}
