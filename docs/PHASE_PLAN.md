# Plano de fases

Escopo de referência definido pelo responsável pelo projeto em 2026-10-24.
Cada fase entrega banco (migração própria), permissões, telas e testes, e
atualiza a documentação. Situação atual de cada fase no fim deste arquivo.

## Fase 0 — Fundação, segurança e acessos

- Validar migrações e segurança no Supabase oficial (stack local; depois projeto
  Cloud exclusivo de desenvolvimento, com Security Advisor).
- Auth por convite (cadastro público desativado).
- MFA obrigatório para Direção e Admin Geral.
- Gestão de pessoas e permissões: perfis editáveis (Admin Geral, Direção,
  Gerente, Vendedora, Recepção, Profissional, Somente leitura), unidades,
  módulos, ações, escopo e exceções individuais; ninguém altera as próprias
  permissões; toda concessão auditada.

## Fase 1 — Operação diária

- Clientes/CRM com identidade única e vínculo separado por unidade; notas e
  histórico de CRM por unidade; possíveis duplicidades apresentadas para
  revisão, sem mescla automática.
- Serviços, profissionais e agenda; profissionais veem só a própria agenda com
  os dados mínimos da cliente.
- Vendas/comandas: abrir, vender, finalizar, registrando quem abriu, quem
  vendeu e quem finalizou.
- Estoque e dashboard operacional.

## Fase 2 — Importação do Trinks

- Importação controlada por CSV: prévia, deduplicação e conferência antes de
  gravar. Nenhuma API do Trinks é presumida.

## Fase 3 — Financeiro

- Fluxo de caixa, despesas/receitas, conciliação (CSV de banco/adquirente até
  haver API e credenciais confirmadas) e comissões com regras configuráveis.
- Referência inicial de comissões (a confirmar): vendedoras com meta individual
  — 0,8% abaixo de 100% da meta e 2% ao atingir; gerente com meta coletiva —
  0,5% abaixo de 100% e 1,5% ao atingir. Período, base de cálculo, estornos e
  fonte do faturamento ficam configuráveis e documentados como pendentes de
  confirmação.

## Fase 4 — Mensagens e relacionamento

- WhatsApp oficial, caixa de entrada, consentimento e opt-out, follow-up, SDR IA,
  pesquisa de satisfação e reengajamento de clientes inativas.
- Mensagens só podem ser ativadas com credenciais oficiais, consentimento e
  testes.

## Regras gerais

- Nada de deploy ou conexão com produção. Validação primeiro na stack local
  oficial; depois em projeto Cloud exclusivo de desenvolvimento.
- Sem dados reais de clientes em nenhum ambiente de desenvolvimento.
- Ao final de cada fase: o que foi implementado, testes executados, falhas
  corrigidas e o que depende de credenciais ou decisões externas
  (`docs/BUILD_AND_VALIDATION.md`).

## Situação

| Fase | Situação | Validação |
|---|---|---|
| 0 | Implementada | Stack local oficial: pgTAP, integração com usuários reais, E2E. Cloud de desenvolvimento: **pendente** (referência do projeto não informada). |
| 1 | Implementada | Stack local oficial: pgTAP, integração com usuários reais, E2E. Cloud: pendente. |
| 2 | Implementada (formato real do Trinks a conferir) | Stack local oficial: pgTAP, E2E com CSV fictício. Cloud: pendente. |
| 3 | Não iniciada | — |
| 4 | Não iniciada | — |
