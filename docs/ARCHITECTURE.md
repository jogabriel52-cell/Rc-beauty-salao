# Arquitetura

## Visão geral

```
 Navegador (React + TS + Vite)
   │  chave publicável + JWT do usuário
   ▼
 Supabase
   ├── Auth ............ login, convites, sessões (cadastro público desativado)
   ├── Data API ........ PostgREST sobre o schema public
   │      └── PostgreSQL: RLS + funções de autorização + gatilhos + auditoria
   └── Edge Functions .. operações que exigem a chave secreta ou lógica de servidor
          (convite, desativação, importação Trinks)
```

- O frontend fala diretamente com a Data API usando o JWT do usuário. Toda
  decisão de acesso acontece no PostgreSQL, por RLS.
- Edge Functions existem apenas onde o banco sozinho não basta: chamadas à API
  administrativa do Auth (`auth.admin.*`) e processamento de arquivos. Elas
  validam o JWT do chamador e, sempre que possível, gravam no banco **com o JWT
  do chamador**, para que RLS e auditoria registrem o ator real.
- Não há servidor de aplicação próprio nesta fase.

## Modelo de dados da Fase 1

```
units ─┬─< unit_memberships >── profiles ──(1:1)── auth.users
       │         └─< membership_permission_overrides >── permissions
       │                                                     │
       │                               role_permissions >────┘
       ├─< professionals (user_id → profiles, opcional)
       ├─< services
       ├─< clients
       └─< appointments ── (client_id, unit_id) → clients
                         ── (professional_id, unit_id) → professionals
                         ── (service_id, unit_id) → services
platform_admins ── profiles
audit_log (gravado por gatilho em todas as tabelas acima)
```

Detalhes e justificativas:

- **Unidade como fronteira de dados.** Cliente, profissional, serviço e
  agendamento pertencem a uma unidade. As chaves estrangeiras compostas
  impedem um agendamento da Sala VIP que referencie um cliente da Geral, mesmo
  por erro de código.
- **Clientes não são compartilhados entre unidades** nesta fase. A mesma pessoa
  pode ter um cadastro em cada unidade. Unificação exige decisão de negócio e
  de privacidade (ver pendências em `SECURITY_REVIEW.md`).
- **Conflito de horário** do mesmo profissional é impedido por restrição de
  exclusão (`btree_gist`) para status ativos (`agendado`, `confirmado`,
  `concluido`). Horários encostados (fim de um = início do outro) são permitidos.
- **Auditoria** guarda o estado anterior e o novo de cada linha, o ator
  (`auth.uid()` ou `app.actor_id` definido por função de servidor) e a role do
  banco. Não há caminho da aplicação para alterar ou apagar auditoria.

Fora da Fase 1: horários de funcionamento, bloqueios de agenda, comandas,
pagamentos, comissões, estoque, mensagens. Ver `PHASE_PLAN.md`.

## Funções de banco expostas

| Função | Uso |
|---|---|
| `has_permission(unit_id, code)` | Base de todas as políticas operacionais |
| `is_platform_admin()` | Políticas administrativas; a interface usa para mostrar a área de administração |
| `is_unit_member(unit_id)` | Visibilidade de unidades |
| `is_own_professional(professional_id)` | Agenda própria do profissional |
| `my_permissions(unit_id)` | Interface: lista de permissões efetivas na unidade |
| `get_my_agenda(from, to)` | Agenda do profissional com nome do cliente, sem expor o cadastro completo |

## Estrutura de repositório (alvo)

```
apps/web/                 frontend React + TS + Vite (a criar)
supabase/
  config.toml             gerado por `supabase init` (a criar)
  migrations/             migrações versionadas
  functions/              Edge Functions (a criar, ver SERVER_FUNCTIONS.md)
  tests/                  testes de banco (RLS, regras)
  BOOTSTRAP.md
scripts/                  utilitários de desenvolvimento
docs/                     especificação
prompts/                  pedidos prontos para o Claude Code
```

## Variáveis de ambiente

| Variável | Onde | Conteúdo |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend | URL do projeto |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend | `sb_publishable_...` |
| chave secreta | segredos das Edge Functions | `sb_secret_...` — nunca no frontend |
| `ALLOWED_ORIGINS` | segredos das Edge Functions | origens autorizadas para CORS |
| `SITE_URL` | segredos das Edge Functions | base para links de convite |

Arquivos `.env*` reais ficam fora do Git (ver `.gitignore`). `.env.example`
contém apenas nomes e valores fictícios.

## Decisões registradas

| # | Decisão | Motivo |
|---|---|---|
| D1 | Supabase como banco, Auth e funções | RLS no PostgreSQL concentra a segurança; menos infraestrutura própria |
| D2 | React + TypeScript + Vite | Ecossistema amplo, tipagem gerada do banco |
| D3 | Hospedagem do frontend decidida após MVP local | Evitar compromisso antes de conhecer requisitos reais |
| D4 | Permissões por unidade com papéis-base + exceções | Atende variações individuais sem multiplicar papéis |
| D5 | Admin Geral não tem acesso operacional implícito | Acesso por unidade sempre explícito e auditável |
| D6 | Clientes por unidade, sem cadastro unificado | Separação Geral × VIP; unificação exige decisão de privacidade |
| D7 | Sem DELETE para a aplicação | Preserva histórico e auditoria |
| D8 | Importação Trinks por CSV real, com mapeamento conferido | Nenhuma API do Trinks é presumida |
| D9 | Escopo do banco limitado à fase corrente | O pacote original misturava quatro fases |
