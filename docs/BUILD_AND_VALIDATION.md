# Construção e validação

Este documento define o que precisa ser executado, e com qual evidência, antes
de chamar qualquer parte do sistema de "validada". Cada nível depende do
anterior.

## Ferramentas

| Ferramenta | Uso |
|---|---|
| Git | versionamento |
| Supabase CLI (versão atual estável) | stack local, migrações, tipos, funções |
| Docker | stack local do Supabase |
| PostgreSQL 15+ (`initdb`, `pg_ctl`, `psql`, contrib) | pré-checagem rápida e `psql` |
| Node.js LTS + npm/pnpm | frontend (quando existir) |
| Deno | Edge Functions (quando existirem) |

## Nível 0 — Pré-checagem em PostgreSQL puro

```bash
./scripts/precheck-migrations.sh
```

Cria um cluster PostgreSQL descartável, carrega um simulador mínimo do Auth do
Supabase (`supabase/tests/shim/`), aplica todas as migrações e roda
`supabase/tests/*_test.sql`. Falha em qualquer erro ou asserção.

Serve para detectar rapidamente erros de SQL e regressões de RLS. **Não**
reproduz o Supabase real.

## Nível 1 — Stack local oficial

```bash
supabase start
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/rls_phase1_test.sql
```

(Confirme a URL do banco local com `supabase status`.)

Também:

- Abrir o Studio local, Advisors, e conferir alertas de segurança.
- Gerar tipos: `supabase gen types typescript --local`.

## Nível 2 — Projeto de desenvolvimento na nuvem

- `supabase db push --dry-run` revisado e `supabase db push` aplicado.
- Security Advisor sem erros.
- Bootstrap executado.
- **Roteiro manual pela Data API**, com um usuário de teste por papel em cada
  unidade, usando a chave publicável e o JWT de cada usuário (cliente
  `supabase-js` em um script local ou pelo frontend):

| # | Usuário | Ação | Esperado |
|---|---|---|---|
| 1 | sem login | listar `clients` | erro de permissão |
| 2 | recepção Geral | listar `clients` | só clientes da Geral |
| 3 | recepção Geral | criar cliente com `unit_id` da VIP | recusado |
| 4 | recepção VIP | listar `appointments` | só agenda da VIP |
| 5 | profissional Geral | listar `clients` | vazio |
| 6 | profissional Geral | `rpc('get_my_agenda')` | só os próprios atendimentos |
| 7 | somente leitura | editar cliente | nenhuma linha alterada |
| 8 | recepção | inserir em `unit_memberships` | recusado |
| 9 | Admin Geral sem vínculo | listar `clients` | vazio |
| 10 | usuário desativado (sessão aberta) | listar `clients` | vazio |
| 11 | qualquer | dois agendamentos sobrepostos do mesmo profissional | segundo recusado (`23P01`) |

Registrar data, projeto, quem executou e resultado de cada linha.

## Nível 3 — Aplicação

Quando `apps/web/` e `supabase/functions/` existirem:

- `typecheck`, `lint` e testes unitários sem erros.
- `build` de produção sem erros e sem chave secreta no pacote gerado
  (procurar por `sb_secret_` e `service_role` nos arquivos de `dist/`).
- Testes das Edge Functions cobrindo os casos de `SERVER_FUNCTIONS.md`.
- Testes de ponta a ponta (Playwright) para: login, troca de unidade, criar e
  cancelar agendamento, cadastro de cliente, convite e desativação de usuário,
  e as negações principais por papel.

## Nível 4 — Antes de dados reais

- Todos os níveis anteriores registrados.
- Pendências bloqueantes de `SECURITY_REVIEW.md` concluídas.
- Projeto de produção separado configurado (`CLOUD_SETUP.md`, seção 9).
- Restauração de backup testada.
- Aprovação explícita do responsável pelo projeto.

Só depois disso o sistema pode ser descrito como validado para uso com dados
reais — e apenas no escopo testado.

## Registro de execuções

| Data | Nível | Ambiente | Executado por | Resultado |
|---|---|---|---|---|
| 2026-10-24 | 0 | PostgreSQL 16.15 local + simulador | Claude Code | 70 asserções passaram; bootstrap testado |
