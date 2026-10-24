# Bootstrap do primeiro Admin Geral

Procedimento executado **uma única vez por projeto Supabase**, depois de aplicar
as migrações. Ele cria o primeiro Admin Geral, que a partir daí administra
usuários e vínculos pela aplicação (e, até ela existir, pelo SQL Editor seguindo
docs/ACCESS_CONTROL.md).

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

Substitua o UID e o nome. Revise o bloco de vínculos: ele atribui o papel
`admin_unidade` explicitamente nas duas unidades. Remova a unidade que esta
pessoa não deve operar.

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

  -- Acesso operacional explícito por unidade (revise antes de executar).
  insert into public.unit_memberships (user_id, unit_id, role)
  select v_user_id, u.id, 'admin_unidade'
  from public.units u
  where u.code in ('geral', 'vip');
end;
$$;
```

O bloco é atômico: se qualquer verificação falhar, nada é gravado.

## Passo 3 — Conferir

```sql
select p.id, p.full_name, p.active,
       (select count(*) from public.platform_admins pa where pa.user_id = p.id) as admin_geral,
       array_agg(u.code || ':' || m.role order by u.code) as vinculos
from public.profiles p
left join public.unit_memberships m on m.user_id = p.id and m.active
left join public.units u on u.id = m.unit_id
group by p.id;

select occurred_at, db_role, table_name, action
from public.audit_log
order by id;
```

Esperado: um perfil ativo, `admin_geral = 1`, os vínculos escolhidos e, na
auditoria, as duas unidades criadas pela migração seguidas das inserções do
bootstrap, todas com `db_role = postgres` e `actor_id` nulo (sinal de operação
administrativa direta no banco).

## Passo 4 — Proteger a conta

- Ativar MFA para essa conta assim que a aplicação oferecer o fluxo (pendência
  registrada em docs/SECURITY_REVIEW.md).
- Registrar, fora do repositório, quem executou o bootstrap, quando e em qual
  projeto.

## Novos Admins Gerais depois do bootstrap

Não reexecute o bloco acima. Um novo Admin Geral é criado por um administrador
do banco no SQL Editor, com registro da decisão:

```sql
insert into public.platform_admins (user_id) values ('<UID com perfil ativo>');
```

Remover um Admin Geral: `delete from public.platform_admins where user_id = '<UID>';`
— o banco impede remover ou desativar o último Admin Geral ativo.
