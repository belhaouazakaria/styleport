"use client";

import { useRef, type ChangeEvent } from "react";
import { Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

interface UploadImageButtonProps {
  disabled?: boolean;
  loading?: boolean;
  onExtracted: (text: string) => void;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
}

export function UploadImageButton({
  disabled,
  loading,
  onExtracted,
  onError,
  onLoadingChange,
}: UploadImageButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    onLoadingChange(true);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        onError(payload?.error?.message || "OCR could not read this image.");
        return;
      }

      onExtracted(payload.text as string);
    } catch {
      onError("OCR could not read this image.");
    } finally {
      onLoadingChange(false);
      event.target.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={handleChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || loading}
        onClick={() => inputRef.current?.click()}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Upload image
      </Button>
    </>
  );
}
