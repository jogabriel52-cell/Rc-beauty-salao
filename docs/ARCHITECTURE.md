# Arquitetura

## Visão geral

```
 Navegador (React + TypeScript + Vite, apps/web)
   │  chave publicável + JWT do usuário (sessão aal1/aal2)
   ▼
 Supabase
   ├── Auth ............ login por convite, MFA TOTP, sessões
   ├── Data API ........ PostgREST sobre o schema public
   │      └── PostgreSQL: RLS + funções de autorização + gatilhos + auditoria
   └── Edge Functions .. operações que exigem a chave secreta (convite, ativação/desativação)
```

- O frontend fala diretamente com a Data API usando o JWT do usuário. Toda
  decisão de acesso acontece no PostgreSQL.
- Regras de negócio que precisam ser garantidas (finalização de comanda,
  baixa de estoque, mescla de clientes, transições de agenda) estão em gatilhos
  e funções do banco, não na interface.
- Edge Functions só onde o banco não basta (`auth.admin`). Elas validam o JWT
  do chamador e gravam com o JWT dele para que RLS e auditoria registrem o ator
  real. São escritas sem dependências externas.
- Não há servidor de aplicação próprio.

## Migrações

| Arquivo | Conteúdo |
|---|---|
| `20261024150000_rls_auto_enable_guard.sql` | Reproduz a proteção do Cloud: `public.rls_auto_enable()` + event trigger `ensure_rls` (RLS automático em tabelas novas de `public`), idempotente, executável só por `postgres`. |
| `20261024150100_phase1_core.sql` | Modelo inicial (unidades, perfis, auditoria, agenda básica). Mantido como histórico; evoluído pelas seguintes. |
| `20261024150200_phase0_access_model.sql` | Perfis de acesso editáveis, escopo, exceções, MFA, anti-escalada, autoproteção. |
| `20261024150300_phase1_operations.sql` | Clientes (identidade + vínculo), CRM, duplicidades, agenda, comandas, estoque, painel, relatórios. |
| `20261024150400_phase2_trinks_import.sql` | Importação controlada do Trinks (mapeamento conferido, prévia, decisões). |
| `20261024150500_phase3_finance.sql` | Financeiro, conciliação por CSV, comissões configuráveis. |
| `20261024150600_phase4_messaging.sql` | WhatsApp oficial (bloqueado sem credenciais), consentimento, caixa de entrada, follow-ups, pesquisas, SDR IA. |

As migrações foram renumeradas antes do primeiro envio ao Cloud: os nomes
anteriores tinham datas futuras (25 a 29/10/2026), o que faria qualquer
migração nova criada depois ficar ordenada antes delas e ser recusada pelo
`db push`. Nenhuma havia sido aplicada em ambiente compartilhado.

## Modelo de dados

### Acesso (Fase 0)

```
auth.users ──1:1── profiles ──< unit_memberships >── units
                       │              │
             platform_admins          ├── access_profiles ──< access_profile_permissions >── permissions
                                      └──< membership_permission_overrides >── permissions
audit_log (gatilho em todas as tabelas de negócio)
```

### Operação (Fase 1)

```
client_identities (identidade única: nome, telefone, e-mail, nascimento)
   └──< client_units (vínculo por unidade: observações de atendimento, origem, arquivamento)
           ├──< crm_interactions (notas e histórico de CRM, por unidade, somente inclusão)
           ├──< appointments >── professionals, services
           └──< sales ──< sale_items >── services | products, professionals
                     └──< sale_payments
products ──< stock_movements (somente inclusão; vendas geram baixa/estorno)
product_stock (view com saldo, security_invoker)
client_duplicate_dismissals (pares revisados como "não é duplicidade")
unit_sequences (numeração de comandas por unidade)
```

Decisões:

- **Unidade como fronteira**: toda tabela operacional tem `unit_id`; chaves
  estrangeiras compostas `(id, unit_id)` impedem relações entre unidades.
