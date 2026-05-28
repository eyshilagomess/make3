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
import { Plus, Trash2, Download, Receipt, Pencil, Upload, Sparkles, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { downloadXLSX } from "@/lib/export";
import { useServerFn } from "@tanstack/react-start";
import { extractFromImage } from "@/lib/extract-invoice.functions";

export const Route = createFileRoute("/_authenticated/gastos")({
  head: () => ({ meta: [{ title: "Gastos — Make 3" }] }),
  component: Page,
});

const CATEGORIES = ["Marketing", "Sacolas / Embalagem", "Chip / Telefone", "Aluguel", "Salários", "Software", "Frete", "Impostos", "Outros"];

type Form = { category: string; amount: string; expense_date: string; notes: string; photo_url: string };
const today = () => new Date().toISOString().slice(0, 10);
const empty = (): Form => ({ category: CATEGORIES[0], amount: "", expense_date: today(), notes: "", photo_url: "" });

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let bin = ""; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function Page() {
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const extract = useServerFn(extractFromImage);

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

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const payload: any = {
        category: f.category,
        amount: Number(f.amount || 0),
        expense_date: f.expense_date,
        notes: f.notes || null,
        photo_url: f.photo_url || null,
      };
      if (editingId) {
        const { error } = await (supabase as any).from("expenses").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("expenses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(editingId ? "Gasto atualizado" : "Gasto registrado!");
      setOpen(false); setEditingId(null); setForm(empty());
    },
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

  const onUploadPhoto = async (file: File, runAI: boolean) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      const uid = user.user?.id ?? "anon";
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${uid}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("expense-receipts").upload(path, file);
      if (up.error) throw up.error;
      setForm((f) => ({ ...f, photo_url: path }));
      toast.success("Foto enviada");
      if (runAI) {
        setAiBusy(true);
        try {
          const b64 = await fileToBase64(file);
          const result: any = await extract({ data: { imageBase64: b64, mimeType: file.type || "image/jpeg", kind: "receipt" } });
          setForm((f) => ({
            ...f,
            category: CATEGORIES.includes(result.category) ? result.category : f.category,
            amount: result.amount ? String(result.amount) : f.amount,
            expense_date: result.expense_date || f.expense_date,
            notes: result.notes || f.notes,
          }));
          toast.success("Dados extraídos da imagem");
        } catch (e: any) {
          toast.error("Não consegui ler a imagem: " + e.message);
        } finally { setAiBusy(false); }
      }
    } catch (e: any) { toast.error(e.message); }
  };

  const openEdit = (r: any) => {
    setEditingId(r.id);
    setForm({
      category: r.category, amount: String(r.amount ?? 0),
      expense_date: r.expense_date, notes: r.notes ?? "",
      photo_url: r.photo_url ?? "",
    });
    setOpen(true);
  };
  const openNew = () => { setEditingId(null); setForm(empty()); setOpen(true); };

  const openPhoto = async (path: string) => {
    const { data, error } = await supabase.storage.from("expense-receipts").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  const rows: any[] = data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const byCategory = rows.reduce<Record<string, number>>((acc, r) => { acc[r.category] = (acc[r.category] || 0) + Number(r.amount ?? 0); return acc; }, {});

  const exportXLSX = () => {
    const detalhes = rows.map(r => ({ Data: r.expense_date, Categoria: r.category, Valor: Number(r.amount), Observação: r.notes ?? "", "Tem recibo": r.photo_url ? "sim" : "não" }));
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
            <Button className="bg-gradient-brand text-primary-foreground border-0 shadow-glow" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo gasto</Button>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(empty()); } }}>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{editingId ? "Editar gasto" : "Registrar gasto"}</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Recibo / cupom (opcional)</Label>
                    <div className="flex items-center gap-2">
                      <label className="flex-1 cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadPhoto(f, false); }} />
                        <span className="inline-flex h-9 w-full items-center justify-center rounded-md border border-input px-3 text-sm hover:bg-muted"><Upload className="h-4 w-4 mr-1" /> Subir foto</span>
                      </label>
                      <label className="flex-1 cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" disabled={aiBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadPhoto(f, true); }} />
                        <span className="inline-flex h-9 w-full items-center justify-center rounded-md border border-primary/40 bg-primary/5 px-3 text-sm hover:bg-primary/10"><Sparkles className="h-4 w-4 mr-1 text-primary" /> {aiBusy ? "Lendo…" : "Subir + IA"}</span>
                      </label>
                    </div>
                    {form.photo_url && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Foto anexada</p>}
                  </div>
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
                    <Button type="submit" disabled={save.isPending} className="bg-gradient-brand text-primary-foreground border-0">{save.isPending ? "Salvando…" : "Salvar"}</Button>
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
              <TableHead>Recibo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">Nenhum gasto neste mês.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{new Date(r.expense_date + "T00:00:00").toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="font-medium">{r.category}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{r.notes ?? "—"}</TableCell>
                <TableCell>{r.photo_url ? <Button size="sm" variant="ghost" onClick={() => openPhoto(r.photo_url)}><ImageIcon className="h-4 w-4" /></Button> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{brl(Number(r.amount))}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm("Excluir gasto?")) remove.mutate(r.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}