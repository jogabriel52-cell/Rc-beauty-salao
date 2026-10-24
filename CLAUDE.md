# CLAUDE.md — RC Beauty

Instruções para o Claude Code neste repositório. Leia este arquivo inteiro antes
de qualquer alteração. Em caso de conflito, a ordem de precedência é:
pedido explícito do responsável pelo projeto → este arquivo → `docs/`.

## O que é o projeto

Sistema de gestão para o salão RC Beauty, com duas unidades de negócio cujos
dados ficam separados: **RC Beauty Geral** (`geral`) e **Sala VIP** (`vip`).
Fases: 0 acessos e segurança · 1 operação diária · 2 importação Trinks ·
3 financeiro · 4 mensagens. Situação em `docs/PHASE_PLAN.md`.

Stack:

- Banco, Auth e funções server-side: **Supabase** (PostgreSQL + RLS, Auth,
  Edge Functions em Deno/TypeScript).
- Frontend: **React + TypeScript + Vite**, em `apps/web/`. Hospedagem será
  decidida depois do MVP local. **Não fazer deploy nem conectar à produção.**
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
   cliente ou do `localStorage`. Vem de `platform_admins`, `unit_memberships`,
   `access_profiles`/`access_profile_permissions` e
   `membership_permission_overrides`, via `public.permission_scope`.
   Perfis são modelos editáveis; nunca codificar nomes de cargos ou de pessoas.
5. **Sem DELETE pela aplicação** em dados operacionais: clientes são
   arquivados, agendamentos cancelados, usuários e vínculos desativados.
6. **Mudança de banco só por migração nova.** Nunca edite uma migração já
   aplicada em qualquer ambiente compartilhado; crie outra. Nunca rode SQL solto
   em produção. O SQL antigo do Builder não deve ser executado nem copiado.
7. **Siga a ordem das fases** de `docs/PHASE_PLAN.md`; cada fase tem migração
   própria. Mensagens (WhatsApp) e integrações bancárias só podem ser
   **ativadas** com credenciais oficiais, consentimento e testes.
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
- Gatilhos de proteção rodam como o chamador e **enxergam só o que o RLS
  permite**. Consultas de checagem que precisam ver além disso devem usar
  funções auxiliares `SECURITY DEFINER` de leitura.
- Funções de autorização retornam `false`, nunca `NULL` (use `coalesce`).
- `INSERT ... ON CONFLICT` aplica a política de SELECT à linha nova; prefira
  verificar existência antes quando o chamador ainda não enxerga a linha.
- A Supabase CLI corta funções com `... END THEN` (um `CASE` terminando
  antes do `THEN` de um `IF`). Calcule o valor numa variável antes do `IF`.
- Toda tabela nova que referencie `client_units` precisa ser incluída em
  `public.merge_clients` (que move o histórico da unidade na mescla).
- Mensagens: credenciais do WhatsApp e da IA só em segredos de Edge Functions;
  envio só por `whatsapp-send` (regras em `messaging_prepare_send`); marcas de
  verificação do canal só pelo servidor; a aplicação e a IA criam apenas
  rascunhos. Nunca ativar envio ou IA sem credenciais oficiais, consentimento e
  testes (`docs/INTEGRATIONS.md`).
- Projeto Cloud de desenvolvimento: ref `biaezsatrxqpopeifkot`. Confirme o ref
  antes de qualquer comando remoto; nunca use outro projeto. Nada de `db reset`,
  restore ou drop remotos.
- Clientes: nunca expor dados de outra unidade; busca entre unidades só por
  telefone/e-mail idênticos e com retorno mascarado (`find_client_candidates`).
- `created_by`, `created_at` e `updated_at` são preenchidos pelo gatilho
  `tg_stamp`; o cliente não envia esses campos (os GRANTs por coluna impedem).
- Toda tabela operacional nova recebe: RLS, políticas, GRANT por coluna,
  `tg_stamp`, `tg_unit_immutable`, `tg_audit` e testes em
  `supabase/tests/database/` (pgTAP) e `tests/integration/`.
- Datas e horas em `timestamptz`; exibição em `America/Sao_Paulo`. Dinheiro em
  centavos (`integer`), moeda BRL.

### Checklist para nova permissão ou tabela

1. Migração nova com tabela, RLS, políticas, GRANTs, gatilhos.
2. Permissão nova em `public.permissions` (módulo, ação, escopos permitidos) e
   atribuição nos perfis iniciais por `access_profiles.key`.
3. Testes positivos e negativos para cada papel e para as duas unidades.
4. Atualizar `docs/ACCESS_CONTROL.md` (matriz de papéis).
5. `supabase db reset`, `supabase test db`, `npm run test:integration` e
   regenerar tipos do frontend.

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
supabase start                         # stack local oficial (Docker)
supabase db reset                      # recria o banco local a partir das migrações
supabase test db                       # pgTAP (supabase/tests/database)
npm install                            # raiz: workspace + testes de integração
npm run test:integration               # usuários reais na stack local
./scripts/write-local-env.sh           # apps/web/.env.local (URL + chave publicável)
npm run -w apps/web gen:types          # tipos do banco para o frontend
npm run -w apps/web dev                # http://localhost:5173
npm run -w apps/web typecheck && npm run -w apps/web lint && npm run -w apps/web test
npm run -w apps/web build && npm run -w apps/web check:bundle
npm run -w apps/web e2e                # Playwright contra a stack local
npm run -w apps/web build:hosting      # build estático para a Hostinger (usa apps/web/.env.production)
./scripts/precheck-migrations.sh       # nível 0 (preliminar, sem Docker)
./scripts/cloud-dev-push.sh            # máquina do responsável: link + dry-run conferido + push no Cloud dev
```

Após editar Edge Functions, reinicie o container `supabase_edge_runtime_*` se a
mudança não for aplicada.

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
| `docs/COMMISSIONS.md` | Regras de comissão configuráveis e parâmetros a confirmar |
| `docs/INTEGRATIONS.md` | Trinks (CSV), WhatsApp, banco — status e pré-requisitos |
| `docs/SERVER_FUNCTIONS.md` | Contratos das Edge Functions |
| `docs/CLOUD_SETUP.md` | Configuração do Supabase Cloud de desenvolvimento |
| `docs/HOSTING.md` | Build estático e passos para publicar na Hostinger |
| `docs/BUILD_AND_VALIDATION.md` | Níveis de validação e evidências exigidas |
| `supabase/BOOTSTRAP.md` | Criação do primeiro Admin Geral |
| `tests/legacy/README.md` | Registro dos testes do modelo inicial |
