import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Download, Receipt } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { downloadXLSX } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/gastos")({
  head: () => ({ meta: [{ title: "Gastos — Make 3" }] }),
  component: Page,
});

const CATEGORIES = ["Marketing", "Sacolas / Embalagem", "Chip / Telefone", "Aluguel", "Salários", "Software", "Frete", "Impostos", "Outros"];

type Form = { category: string; amount: string; expense_date: string; notes: string };
const today = () => new Date().toISOString().slice(0, 10);
const empty = (): Form => ({ category: CATEGORIES[0], amount: "", expense_date: today(), notes: "" });

function Page() {
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty());

  const { start, end, label } = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const s = new Date(y, m - 1, 1);
    const e = new Date(y, m, 1);
    return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10), label: s.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
  }, [month]);

  const { data } = useQuery({
    queryKey: ["expenses", month],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("expenses").select("*").gte("expense_date", start).lt("expense_date", end).order("expense_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (f: Form) => {
      const payload = { category: f.category, amount: Number(f.amount || 0), expense_date: f.expense_date, notes: f.notes || null };
      const { error } = await (supabase as any).from("expenses").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Gasto registrado!"); setOpen(false); setForm(empty()); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Gasto excluído"); },
    onError: (e: any) => toast.error(e.message),
  });

  const rows: any[] = data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const byCategory = rows.reduce<Record<string, number>>((acc, r) => { acc[r.category] = (acc[r.category] || 0) + Number(r.amount ?? 0); return acc; }, {});

  const exportXLSX = () => {
    const detalhes = rows.map(r => ({ Data: r.expense_date, Categoria: r.category, Valor: Number(r.amount), Observação: r.notes ?? "" }));
    const resumo = Object.entries(byCategory).map(([Categoria, Total]) => ({ Categoria, Total }));
    downloadXLSX(`gastos-${month}.xlsx`, { Resumo: resumo, Detalhes: detalhes });
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Gastos"
        subtitle={`Despesas mensais — ${label}`}
        actions={
          <div className="flex items-center gap-2">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[170px]" />
            <Button variant="outline" onClick={exportXLSX}><Download className="h-4 w-4 mr-1" /> Baixar</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-brand text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4 mr-1" /> Novo gasto</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Registrar gasto</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); create.mutate(form); }} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Categoria *</Label>
                    <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Valor (R$) *</Label><Input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Data *</Label><Input type="date" required value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1.5"><Label>Observação</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button type="submit" disabled={create.isPending} className="bg-gradient-brand text-primary-foreground border-0">{create.isPending ? "Salvando…" : "Salvar"}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard accent label="Total do mês" value={brl(total)} icon={Receipt} hint={`${rows.length} lançamentos`} />
        {Object.entries(byCategory).slice(0, 3).map(([cat, val]) => (
          <StatCard key={cat} label={cat} value={brl(val)} hint={`${((val / (total || 1)) * 100).toFixed(0)}% do total`} />
        ))}
      </div>

      <Card className="p-4 shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Observação</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">Nenhum gasto neste mês.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{new Date(r.expense_date + "T00:00:00").toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="font-medium">{r.category}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{r.notes ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{brl(Number(r.amount))}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm("Excluir gasto?")) remove.mutate(r.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}