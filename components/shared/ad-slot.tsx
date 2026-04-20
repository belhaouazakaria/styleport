import type { AdPlacement } from "@prisma/client";

interface AdSlotProps {
  placement: Pick<AdPlacement, "id" | "name" | "providerType" | "adSenseSlot" | "codeSnippet">;
  adSenseClientId: string;
}

export function AdSlot({ placement, adSenseClientId }: AdSlotProps) {
  if (placement.providerType === "CUSTOM_HTML" && placement.codeSnippet) {
    return (
      <div
        className="overflow-hidden rounded-2xl border border-border bg-surface"
        dangerouslySetInnerHTML={{ __html: placement.codeSnippet }}
      />
    );
  }

  if (placement.providerType === "ADSENSE" && placement.adSenseSlot) {
    return (
      <div className="rounded-2xl border border-border bg-muted-surface p-4 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">Ad</p>
        <div className="mt-2 min-h-20 rounded-xl border border-dashed border-border bg-white p-4 text-sm text-muted-ink">
          {adSenseClientId ? (
            <p>AdSense slot: {placement.adSenseSlot}</p>
          ) : (
            <p>Set AdSense client ID in settings to activate this placement.</p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
