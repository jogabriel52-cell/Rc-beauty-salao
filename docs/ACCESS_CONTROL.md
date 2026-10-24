# Controle de acesso

Toda regra deste documento é aplicada no banco (RLS, GRANTs e gatilhos da
migração `20261024000000_phase1_core.sql`). A interface apenas reflete essas
regras para não oferecer ações que vão falhar.

## Conceitos

| Conceito | Tabela | Descrição |
|---|---|---|
| Usuário | `auth.users` + `profiles` | Conta do Auth com perfil de aplicação. Sem perfil ativo, nenhum acesso. |
| Admin Geral | `platform_admins` | Administra unidades, usuários, vínculos e exceções; lê toda a auditoria. |
| Unidade | `units` | `geral` (RC Beauty Geral) e `vip` (Sala VIP). |
| Vínculo | `unit_memberships` | Liga um usuário a uma unidade com **um** papel-base. Sem vínculo ativo, nenhum dado da unidade. |
| Papel-base | `role_permissions` | Conjunto padrão de permissões. |
| Exceção individual | `membership_permission_overrides` | Concede (`grant`) ou revoga (`revoke`) uma permissão para um vínculo, com motivo obrigatório. |

**Permissão efetiva** em uma unidade = (permissões do papel − revogações) ∪
concessões, e só existe se o perfil, o vínculo e a unidade estiverem ativos.
Implementação: `public.has_permission(unit_id, code)`.

### Admin Geral e acesso operacional

O Admin Geral **não** lê clientes ou agenda de uma unidade apenas por ser Admin
Geral. Para operar uma unidade ele precisa de vínculo explícito, criado por ele
mesmo e registrado na auditoria. Assim a separação Geral × VIP vale para todos,
e todo acesso a dados de clientes tem um vínculo rastreável.

## Papéis-base

| Permissão | admin_unidade | recepcao | profissional | somente_leitura |
|---|:-:|:-:|:-:|:-:|
| `clients.view` | ✔ | ✔ | | ✔ |
| `clients.create` | ✔ | ✔ | | |
| `clients.update` | ✔ | ✔ | | |
| `clients.archive` | ✔ | | | |
| `professionals.view` | ✔ | ✔ | ✔ | ✔ |
| `professionals.manage` | ✔ | | | |
| `services.view` | ✔ | ✔ | ✔ | ✔ |
| `services.manage` | ✔ | | | |
| `appointments.view_all` | ✔ | ✔ | | ✔ |
| `appointments.view_own` | ✔ | | ✔ | |
| `appointments.create` | ✔ | ✔ | | |
| `appointments.update` | ✔ | ✔ | | |
| `appointments.cancel` | ✔ | ✔ | | |
| `audit.view` | ✔ | | | |

Observações:

- `profissional` vê apenas agendamentos em que é o profissional
  (`professionals.user_id` = usuário). O nome do cliente vem pela função
  `get_my_agenda`, que não expõe telefone, e-mail ou observações do cadastro.
- `appointments.cancel` sem `appointments.update` permite apenas cancelar
  (status + motivo); remarcar exige `appointments.update`.
- `clients.archive` sem `clients.update` permite apenas arquivar/restaurar.
- Ligar um usuário a um profissional exige que ele tenha vínculo ativo na mesma
  unidade.

## Ações administrativas (somente Admin Geral)

| Ação | Como |
|---|---|
| Criar ou renomear unidade, ativar/desativar | `units` (insert/update) |
| Convidar usuário | Edge Function `admin-invite-user` (precisa da chave secreta) |
| Criar perfil | `profiles` insert (feito pela função de convite) |
| Vincular a uma unidade, trocar papel, desativar vínculo | `unit_memberships` |
| Conceder/revogar permissão individual | `membership_permission_overrides` (motivo obrigatório) |
| Desativar/reativar usuário | Edge Function `admin-deactivate-user` / `admin-reactivate-user` |
| Criar ou remover Admin Geral | Somente administrador do banco no SQL Editor (`supabase/BOOTSTRAP.md`) |

Proteções no banco:

- Ninguém altera o próprio campo `active`; ninguém desativa a si mesmo.
- Não é possível desativar ou remover o último Admin Geral ativo.
- `user_id` de um vínculo e `unit_id` de qualquer registro são imutáveis.
- Desativar um usuário exige motivo e corta o acesso a dados **imediatamente**,
  mesmo que o token de sessão ainda não tenha expirado, porque toda verificação
  consulta `profiles.active`.

## Ciclo de vida do usuário

1. **Entrada.** Admin Geral convida (e-mail, nome, unidades e papéis). O usuário
   recebe o e-mail, define a senha e entra.
2. **Mudança de função.** Admin Geral altera o papel do vínculo ou adiciona
   exceção com motivo. Preferir mudar o papel a acumular exceções.
3. **Transferência de unidade.** Desativar o vínculo antigo e criar o novo.
   Nunca reaproveitar um vínculo trocando a unidade (o banco impede).
4. **Afastamento ou desligamento.** Desativar o usuário com motivo, no mesmo dia.
   A função também bloqueia o login no Auth.
5. **Revisão periódica.** Mensalmente, o Admin Geral revisa vínculos ativos e
   exceções (consultas em `OPERATIONS.md`).

Usuários não são excluídos: `profiles` referencia `auth.users` com
`on delete restrict`, o que impede apagar pelo painel uma conta que tenha
perfil. Pedido de exclusão de dados pessoais de funcionário segue procedimento
próprio, ainda a definir (pendência em `SECURITY_REVIEW.md`).

## Regras para quem desenvolve

- Nunca usar `user_metadata` (editável pelo próprio usuário) nem
  `app_metadata` para autorização nesta arquitetura.
- Nunca filtrar dados por unidade apenas no frontend esperando que isso proteja
  algo. Sempre conferir com testes que o banco recusa.
- Nova permissão: migração + `permissions` + `role_permissions` + políticas +
  testes + atualização desta matriz.
- Novos papéis-base exigem justificativa; o preferido é ajustar exceções.
