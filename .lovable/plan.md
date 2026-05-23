## Contexto

Hoje o cadastro de produto guarda 1 estoque único (`products.stock`). Para uma base com várias cores, isso não basta — cada cor precisa do próprio saldo, SKU e movimentações.

## Mudança proposta

**Produto** continua sendo o "pai" (nome, marca, categoria, preço, custo, foto) — cadastrado na tela de **Precificação**.
**Variante** é o filho que realmente entra no estoque (ex.: "Base Make 3 — cor 02 Bege Claro"). Cada venda e movimentação aponta para uma variante.

### Banco de dados

Nova tabela `product_variants`:
- `product_id` (vínculo com o produto)
- `name` (ex.: "Cor 02 - Bege Claro", "Tom Médio", "30ml")
- `sku` (código próprio da variante, opcional)
- `barcode` (opcional)
- `stock` e `min_stock`
- `extra_cost` e `extra_price` (ajuste opcional sobre o produto pai, p/ casos em que o tamanho muda o preço)
- `status` (ativo/inativo)

Ajustes em tabelas existentes:
- `products`: marcar `has_variants` (boolean). Quando true, o estoque do produto deixa de ser usado e passa a somar o estoque das variantes.
- `stock_movements`: adicionar `variant_id` (opcional — usado quando o produto tem variantes).
- `order_items`: adicionar `variant_id` e `variant_name` (snapshot).

### Telas

1. **Precificação / Produtos**: ao cadastrar um produto, marcar se "tem variações". Se sim, abre uma sub-lista para adicionar/editar variantes (nome, SKU, custo extra, preço extra).
2. **Estoque**: o seletor de produto vira "produto → variante" quando houver. Lista de saldos passa a mostrar uma linha por variante.
3. **Vendas (Pedidos)**: ao adicionar item ao pedido, se o produto tem variantes, obriga escolher qual cor/tom.
4. **Dashboard**: alerta de estoque baixo passa a considerar variantes.

### Migração de dados

Os produtos já cadastrados ficam como "sem variantes" (mantém `products.stock`). Nada se perde.

## O que NÃO vou mudar agora

- Importação em massa de variantes
- Fotos por variante (usa a foto do produto pai)
- Histórico de preços por variante

Se aprovar, eu rodo a migração, atualizo as 4 telas e o cálculo de baixa de estoque automática nos pedidos.
