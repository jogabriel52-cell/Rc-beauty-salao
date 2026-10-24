# Controle de acesso

Todas as regras deste documento são aplicadas **no banco** (RLS, GRANTs e
gatilhos). A interface só reflete essas regras para não oferecer ações que vão
falhar. Implementação: `supabase/migrations/20261025000000_phase0_access_model.sql`
e as políticas de cada módulo nas migrações das fases seguintes.

## Conceitos

| Conceito | Onde | Descrição |
|---|---|---|
| Pessoa | `auth.users` + `profiles` | Conta do Auth com perfil de aplicação. Sem perfil ativo, nenhum acesso. |
| Unidade | `units` | `geral` (RC Beauty Geral) e `vip` (Sala VIP). |
| Perfil de acesso | `access_profiles` + `access_profile_permissions` | **Modelo editável** de permissões. Não é cargo fixo no código. |
| Permissão | `permissions` | `módulo.ação`, com os escopos permitidos. |
| Escopo | `access_scope` | `own` = somente o que é da própria pessoa; `unit` = toda a unidade. |
| Vínculo | `unit_memberships` | Pessoa × unidade com **um** perfil de acesso. Sem vínculo ativo, nenhum dado da unidade. |
| Exceção individual | `membership_permission_overrides` | Concede (com escopo) ou revoga uma permissão em um vínculo, com motivo obrigatório. |
| Admin Geral | `platform_admins` | Marca de superadministração (criada só pelo administrador do banco). |

**Permissão efetiva** na unidade (`public.permission_scope(unit, código)`):

1. só existe com perfil de pessoa ativo, vínculo ativo, unidade ativa e MFA
   satisfeito (quando exigido);
2. revogação individual remove a permissão;
3. caso contrário, vale o **maior** escopo entre o perfil e a concessão individual.

## Perfis iniciais (modelos editáveis)

Criados pela migração com uma chave interna (`key`) que só serve para as
migrações encontrarem os modelos. Nome, descrição, exigência de MFA e
permissões são editáveis em **Perfis de acesso**.

| Perfil | MFA | Intenção |
|---|:-:|---|
| Admin Geral | ✔ | Acesso completo às unidades vinculadas, inclusive gestão de acessos. Atribuído ao João no bootstrap. |
| Direção | ✔ | Acesso completo aos módulos das unidades vinculadas, inclusive financeiro e gestão de acessos. Previsto para Rosa, Amanda e Giarlisson (cadastro feito pela direção, não no código). |
| Gerente | | Opera agenda, clientes, comandas, estoque, relatórios e o financeiro da própria unidade. Previsto para Ivny, na unidade escolhida no cadastro. |
| Vendedora | | CRM/WhatsApp e agendamentos; vê as próprias vendas e a própria comissão. |
| Recepção | | Agenda, cadastro de clientes, abre e finaliza comandas. |
| Profissional | | Somente a própria agenda (com os dados da cliente necessários ao atendimento) e a própria comissão. Cabeleireiras, manicures, lash designers. |
| Somente leitura | | Consulta de dados operacionais, sem alterações e sem financeiro. |

A matriz completa de permissões por perfil está ao final deste documento e é
atualizada a cada fase.

## Gestão de acessos

### Quem pode

| Ação | Regra |
|---|---|
| Convidar pessoa, criar vínculo, trocar perfil, desativar vínculo, criar/remover exceção | `access.manage` em escopo de unidade **na unidade do vínculo** |
| Ativar ou desativar a pessoa (todas as unidades) | `access.manage` em **todas** as unidades em que ela tem vínculo ativo |
| Criar ou editar perfis de acesso (afetam todas as unidades) | `access.manage` em **todas** as unidades ativas, ou Admin Geral |
| Criar ou remover Admin Geral | Somente o administrador do banco, no SQL Editor (`supabase/BOOTSTRAP.md`) |
| Criar ou editar unidades | Admin Geral |

### Proteções (gatilhos no banco)

- **Ninguém altera as próprias permissões**: não cria, altera ou desativa o
  próprio vínculo; não cria exceção para si; não edita perfil de acesso que
  possui; não se ativa nem se desativa.
- **Anti-escalada**: só é possível atribuir perfis e conceder exceções cujas
  permissões (e escopos) o próprio ator possui na unidade. Para perfis, em todas
  as unidades ativas.
