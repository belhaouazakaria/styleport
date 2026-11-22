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
    if (!unit) return;
    let observer: ResizeObserver | undefined;

    // AdSense throws "No slot size for availableWidth=0" when the slot is hidden
    // or not laid out yet. That error used to escape this effect and take down the
    // whole page, so wait for a real width and never let an ad failure crash the page.
    const tryInitialize = () => {
      if (initializedRef.current || unit.hasAttribute("data-adsbygoogle-status")) return;
      if (unit.getBoundingClientRect().width <= 0) return;
      initializedRef.current = true;
      observer?.disconnect();
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (error) {
        console.warn("[adsense] slot could not be initialized", error);
      }
    };

    tryInitialize();
    if (!initializedRef.current && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(tryInitialize);
      observer.observe(unit);
    }
    return () => observer?.disconnect();
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
