import { useRef, useState, type ReactElement, type RefObject } from "react";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, Scissors, ClipboardPaste, Undo2, TextSelect, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { isDesktop } from "../../api";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from "./context-menu";

type TextControl = HTMLInputElement | HTMLTextAreaElement;
export function TextEditMenu({ target, children, clear }: { target: RefObject<TextControl | null>; children: ReactElement; clear?: () => void }) {
  const selection = useRef({ start: 0, end: 0 });
  const [selected, setSelected] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const capture = () => {
    const input = target.current;
    if (!input) return;
    selection.current = { start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0 };
    setSelected(selection.current.start !== selection.current.end);
    setReadOnly(input.readOnly || input.disabled);
  };
  const restore = () => {
    const input = target.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(selection.current.start, selection.current.end);
    return input;
  };
  const edit = async (action: "cut" | "copy" | "paste" | "undo" | "all") => {
    try {
      const input = restore();
      if (!input) return;
      if (action === "copy" || action === "cut") {
        const text = input.value.slice(selection.current.start, selection.current.end);
        if (isDesktop()) await writeText(text); else await navigator.clipboard.writeText(text);
        if (action === "cut") { restore(); document.execCommand("delete"); }
      } else if (action === "paste") {
        const text = isDesktop() ? await readText() : await navigator.clipboard.readText();
        restore();
        if (text !== null) document.execCommand("insertText", false, text);
      } else if (action === "undo") document.execCommand("undo");
      else input.select();
      capture();
    } catch (error) { toast.error("编辑操作失败：" + String(error)); }
  };
  return <ContextMenu onOpenChange={open => { if (open) capture(); }}>
    <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
    <ContextMenuContent onCloseAutoFocus={event => { event.preventDefault(); restore(); }}>
      <ContextMenuItem disabled={readOnly} onSelect={() => void edit("undo")}><Undo2 />撤销<ContextMenuShortcut>Ctrl+Z</ContextMenuShortcut></ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem disabled={readOnly || !selected} onSelect={() => void edit("cut")}><Scissors />剪切<ContextMenuShortcut>Ctrl+X</ContextMenuShortcut></ContextMenuItem>
      <ContextMenuItem disabled={!selected} onSelect={() => void edit("copy")}><Copy />复制<ContextMenuShortcut>Ctrl+C</ContextMenuShortcut></ContextMenuItem>
      <ContextMenuItem disabled={readOnly} onSelect={() => void edit("paste")}><ClipboardPaste />粘贴<ContextMenuShortcut>Ctrl+V</ContextMenuShortcut></ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => void edit("all")}><TextSelect />全选<ContextMenuShortcut>Ctrl+A</ContextMenuShortcut></ContextMenuItem>
      {clear && <><ContextMenuSeparator /><ContextMenuItem onSelect={clear}><Trash2 />清空日志</ContextMenuItem></>}
    </ContextMenuContent>
  </ContextMenu>;
}
