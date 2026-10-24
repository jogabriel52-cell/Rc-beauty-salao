-- =============================================================================
-- RC Beauty — proteção: RLS habilitado automaticamente em tabelas novas de public
--
-- O projeto Cloud de desenvolvimento já nasceu com a função
-- public.rls_auto_enable() e o event trigger ensure_rls (criados pelo
-- painel). Esta migração reproduz a mesma proteção de forma versionada e
-- idempotente, para que o banco local e o repositório fiquem iguais ao Cloud:
--   * recria a função com o mesmo corpo (apenas search_path vazio, convenção
--     do projeto; pg_catalog continua implícito);
--   * cria o event trigger somente se não existir (sem duplicar);
--   * somente o dono (postgres) executa a função.
-- As migrações seguintes continuam habilitando RLS explicitamente em cada
-- tabela; este gatilho é uma segunda barreira.
-- =============================================================================

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;

do $$
declare
  v_fn regprocedure;
begin
  select evtfoid::regprocedure into v_fn from pg_catalog.pg_event_trigger where evtname = 'ensure_rls';
  if v_fn is null then
    create event trigger ensure_rls on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  elsif v_fn <> 'public.rls_auto_enable()'::regprocedure then
    raise exception 'Event trigger ensure_rls já existe apontando para %; revisar antes de aplicar', v_fn;
  end if;
end;
$$;
