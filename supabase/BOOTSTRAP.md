# Bootstrap do primeiro Admin Geral

Procedimento executado **uma única vez por projeto Supabase**, depois de aplicar
as migrações. Ele cria o primeiro Admin Geral, que a partir daí cadastra as
demais pessoas (Direção, Gerente, Vendedoras, Recepção, Profissionais) pela
tela **Pessoas e acessos** da aplicação. Nomes e e-mails não ficam no código:
são informados aqui (Admin Geral) e na aplicação (demais pessoas).

O bootstrap roda **somente no SQL Editor do painel do Supabase**, que executa
como administrador do banco (`postgres`). Ele não pode ser feito pela aplicação:
nenhum usuário da aplicação tem permissão de escrita em `platform_admins`.

## Pré-requisitos

- Migrações aplicadas (`supabase db push` ou `supabase db reset` no local).
- Cadastro público desativado no Auth (ver docs/CLOUD_SETUP.md).
- A pessoa que será Admin Geral está presente e tem acesso ao próprio e-mail.

## Passo 1 — Criar o usuário no Auth

Painel → **Authentication → Users → Add user**:

- Use **Send invitation** se o SMTP já estiver configurado; caso contrário,
  **Create new user** com e-mail e uma senha temporária forte, marcando
  *Auto Confirm User*. Entregue a senha temporária por canal separado e peça a
  troca no primeiro acesso.
- Não preencha `user_metadata` com papel ou permissões. Autorização nunca vem de
  metadados do usuário.

Copie o **UID** do usuário criado.

## Passo 2 — Executar o bootstrap no SQL Editor

Substitua o UID e o nome. O bloco atribui explicitamente o perfil de acesso
**Admin Geral** nas duas unidades (acesso completo a todos os módulos).

```sql
do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-000000000000';  -- UID do Auth
  v_name    text := 'Nome Completo do Admin';
begin
  if v_user_id = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Preencha o UID do usuário';
  end if;
  if not exists (select 1 from auth.users where id = v_user_id) then
    raise exception 'Usuário % não existe no Auth', v_user_id;
  end if;
  if exists (select 1 from public.platform_admins) then
    raise exception 'Já existe Admin Geral. O bootstrap não deve ser repetido; '
                    'novos administradores são criados por procedimento revisado.';
  end if;

  insert into public.profiles (id, full_name)
  values (v_user_id, v_name);

  insert into public.platform_admins (user_id)
  values (v_user_id);

  -- Acesso explícito às duas unidades com o perfil Admin Geral.
  insert into public.unit_memberships (user_id, unit_id, access_profile_id)
  select v_user_id, u.id, ap.id
  from public.units u
  cross join public.access_profiles ap
  where u.code in ('geral', 'vip') and ap.key = 'admin_geral';
end;
$$;
```

O bloco é atômico: se qualquer verificação falhar, nada é gravado.

## Passo 3 — Conferir

```sql
select p.id, p.full_name, p.active,
       (select count(*) from public.platform_admins pa where pa.user_id = p.id) as admin_geral,
       array_agg(u.code || ':' || ap.name order by u.code) as vinculos
from public.profiles p
left join public.unit_memberships m on m.user_id = p.id and m.active
left join public.units u on u.id = m.unit_id
left join public.access_profiles ap on ap.id = m.access_profile_id
group by p.id;

select occurred_at, db_role, table_name, action
from public.audit_log
order by id;
```

Esperado: um perfil ativo, `admin_geral = 1`, vínculos `geral:Admin Geral` e
`vip:Admin Geral` e, na auditoria, as inserções do bootstrap com
`db_role = postgres` e `actor_id` nulo (sinal de operação administrativa direta
no banco).

## Passo 4 — Primeiro acesso com MFA

O perfil Admin Geral exige MFA. No primeiro login, a aplicação mostra o QR code
para cadastrar o aplicativo autenticador; sem o código, nenhuma permissão é
efetiva (o banco exige `aal2`). Registre, fora do repositório, quem executou o
bootstrap, quando e em qual projeto.

## Passo 5 — Cadastrar a Direção e a equipe

Pela aplicação, em **Pessoas e acessos → Convidar pessoa**: informar nome,
e-mail, unidades e perfil (Direção, Gerente, Vendedora, Recepção, Profissional
ou Somente leitura). A Direção também exige MFA no primeiro acesso.

## Novos Admins Gerais depois do bootstrap

Não reexecute o bloco acima. Um novo Admin Geral é criado por um administrador
do banco no SQL Editor, com registro da decisão:

```sql
insert into public.platform_admins (user_id) values ('<UID com perfil ativo>');
```

Remover um Admin Geral: `delete from public.platform_admins where user_id = '<UID>';`
— o banco impede remover ou desativar o último Admin Geral ativo.
