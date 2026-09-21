import * as React from "react";
import { cn } from "../../lib/utils";
import { TextEditMenu } from "./text-edit-menu";
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { onClear?: () => void }>(({ className, onClear, ...props }, ref) => {
  const input = React.useRef<HTMLTextAreaElement>(null);
  React.useImperativeHandle(ref, () => input.current!);
  return <TextEditMenu target={input} clear={onClear}><textarea ref={input} className={cn("ui-textarea flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} /></TextEditMenu>;
});
Textarea.displayName = "Textarea";
