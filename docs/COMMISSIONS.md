# Comissões — regras configuráveis e decisões pendentes

As regras de comissão são **dados**, não código. Cada pessoa beneficiária tem um
plano por unidade (`commission_plans`), com faixas (`commission_plan_tiers`),
metas por período (`commission_goals`) e apurações (`commission_statements`).

## Referência inicial informada pela direção

| Modelo (tela "Novo plano a partir de modelo") | Tipo de meta | Faixas |
|---|---|---|
| Meta individual (referência inicial das vendedoras) | individual | 0,8% abaixo de 100% da meta; 2% ao atingir 100% |
| Meta coletiva (referência inicial da gerente) | coletiva | 0,5% abaixo de 100% da meta; 1,5% ao atingir 100% |

A referência foi dada para Maria Clara e Clara (meta individual) e Ivny (meta
coletiva). **Os nomes não estão no código**: o plano é criado na tela,
escolhendo a pessoa beneficiária entre as pessoas da unidade.

## Parâmetros que NÃO foram presumidos

Todo plano nasce em **rascunho** com estes parâmetros vazios ("a confirmar"). O
banco **impede ativar e apurar** enquanto algum estiver vazio.

| Parâmetro | Opções disponíveis | Pergunta para a direção |
|---|---|---|
| Fonte do faturamento | comandas finalizadas no sistema · pagamentos recebidos nas comandas · valor informado manualmente na apuração | De onde vem o número que conta para a meta? |
| Base de cálculo | vendas em que a pessoa é a vendedora · serviços realizados pela pessoa · todas as vendas da unidade | Para meta individual, contam as vendas *registradas* como dela ou os serviços que ela *executou*? A meta coletiva é a unidade inteira? |
| Itens considerados | serviços e produtos · só serviços · só produtos | Produtos entram na comissão? |
| Valor considerado | valor dos itens (antes do desconto da comanda) · valor líquido (após desconto) | Descontos concedidos reduzem a base? |
| Período | mensal, com dia de início (1–28) | O mês da comissão é o mês civil (dia 1) ou fecha em outra data? |
| Estornos | excluir canceladas até a apuração (sem desconto posterior) · descontar no período do cancelamento | Se uma venda é cancelada depois de a comissão ter sido apurada/paga, o valor é descontado depois? |
| Aplicação das faixas | taxa da faixa atingida sobre toda a base · progressiva (cada faixa sobre a sua parte) | Ao atingir a meta, os 2% valem sobre **todo** o faturamento ou só sobre o que passou da meta? |

Também a decidir fora do sistema:

- Metas de cada pessoa por período (cadastradas na tela de regras).
- Se a comissão é paga sobre valores **recebidos** (Pix, cartão com prazo,
  parcelado) ou **vendidos**.
- Tratamento de trocas, cortesias e vouchers.
- Data de pagamento e se a despesa vai para "Comissões" ou outra categoria.

## Regras garantidas pelo banco

- Ninguém cria, edita, apura, aprova ou paga a **própria** comissão.
- Plano ativo não muda regras nem faixas (volte para rascunho para alterar).
- Apuração exige plano ativo e meta cadastrada para o período; um período é
  apurado uma vez (cancelar a apuração para refazer).
- **Aprovação por pessoa diferente de quem apurou.**
- "Gerar pagamento" cria uma despesa prevista na categoria "Comissões" do
  financeiro (exige permissão financeira).
- A apuração guarda uma cópia dos parâmetros e das faixas usados.

## Visibilidade

| Quem | Vê |
|---|---|
| Admin Geral, Direção (`commissions.manage`) | Planos, metas e apurações da unidade |
| Gerente, Vendedora, Profissional (`commissions.view` próprio) | Só as próprias apurações e o próprio plano |

## Exemplos verificados nos testes (pgTAP)

| Situação | Resultado |
|---|---|
| Faturamento R$ 500, meta R$ 1.000, faixa sobre total | 50% → 0,8% → R$ 4,00 |
| Faturamento R$ 1.000, meta R$ 500, faixa sobre total | 200% → 2% → R$ 20,00 |
| Faturamento informado R$ 8.000, meta coletiva R$ 10.000 | 80% → 0,5% → R$ 40,00 |
| Serviços R$ 1.000, meta R$ 500, progressiva | 0,8% × R$ 500 + 2% × R$ 500 = R$ 14,00 |
