"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/providers/toast-provider";
import { slugify } from "@/lib/slugify";

interface CategoryInitial {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  iconKey: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  archivedAt: string | null;
}

interface CategoryFormProps {
  mode: "create" | "edit";
  initial?: CategoryInitial;
}

export function CategoryForm({ mode, initial }: CategoryFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));

  const [form, setForm] = useState({
    name: initial?.name || "",
    slug: initial?.slug || "",
    description: initial?.description || "",
    sortOrder: initial?.sortOrder || 10,
    isActive: initial?.isActive ?? true,
    iconKey: initial?.iconKey || "",
    seoTitle: initial?.seoTitle || "",
    seoDescription: initial?.seoDescription || "",
  });

  async function save() {
    setBusy(true);

    const payload = {
      ...form,
      slug: slugify(form.slug || form.name),
      sortOrder: Number(form.sortOrder) || 0,
    };

    const endpoint = mode === "create" ? "/api/admin/categories" : `/api/admin/categories/${initial?.id}`;
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
        description: result?.error?.message || "Please verify the fields and retry.",
        variant: "error",
      });
      return;
    }

    toast({ title: "Category saved" });

    if (mode === "create") {
      router.push(`/admin/categories/${result.category.id}`);
    } else {
      router.refresh();
    }
  }

  async function archiveToggle() {
    if (!initial?.id) return;

    setBusy(true);
    const modeValue = initial.archivedAt ? "unarchive" : "archive";
    const response = await fetch(`/api/admin/categories/${initial.id}?mode=${modeValue}`, {
      method: "DELETE",
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Action failed", description: "Please try again.", variant: "error" });
      return;
    }

    toast({ title: initial.archivedAt ? "Category restored" : "Category archived" });
    router.refresh();
  }

  async function hardDelete() {
    if (!initial?.id) return;

    setBusy(true);
    const response = await fetch(`/api/admin/categories/${initial.id}?mode=hard`, {
      method: "DELETE",
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Delete failed", description: "Please try again.", variant: "error" });
      return;
    }

    toast({ title: "Category deleted" });
    router.push("/admin/categories");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Category Details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Name</span>
            <input
              value={form.name}
              onChange={(event) => {
                const value = event.target.value;
                setForm((current) => ({ ...current, name: value }));
                if (!slugTouched) {
                  setForm((current) => ({ ...current, slug: slugify(value) }));
                }
              }}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Slug</span>
            <input
              value={form.slug}
              onChange={(event) => {
                setSlugTouched(true);
                setForm((current) => ({ ...current, slug: slugify(event.target.value) }));
              }}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Description</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Icon Key</span>
            <input
              value={form.iconKey}
              onChange={(event) => setForm((current) => ({ ...current, iconKey: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border px-3"
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
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">SEO Title</span>
            <input
              value={form.seoTitle}
              onChange={(event) => setForm((current) => ({ ...current, seoTitle: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">SEO Description</span>
            <textarea
              value={form.seoDescription}
              onChange={(event) =>
                setForm((current) => ({ ...current, seoDescription: event.target.value }))
              }
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink md:col-span-2">
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
          {busy ? "Saving..." : mode === "create" ? "Create Category" : "Save Changes"}
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
        title="Permanently delete category?"
        description="This action cannot be undone. Translators using this category keep running but lose the relation."
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
