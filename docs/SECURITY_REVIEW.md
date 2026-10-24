# Revisão de segurança

Estado em 2026-10-24. Este documento registra o que foi desenhado, o que foi
verificado e o que falta. Ele **não** atesta que o sistema é seguro: nenhuma
parte foi executada em um projeto Supabase real e o frontend e as Edge
Functions ainda não existem.

## Escopo

Migração `supabase/migrations/20261024000000_phase1_core.sql`, procedimento de
bootstrap e contratos de `docs/SERVER_FUNCTIONS.md`.

## Ativos e ameaças principais

| Ativo | Ameaça | Controle |
|---|---|---|
| Dados de clientes (nome, telefone, e-mail, nascimento, observações) | Leitura por pessoa sem vínculo ou de outra unidade | RLS por `has_permission`; nada para `anon`; testes de isolamento Geral × VIP |
| Agenda | Alteração indevida, conflito de horários | Permissões separadas para criar, editar e cancelar; restrição de exclusão |
| Contas e permissões | Autoescalada de privilégio | Escrita em vínculos/exceções só por Admin Geral; `platform_admins` só pelo administrador do banco; GRANTs por coluna |
| Chave secreta | Vazamento pelo frontend ou repositório | Só em segredos de Edge Functions; regra explícita em `CLAUDE.md` |
| Auditoria | Apagamento ou falsificação | Gravada só por gatilho `SECURITY DEFINER`; sem GRANT de escrita; `created_by` forçado pelo banco |
| Ex-funcionário | Acesso após desligamento | `profiles.active` verificado em toda permissão; bloqueio no Auth pela função de desativação |

## Controles implementados na migração

- RLS habilitado em todas as 12 tabelas de `public`.
- `revoke all` de `anon` e `authenticated`, seguido de GRANTs explícitos por
  tabela e por coluna. Privilégios padrão do schema revogados para objetos
  futuros criados pela role `postgres`.
- `execute` de funções revogado de `public`/`anon`; liberado a
  `authenticated` apenas nas funções necessárias.
- Funções `SECURITY DEFINER` com `search_path = ''` e nomes qualificados.
- Sem `DELETE` para a aplicação, exceto em exceções individuais (Admin Geral).
- `unit_id` imutável; chaves compostas impedem relações entre unidades.
- `created_by`, `cancelled_by`, `archived_by`, `deactivated_at` preenchidos
  pelo banco.
- Último Admin Geral ativo protegido; ninguém se autodesativa.
- Ator da auditoria: `auth.uid()` sempre prevalece sobre `app.actor_id`, que só
  é usado quando não há JWT de usuário (funções de servidor).

## Verificação executada

| Data | Ambiente | O quê | Resultado |
|---|---|---|---|
| 2026-10-24 | PostgreSQL 16 puro + simulador mínimo do Auth (`supabase/tests/shim/`) | `scripts/precheck-migrations.sh`: aplica a migração e roda `supabase/tests/rls_phase1_test.sql` (70 asserções) | Todas passaram |
| 2026-10-24 | Mesmo ambiente | Bloco de bootstrap de `supabase/BOOTSTRAP.md`, incluindo recusa na segunda execução | Funcionou como descrito |

Limites dessa verificação: o simulador não reproduz o Supabase real (roles
internas, `auth.uid()` oficial, PostgREST, configurações do Auth, privilégios
padrão exatos). É uma pré-checagem, não validação.

## Não verificado

- Migração na stack local oficial (`supabase start` / `supabase db reset`).
- Migração no projeto Supabase Cloud de desenvolvimento.
- Security Advisor e Performance Advisor do painel.
- Chamadas reais pela Data API com JWTs de cada papel.
- Edge Functions (não implementadas).
- Frontend (não implementado).

## Pendências antes de dados reais

Itens em ordem de prioridade. Nenhum dado real de cliente deve entrar antes de
todos os itens **bloqueantes** estarem concluídos e registrados.

| # | Item | Tipo | Fase |
|---|---|---|---|
| P1 | Validar migração e testes na stack local e no projeto de desenvolvimento (níveis 1 e 2 de `BUILD_AND_VALIDATION.md`) | Bloqueante | 1 |
| P2 | Security Advisor sem erros; avisos justificados por escrito | Bloqueante | 1 |
| P3 | Implementar e testar `admin-invite-user`, `admin-deactivate-user`, `admin-reactivate-user` conforme contrato | Bloqueante | 1 |
| P4 | Cadastro público desativado, URLs de redirecionamento restritas, SMTP próprio configurado | Bloqueante | 1 |
| P5 | MFA obrigatório para Admin Geral: fluxo TOTP no frontend e exigência de `aal2` em `is_platform_admin()` (nova migração) | Bloqueante | 1 |
| P6 | LGPD: base legal, aviso de privacidade aos clientes, política de retenção (inclusive da auditoria, que guarda dados pessoais), procedimento de atendimento a titulares (acesso, correção, anonimização) | Bloqueante | 1 |
| P7 | Plano de backup e restauração testado; avaliar PITR do plano contratado | Bloqueante | 1 |
| P8 | Projeto de produção separado do de desenvolvimento, com senhas e chaves próprias | Bloqueante | 1 |
| P9 | Proteção de senha vazada e política de senha no Auth (conforme plano) | Recomendado | 1 |
| P10 | Política de CSP e cabeçalhos de segurança na hospedagem do frontend | Recomendado | 1 |
| P11 | Medir desempenho das políticas com volume realista (funções por linha); ajustar índices | Recomendado | 1 |
| P12 | Proteção de branch, revisão obrigatória e varredura de segredos no repositório | Recomendado | 0 |
| P13 | Políticas de Storage antes de qualquer upload (importação usa staging em tabela) | Bloqueante quando usar Storage | 2 |
| P14 | Revisão própria para importação Trinks, financeiro, WhatsApp e banco | Bloqueante para cada fase | 2–4 |

## Sobre o SQL original do Builder

O SQL do pacote original foi descartado como fonte de execução porque:

- misturava tabelas das quatro fases num único script;
- descrevia funções que não existiam no próprio script;
- tinha políticas insuficientes para separar unidades e papéis.

Ele pode ser mantido apenas como referência histórica, fora de
`supabase/migrations/`, e nunca deve ser executado nem copiado para um banco
ativo.

## Como reportar um problema de segurança

Registrar em canal privado com o responsável pelo projeto (não em issue
pública), com passos para reproduzir. Se houver suspeita de vazamento de
chave: rotacionar a chave no painel imediatamente e depois investigar.
