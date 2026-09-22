import * as React from "react";
import { cn } from "../../lib/utils";
import { TextEditMenu } from "./text-edit-menu";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, autoComplete = "off", spellCheck = false, autoCorrect = "off", autoCapitalize = "none", ...props }, ref) => {
  const input = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => input.current!);
  return <TextEditMenu target={input}><input ref={input} autoComplete={autoComplete} spellCheck={spellCheck} autoCorrect={autoCorrect} autoCapitalize={autoCapitalize} className={cn("ui-input flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} /></TextEditMenu>;
});
Input.displayName = "Input";
