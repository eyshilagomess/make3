
-- Expenses
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team read expenses" ON public.expenses FOR SELECT TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "Team write expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid()));
CREATE POLICY "Team update expenses" ON public.expenses FOR UPDATE TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "Admin/gerente delete expenses" ON public.expenses FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_expenses_date ON public.expenses(expense_date DESC);

-- Allocation config (single row, percentages summing to 100)
CREATE TABLE public.allocation_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_pct numeric NOT NULL DEFAULT 30,
  prolabore_pct numeric NOT NULL DEFAULT 40,
  expenses_pct numeric NOT NULL DEFAULT 30,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocation_config TO authenticated;
GRANT ALL ON public.allocation_config TO service_role;
ALTER TABLE public.allocation_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team read allocation" ON public.allocation_config FOR SELECT TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "Team write allocation" ON public.allocation_config FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid()));
CREATE POLICY "Team update allocation" ON public.allocation_config FOR UPDATE TO authenticated USING (is_team_member(auth.uid()));
CREATE TRIGGER allocation_updated_at BEFORE UPDATE ON public.allocation_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.allocation_config (investment_pct, prolabore_pct, expenses_pct) VALUES (30, 40, 30);
