import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className={`p-5 shadow-card ${accent ? "bg-gradient-brand text-primary-foreground border-transparent" : ""}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`text-xs uppercase tracking-wider font-medium ${accent ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
          {label}
        </span>
        {Icon && <Icon className={`h-4 w-4 ${accent ? "text-primary-foreground/80" : "text-primary"}`} />}
      </div>
      <div className="text-2xl font-bold tracking-tight font-display">{value}</div>
      {hint && <div className={`text-xs mt-1 ${accent ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{hint}</div>}
    </Card>
  );
}