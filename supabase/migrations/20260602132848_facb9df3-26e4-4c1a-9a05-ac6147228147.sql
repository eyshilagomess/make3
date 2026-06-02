-- 1) Data de conclusão/pagamento no pedido
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Trigger: quando o pedido vira pago/concluído, preenche closed_at automaticamente
CREATE OR REPLACE FUNCTION public.set_order_closed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.payment_status::text = 'pago' OR NEW.status::text = 'concluido' OR NEW.status::text = 'concluído')
     AND NEW.closed_at IS NULL THEN
    NEW.closed_at = now();
  END IF;
  -- se voltar para pendente/cancelado, limpa
  IF (NEW.payment_status::text <> 'pago' AND NEW.status::text NOT IN ('concluido','concluído'))
     AND OLD.closed_at IS NOT NULL THEN
    NEW.closed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_closed_at ON public.orders;
CREATE TRIGGER orders_set_closed_at
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_order_closed_at();

-- Backfill: pedidos já pagos/concluídos sem closed_at recebem o updated_at
UPDATE public.orders
SET closed_at = COALESCE(updated_at, created_at)
WHERE closed_at IS NULL
  AND (payment_status::text = 'pago' OR status::text IN ('concluido','concluído'));

CREATE INDEX IF NOT EXISTS idx_orders_closed_at ON public.orders(closed_at);

-- 2) Tabela de fechamentos diários (snapshot + conferência de caixa)
CREATE TABLE public.daily_closings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  closing_date date NOT NULL UNIQUE,
  orders_count integer NOT NULL DEFAULT 0,
  gross_revenue numeric NOT NULL DEFAULT 0,
  discounts numeric NOT NULL DEFAULT 0,
  shipping numeric NOT NULL DEFAULT 0,
  net_revenue numeric NOT NULL DEFAULT 0,
  cogs numeric NOT NULL DEFAULT 0,
  channel_fees numeric NOT NULL DEFAULT 0,
  machine_fees numeric NOT NULL DEFAULT 0,
  expenses numeric NOT NULL DEFAULT 0,
  gross_profit numeric NOT NULL DEFAULT 0,
  net_profit numeric NOT NULL DEFAULT 0,
  wallet_calculated jsonb NOT NULL DEFAULT '{}'::jsonb,
  wallet_counted jsonb NOT NULL DEFAULT '{}'::jsonb,
  wallet_diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  closed_by uuid,
  closed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_closings TO authenticated;
GRANT ALL ON public.daily_closings TO service_role;

ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team read daily_closings" ON public.daily_closings
FOR SELECT TO authenticated USING (is_team_member(auth.uid()));

CREATE POLICY "Team write daily_closings" ON public.daily_closings
FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid()));

CREATE POLICY "Team update daily_closings" ON public.daily_closings
FOR UPDATE TO authenticated USING (is_team_member(auth.uid()));

CREATE POLICY "Admin/gerente delete daily_closings" ON public.daily_closings
FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente'));

CREATE TRIGGER daily_closings_updated_at
BEFORE UPDATE ON public.daily_closings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();