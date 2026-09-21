import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "../../lib/utils";
export function ToggleGroup({ className, ...props }: React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>) {
  return <ToggleGroupPrimitive.Root className={cn("flex items-center justify-center gap-1", className)} {...props} />;
}
export function ToggleGroupItem({ className, ...props }: React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>) {
  return <ToggleGroupPrimitive.Item className={cn("inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground", className)} {...props} />;
}
