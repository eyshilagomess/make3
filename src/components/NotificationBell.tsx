import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type N = { id: string; type: string; title: string; message: string | null; read: boolean; created_at: string; data: any };

export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as N[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`notifications-feed-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const n = payload.new as N;
          toast.info(n.title, { description: n.message ?? undefined });
          qc.invalidateQueries({ queryKey: ["notifications"] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const unread = (data ?? []).filter((n) => !n.read).length;

  const markAllRead = async () => {
    const ids = (data ?? []).filter((n) => !n.read).map((n) => n.id);
    if (!ids.length) return;
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full px-1 text-[10px]">
              {unread > 99 ? "99+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="font-medium">Notificações</div>
          <Button variant="ghost" size="sm" onClick={markAllRead}>Marcar lidas</Button>
        </div>
        <div className="max-h-96 overflow-auto">
          {(data ?? []).length === 0 && (
            <div className="p-4 text-sm text-muted-foreground text-center">Sem notificações</div>
          )}
          {(data ?? []).map((n) => (
            <div key={n.id} className={`p-3 border-b text-sm ${n.read ? "" : "bg-muted/40"}`}>
              <div className="font-medium">{n.title}</div>
              {n.message && <div className="text-muted-foreground text-xs mt-0.5">{n.message}</div>}
              <div className="text-[10px] text-muted-foreground mt-1">
                {new Date(n.created_at).toLocaleString("pt-BR")}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}