- **Admin Geral protegido**: vínculos, exceções, perfil de pessoa e modelos
  usados pelo Admin Geral só são alterados por outro Admin Geral.
- **Último Admin Geral ativo** não pode ser desativado nem removido.
- **Perfil em uso** não pode ser desativado (mova as pessoas antes).
- `user_id` de vínculo e `unit_id` de qualquer registro são imutáveis.
- Desativar uma pessoa exige motivo e corta o acesso aos dados
  **imediatamente**, mesmo com sessão aberta; a função de servidor também
  bloqueia o login no Auth.

### Auditoria de concessões

Toda inserção, alteração ou remoção em `unit_memberships`,
`membership_permission_overrides`, `access_profiles`,
`access_profile_permissions`, `profiles` e `platform_admins` é registrada em
`audit_log` com o ator (`auth.uid()`), a role do banco e o antes/depois. A tela
**Auditoria** filtra essas concessões. Registros sem unidade (modelos de acesso)
são visíveis para o Admin Geral e para quem tem `audit.view` em todas as
unidades.

## MFA

- Perfis com **Exige MFA** (Admin Geral e Direção, por padrão) e o Admin Geral
  só têm permissões efetivas com sessão `aal2` (senha + código TOTP). Com `aal1`,
  o banco devolve zero permissões e a aplicação leva à tela de MFA.
- Ao verificar o MFA, o Auth encerra as outras sessões da pessoa.
- A exigência pode ser ligada em qualquer outro perfil pela tela de perfis.

## Visibilidade de pessoas

- Cada pessoa vê o próprio perfil e o nome dos colegas que compartilham alguma
  unidade (para agenda e comandas). E-mail e status de acesso aparecem somente
  em **Pessoas e acessos**, pela função `admin_list_people`, para quem gere a
  unidade.

## Ciclo de vida

1. **Entrada**: convite (nome, e-mail, cargo, unidades e perfil). A pessoa define
   a senha pelo link do e-mail; se o perfil exigir, cadastra o MFA no primeiro
   acesso.
2. **Ajustes**: trocar o perfil do vínculo ou adicionar exceção com motivo.
   Preferir ajustar o perfil a acumular exceções.
3. **Transferência de unidade**: remover o acesso à unidade antiga e adicionar a
   nova.
4. **Saída/afastamento**: desativar com motivo no mesmo dia.
5. **Revisão mensal** dos vínculos e exceções (`docs/OPERATIONS.md`).

Pessoas não são excluídas: `profiles` referencia `auth.users` com
`on delete restrict`.

## Regras para quem desenvolve

- Autorização nunca vem de `user_metadata`, `app_metadata`, parâmetros do
  cliente ou `localStorage`.
- Gatilhos de proteção rodam como o chamador (sujeitos a RLS). Consultas que
  precisam enxergar além do que o chamador vê usam funções auxiliares
  `SECURITY DEFINER` (ex.: `actor_manages_person`). Erro já encontrado e
  corrigido: uma checagem que consultava vínculos sob RLS deixava passar um
  caso proibido.
- Funções de autorização devem retornar `false`, nunca `NULL`, quando negam
  (`coalesce`): `NOT NULL` é `NULL` e deixa checagens de negação passarem.
- Nova permissão: migração + `permissions` + atribuição nos modelos por `key` +
  políticas + testes (pgTAP e integração) + atualização da matriz abaixo.

## Matriz de permissões por perfil

Legenda: **U** = toda a unidade; **P** = somente o próprio; vazio = sem acesso.
Valores iniciais; a direção pode alterá-los em Perfis de acesso.

