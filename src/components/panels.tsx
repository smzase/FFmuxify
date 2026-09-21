import { useEffect, useRef } from "react";
import { Play, Square, Trash2, X, GripVertical } from "lucide-react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle } from "./ui/card";
import { Textarea } from "./ui/textarea";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "./ui/context-menu";
import type { QueueTask } from "../types";

export type Metrics = { elapsed: string; time: string; speed: string; fps: string; bitrate: string };
export const emptyMetrics = (): Metrics => ({ elapsed: "00:00:00", time: "00:00:00.00", speed: "0.00x", fps: "0", bitrate: "0 kbits/s" });
type Controls = { start: () => void; stop: () => void; running: boolean; canStart: boolean };

export function QueuePanel({ queues, reorder, remove, clear, controls }: {
  queues: QueueTask[]; reorder: (from: string, to: string) => void; remove: (id: string) => void; clear: () => void; controls?: Controls;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [queues.length]);
  return <Card className="queue-panel"><CardHeader><CardTitle>任务队列</CardTitle><div className="panel-actions">
    {controls && <Button onClick={controls.running ? controls.stop : controls.start} disabled={!controls.running && !controls.canStart}>{controls.running ? <><Square size={15} />停止</> : <><Play size={15} />开始</>}</Button>}
    <Button variant="outline" onClick={clear} disabled={queues.some(q => q.status === "running")}><Trash2 size={15} />清空</Button>
  </div></CardHeader><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => { if (over && active.id !== over.id) reorder(String(active.id), String(over.id)); }} accessibility={{ screenReaderInstructions: { draggable: "按空格拾起任务，用上下方向键调整位置，再按空格放下；按 Escape 取消。" } }}>
    <SortableContext items={queues.map(task => task.id)} strategy={verticalListSortingStrategy}><div className="queue-list" ref={list}>
      {queues.map(task => <SortableTask key={task.id} task={task} remove={remove} />)}
    </div></SortableContext>
  </DndContext></Card>;
}

function SortableTask({ task, remove }: { task: QueueTask; remove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: task.status === "running", transition: { duration: 200, easing: "ease" } });
  return <ContextMenu><ContextMenuTrigger asChild>
      <div ref={setNodeRef} className={"queue-item " + task.status + " pass-" + task.pass + (isDragging ? " dragging" : "")} style={{ transform: CSS.Transform.toString(transform), transition }} onPointerDown={event => listeners?.onPointerDown?.(event)}>
        <div className="queue-main"><button ref={setActivatorNodeRef} {...attributes} {...listeners} className="queue-grip text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label={"调整任务位置 " + task.description} disabled={task.status === "running"}><GripVertical size={15} /></button><span className="queue-status" /><span>{task.description}</span></div>
        {task.status === "running" && <div className="progress-track" role="progressbar" aria-valuenow={Math.round(task.progress * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: Math.round(task.progress * 100) + "%" }} /></div>}
        <Button variant="ghost" size="icon" className="queue-remove" aria-label="移除任务" disabled={task.status === "running"} onPointerDown={event => event.stopPropagation()} onClick={() => remove(task.id)}><X size={14} /></Button>
      </div>
    </ContextMenuTrigger><ContextMenuContent><ContextMenuItem disabled={task.status === "running"} onSelect={() => remove(task.id)}><Trash2 size={14} />移除任务</ContextMenuItem></ContextMenuContent></ContextMenu>;
}

function LogView({ lines, label, clear }: { lines: string[]; label: string; clear: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [lines]);
  return <Textarea ref={ref} className="log-view" aria-label={label} readOnly value={lines.join("\n")} spellCheck={false} onClear={clear} />;
}

export function EncodeLogPanel({ metrics, log, clear, controls }: { metrics: Metrics; log: string[]; clear: () => void; controls: Controls }) {
  return <Card className="log-panel encode-log"><CardHeader><CardTitle>执行控制</CardTitle><div className="panel-actions">
    <Button disabled={controls.running || !controls.canStart} onClick={controls.start}><Play size={16} />开始压制</Button>
    <Button variant="outline" disabled={!controls.running} onClick={controls.stop}><Square size={15} />强制终止</Button>
  </div></CardHeader>
    <div className="metrics-row">{[["已用时间", metrics.elapsed], ["视频位置", metrics.time], ["压制速度", metrics.speed], ["FPS", metrics.fps], ["实时码率", metrics.bitrate]].map(([label, value]) => <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <LogView label="压制日志" lines={log} clear={clear} />
  </Card>;
}

export function MuxLogPanel({ muxLog, subsetLog, clearMux, clearSubset }: { muxLog: string[]; subsetLog: string[]; clearMux: () => void; clearSubset: () => void }) {
  return <Card className="log-panel mux-logs"><div className="log-section"><CardTitle>混流日志</CardTitle><LogView label="混流日志" lines={muxLog} clear={clearMux} /></div><div className="log-section"><CardTitle>子集日志</CardTitle><LogView label="子集日志" lines={subsetLog} clear={clearSubset} /></div></Card>;
}
