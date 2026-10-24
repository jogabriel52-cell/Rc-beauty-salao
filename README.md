# RC Beauty — kit de construção

Este pacote converte o material original do Builder em uma especificação
coerente para construir o RC Beauty com Claude Code, PostgreSQL/Supabase e uma
aplicação web própria.

## Estado atual

Sistema em construção por fases (`docs/PHASE_PLAN.md`). Situação:

- **Fase 0 — acessos e segurança: implementada.** Perfis de acesso editáveis,
  escopo por módulo/ação, exceções individuais, MFA obrigatório para Admin
  Geral e Direção, convite e desativação por Edge Functions, auditoria de
  concessões, telas de pessoas, perfis e auditoria.
- **Fase 1 — operação diária: implementada.** Clientes com identidade única e
  vínculo por unidade, CRM por unidade, revisão de duplicidades, serviços,
  profissionais, agenda (profissional vê só a própria), comandas com quem
  abriu/vendeu/finalizou, estoque, painel e relatórios.
- **Fase 2 — importação do Trinks: implementada.** CSV lido no navegador,
  mapeamento conferido por outra pessoa, prévia com deduplicação e decisão
  humana antes de gravar. O formato real da exportação ainda precisa ser
  conferido com um arquivo do Trinks.
- **Fase 3 — financeiro: implementada.** Lançamentos, fluxo de caixa,
  conciliação por CSV de banco/adquirente e comissões configuráveis. Os
  parâmetros de comissão que não foram informados (período, base, estornos,
  fonte do faturamento etc.) ficam "a confirmar" e bloqueiam a apuração até a
  direção decidir (`docs/COMMISSIONS.md`).
- **Fase 4 — mensagens e relacionamento: implementada, com envio bloqueado.**
  WhatsApp oficial por unidade (caixa de entrada, rascunhos, modelos, webhook
  assinado), consentimento e opt-out por finalidade, follow-ups,
  reengajamento de inativas, pesquisa de satisfação (NPS) e SDR IA que só
  sugere rascunhos. O envio só pode ser ativado com credenciais oficiais da
  Meta, consentimento e testes; a IA está desligada e sem chave. **Nenhuma
  chamada real à Graph API ou à IA foi feita** (`docs/INTEGRATIONS.md`).

Validação feita até aqui (detalhes em `docs/BUILD_AND_VALIDATION.md`):

- **Preliminar (nível 0)**: PostgreSQL 16 com imitação mínima do Auth — não é
  validação oficial do Supabase.
- **Stack local oficial do Supabase (nível 1)**: `supabase db reset`,
  `supabase test db` (pgTAP) e testes de integração com usuários reais de teste
  (login, MFA TOTP, convite, desativação) — passando.
- **Aplicação (nível 3)**: typecheck, lint, testes unitários, build sem segredo
  e E2E no navegador contra a stack local — passando.
- **Cloud de desenvolvimento (nível 2)**: projeto `biaezsatrxqpopeifkot`
  identificado e conferido (vazio). **Migrações ainda não aplicadas**: o
  `supabase db push --dry-run` exige token e senha do banco e conexão Postgres,
  indisponíveis no ambiente de trabalho (`docs/CLOUD_SETUP.md`).
- **Hospedagem**: frontend preparado para build estático na Hostinger
  (`docs/HOSTING.md`); nada publicado, nenhum domínio conectado.

Nada foi publicado, nenhum deploy foi feito e nenhum dado real foi usado. O
sistema não deve ser descrito como "seguro" ou "validado em produção".

## Decisões desta revisão

- Claude Code é o agente de desenvolvimento; o banco, Auth e funções
  server-side ficam no Supabase.
- O frontend proposto é React + TypeScript + Vite. Hospedagem do frontend será
  escolhida depois do primeiro MVP local.
- Cada fase entra com migração própria, telas e testes. Mensagens e integrações
  bancárias só são ativadas com credenciais oficiais, consentimento e testes.
