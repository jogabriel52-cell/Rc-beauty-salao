# Construção e validação

Define o que precisa ser executado, e com qual evidência, antes de chamar
qualquer parte do sistema de "validada" — e registra o que já foi executado.

## Níveis

| Nível | Ambiente | Natureza |
|---|---|---|
| 0 | PostgreSQL puro + simulador mínimo do Auth | **Preliminar.** Não é validação do Supabase. |
| 1 | Stack local oficial do Supabase (`supabase start`) | Validação oficial local. |
| 2 | Projeto Supabase Cloud **exclusivo de desenvolvimento** | Validação na nuvem + Security Advisor. |
| 3 | Aplicação (frontend + Edge Functions) contra o nível 1 ou 2 | Validação funcional ponta a ponta. |
| 4 | Antes de dados reais | Aprovação do responsável, pendências bloqueantes resolvidas. |

Nenhum nível autoriza dados reais de clientes, deploy ou conexão com produção.

## Ferramentas

| Ferramenta | Uso |
|---|---|
| Supabase CLI (testado com 2.122.0) | stack local, migrações, `supabase test db`, tipos |
| Docker | stack local |
| Node.js 22 + npm | frontend, testes de integração e E2E |
| PostgreSQL 15+ (opcional) | pré-checagem nível 0 |

## Comandos

```bash
# Nível 0 (preliminar): migrações em PostgreSQL descartável
./scripts/precheck-migrations.sh

# Nível 1: stack local oficial
supabase start
supabase db reset                 # aplica todas as migrações do zero
supabase test db                  # testes pgTAP (supabase/tests/database)
npm install
npm run test:integration          # usuários reais: Auth, MFA TOTP, Edge Functions, Data API

# Nível 3: aplicação
./scripts/write-local-env.sh      # gera apps/web/.env.local (URL + chave publicável)
npm run -w apps/web typecheck
npm run -w apps/web lint
npm run -w apps/web test          # unitários
npm run -w apps/web build && npm run -w apps/web check:bundle   # sem segredo no bundle
npm run -w apps/web e2e           # Playwright no navegador contra a stack local

# Nível 2: Cloud de desenvolvimento (somente com a referência do projeto RC Beauty dev)
supabase link --project-ref <ref-rc-beauty-dev>
supabase db push --dry-run
supabase db push
# depois: Security Advisor no painel e testes de integração apontando para o projeto
```

## Testes existentes

| Arquivo | Tipo | Cobre |
|---|---|---|
| `supabase/tests/database/010_access_model.test.sql` | pgTAP | perfis editáveis, escopos, MFA (aal1/aal2), anti-escalada, autoproteção, proteção do Admin Geral, desativação, auditoria, estrutura (RLS, grants, search_path) |
| `tests/integration/phase0-access.test.ts` | Integração (Vitest + Auth real) | login, MFA TOTP, encerramento de outras sessões, convite com e-mail (Mailpit), 401/403/409/400, desativação com corte imediato e bloqueio de login, reativação |
| `apps/web/e2e/phase0-access.spec.ts` | E2E (Playwright) | entrada da Recepção, cadastro de MFA da Direção, convite, aceite do convite e definição de senha, exceção individual, desativação, bloqueio do próprio perfil |
| `supabase/tests/database/020_operations.test.sql` | pgTAP | identidade única + vínculo por unidade, busca mascarada entre unidades, vínculo com prova de telefone/e-mail, CRM por unidade e somente inclusão, duplicidades e mescla, profissional sem acesso a cadastro/CRM e agenda própria com dados mínimos, agenda (conflito, transições, cancelamento, exceções), comandas (numeração, quem abriu/vendeu/finalizou, totais, pagamentos, finalização, cancelamento com estorno), estoque, painel, relatórios, usuário inativo, MFA. Inclui as verificações equivalentes às 70 do modelo inicial |
| `tests/integration/phase1-operations.test.ts` | Integração | isolamento de clientes pela API, vínculo entre unidades mascarado, agenda do profissional sem telefone, comanda completa com baixa de estoque, escopo próprio da vendedora |
| `apps/web/e2e/phase1-operations.spec.ts` | E2E | Recepção agenda nova cliente, confirma, abre e finaliza comanda; Profissional vê só a própria agenda; VIP vincula cadastro mascarado; Gerente mescla duplicidade; Gerente cadastra serviço/produto, lança estoque, vê painel e relatórios |
| `supabase/tests/database/030_trinks_import.test.sql` | pgTAP | mapeamento só por quem tem `imports.run`, aprovação por outra pessoa, prévia e classificação (nova, vincular, possível duplicidade, já existe, repetida, inválida), problemas de campo, decisões, confirmação com origem/código, observação → CRM, vínculo sem duplicar identidade, bloqueio de reimportação, descarte com expurgo, edição volta a rascunho |
| `apps/web/e2e/phase2-import.spec.ts` | E2E | mapeamento a partir do arquivo, aprovação por outra pessoa, prévia, decisão de possível duplicidade, confirmação, nota de CRM, bloqueio de reimportação |
| `supabase/tests/database/040_finance.test.sql` | pgTAP | acesso ao financeiro por papel e unidade, regras de lançamento (categoria × tipo, pago exige data/conta, valor pago imutável, cancelamento com motivo, sem DELETE, origem reservada), importação de extrato e bloqueio de repetição, sugestões, conciliação, criar a partir da linha, ignorar, desfazer, fluxo de caixa com/sem vendas, comissões (modelos 0,8/2 e 0,5/1,5, parâmetros a confirmar bloqueiam ativação, ninguém cria a própria, faixas imutáveis em plano ativo, meta obrigatória, apuração única, aprovação por outra pessoa, pagamento gera despesa, valor informado, progressiva, visibilidade própria) |
| `apps/web/e2e/phase3-finance.spec.ts` | E2E | conta, lançamento, extrato CSV, conciliação, lançamento a partir da linha, fluxo de caixa; plano a partir de modelo, bloqueio por parâmetros a confirmar, ativação, meta, apuração, aprovação e pagamento por outra pessoa, vendedora vê a própria comissão |
| `apps/web/src/**/*.test.ts` | Unitário | formatação, telefone, dinheiro, mensagens de erro, cálculo de permissões efetivas |
| `tests/legacy/rls_phase1_baseline_test.sql` | SQL (histórico) | 70 asserções do modelo inicial (papéis fixos), preservadas como registro |

