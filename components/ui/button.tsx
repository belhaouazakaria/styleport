import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full text-sm font-bold transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-accent-500 text-white shadow-[0_4px_0_#d9563b] hover:-translate-y-0.5 hover:bg-accent-600 active:translate-y-1 active:shadow-none",
        outline:
          "border border-border bg-white text-ink hover:bg-muted-surface",
        ghost: "text-muted-ink hover:bg-muted-surface",
        secondary: "bg-ink text-white hover:bg-brand-800",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 min-h-9 px-3 text-xs",
        lg: "h-12 px-7 text-base",
        icon: "h-11 w-11 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
