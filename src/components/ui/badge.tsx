import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-zinc-950 text-white",
      secondary: "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
      success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
      warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
      danger: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