## Registro de execuções

| Data | Nível | Ambiente | Commit / estado | Resultado |
|---|---|---|---|---|
| 2026-10-24 | 0 (preliminar) | PostgreSQL 16.15 + simulador do Auth | 31d01c2 (modelo inicial) | 70 asserções passaram; bootstrap testado |
| 2026-10-24 | 1 | Supabase CLI 2.122.0, PostgreSQL 17.11 (stack local oficial) | 31d01c2 (modelo inicial) | Mesmas 70 asserções passaram |
| 2026-10-24 | 1 | Stack local oficial | Fase 0 | `supabase db reset` ok; `supabase test db`: 69/69; integração: 20/20; bootstrap ok e recusa na repetição |
| 2026-10-24 | 3 | Stack local oficial + Vite + Chromium (Playwright 1.63) | Fase 0 | typecheck, lint, 12 unitários, build, bundle sem segredo, E2E 3/3 |
| 2026-10-24 | 1 | Stack local oficial | Fase 1 | `supabase db reset` ok; `supabase test db`: 168/168 (69 + 99); integração: 26/26 |
| 2026-10-24 | 3 | Stack local oficial + Vite + Chromium | Fase 1 | typecheck, lint, 12 unitários, build sem aviso de tamanho, bundle sem segredo, E2E 7/7 |
| 2026-10-24 | 1 | Stack local oficial | Fase 2 | `supabase test db`: 206/206 (69 + 99 + 38); integração: 26/26 |
| 2026-10-24 | 3 | Stack local oficial + Vite + Chromium | Fase 2 | typecheck, lint, 17 unitários (inclui leitura de CSV UTF-8/Windows-1252), build, bundle sem segredo, E2E 8/8 |
| 2026-10-24 | 1 | Stack local oficial | Fase 3 | `supabase test db`: 264/264 (69 + 99 + 38 + 58); integração: 26/26 |
| 2026-10-24 | 3 | Stack local oficial + Vite + Chromium | Fase 3 | typecheck, lint, 19 unitários (inclui valores/datas de extrato), build, bundle sem segredo, E2E 10/10 |
| — | 2 | Cloud de desenvolvimento | — | **Não executado**: referência do projeto Cloud da RC Beauty não informada |

### Falhas encontradas e corrigidas na Fase 0

