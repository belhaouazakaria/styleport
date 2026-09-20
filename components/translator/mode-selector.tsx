import { Lightbulb, Smile, WandSparkles } from "lucide-react";

import type { PublicMode } from "@/lib/types";

interface ModeSelectorProps {
  value: string;
  modes: PublicMode[];
  onChange: (modeKey: string) => void;
}

export function ModeSelector({ value, modes, onChange }: ModeSelectorProps) {
  function moveSelection(index: number, direction: 1 | -1) {
    const nextIndex = (index + direction + modes.length) % modes.length;
    onChange(modes[nextIndex].key);
  }

  return (
    <div className="twist-strip" role="radiogroup" aria-label="Choose a twist style">
      <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-brand-800">
        <WandSparkles className="h-4 w-4" aria-hidden="true" />
        <span>Choose your twist</span>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-3">
        {modes.map((mode, index) => {
          const active = mode.key === value;
          const Icon = index === 0 ? WandSparkles : index % 2 === 0 ? Lightbulb : Smile;
          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active || (!modes.some((item) => item.key === value) && index === 0) ? 0 : -1}
              onClick={() => onChange(mode.key)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  moveSelection(index, 1);
                  (event.currentTarget.parentElement?.children[(index + 1) % modes.length] as HTMLElement | undefined)?.focus();
                }
                if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  event.preventDefault();
                  moveSelection(index, -1);
                  (event.currentTarget.parentElement?.children[(index - 1 + modes.length) % modes.length] as HTMLElement | undefined)?.focus();
                }
              }}
              className={`twist-strip-option ${active ? "twist-strip-option-active" : ""}`}
              title={mode.description || mode.label}
            >
              <span className="twist-strip-icon"><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <span className="min-w-0 text-left"><span className="block truncate text-sm font-extrabold">{mode.label}</span>{mode.description ? <span className="mt-0.5 block truncate text-[11px] font-medium opacity-70">{mode.description}</span> : null}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
