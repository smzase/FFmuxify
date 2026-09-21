import * as React from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { cn } from "../../lib/utils";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export function ContextMenuContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>) {
  return <ContextMenuPrimitive.Portal><ContextMenuPrimitive.Content collisionPadding={8} className={cn("context-menu z-[60] min-w-40 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 duration-150", className)} {...props} /></ContextMenuPrimitive.Portal>;
}
export function ContextMenuItem({ className, ...props }: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item>) {
  return <ContextMenuPrimitive.Item className={cn("context-menu-item relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0", className)} {...props} />;
}
export function ContextMenuSeparator() { return <ContextMenuPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />; }
export function ContextMenuShortcut({ children }: { children: React.ReactNode }) { return <span className="ml-auto pl-5 text-xs tracking-widest text-muted-foreground">{children}</span>; }
