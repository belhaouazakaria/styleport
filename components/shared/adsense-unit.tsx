"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, never>>;
  }
}

interface AdSenseUnitProps {
  clientId: string;
  slotId: string;
}

export function AdSenseUnit({ clientId, slotId }: AdSenseUnitProps) {
  const unitRef = useRef<HTMLModElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const unit = unitRef.current;
    if (!unit || initializedRef.current || unit.hasAttribute("data-adsbygoogle-status")) return;

    initializedRef.current = true;
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }, []);

  return (
    <ins
      ref={unitRef}
      className="adsbygoogle block min-h-20 w-full"
      style={{ display: "block" }}
      data-ad-client={clientId}
      data-ad-slot={slotId}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
