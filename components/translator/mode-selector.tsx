import { WandSparkles } from "lucide-react";

import { Select } from "@/components/ui/select";
import type { PublicMode } from "@/lib/types";

interface ModeSelectorProps {
  value: string;
  modes: PublicMode[];
  onChange: (modeKey: string) => void;
}

export function ModeSelector({ value, modes, onChange }: ModeSelectorProps) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-muted-ink">
      <WandSparkles className="h-4 w-4 text-brand-600" />
      <span className="hidden sm:inline">Mode</span>
      <Select
        aria-label="Translation mode"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        options={modes.map((mode) => ({
          value: mode.key,
          label: mode.label,
        }))}
        className="min-w-[220px]"
      />
    </label>
  );
}
