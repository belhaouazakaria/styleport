import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdSenseUnit } from "@/components/shared/adsense-unit";

type RO = { cb: () => void };
let observers: RO[] = [];
let width = 0;

beforeEach(() => {
  observers = [];
  width = 0;
  (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle = [];
  vi.stubGlobal("ResizeObserver", class { cb: () => void; constructor(cb: () => void) { this.cb = cb; observers.push(this); } observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("AdSenseUnit", () => {
  it("does not push into a zero-width (hidden) slot, and pushes once it has width", () => {
    render(<AdSenseUnit clientId="ca-pub-1" slotId="123" />);
    expect((window.adsbygoogle as unknown[]).length).toBe(0);
    width = 320;
    observers.forEach((o) => o.cb());
    observers.forEach((o) => o.cb());
    expect((window.adsbygoogle as unknown[]).length).toBe(1);
  });

  it("pushes immediately when the slot is already visible", () => {
    width = 300;
    render(<AdSenseUnit clientId="ca-pub-1" slotId="123" />);
    expect((window.adsbygoogle as unknown[]).length).toBe(1);
  });

  it("never lets an AdSense error crash the page", () => {
    width = 300;
    (window as unknown as { adsbygoogle: { push: () => never } }).adsbygoogle = { push: () => { throw new Error("No slot size for availableWidth=0"); } };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => render(<AdSenseUnit clientId="ca-pub-1" slotId="123" />)).not.toThrow();
  });
});
