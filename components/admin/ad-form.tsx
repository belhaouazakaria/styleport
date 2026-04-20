"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/providers/toast-provider";

interface AdInitial {
  id: string;
  name: string;
  key: string;
  description: string | null;
  pageType: "ALL" | "HOMEPAGE" | "TRANSLATOR" | "CATEGORY";
  deviceType: "ALL" | "DESKTOP" | "MOBILE";
  placementType:
    | "HOMEPAGE_TOP"
    | "HOMEPAGE_BETWEEN_SECTIONS"
    | "TRANSLATOR_ABOVE_TOOL"
    | "TRANSLATOR_BELOW_TOOL"
    | "SIDEBAR_SLOT"
    | "FOOTER_SLOT"
    | "MOBILE_STICKY_SLOT"
    | "CUSTOM";
  providerType: "ADSENSE" | "CUSTOM_HTML";
  adSenseSlot: string | null;
  codeSnippet: string | null;
  categoryId: string | null;
  isActive: boolean;
  sortOrder: number;
  archivedAt: string | null;
}

interface AdFormProps {
  mode: "create" | "edit";
  initial?: AdInitial;
  categories: Array<{ id: string; name: string }>;
}

export function AdForm({ mode, initial, categories }: AdFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [form, setForm] = useState({
    name: initial?.name || "",
    key: initial?.key || "",
    description: initial?.description || "",
    pageType: initial?.pageType || "ALL",
    deviceType: initial?.deviceType || "ALL",
    placementType: initial?.placementType || "CUSTOM",
    providerType: initial?.providerType || "ADSENSE",
    adSenseSlot: initial?.adSenseSlot || "",
    codeSnippet: initial?.codeSnippet || "",
    categoryId: initial?.categoryId || "",
    isActive: initial?.isActive ?? false,
    sortOrder: initial?.sortOrder || 10,
  });

  async function save() {
    setBusy(true);

    const payload = {
      ...form,
      sortOrder: Number(form.sortOrder) || 0,
    };

    const endpoint = mode === "create" ? "/api/admin/ads" : `/api/admin/ads/${initial?.id}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({
        title: "Save failed",
        description: result?.error?.message || "Please review values and retry.",
        variant: "error",
      });
      return;
    }

    toast({ title: "Ad placement saved" });
    if (mode === "create") {
      router.push(`/admin/ads/${result.ad.id}`);
    } else {
      router.refresh();
    }
  }

  async function archiveToggle() {
    if (!initial?.id) return;

    setBusy(true);
    const modeValue = initial.archivedAt ? "unarchive" : "archive";
    const response = await fetch(`/api/admin/ads/${initial.id}?mode=${modeValue}`, {
      method: "DELETE",
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Action failed", description: "Please try again.", variant: "error" });
      return;
    }

    toast({ title: initial.archivedAt ? "Placement restored" : "Placement archived" });
    router.refresh();
  }

  async function hardDelete() {
    if (!initial?.id) return;

    setBusy(true);
    const response = await fetch(`/api/admin/ads/${initial.id}?mode=hard`, {
      method: "DELETE",
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Delete failed", description: "Please try again.", variant: "error" });
      return;
    }

    toast({ title: "Placement deleted" });
    router.push("/admin/ads");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Placement Details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Key</span>
            <input
              value={form.key}
              onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Description</span>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Page Type</span>
            <select
              value={form.pageType}
              onChange={(event) => setForm((current) => ({ ...current, pageType: event.target.value as typeof current.pageType }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="ALL">All</option>
              <option value="HOMEPAGE">Homepage</option>
              <option value="TRANSLATOR">Translator</option>
              <option value="CATEGORY">Category</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Device Type</span>
            <select
              value={form.deviceType}
              onChange={(event) => setForm((current) => ({ ...current, deviceType: event.target.value as typeof current.deviceType }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="ALL">All devices</option>
              <option value="DESKTOP">Desktop</option>
              <option value="MOBILE">Mobile</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Placement Type</span>
            <select
              value={form.placementType}
              onChange={(event) =>
                setForm((current) => ({ ...current, placementType: event.target.value as typeof current.placementType }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="HOMEPAGE_TOP">Homepage Top</option>
              <option value="HOMEPAGE_BETWEEN_SECTIONS">Homepage Between Sections</option>
              <option value="TRANSLATOR_ABOVE_TOOL">Translator Above Tool</option>
              <option value="TRANSLATOR_BELOW_TOOL">Translator Below Tool</option>
              <option value="SIDEBAR_SLOT">Sidebar Slot</option>
              <option value="FOOTER_SLOT">Footer Slot</option>
              <option value="MOBILE_STICKY_SLOT">Mobile Sticky Slot</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Provider Type</span>
            <select
              value={form.providerType}
              onChange={(event) =>
                setForm((current) => ({ ...current, providerType: event.target.value as typeof current.providerType }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="ADSENSE">AdSense</option>
              <option value="CUSTOM_HTML">Custom HTML</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Category Target (optional)</span>
            <select
              value={form.categoryId}
              onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">AdSense Slot (optional)</span>
            <input
              value={form.adSenseSlot}
              onChange={(event) =>
                setForm((current) => ({ ...current, adSenseSlot: event.target.value }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
              placeholder="e.g. 1234567890"
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Custom Code Snippet (optional)</span>
            <textarea
              value={form.codeSnippet}
              onChange={(event) =>
                setForm((current) => ({ ...current, codeSnippet: event.target.value }))
              }
              className="min-h-24 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Sort Order</span>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(event) =>
                setForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            />
            Active
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving..." : mode === "create" ? "Create Placement" : "Save Changes"}
        </Button>

        {mode === "edit" ? (
          <>
            <Button type="button" variant="outline" onClick={() => void archiveToggle()} disabled={busy}>
              {initial?.archivedAt ? "Unarchive" : "Archive"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" />
              Delete Forever
            </Button>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Permanently delete ad placement?"
        description="This action cannot be undone."
        confirmLabel="Delete forever"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void hardDelete();
        }}
        variant="danger"
      />
    </div>
  );
}
