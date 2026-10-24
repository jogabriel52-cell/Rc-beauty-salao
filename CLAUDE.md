# CLAUDE.md — RC Beauty

Instruções para o Claude Code neste repositório. Leia este arquivo inteiro antes
de qualquer alteração. Em caso de conflito, a ordem de precedência é:
pedido explícito do responsável pelo projeto → este arquivo → `docs/`.

## O que é o projeto

Sistema de gestão para o salão RC Beauty, com duas unidades de negócio cujos
dados ficam separados: **RC Beauty Geral** (`geral`) e **Sala VIP** (`vip`).
Fase atual: **Fase 1 — núcleo operacional** (usuários e permissões, clientes,
profissionais, serviços, agenda, auditoria). Ver `docs/PHASE_PLAN.md`.

Stack:

- Banco, Auth e funções server-side: **Supabase** (PostgreSQL + RLS, Auth,
  Edge Functions em Deno/TypeScript).
- Frontend: **React + TypeScript + Vite**, em `apps/web/` (ainda não criado).
  Hospedagem do frontend será decidida depois do MVP local.
- Migrações versionadas em `supabase/migrations/`, aplicadas pela Supabase CLI.

## Regras não negociáveis

1. **Segurança fica no banco.** Toda tabela em `public` tem RLS habilitado,
   políticas por operação e GRANTs explícitos para `authenticated`. Nada é
   concedido a `anon`. Esconder botões na interface não é controle de acesso.
2. **Isolamento por unidade.** Toda tabela operacional tem `unit_id not null`,
   políticas baseadas em `public.has_permission(unit_id, '<permissão>')` e o
   gatilho `tg_unit_immutable`. Relações entre tabelas da mesma unidade usam
   chave estrangeira composta `(id, unit_id)`.
3. **Chaves.** A chave publicável (`sb_publishable_...`) pode ir para o
   frontend. A chave secreta (`sb_secret_...`, ou a legada `service_role`)
   existe só em segredos de Edge Functions e no ambiente do servidor. Nunca em
   `VITE_*`, no repositório, em logs, em mensagens de erro ou em prompts.
4. **Autorização nunca vem de `user_metadata`**, de parâmetros enviados pelo
   cliente ou do `localStorage`. Vem das tabelas `platform_admins`,
   `unit_memberships`, `role_permissions` e `membership_permission_overrides`.
5. **Sem DELETE pela aplicação** em dados operacionais: clientes são
   arquivados, agendamentos cancelados, usuários e vínculos desativados.
6. **Mudança de banco só por migração nova.** Nunca edite uma migração já
   aplicada em qualquer ambiente compartilhado; crie outra. Nunca rode SQL solto
   em produção. O SQL antigo do Builder não deve ser executado nem copiado.
7. **Não crie tabelas de fases futuras** (financeiro, comissões, WhatsApp,
   integrações bancárias) sem o projeto e a revisão descritos em
   `docs/PHASE_PLAN.md`.
8. **Dados reais** (clientes, telefones, exportações do Trinks) nunca entram no
   repositório, em fixtures, em seeds, em logs ou em capturas de tela de teste.
   Use dados fictícios com domínio `.invalid`.
9. **Não declare nada como "seguro", "validado" ou "pronto para produção"**
   sem as evidências exigidas em `docs/BUILD_AND_VALIDATION.md`. Relate
   exatamente o que foi executado e o que não foi.

## Convenções de banco

- Identificadores em inglês (`clients`, `appointments`); valores de domínio
  exibidos ao usuário podem ser em português (`agendado`, `recepcao`).
- Funções `SECURITY DEFINER` sempre com `set search_path = ''` e nomes
  totalmente qualificados (`public.x`, `auth.uid()`). Use `(select auth.uid())`
  em políticas.
- Funções `SECURITY DEFINER` que escrevem em tabelas devem verificar a
  permissão do chamador por conta própria: dentro delas `current_user` é o dono
  da função, o que faz `public.is_server_context()` retornar verdadeiro.
- `created_by`, `created_at` e `updated_at` são preenchidos pelo gatilho
  `tg_stamp`; o cliente não envia esses campos (os GRANTs por coluna impedem).
- Toda tabela operacional nova recebe: RLS, políticas, GRANT por coluna,
  `tg_stamp`, `tg_unit_immutable`, `tg_audit` e testes em
  `supabase/tests/`.
- Datas e horas em `timestamptz`; exibição em `America/Sao_Paulo`. Dinheiro em
  centavos (`integer`), moeda BRL.

### Checklist para nova permissão ou tabela

1. Migração nova com tabela, RLS, políticas, GRANTs, gatilhos.
2. Permissão nova em `public.permissions` e atribuição em `role_permissions`.
3. Testes positivos e negativos para cada papel e para as duas unidades.
4. Atualizar `docs/ACCESS_CONTROL.md` (matriz de papéis).
5. `scripts/precheck-migrations.sh` e, quando disponível, `supabase db reset`
   + testes na stack local.

## Convenções de frontend

- Cliente Supabase criado uma única vez com `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_PUBLISHABLE_KEY`. Nenhuma outra variável sensível no frontend.
- Tipos gerados com `supabase gen types typescript` — não escreva tipos de
  tabela à mão.
- A unidade ativa é escolhida pelo usuário entre os vínculos retornados pelo
  banco; toda consulta operacional filtra por `unit_id` (o RLS garante o resto).
- Use `public.my_permissions(unit_id)` apenas para mostrar ou esconder ações.
  Trate erros `42501` (sem permissão) e `23P01` (conflito de horário) com
  mensagens claras em português.
- Interface em português do Brasil.

## Comandos

```bash
./scripts/precheck-migrations.sh      # migrações + testes em Postgres descartável
supabase start                         # stack local (Docker)
supabase db reset                      # recria o banco local a partir das migrações
psql "<DB_URL local>" -v ON_ERROR_STOP=1 -f supabase/tests/rls_phase1_test.sql
supabase gen types typescript --local > apps/web/src/lib/database.types.ts
```

Comandos do frontend serão adicionados aqui quando `apps/web/` existir.

## Como trabalhar

- Antes de mudar algo, leia o documento correspondente em `docs/`.
- Faça mudanças pequenas e verificáveis. Rode as checagens antes de dizer que
  terminou e mostre a saída quando algo falhar.
- Ao final de cada tarefa, informe: o que mudou, o que foi testado (comando e
  resultado), o que não foi testado e pendências.
- Peça confirmação antes de: aplicar migração em projeto remoto, alterar
  configuração do Auth, mexer em segredos, apagar dados ou ampliar o escopo
  da fase.

## Mapa de documentos

| Documento | Conteúdo |
|---|---|
| `docs/ARCHITECTURE.md` | Componentes, fluxo de dados, decisões |
| `docs/ACCESS_CONTROL.md` | Papéis, permissões, exceções, ciclo de vida de usuários |
| `docs/SECURITY_REVIEW.md` | Ameaças, controles, pendências antes de dados reais |
| `docs/PHASE_PLAN.md` | Escopo e critérios de saída de cada fase |
| `docs/OPERATIONS.md` | Regras operacionais do salão e rotinas administrativas |
| `docs/INTEGRATIONS.md` | Trinks (CSV), WhatsApp, banco — status e pré-requisitos |
| `docs/SERVER_FUNCTIONS.md` | Contratos das Edge Functions |
| `docs/CLOUD_SETUP.md` | Configuração do Supabase Cloud de desenvolvimento |
| `docs/BUILD_AND_VALIDATION.md` | Níveis de validação e evidências exigidas |
| `supabase/BOOTSTRAP.md` | Criação do primeiro Admin Geral |
