import { useId } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import type { ParamSet } from "../types";

export function Field({ label, value, onChange, onBrowse, placeholder, compact = false, className = "", disabled = false }: {
  label: string; value: string; onChange: (value: string) => void; onBrowse?: () => void;
  placeholder?: string; compact?: boolean; className?: string; disabled?: boolean;
}) {
  const id = useId();
  return <div className={`field-row ${className}`}><label className="field-label" htmlFor={id}>{label}</label>
    <Input id={id} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} />
    {onBrowse && <Button variant="outline" size={compact ? "icon" : "md"} title={`浏览${label}`} aria-label={`浏览${label}`} onClick={onBrowse}><FolderOpen size={16} />{!compact && "浏览"}</Button>}
  </div>;
}

export function Check({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return <div className={`check-row ${disabled ? "disabled" : ""}`}><Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={value => onChange(value === true)} /><Label htmlFor={id}>{label}</Label></div>;
}

export function Segmented({ items, value, onChange, label }: { items: readonly string[]; value: string; onChange: (value: string) => void; label: string }) {
  const labels: Record<string, string> = { with_sub: "有字幕", no_sub: "无字幕", tray: "最小化到托盘", exit: "直接退出", encode: "压制", mux: "封装" };
  return <ToggleGroup className="segmented" type="single" value={value} onValueChange={next => { if (next) onChange(next); }} aria-label={label}>{items.map(item => <ToggleGroupItem key={item} value={item}>{labels[item] ?? item}</ToggleGroupItem>)}</ToggleGroup>;
}

export function Parameters({ value, onChange }: { value: ParamSet; onChange: (patch: Partial<ParamSet>) => void }) {
  const id = useId();
  const fields = value.enable_2pass ? ([['pass1', 'Pass 1 参数'], ['pass2', 'Pass 2 参数']] as const) : ([['crf', 'CRF / 单次参数']] as const);
  return <div className={`params-grid ${value.enable_2pass ? "two-pass" : ""}`}>{fields.map(([key, label]) => <div className="param-field" key={key}>
    <label className="field-label" htmlFor={`${id}-${key}`}>{label}</label><Textarea id={`${id}-${key}`} value={value[key]} onChange={event => onChange({ [key]: event.target.value })} />
  </div>)}</div>;
}