| Falha | Como foi achada | Correção |
|---|---|---|
| `has_unit_scope` retornava `NULL` em vez de `false`, fazendo checagens de negação passarem (ex.: gerir unidade sem permissão) | pgTAP | `coalesce(..., false)` |
| Gatilho de modelos consultava `platform_admins` sob RLS e não via o Admin Geral | pgTAP | funções auxiliares `SECURITY DEFINER` |
| Checagem "gere todas as unidades da pessoa" consultava vínculos sob RLS; Gerente da Geral conseguia desativar pessoa que também atua na VIP | pgTAP | `actor_manages_person` sem RLS |
| `INSERT ... ON CONFLICT` em `profiles` aplicava política de SELECT à linha nova | pgTAP | verificação prévia com `profile_exists` |
| `[auth.email] enable_signup = false` desligava o login por e-mail | integração | manter `true`; bloqueio de cadastro é `[auth] enable_signup = false` |
| Edge Runtime local não baixava `supabase-js` (CA do proxy do ambiente) | integração | funções reescritas sem dependências (somente `fetch`) |
| Corpo validado antes da autenticação (400 em vez de 401) | integração | autenticar primeiro |

### Falhas encontradas e corrigidas na Fase 1

| Falha | Como foi achada | Correção |
|---|---|---|
| Teste de auditoria de modelos contava registros gerados pela própria migração | pgTAP | filtrar pelo ator |
| Painel somava comandas com condição redundante | revisão do SQL | condição simplificada |
| Tela inicial mudou (Painel/Minha agenda) e testes E2E da Fase 0 esperavam a saudação | E2E | testes atualizados |
| Produto escolhido por posição na lista pegava produto de outra execução | E2E | nomes únicos por execução e seleção pelo nome |
| Segunda página E2E navegava antes de o login concluir | E2E | `login()` aguarda sair de `/entrar` |
| Pacote principal de 524 KB | build | rotas sob demanda e pacotes de terceiros separados |

### Falhas encontradas e corrigidas na Fase 2

| Falha | Como foi achada | Correção |
|---|---|---|
| `text[] || 'literal'` ambíguo na classificação | pgTAP | `array_append` |
| Resumo do lote vazava contagens sem checar permissão | revisão | função com verificação explícita |
| Parâmetro `undefined` omitido fazia o PostgREST não achar a função de salvar mapeamento | E2E | enviar `null` |
| Busca de clientes tratava como telefone nomes com 4+ dígitos | E2E | telefone só quando o termo é numérico |
| Mensagens do banco com "á" eram trocadas por mensagem genérica | E2E | detector de português ampliado + teste unitário |
| Navegação logo após o MFA às vezes voltava à tela de MFA nos testes | E2E | helper aguarda a conclusão do MFA |

### Falhas encontradas e corrigidas na Fase 3

| Falha | Como foi achada | Correção |
|---|---|---|
| A Supabase CLI divide incorretamente funções com `... END THEN` dentro de `IF` (erro de sintaxe na migração) | `supabase db reset` | calcular o valor antes do `IF`; regra registrada no CLAUDE.md |
| Checagem de categoria × tipo consultava categorias sob RLS (pessoa com `finance.manage` sem `finance.view` passaria) | revisão | função auxiliar `finance_category_kind` |
| `preset_key` fora do GRANT de inserção | pgTAP | GRANT corrigido |
| Teste chamava a apuração dentro de `WHERE` (executada várias vezes) | pgTAP | teste corrigido |
| Pessoas de teste com o mesmo nome em execuções diferentes levavam a escolher a pessoa errada | E2E | nomes únicos por execução |
| Apurações de execuções anteriores tornavam a linha ambígua | E2E | coluna "Plano" na apuração (também melhora a tela) |

## Roteiro manual no Cloud de desenvolvimento (nível 2)

Com um usuário de teste por perfil em cada unidade (e-mails controlados pela
equipe, nunca de clientes):

| # | Quem | Ação | Esperado |
|---|---|---|---|
| 1 | sem login | listar `clients`/`unit_memberships` | erro de permissão |
| 2 | Direção sem MFA | qualquer tela | exige MFA; banco sem permissões |
| 3 | Recepção Geral | listar clientes | só da Geral |
| 4 | Profissional | agenda | só a própria, sem telefone/e-mail/observações privadas |
| 5 | Gerente Geral | gerir vínculo da VIP | recusado |
| 6 | Direção | alterar o próprio vínculo/perfil | recusado |
| 7 | Direção | desativar pessoa | corte imediato; login bloqueado |
| 8 | qualquer | dois atendimentos sobrepostos do mesmo profissional | segundo recusado |

## Critério para "validado"

Só é possível dizer que algo está validado **no ambiente em que foi testado**.
Segurança e integrações só são declaradas concluídas após validação no ambiente
correspondente (nível 2 para nuvem; credenciais oficiais para WhatsApp, banco e
adquirente).
