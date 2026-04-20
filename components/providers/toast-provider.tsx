"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "success" | "error";
}

interface ToastOptions {
  title: string;
  description?: string;
  variant?: "success" | "error";
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, variant = "success" }: ToastOptions) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, title, description, variant }]);

      window.setTimeout(() => removeToast(id), 2600);
    },
    [removeToast],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((item) => {
          const isError = item.variant === "error";
          return (
            <div
              key={item.id}
              className={cn(
                "pointer-events-auto animate-toast-in rounded-xl border bg-white p-3 text-sm shadow-lg",
                isError ? "border-red-200 text-red-700" : "border-emerald-200 text-emerald-700",
              )}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start gap-2">
                {isError ? (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div>
                  <p className="font-semibold">{item.title}</p>
                  {item.description ? <p className="text-xs opacity-85">{item.description}</p> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return context;
}
