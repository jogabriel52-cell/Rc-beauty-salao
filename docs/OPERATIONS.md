# Operação

Regras de negócio e rotinas. **(banco)** = imposto pelo banco; o restante é
da interface ou de processo.

## Unidades

- **RC Beauty Geral** (`geral`) e **Sala VIP** (`vip`) operam separadas:
  profissionais, serviços, agenda, comandas, estoque, notas e CRM por unidade
  **(banco)**.
- Uma pessoa da equipe que atua nas duas unidades tem um vínculo em cada, com o
  perfil adequado a cada uma.
- Um profissional que atende nas duas unidades tem um cadastro de profissional
  em cada; conflitos de horário **entre** unidades não são detectados (pendência).

## Clientes

- **Identidade única**: nome, telefone, e-mail e nascimento são um cadastro só,
  usado por todas as unidades em que a cliente é atendida.
- **Vínculo por unidade**: observações de atendimento, CRM, agenda e comandas
  pertencem à unidade. Acesso a uma unidade não libera nada da outra **(banco)**.
- Telefone gravado só com dígitos e DDI (`55DDDNÚMERO`) **(banco)**.
- Antes de cadastrar, o sistema procura possíveis duplicidades:
  - **nesta unidade**: por nome, telefone ou e-mail;
  - **em outra unidade**: somente por telefone ou e-mail idênticos, mostrando
    apenas primeiro nome + inicial e os 4 últimos dígitos do telefone **(banco)**.
- A recepção escolhe: usar o cadastro desta unidade, **vincular** o cadastro de
  outra unidade (exige o mesmo telefone ou e-mail) ou criar um novo. Nada é
  mesclado automaticamente.
- **Observações de atendimento** (ex.: alergia) são vistas pelo profissional na
  própria agenda. **Notas privadas** vão no CRM e o profissional não vê.
- Clientes não são apagados: são arquivados **(banco)**.

### Revisão de duplicidades (Gerente, Direção, Admin Geral)

- Tela **Possíveis duplicidades**: pares da unidade com mesmo telefone, mesmo
  e-mail ou mesmo nome.
- **Mesclar**: escolhe o cadastro mantido; agenda, comandas e CRM da unidade
  passam para ele; o outro é arquivado com referência; campos vazios são
  completados **(banco)**. Outras unidades não são alteradas.
- **Não é duplicidade**: registra o motivo e o par sai da lista.

## CRM

- Registros (nota, ligação, WhatsApp, visita, e-mail, outro) por cliente e
  unidade, somente inclusão — correções são novos registros **(banco)**.
- Vendedoras registram; Recepção consulta; Profissional não vê (perfis
  iniciais, editáveis).

## Agenda

- Horários em `timestamptz`, exibidos em `America/Sao_Paulo` (UTC−3, sem
  horário de verão desde 2019).
- Cliente, profissional e serviço da mesma unidade **(banco)**; até 12 horas.
- Um profissional não tem dois atendimentos ativos sobrepostos **(banco)**;
  horários encostados são permitidos.

### Situações

```
agendado ──► confirmado ──► concluido
   │             │
   ├─────────────┼──► nao_compareceu
   └─────────────┴──► cancelado (exige motivo)
```

- Concluído, não compareceu e cancelado são finais; confirmado não volta para
  agendado **(banco)**.
- Quem cancelou e quando ficam registrados **(banco)**.
- Do agendamento é possível **abrir comanda** já com o serviço e o profissional.

## Comandas

- Numeração sequencial por unidade **(banco)**.
- Registram **quem abriu** (automático), **quem vendeu** (escolhido entre as
  pessoas ativas da unidade; se vazio, quem abriu) e **quem finalizou**
  (automático) **(banco)**.
- Itens de serviço (com profissional) e de produto; preço e descrição vêm do
  cadastro e podem ser ajustados enquanto a comanda está aberta.
- Desconto por item e por comanda; total calculado pelo banco **(banco)**.
- **Finalizar** exige ao menos um item e pagamentos que somem exatamente o
  total; baixa o estoque dos produtos **(banco)**.
- Comanda finalizada não é editada; para corrigir, **cancelar** (com motivo; o
  estoque volta) e abrir outra **(banco)**.