- **Identidade única da cliente**: nome e contato ficam em `client_identities`,
  compartilhados entre as unidades em que a cliente é atendida. Tudo o que é da
  unidade (observações, CRM, agenda, comandas) fica no vínculo e nas tabelas
  ligadas a ele. Ver regras de visibilidade em `ACCESS_CONTROL.md`.
- **Busca de duplicidade entre unidades** só por telefone ou e-mail idênticos,
  com retorno mascarado (`find_client_candidates`). Vincular exige informar o
  mesmo telefone ou e-mail.
- **Mescla** (`merge_clients`) só dentro da unidade, por decisão humana, e
  nunca altera dados de outra unidade.
- **Conflito de horário** do mesmo profissional impedido por restrição de
  exclusão (`btree_gist`) para agendamentos ativos.
- **Comandas**: total calculado pelo banco a partir dos itens; finalização exige
  pagamentos = total, registra quem finalizou e baixa o estoque; cancelamento de
  comanda finalizada estorna o estoque. Itens e pagamentos só mudam com a
  comanda aberta.
- **Auditoria** guarda antes/depois, ator e role do banco; não há caminho da
  aplicação para alterá-la.

## Funções de banco expostas

| Função | Uso |
|---|---|
| `permission_scope`, `has_permission`, `has_unit_scope` | Base das políticas |
| `my_access()` | Interface: acesso, MFA e permissões por unidade |
| `admin_list_people()`, `admin_provision_person()` | Gestão de pessoas |
| `find_client_candidates()`, `create_client()` | Cadastro com verificação de duplicidade |
| `client_duplicate_candidates()`, `dismiss_client_duplicate()`, `merge_clients()` | Revisão de duplicidades |
| `get_my_agenda()` | Agenda do profissional com dados mínimos da cliente |
| `unit_people()` | Pessoas da unidade (nome/cargo) para vendedor e profissional |
| `operational_dashboard()` | Painel operacional |
| `report_sales()`, `report_appointments()` | Relatórios |

## Frontend

- `apps/web/src/auth/AuthProvider.tsx`: sessão, `my_access`, unidade ativa, MFA.
- `apps/web/src/layout/`: menu filtrado pelas permissões da unidade ativa.
- `apps/web/src/pages/admin/`: pessoas e acessos, perfis, auditoria.
- `apps/web/src/pages/ops/`: painel, agenda, minha agenda, clientes,
  duplicidades, serviços, profissionais, comandas, estoque, relatórios.
- Rotas carregadas sob demanda; pacotes de terceiros separados.
- Tipos gerados do banco em `src/lib/database.types.ts`.

## Variáveis de ambiente

| Variável | Onde | Conteúdo |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend | URL do projeto |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend | `sb_publishable_...` |
| `ALLOWED_ORIGINS`, `SITE_URL` | segredos das Edge Functions | CORS e base dos links de convite |
| `SUPABASE_SECRET_KEYS` | injetada pelo Supabase nas Edge Functions | nunca no frontend |

## Decisões registradas

| # | Decisão | Motivo |
|---|---|---|
| D1 | Supabase como banco, Auth e funções | RLS concentra a segurança |
| D2 | React + TypeScript + Vite | Tipagem gerada do banco |
| D3 | Hospedagem decidida após MVP local; sem deploy agora | Instrução do responsável |
| D4 | Perfis de acesso editáveis com escopo e exceções | Cargos mudam; regras ficam em dados, não em código |
| D5 | MFA exigido no banco (aal2) | A interface não é controle de segurança |
| D6 | Identidade única + vínculo por unidade | Requisito: uma cliente, dados de cada unidade separados |
| D7 | Sem mescla automática | Requisito: dúvidas vão para revisão |
| D8 | Edge Functions sem dependências | Cadeia de suprimentos mínima; funcionou em rede restrita |
| D9 | Uma migração por fase | Revisão e reversão por fase |
