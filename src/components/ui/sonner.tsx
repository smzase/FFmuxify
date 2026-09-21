import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return <Sonner className="toaster group" style={{
    fontFamily: "var(--ui-font)",
    "--normal-bg": "rgb(var(--popover))",
    "--normal-text": "rgb(var(--popover-foreground))",
    "--normal-border": "rgb(var(--border))",
    "--border-radius": "var(--radius)",
  } as CSSProperties} {...props} />;
}
