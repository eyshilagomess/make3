
-- Unifica pagamentos do fechamento com gastos
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'saida';
ALTER TABLE public.expenses ADD CONSTRAINT expenses_kind_chk CHECK (kind IN ('saida','entrada'));
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmado';
ALTER TABLE public.expenses ADD CONSTRAINT expenses_status_chk CHECK (status IN ('confirmado','pendente'));

-- Migra lançamentos existentes do closing_payments para expenses
INSERT INTO public.expenses (category, amount, expense_date, notes, kind, status, created_by, created_at, updated_at)
SELECT
  COALESCE(NULLIF(description,''), 'Lançamento de fechamento') AS category,
  amount,
  paid_at AS expense_date,
  notes,
  CASE WHEN kind = 'recebido' THEN 'entrada' ELSE 'saida' END AS kind,
  status,
  created_by,
  created_at,
  updated_at
FROM public.closing_payments;

DROP TABLE IF EXISTS public.closing_payments;