- Formas de pagamento: dinheiro, Pix, débito, crédito (com parcelas), voucher,
  outro.

## Estoque

- Saldo = soma dos movimentos; movimentos não são editados nem apagados
  **(banco)**.
- Entradas, saídas e ajustes manuais (saída e ajuste exigem motivo); baixas e
  estornos de venda só pelas comandas **(banco)**.
- Venda pode deixar saldo negativo (registro de estoque atrasado não trava o
  caixa); o painel destaca produtos abaixo do mínimo.

## Painel e relatórios

- **Painel** (dashboard.view): agenda do dia, vendas do dia e do mês, comandas
  abertas, serviços mais vendidos, estoque baixo, clientes novas no mês — cada
  bloco só aparece se o perfil tiver a permissão correspondente **(banco)**.
- **Relatórios** (reports.view): faturamento, ticket médio, por vendedor(a),
  serviços por profissional, formas de pagamento, por dia, itens vendidos,
  atendimentos por profissional.

## Importação do Trinks

Ver `docs/INTEGRATIONS.md`. Resumo: mapeamento conferido por outra pessoa;
prévia com classificação; decisão obrigatória nas possíveis duplicidades;
confirmação grava; mesmo arquivo não é importado duas vezes na unidade.
Rotina mensal do administrador do banco: `select public.import_purge_staging(30);`.

## Financeiro

- **Contas** (caixa, banco, adquirente, outro) com saldo inicial e
  **categorias** de receita e despesa por unidade (categorias iniciais criadas
  pela migração; editáveis).
- **Lançamentos**: previsto → pago (data e conta obrigatórias) ou cancelado
  (motivo obrigatório) **(banco)**. Valor de lançamento pago não muda;
  lançamento conciliado não muda valor, data, conta nem situação até desfazer a
  conciliação **(banco)**. Não há exclusão.
- **Fluxo de caixa**: realizado (pagos) e previsto (a receber/a pagar) por dia,
  por categoria e saldo das contas. As vendas das comandas podem ser incluídas
  quando não forem lançadas manualmente como receita — **a direção precisa
  definir qual prática adotar** para não contar em dobro.
- **Conciliação** (permissão própria): extrato CSV de banco ou adquirente com
  mapeamento das colunas no envio (data, descrição, valor ou crédito/débito);
  o mesmo arquivo não entra duas vezes na conta **(banco)**. Para cada linha:
  conciliar com sugestão (mesmo valor, tipo compatível, até 7 dias), criar
  lançamento a partir da linha (ex.: tarifa) ou ignorar com motivo. Conciliar
  um lançamento previsto o marca como pago na data e conta do extrato
  **(banco)**.

## Comissões

Ver `docs/COMMISSIONS.md` (parâmetros a confirmar, exemplos e regras).

## Rotinas administrativas

### Entrada de pessoa

1. Direção/Admin Geral convida em **Pessoas e acessos** (nome, e-mail, cargo,
   unidades, perfil).
2. Se for profissional, cadastrar em **Profissionais** e ligar ao usuário.
3. Perfis com MFA: acompanhar o primeiro acesso.

### Saída ou afastamento

1. Desativar a pessoa no mesmo dia, com motivo.
2. Desativar o cadastro de profissional depois de redistribuir a agenda futura.

### Revisão mensal de acessos

Tela **Auditoria** (concessões) e **Pessoas e acessos**. Consulta equivalente:

```sql
select u.name as unidade, p.full_name, ap.name as perfil, m.active
from public.unit_memberships m
join public.profiles p on p.id = m.user_id
join public.units u on u.id = m.unit_id
join public.access_profiles ap on ap.id = m.access_profile_id
order by u.name, ap.name, p.full_name;

select u.name, p.full_name, o.permission_code, o.effect, o.scope, o.reason
from public.membership_permission_overrides o
join public.unit_memberships m on m.id = o.membership_id
join public.profiles p on p.id = m.user_id
join public.units u on u.id = m.unit_id;
```

### Backup e incidentes

- Definir backup e testar restauração antes de dados reais (pendência P7).
- Suspeita de acesso indevido: desativar a conta, consultar a auditoria,
  preservar registros. Suspeita de vazamento de chave: revogar e investigar.
