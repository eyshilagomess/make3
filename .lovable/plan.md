
# Dashboard auditável — plano de evolução

Objetivo: manter o layout atual do Dashboard, mas tornar **todo número clicável**, com fórmula, origem dos dados e lista dos registros que compõem o valor. Reorganizar o financeiro (CMV puro, categorias próprias para embalagem/frete/etc.), adicionar análise financeira por pedido e por produto, e novos indicadores.

---

## 1. Componente reutilizável: `MetricDrillDown`

Criar `src/components/MetricDrillDown.tsx` — um `Dialog` padrão que toda métrica clicável abre. Recebe:

- `label` — nome da métrica
- `value` — valor exibido
- `formula` — string legível (ex.: `Receita líquida − CMV − Taxas − Gastos`)
- `sources` — lista de origens (ex.: `tabela orders`, `tabela order_items.unit_cost`, `tabela expenses`)
- `rows` — array de registros que compõem o valor, com colunas configuráveis e link para a página de origem (pedido, produto, gasto)
- `breakdown` — opcional, sub-totais (ex.: por canal, por categoria)

Todos os `StatCard` viram clicáveis (wrap em `button`) e cada linha da DRE também. `StatCard` ganha prop opcional `onClick`.

## 2. Reorganização financeira / categorias próprias

Atualmente `expenses.category` é texto livre. Definir categorias canônicas no front (sem migration — apenas convenção + dropdown):

- `embalagem` (sacola, papel seda, adesivo, caixa)
- `brinde`
- `marketing`
- `frete_subsidio` (diferença entre frete cobrado e frete pago à transportadora)
- `operacional` (chip, internet, aluguel…)
- `outros`

Atualizar `gastos.tsx` para usar `Select` com essas categorias (mantendo "outros" como livre via `notes`).

DRE no Dashboard passa a mostrar:

```
Receita bruta (produtos)
− Descontos
+ Frete cobrado
= Receita líquida
− CMV (apenas custo do produto)
= Lucro bruto  → Margem bruta %
− Taxas de canal (Site/Shopee/TikTok)
− Taxas de maquininha (Infinity Pay)
− Embalagem
− Brindes
− Frete subsidiado
− Marketing
− Operacional
= Lucro líquido → Margem líquida %
```

Cada linha é clicável e abre o `MetricDrillDown` com os registros (pedidos/itens/gastos) que somaram aquele valor.

**CMV** continua = `Σ order_items.unit_cost × quantity` apenas. Embalagem etc. saem do CMV e viram linhas próprias alimentadas por `expenses` filtrado por categoria.

## 3. Produtos — campos novos e histórico de custo

Migration (nova tabela + colunas):

- `products.avg_cost numeric` (custo médio ponderado, atualizado quando entra estoque)
- nova tabela `product_cost_history(id, product_id, old_cost, new_cost, changed_by, changed_at, reason)` com RLS de equipe + GRANTs.
- Trigger em `products` BEFORE UPDATE: se `cost` mudou, insere linha em `product_cost_history`.

Na tela de Produtos adicionar colunas/linhas:

- Custo de compra (`cost`)
- Custo médio (`avg_cost`)
- Preço de venda (`price`)
- Lucro unitário = `price − cost`
- Margem % = `(price − cost) / price × 100`
- Botão "Histórico de custo" abre dialog listando `product_cost_history`.

## 4. Pedidos — análise financeira individual

No detalhe do pedido (já existe modal "Ver detalhes"), adicionar bloco **Análise financeira**:

```
Valor vendido         = orders.total
− Custo dos produtos  = Σ items.unit_cost × qty
− Taxa de canal       = total × fee(channel)
− Taxa de maquininha  = Σ infinityPayFeeAmount(...)
− Custos adicionais   = (rateio opcional embalagem por pedido — fora do MVP, exibir 0)
= Lucro do pedido
Margem %              = lucro / total × 100
```

Cada valor mostra a fórmula em tooltip e tem link "ver itens".

## 5. Novos indicadores no Dashboard

Nova seção "Indicadores" abaixo do "Onde está o dinheiro":

- Ticket médio (já existe)
- **Margem média por pedido** = média de margem % dos pedidos do mês
- **Lucro por categoria** — agregado de `products.category` × itens vendidos
- **Lucro por produto** — top/bottom 5 (Mais lucrativos / Menos lucrativos)
- **Giro de estoque** = `Σ qty vendida no mês / estoque médio` por produto (mostra top giro)
- **Estoque crítico** = produtos com `stock ≤ min_stock` (já existe, manter)

Cada bloco com cabeçalho clicável que abre drill-down completo.

## 6. Rastreabilidade / auditoria

- Toda linha da DRE e todo StatCard abre `MetricDrillDown` mostrando: **fórmula**, **fontes** (tabelas), **registros base** com link.
- Para "última atualização": exibir `MAX(updated_at)` da tabela origem no rodapé do dialog.
- `product_cost_history` cobre auditoria de custo. Para pedidos/gastos os campos `updated_at` + `created_by` já existem e serão exibidos no drill-down.

## 7. Arquivos afetados

- **Migration**: `products.avg_cost`, tabela `product_cost_history` + trigger + RLS + GRANTs.
- **Novos**: `src/components/MetricDrillDown.tsx`, `src/lib/finance.ts` (helpers de fórmulas/categorias).
- **Editados**: `src/routes/_authenticated/dashboard.tsx` (clicabilidade + nova DRE + indicadores), `src/routes/_authenticated/produtos.tsx` (campos novos + histórico), `src/routes/_authenticated/pedidos.tsx` (bloco análise), `src/routes/_authenticated/gastos.tsx` (categorias canônicas), `src/components/StatCard.tsx` (prop `onClick`).

## 8. Fora do escopo deste plano

- Rateio automático de embalagem por pedido (mostrado como 0 no MVP; pode entrar em iteração futura).
- Histórico de alteração de preço de venda (apenas custo no MVP — diga se quer incluir preço também).
- Exportação dos drill-downs para Excel (fácil de adicionar depois usando `downloadXLSX`).

Confirme para eu executar (vai gerar 1 migration + edições nos arquivos acima).
