import { useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronsUpDown, LoaderCircle, Search } from "lucide-react";
import { api } from "../api";
import { fontStack } from "../lib/fonts";
import type { SystemFont } from "../types";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

const rowHeight = 34;
const listHeight = 238;
const overscan = 3;
const searchKey = (text: string) => text.normalize("NFKC").toLowerCase();
const defaultFont: SystemFont = { family: "", display_name: "默认字体", aliases: ["Segoe UI", "Microsoft YaHei", "微软雅黑", "default"] };

export function FontPicker({ value, onChange, disabled }: { value: string; onChange: (family: string) => void; disabled?: boolean }) {
  const id = useId();
  const listId = id + "-list";
  const [open, setOpen] = useState(false);
  const [fonts, setFonts] = useState<SystemFont[] | null>(api.cachedFonts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [active, setActive] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(listHeight);
  const input = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const options = useMemo(() => [defaultFont, ...(fonts ?? [])].map(font => ({
    ...font, search: searchKey([font.family, font.display_name, ...font.aliases].join("\n")),
  })), [fonts]);
  const filtered = useMemo(() => {
    const words = searchKey(deferredQuery).trim().split(/\s+/).filter(Boolean);
    return options.filter(font => words.every(word => font.search.includes(word)));
  }, [options, deferredQuery]);
  const selected = fonts?.find(font => font.family === value);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(filtered.length, start + Math.ceil(viewportHeight / rowHeight) + overscan * 2);
  const activeId = active >= start && active < end ? id + "-option-" + active : undefined;
  const setOpened = (next: boolean) => { setQuery(""); setOpen(next); };

  useEffect(() => {
    if (!open || fonts) return;
    let disposed = false;
    setLoading(true);
    setError("");
    void api.listFonts().then(result => { if (!disposed) { setLoading(false); setFonts(result); } })
      .catch(reason => { if (!disposed) setError("无法读取字体：" + String(reason)); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [open, retry, fonts]);

  useLayoutEffect(() => {
    if (!open) return;
    const index = deferredQuery.trim() ? 0 : Math.max(0, filtered.findIndex(font => font.family === value));
    setActive(index);
    const top = Math.max(0, index * rowHeight - rowHeight * 2);
    setScrollTop(top);
    if (viewport.current) viewport.current.scrollTop = top;
  }, [open, filtered, deferredQuery, value]);

  useEffect(() => {
    const node = viewport.current;
    if (!open || !node) return;
    const observer = new ResizeObserver(() => setViewportHeight(node.clientHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, [open]);

  const move = (index: number) => {
    const next = Math.max(0, Math.min(filtered.length - 1, index));
    setActive(next);
    const node = viewport.current;
    if (!node) return;
    const top = next * rowHeight;
    if (top < node.scrollTop) node.scrollTop = top;
    else if (top + rowHeight > node.scrollTop + node.clientHeight) node.scrollTop = top + rowHeight - node.clientHeight;
    setScrollTop(node.scrollTop);
  };
  const choose = (family: string) => { onChange(family); setOpened(false); };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (filtered[active]) choose(filtered[active].family);
    } else if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const page = Math.max(1, Math.floor(viewportHeight / rowHeight));
      const next = event.key === "Home" ? 0 : event.key === "End" ? filtered.length - 1 : active + ({ ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page }[event.key] ?? 0);
      move(next);
    }
  };

  return <div className="font-setting">
    <div className="field-row">
      <Label className="field-label" htmlFor={id}>字体</Label>
      <Popover open={open} onOpenChange={setOpened}>
        <PopoverTrigger asChild><Button id={id} variant="outline" role="combobox" aria-label="字体" aria-controls={open ? listId : undefined} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} className="min-w-0 flex-1 justify-between font-normal">
          <span className="truncate">{value ? selected?.display_name ?? value : "默认字体（Segoe UI / 微软雅黑）"}</span><ChevronsUpDown className="opacity-50" />
        </Button></PopoverTrigger>
        <PopoverContent className="font-popover" onOpenAutoFocus={event => { event.preventDefault(); input.current?.focus(); }}>
          <div className="font-search"><Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input ref={input} aria-label="搜索字体" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls={listId} aria-activedescendant={activeId} placeholder="搜索字体名称…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={onKeyDown} className="border-0 shadow-none focus-visible:ring-0" />
          </div>
          {loading && <div className="font-list-message" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />正在读取已安装字体…</div>}
          {error && <div className="font-list-message" role="alert"><span>{error}</span><Button variant="ghost" size="sm" onClick={() => setRetry(count => count + 1)}>重试</Button></div>}
          <div ref={viewport} id={listId} role="listbox" aria-label="字体列表" aria-busy={loading || query !== deferredQuery} className="font-options" onScroll={event => setScrollTop(event.currentTarget.scrollTop)} onWheelCapture={event => {
            const node = event.currentTarget;
            const max = node.scrollHeight - node.clientHeight;
            if (max <= 0 || event.deltaY === 0) return;
            const delta = event.deltaMode === 1 ? event.deltaY * rowHeight : event.deltaY;
            event.preventDefault();
            event.stopPropagation();
            node.scrollTop = Math.max(0, Math.min(max, node.scrollTop + delta));
            setScrollTop(node.scrollTop);
          }}>
            <div className="relative" style={{ height: filtered.length * rowHeight }}>
              {filtered.slice(start, end).map((font, offset) => {
                const index = start + offset;
                return <div id={id + "-option-" + index} key={font.family} role="option" aria-selected={font.family === value} aria-posinset={index + 1} aria-setsize={filtered.length} title={font.display_name === font.family ? font.family : font.display_name + " / " + font.family}
                  className={cn("font-option", index === active && "bg-accent text-accent-foreground")}
                  style={{ height: rowHeight, top: index * rowHeight }}
                  onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(font.family)}>
                  <Check className={cn("h-4 w-4 shrink-0", font.family !== value && "invisible")} />
                  <span className="truncate">{font.display_name}</span>
                  {font.family && font.family !== font.display_name && <span className="ml-auto truncate text-xs text-muted-foreground">{font.family}</span>}
                </div>;
              })}
            </div>
            {!loading && !error && filtered.length === 0 && <div className="font-list-message" role="status">未找到匹配的字体</div>}
          </div>
          <div className="font-list-footer">{loading ? "正在加载…" : "可选字体：" + filtered.length}</div>
        </PopoverContent>
      </Popover>
    </div>
    <div className="font-preview" aria-label="字体预览" style={{ fontFamily: fontStack(value) }}>视频压制 · 字体预览 AaBb 0123456789</div>
    {fonts && value && !selected && <span className="text-xs text-muted-foreground">此字体当前未安装，界面将使用备用字体。</span>}
  </div>;
}