- Pessoas e permissões são administradas por unidade, com perfis de acesso
  editáveis (não cargos fixos no código), escopo por módulo/ação e exceções
  individuais. O acesso por unidade é atribuído explicitamente.
- Segurança é aplicada no banco. A interface não é controle de segurança.
- A chave publicável (`sb_publishable_...`) pode ficar no frontend; a chave
  secreta (`sb_secret_...`) fica somente no servidor. Nunca colocar chave
  secreta no navegador, em variável `VITE_*`, no repositório ou em logs.
- A importação do Trinks começa por CSV de exportação real, com mapeamento
  conferido. Nenhuma API é presumida.

## Como rodar localmente

```bash
supabase start                    # stack local oficial (Docker)
supabase db reset && supabase test db
npm install && npm run test:integration
./scripts/write-local-env.sh
npm run -w apps/web dev           # http://localhost:5173
```

Primeiro acesso: criar o Admin Geral pelo Auth e seguir
[`supabase/BOOTSTRAP.md`](supabase/BOOTSTRAP.md); as demais pessoas são
convidadas pela tela **Pessoas e acessos**. Na stack local, os e-mails de
convite aparecem no Mailpit (`http://127.0.0.1:54324`).

Leitura recomendada: [`CLAUDE.md`](CLAUDE.md),
[`docs/ACCESS_CONTROL.md`](docs/ACCESS_CONTROL.md),
[`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md),
[`docs/PHASE_PLAN.md`](docs/PHASE_PLAN.md) e
[`docs/CLOUD_SETUP.md`](docs/CLOUD_SETUP.md) (projeto Cloud exclusivo de
desenvolvimento, sem dados reais).

## Arquivos

| Caminho | Conteúdo |
|---|---|
| `CLAUDE.md` | Instruções principais para o Claude Code |
| `docs/ARCHITECTURE.md` | Componentes, modelo de dados, decisões |
| `docs/ACCESS_CONTROL.md` | Papéis, permissões, exceções, ciclo de vida de usuários |
| `docs/SECURITY_REVIEW.md` | Ameaças, controles, verificação feita e pendências |
| `docs/PHASE_PLAN.md` | Escopo e critérios de saída das fases 0 a 4 |
| `docs/OPERATIONS.md` | Regras operacionais do salão e rotinas administrativas |
| `docs/COMMISSIONS.md` | Comissões: referência inicial, parâmetros a confirmar |
| `docs/INTEGRATIONS.md` | Trinks (CSV), e-mail, WhatsApp, banco |
| `docs/CLOUD_SETUP.md` | Configuração segura do Supabase Cloud de desenvolvimento |
| `docs/SERVER_FUNCTIONS.md` | Contratos obrigatórios das Edge Functions de convite, desativação e importação |
| `docs/BUILD_AND_VALIDATION.md` | Níveis de validação e evidências exigidas |
| `supabase/migrations/` | Migrações por fase |
| `supabase/functions/` | Edge Functions (convite, ativação/desativação) |
| `supabase/tests/database/` | Testes pgTAP (`supabase test db`) |
| `tests/integration/` | Testes com usuários reais na stack local |
| `tests/legacy/` | Registro dos testes do modelo inicial |
| `apps/web/` | Aplicação React + TypeScript + Vite, com E2E Playwright |
| `supabase/BOOTSTRAP.md` | Criação controlada do primeiro Admin Geral |
| `scripts/precheck-migrations.sh` | Pré-checagem preliminar em PostgreSQL descartável |
| `prompts/CLAUDE_CODE_START.md` | Pedido inicial pronto para usar no Claude Code |
| `.env.example` | Variáveis do frontend (somente valores públicos) |

## Aviso sobre o pacote original

O SQL original do Builder foi substituído como fonte de execução. Ele
misturava tabelas de quatro fases, descrevia funções que não existiam e
continha políticas insuficientes. O arquivo original pode ser mantido como
referência histórica, mas não deve ser executado nem copiado para um banco
ativo.
