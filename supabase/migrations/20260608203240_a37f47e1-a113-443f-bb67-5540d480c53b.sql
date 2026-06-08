CREATE TABLE public.closing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('recebido','pago')),
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmado' CHECK (status IN ('pendente','confirmado')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.closing_payments TO authenticated;
GRANT ALL ON public.closing_payments TO service_role;

ALTER TABLE public.closing_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team can view closing_payments" ON public.closing_payments
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "team can insert closing_payments" ON public.closing_payments
  FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "team can update closing_payments" ON public.closing_payments
  FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "team can delete closing_payments" ON public.closing_payments
  FOR DELETE TO authenticated USING (public.is_team_member(auth.uid()));

CREATE INDEX idx_closing_payments_period ON public.closing_payments(period_start, period_end);

CREATE TRIGGER set_closing_payments_updated_at
  BEFORE UPDATE ON public.closing_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();