| Permissão | Admin Geral | Direção | Gerente | Vendedora | Recepção | Profissional | Somente leitura |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `access.manage` — pessoas e acessos | U | U | | | | | |
| `audit.view` — auditoria | U | U | U | | | | |
| `clients.view` — cadastro de clientes | U | U | U | U | U | | U |
| `clients.create` — cadastrar/vincular | U | U | U | U | U | | |
| `clients.update` — editar cadastro e observações de atendimento | U | U | U | U | U | | |
| `clients.archive` — arquivar | U | U | U | | | | |
| `clients.merge` — revisar duplicidades | U | U | U | | | | |
| `crm.view` — notas privadas e histórico | U | U | U | U | U | | |
| `crm.write` — registrar CRM | U | U | U | U | | | |
| `services.view` / `services.manage` | U / U | U / U | U / U | U / – | U / – | U / – | U / – |
| `professionals.view` / `professionals.manage` | U / U | U / U | U / U | U / – | U / – | U / – | U / – |
| `appointments.view` — agenda | U | U | U | U | U | **P** | U |
| `appointments.create` / `update` / `cancel` | U | U | U | U | U | | |
| `sales.view` — comandas | U | U | U | **P** | U | | U |
| `sales.open` / `edit` / `finalize` | U | U | U | | U | | |
| `sales.cancel` — cancelar (estorna estoque) | U | U | U | | | | |
| `stock.view` / `stock.manage` | U / U | U / U | U / U | | U / – | | U / – |
| `dashboard.view` — painel | U | U | U | | U | | U |
| `reports.view` — relatórios | U | U | U | | | | U |
| `imports.run` — importação Trinks | U | U | | | | | |
| `finance.view` / `finance.manage` / `finance.reconcile` | U | U | U | | | | |
| `commissions.view` — comissões | U | U | **P** | **P** | | **P** | |
| `commissions.manage` — regras, metas, apuração | U | U | | | | | |
| `messaging.view` — caixa de entrada | U | U | U | U | | | |
| `messaging.send` — responder/enviar (canal ativo) | U | U | U | U | | | |
| `messaging.manage` — canal, modelos, ativação, SDR IA | U | U | | | | | |
| `consent.manage` — registrar consentimento/opt-out | U | U | U | U | U | | |
| `followups.manage` — follow-ups | U | U | U | **P** | **P** | | |
| `surveys.manage` — pesquisa de satisfação | U | U | U | | | | |

Escopo **P** (próprio):

- `appointments.view` P: só agendamentos em que a pessoa é o profissional. O
  nome da cliente e as observações de atendimento chegam pela função
  `get_my_agenda`; telefone, e-mail e CRM não.
- `sales.view` P: só comandas que a pessoa abriu, vendeu ou finalizou.
- `commissions.view` P: só as próprias apurações e o próprio plano (ninguém
  configura, apura, aprova ou paga a própria comissão — ver `COMMISSIONS.md`).
- `messaging.view` P (disponível para perfis personalizados): só conversas
  atribuídas à pessoa. Com U, vê todas da unidade; atribuir, encerrar e
  reabrir conversas exige U + `messaging.send`.
- `followups.manage` P: só follow-ups atribuídos à própria pessoa, e só pode
  criá-los para si. Reengajamento (lista de inativas) exige U e `clients.view`.

Regras de mensagens garantidas pelo banco (valem para qualquer perfil):

- O canal só fica ativo com credencial, webhook e teste verificados pelo
  servidor e texto de consentimento; a aplicação não grava essas marcas.
- Pessoas só criam e descartam **rascunhos**; envio, recebimento e status são
  gravados pelo servidor. A IA só gera rascunhos.
- Consentimento é registro somente de inclusão (revogar = novo opt-out); datas
  futuras são recusadas.
- Canal, modelos, consentimento, follow-ups e pesquisas são auditados; o
  conteúdo das mensagens não vai para a auditoria.

## Clientes: o que cada unidade enxerga

| Dado | Onde fica | Quem vê |
|---|---|---|
| Nome, telefone, e-mail, nascimento | `client_identities` (única) | Quem tem `clients.view` em **alguma unidade vinculada** à cliente |
| Observações de atendimento | `client_units` (por unidade) | `clients.view` na unidade; profissional na própria agenda |
| Notas privadas e histórico de CRM | `crm_interactions` (por unidade) | `crm.view` na unidade |
| Agenda e comandas | por unidade | permissões da unidade |
| Existência em outra unidade | `find_client_candidates` | Só por telefone/e-mail idênticos, com nome e telefone mascarados |

A edição de nome/contato por uma unidade vale para as demais unidades
vinculadas (é a mesma identidade) e fica registrada na auditoria.

Importação: o mapeamento de colunas precisa ser aprovado por pessoa diferente
de quem o editou por último (conferência). Comissões: a apuração é aprovada
por pessoa diferente de quem apurou.

Mensagens: conversas e consentimento são da unidade dona do número. Uma
cliente vinculada às duas unidades tem consentimentos separados em cada uma.
