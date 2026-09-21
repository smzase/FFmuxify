import * as React from "react";
import { cn } from "../../lib/utils";
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <section className={cn("ui-card rounded-xl border bg-card text-card-foreground shadow-sm", className)} {...props} />; }
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("card-header p-6", className)} {...props} />; }
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) { return <h2 className={cn("card-title font-semibold leading-none tracking-tight", className)} {...props} />; }
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("card-content p-6 pt-0", className)} {...props} />; }
