# Plano de fases

Cada fase tem escopo fechado e critérios de saída. Uma fase só começa quando a
anterior atingiu seus critérios, salvo decisão explícita do responsável pelo
projeto. Tabelas de uma fase não são criadas antecipadamente.

## Fase 0 — Fundação

**Escopo**

- Repositório Git com este pacote; proteção da branch principal.
- Projeto Supabase de desenvolvimento dedicado (`docs/CLOUD_SETUP.md`).
- Supabase CLI instalada; `supabase init`; stack local funcionando.
- Migração da Fase 1 aplicada no local e no desenvolvimento.
- Bootstrap do primeiro Admin Geral (`supabase/BOOTSTRAP.md`).

**Critérios de saída**

- `scripts/precheck-migrations.sh` e testes na stack local passando.
- Migração aplicada no projeto de desenvolvimento; Security Advisor revisado.
- Admin Geral criado; registro de quem fez e quando.

## Fase 1 — Núcleo operacional (MVP)

**Escopo de banco** (já na migração inicial): unidades, perfis, Admin Geral,
papéis, permissões, vínculos, exceções, profissionais, serviços, clientes,
agendamentos, auditoria.

**Escopo a implementar**

- Edge Functions: `admin-invite-user`, `admin-deactivate-user`,
  `admin-reactivate-user` (`docs/SERVER_FUNCTIONS.md`).
- Frontend (`apps/web/`):
  - Login, definição de senha pelo convite, troca de senha, logout.
  - Seletor de unidade a partir dos vínculos ativos.
  - Agenda do dia/semana por profissional; criar, remarcar, confirmar,
    concluir, marcar falta, cancelar com motivo.
  - "Minha agenda" para profissionais (`get_my_agenda`).
  - Clientes: busca por nome/telefone, cadastro, edição, arquivamento.
  - Serviços e profissionais: cadastro e edição.
  - Administração (Admin Geral): usuários, vínculos, papéis, exceções,
    desativação/reativação.
  - Auditoria: consulta filtrada por unidade, tabela e período.
- MFA para Admin Geral (pendência P5).

**Critérios de saída**

- Todos os testes de banco e de frontend passando (`BUILD_AND_VALIDATION.md`).
- Teste manual com um usuário de cada papel em cada unidade, roteiro registrado.
- Pendências bloqueantes P1–P8 de `SECURITY_REVIEW.md` concluídas.
- Uso piloto com dados fictícios aprovado pela gestão do salão.

## Fase 2 — Migração do Trinks e agenda completa

**Escopo**

- Importação de clientes a partir de CSV de exportação real do Trinks:
  staging, validação, relatório de prévia, confirmação, rastreabilidade
  (`docs/INTEGRATIONS.md`, `docs/SERVER_FUNCTIONS.md`).
- Importação de histórico de atendimentos apenas se a exportação permitir e o
  mapeamento for conferido.
- Horários de funcionamento por unidade, jornada de profissionais, bloqueios
  de agenda (folgas, intervalos).
- Permissão nova `imports.run`.

**Pré-requisitos**: arquivo real de exportação analisado (sem versionar), mapa
de colunas aprovado, revisão de segurança da fase.

## Fase 3 — Financeiro

**Escopo candidato** (exige projeto próprio antes de qualquer tabela):
comandas/atendimentos realizados, formas de pagamento, caixa diário, comissões
de profissionais, relatórios.

**Pré-requisitos**: regras de comissão e de caixa escritas e aprovadas;
definição de quem pode ver valores; revisão de segurança; decisão sobre emissão
fiscal (fora do escopo até decisão contrária).

## Fase 4 — Integrações externas

**Escopo candidato**: confirmação e lembrete de agendamento por WhatsApp
(provedor oficial), conciliação bancária. Ver `docs/INTEGRATIONS.md`.

**Pré-requisitos**: escolha de provedor com contrato, consentimento dos
clientes (LGPD), revisão de segurança, gestão de segredos de terceiros.

## Fora do escopo até decisão explícita

Aplicativo móvel nativo, agendamento online pelo cliente final, cadastro
unificado de clientes entre unidades, emissão de nota fiscal, estoque.
