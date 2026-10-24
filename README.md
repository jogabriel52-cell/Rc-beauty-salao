# RC Beauty — kit de construção

Este pacote converte o material original do Builder em uma especificação
coerente para construir o RC Beauty com Claude Code, PostgreSQL/Supabase e uma
aplicação web própria.

## Estado real do pacote

Este é um **kit de construção, não o sistema pronto**. Ele contém arquitetura,
regras, plano de fases e uma migração inicial de banco para a Fase 1. Ainda não
contém o frontend completo, o fluxo de convite de usuários, todas as funções
operacionais, o importador Trinks nem integrações de WhatsApp ou banco. Esses
itens estão identificados como trabalho de implementação.

Nenhuma aplicação ou migração foi executada em um projeto Supabase real.
Portanto, este material não deve ser descrito como "100% seguro" ou "validado
em produção" até completar a revisão e os testes indicados em
[`docs/BUILD_AND_VALIDATION.md`](docs/BUILD_AND_VALIDATION.md).

O que foi executado até agora: a migração e 70 asserções de RLS e regras de
negócio passaram em um PostgreSQL 16 puro com um simulador mínimo do Auth do
Supabase (`scripts/precheck-migrations.sh`), e o bloco de bootstrap foi
testado no mesmo ambiente. Isso é uma pré-checagem (nível 0), não validação.

## Decisões desta revisão

- Claude Code é o agente de desenvolvimento; o banco, Auth e funções
  server-side ficam no Supabase.
- O frontend proposto é React + TypeScript + Vite. Hospedagem do frontend será
  escolhida depois do primeiro MVP local.
- O projeto começa com as tabelas e recursos da Fase 1. Não cria tabelas
  financeiras, WhatsApp ou integrações futuras sem projeto e revisão próprios.
- Usuários e permissões são administrados por unidade, com papéis-base e
  exceções individuais. O acesso por unidade é atribuído explicitamente.
- Segurança é aplicada no banco. A interface não é controle de segurança.
- A chave publicável (`sb_publishable_...`) pode ficar no frontend; a chave
  secreta (`sb_secret_...`) fica somente no servidor. Nunca colocar chave
  secreta no navegador, em variável `VITE_*`, no repositório ou em logs.
- A importação do Trinks começa por CSV de exportação real, com mapeamento
  conferido. Nenhuma API é presumida.

## Comece nesta ordem

1. Leia este README e o [`CLAUDE.md`](CLAUDE.md).
2. Leia [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md),
   [`docs/ACCESS_CONTROL.md`](docs/ACCESS_CONTROL.md) e
   [`docs/PHASE_PLAN.md`](docs/PHASE_PLAN.md).
3. Crie um projeto Git e um projeto Supabase de desenvolvimento, sem dados
   reais de clientes. Siga [`docs/CLOUD_SETUP.md`](docs/CLOUD_SETUP.md) e não
   reutilize um banco de outro produto.
4. Instale a Supabase CLI e use as migrações em `supabase/migrations`. Não
   execute o SQL antigo do Builder.
5. Aplique a migração em ambiente local/de teste e revise RLS antes de começar
   a interface. Comece por `./scripts/precheck-migrations.sh` e depois pela
   stack local (`supabase start`, `supabase db reset`).
6. Crie o primeiro usuário administrativo pelo Auth do Supabase e siga o
   procedimento administrativo em [`supabase/BOOTSTRAP.md`](supabase/BOOTSTRAP.md);
   o bootstrap é executado somente no SQL Editor como administrador do banco.
7. Use [`prompts/CLAUDE_CODE_START.md`](prompts/CLAUDE_CODE_START.md) como
   primeira instrução ao Claude Code.
8. Só avance para dados reais depois de validar os perfis e a separação
   RC Beauty Geral × Sala VIP.

## Arquivos

| Caminho | Conteúdo |
|---|---|
| `CLAUDE.md` | Instruções principais para o Claude Code |
| `docs/ARCHITECTURE.md` | Componentes, modelo de dados, decisões |
| `docs/ACCESS_CONTROL.md` | Papéis, permissões, exceções, ciclo de vida de usuários |
| `docs/SECURITY_REVIEW.md` | Ameaças, controles, verificação feita e pendências |
| `docs/PHASE_PLAN.md` | Escopo e critérios de saída das fases 0 a 4 |
| `docs/OPERATIONS.md` | Regras operacionais do salão e rotinas administrativas |
| `docs/INTEGRATIONS.md` | Trinks (CSV), e-mail, WhatsApp, banco |
| `docs/CLOUD_SETUP.md` | Configuração segura do Supabase Cloud de desenvolvimento |
| `docs/SERVER_FUNCTIONS.md` | Contratos obrigatórios das Edge Functions de convite, desativação e importação |
| `docs/BUILD_AND_VALIDATION.md` | Níveis de validação e evidências exigidas |
| `supabase/migrations/` | Migração inicial da Fase 1 |
| `supabase/tests/` | Testes de RLS e regras (SQL) e simulador do Auth para pré-checagem |
| `supabase/BOOTSTRAP.md` | Criação controlada do primeiro Admin Geral |
| `scripts/precheck-migrations.sh` | Pré-checagem em PostgreSQL descartável |
| `prompts/CLAUDE_CODE_START.md` | Pedido inicial pronto para usar no Claude Code |
| `.env.example` | Variáveis do frontend (somente valores públicos) |

## Aviso sobre o pacote original

O SQL original do Builder foi substituído como fonte de execução. Ele
misturava tabelas de quatro fases, descrevia funções que não existiam e
continha políticas insuficientes. O arquivo original pode ser mantido como
referência histórica, mas não deve ser executado nem copiado para um banco
ativo.
