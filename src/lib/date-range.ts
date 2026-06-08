export type RangePresetId =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "this_month"
  | "last_month"
  | "closing_current"
  | "closing_previous"
  | "custom";

export type DateRange = {
  presetId: RangePresetId;
  start: Date; // 00:00:00 local
  end: Date;   // 23:59:59.999 local (inclusive)
  label: string;
};

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };

const fmtBR = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtMonth = (d: Date) => d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const fmtRange = (s: Date, e: Date) => `${fmtBR(s)} – ${fmtBR(e)}`;

/** Ciclo de fechamento: dia 11 do mês anterior até dia 10 do mês de referência (inclusive). */
export function closingCycleFor(ref: Date): { start: Date; end: Date } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  // se ref é >= dia 11, o ciclo atual termina dia 10 do mês seguinte
  if (ref.getDate() >= 11) {
    return { start: startOfDay(new Date(y, m, 11)), end: endOfDay(new Date(y, m + 1, 10)) };
  }
  return { start: startOfDay(new Date(y, m - 1, 11)), end: endOfDay(new Date(y, m, 10)) };
}

export function previousClosingCycle(ref: Date) {
  const cur = closingCycleFor(ref);
  const prevRef = addDays(cur.start, -1);
  return closingCycleFor(prevRef);
}

export function rangeFromPreset(id: RangePresetId, now = new Date()): DateRange {
  switch (id) {
    case "today": {
      const s = startOfDay(now), e = endOfDay(now);
      return { presetId: id, start: s, end: e, label: `Hoje (${fmtBR(s)})` };
    }
    case "yesterday": {
      const y = addDays(now, -1);
      const s = startOfDay(y), e = endOfDay(y);
      return { presetId: id, start: s, end: e, label: `Ontem (${fmtBR(s)})` };
    }
    case "last7": {
      const s = startOfDay(addDays(now, -6)), e = endOfDay(now);
      return { presetId: id, start: s, end: e, label: `Últimos 7 dias` };
    }
    case "last30": {
      const s = startOfDay(addDays(now, -29)), e = endOfDay(now);
      return { presetId: id, start: s, end: e, label: `Últimos 30 dias` };
    }
    case "this_month": {
      const s = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      const e = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { presetId: id, start: s, end: e, label: fmtMonth(s) };
    }
    case "last_month": {
      const s = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const e = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      return { presetId: id, start: s, end: e, label: fmtMonth(s) };
    }
    case "closing_current": {
      const { start, end } = closingCycleFor(now);
      return { presetId: id, start, end, label: `Ciclo ${fmtRange(start, end)}` };
    }
    case "closing_previous": {
      const { start, end } = previousClosingCycle(now);
      return { presetId: id, start, end, label: `Ciclo anterior ${fmtRange(start, end)}` };
    }
    case "custom":
    default: {
      const s = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      const e = endOfDay(now);
      return { presetId: "custom", start: s, end: e, label: fmtRange(s, e) };
    }
  }
}

export function customRange(startISO: string, endISO: string): DateRange {
  const s = startOfDay(new Date(startISO + "T00:00:00"));
  const e = endOfDay(new Date(endISO + "T00:00:00"));
  return { presetId: "custom", start: s, end: e, label: fmtRange(s, e) };
}

/** Para colunas timestamp (gte start, lt endExclusive) */
export const toISO = (d: Date) => d.toISOString();
export const endExclusiveISO = (end: Date) => new Date(end.getTime() + 1).toISOString();

/** Para colunas date (YYYY-MM-DD inclusivo) */
export const toDateStr = (d: Date) => {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const DEFAULT_PRESET: RangePresetId = "this_month";
