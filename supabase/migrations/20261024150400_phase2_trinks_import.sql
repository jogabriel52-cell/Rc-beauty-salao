-- =============================================================================
-- RC Beauty — Fase 2: importação controlada do Trinks (CSV)
--
-- Nenhum formato do Trinks é presumido. O fluxo é:
--   1. Mapeamento montado a partir dos cabeçalhos de uma exportação real
--      (import_mappings), salvo como rascunho e APROVADO por outra pessoa.
--   2. O navegador lê o CSV e envia somente os campos mapeados; o banco
--      normaliza, valida e classifica cada linha (prévia, nada gravado em
--      clientes).
--   3. Revisão humana das linhas com dúvida (nenhuma mescla automática).
--   4. Confirmação: cria/vincula clientes com origem 'trinks_csv' e o código
--      do Trinks; o mesmo arquivo não pode ser importado duas vezes na unidade.
--   5. Linhas de staging (dados pessoais) são apagadas ao descartar e podem ser
--      expurgadas após o prazo de retenção.
-- =============================================================================

insert into public.permissions (code, module, action, module_label, description, allowed_scopes, sort_order) values
  ('imports.run', 'imports', 'run', 'Importação',
   'Preparar mapeamentos, conferir prévias e confirmar importações de dados (Trinks)', '{unit}', 800);

insert into public.access_profile_permissions (profile_id, permission_code, scope)
select ap.id, 'imports.run', 'unit' from public.access_profiles ap where ap.key in ('admin_geral', 'direcao');

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------

create table public.import_mappings (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 3 and 120),
  entity        text not null default 'clients' check (entity in ('clients')),
  -- {"full_name": "<cabeçalho>", "phone": "...", "email": "...", "birth_date": "...",
  --  "external_ref": "...", "notes": "..."}; full_name obrigatório.
  columns       jsonb not null,
  date_format   text not null default 'DD/MM/YYYY' check (date_format in ('DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY')),
  source_headers text[] not null default '{}',
  status        text not null default 'rascunho' check (status in ('rascunho', 'aprovado', 'arquivado')),
  last_edited_by uuid,
  approved_by   uuid,
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  check (columns ? 'full_name' and jsonb_typeof(columns -> 'full_name') = 'string'),
  check (status <> 'aprovado' or approved_by is not null)
);

create table public.import_batches (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.units (id) on delete restrict,
  mapping_id    uuid not null references public.import_mappings (id) on delete restrict,
  file_name     text not null check (length(file_name) between 1 and 255),
  file_sha256   text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  row_count     integer not null check (row_count between 1 and 20000),
  status        text not null default 'rascunho'
                check (status in ('rascunho', 'confirmado', 'descartado')),
  summary       jsonb,
  confirmed_by  uuid,
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  unique (id, unit_id)
);
create unique index import_batches_once_uidx
  on public.import_batches (unit_id, file_sha256) where status = 'confirmado';

create table public.import_rows (
  id                    uuid primary key default gen_random_uuid(),
  batch_id              uuid not null,
  unit_id               uuid not null,
  row_number            integer not null check (row_number > 0),
  full_name             text,
  phone_raw             text,
  phone                 text,
  email                 text,
  birth_date            date,
  external_ref          text,
  notes                 text,
  classification        text not null check (classification in (
                          'nova', 'vincular', 'duplicada_na_unidade', 'duplicada_no_arquivo',
                          'possivel_duplicidade', 'invalida')),
  match_identity_id     uuid references public.client_identities (id) on delete set null,
  match_client_unit_id  uuid references public.client_units (id) on delete set null,
  match_hint            text,
  issues                text[] not null default '{}',
  decision              text check (decision in ('criar', 'vincular', 'ignorar')),
  decided_by            uuid,
  result_client_unit_id uuid references public.client_units (id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (batch_id, row_number),
  foreign key (batch_id, unit_id) references public.import_batches (id, unit_id) on delete cascade,
  check (classification <> 'invalida' or decision = 'ignorar')
);
create index import_rows_batch_idx on public.import_rows (batch_id, classification);

-- -----------------------------------------------------------------------------
-- Funções
-- -----------------------------------------------------------------------------

create or replace function public.can_import_any_unit()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.units u where u.active and public.has_permission(u.id, 'imports.run'));
$$;

-- Data conforme o formato do mapeamento; NULL se inválida.
create or replace function public.parse_import_date(p_value text, p_format text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_value, ''));
  v_date date;
begin
  if v = '' then return null; end if;
  begin
    v_date := case p_format
      when 'DD/MM/YYYY' then to_date(v, 'DD/MM/YYYY')
      when 'MM/DD/YYYY' then to_date(v, 'MM/DD/YYYY')
      else to_date(v, 'YYYY-MM-DD')
    end;
  exception when others then
    return null;
  end;
  if v_date < date '1900-01-02' or v_date > current_date then
    return null;
  end if;
  return v_date;
end;
$$;

-- Salva (cria ou edita) um mapeamento como rascunho. Editar um mapeamento
-- aprovado volta-o para rascunho, exigindo nova aprovação.
create or replace function public.import_save_mapping(
  p_id uuid, p_name text, p_columns jsonb, p_date_format text, p_source_headers text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_key text;
begin
  if not public.can_import_any_unit() then
    raise exception 'Sem permissão para importar' using errcode = '42501';
  end if;
  for v_key in select jsonb_object_keys(p_columns) loop
    if v_key not in ('full_name', 'phone', 'email', 'birth_date', 'external_ref', 'notes') then
      raise exception 'Campo de destino desconhecido: %', v_key using errcode = '22023';
    end if;
  end loop;
  if v_id is null then
    insert into public.import_mappings (name, columns, date_format, source_headers, last_edited_by)
    values (p_name, p_columns, p_date_format, coalesce(p_source_headers, '{}'), public.current_actor_id())
    returning id into v_id;
  else
    update public.import_mappings
    set name = p_name, columns = p_columns, date_format = p_date_format,
        source_headers = coalesce(p_source_headers, source_headers),
        status = 'rascunho', approved_by = null, approved_at = null,
        last_edited_by = public.current_actor_id()
    where id = v_id and status <> 'arquivado';
    if not found then
      raise exception 'Mapeamento não encontrado' using errcode = '22023';
    end if;
  end if;
  return v_id;
end;
$$;

-- Aprovação por pessoa diferente de quem editou por último (conferência).
create or replace function public.import_approve_mapping(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_editor uuid;
begin
  if not public.can_import_any_unit() then
    raise exception 'Sem permissão para importar' using errcode = '42501';
  end if;
  select last_edited_by into v_editor from public.import_mappings where id = p_id and status = 'rascunho';
  if not found then
    raise exception 'Mapeamento não está em rascunho' using errcode = '22023';
  end if;
  if v_editor = public.current_actor_id() then
    raise exception 'O mapeamento deve ser conferido e aprovado por outra pessoa' using errcode = '42501';
  end if;
  update public.import_mappings
  set status = 'aprovado', approved_by = public.current_actor_id(), approved_at = now()
  where id = p_id;
end;
$$;

create or replace function public.import_create_batch(
  p_unit_id uuid, p_mapping_id uuid, p_file_name text, p_file_sha256 text, p_row_count integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.has_permission(p_unit_id, 'imports.run') then
    raise exception 'Sem permissão para importar nesta unidade' using errcode = '42501';
  end if;
  if not exists (select 1 from public.import_mappings where id = p_mapping_id and status = 'aprovado') then
    raise exception 'Use um mapeamento aprovado' using errcode = '22023';
  end if;
  if exists (select 1 from public.import_batches
             where unit_id = p_unit_id and file_sha256 = lower(p_file_sha256) and status = 'confirmado') then
    raise exception 'Este arquivo já foi importado nesta unidade' using errcode = '23505';
  end if;
  insert into public.import_batches (unit_id, mapping_id, file_name, file_sha256, row_count)
  values (p_unit_id, p_mapping_id, p_file_name, lower(p_file_sha256), p_row_count)
  returning id into v_id;
  return v_id;
end;
$$;

-- Recebe linhas já mapeadas pelo navegador (no máximo 1000 por chamada),
-- normaliza, valida e classifica. Nada é gravado em clientes aqui.
create or replace function public.import_stage_rows(p_batch_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.import_batches%rowtype;
  v_format text;
  v_row jsonb;
  v_num integer;
  v_name text;
  v_phone_raw text;
  v_phone text;
  v_email text;
  v_birth_raw text;
  v_birth date;
  v_ext text;
  v_notes text;
  v_issues text[];
  v_class text;
  v_decision text;
  v_identity uuid;
  v_client uuid;
  v_hint text;
  v_count integer := 0;
begin
  select * into v_batch from public.import_batches where id = p_batch_id;
  if not found or not public.has_permission(v_batch.unit_id, 'imports.run') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v_batch.status <> 'rascunho' then
    raise exception 'Lote não está em preparação' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Envie de 1 a 1000 linhas por vez' using errcode = '22023';
  end if;
  select date_format into v_format from public.import_mappings where id = v_batch.mapping_id;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_num := (v_row ->> 'row_number')::integer;
    if v_num is null or v_num < 1 or v_num > v_batch.row_count then
      raise exception 'Número de linha inválido' using errcode = '22023';
    end if;
    v_issues := '{}';
    v_name := nullif(btrim(regexp_replace(coalesce(v_row ->> 'full_name', ''), '\s+', ' ', 'g')), '');
    v_phone_raw := nullif(btrim(coalesce(v_row ->> 'phone', '')), '');
    v_phone := public.normalize_phone(v_phone_raw);
    v_email := nullif(lower(btrim(coalesce(v_row ->> 'email', ''))), '');
    v_birth_raw := nullif(btrim(coalesce(v_row ->> 'birth_date', '')), '');
    v_birth := public.parse_import_date(v_birth_raw, v_format);
    v_ext := nullif(btrim(coalesce(v_row ->> 'external_ref', '')), '');
    v_notes := left(nullif(btrim(coalesce(v_row ->> 'notes', '')), ''), 2000);
    v_identity := null; v_client := null; v_hint := null;

    if v_phone_raw is not null and v_phone is null then
      v_issues := array_append(v_issues, 'telefone inválido (ignorado)');
    end if;
    if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_issues := array_append(v_issues, 'e-mail inválido (ignorado)');
      v_email := null;
    end if;
    if v_birth_raw is not null and v_birth is null then
      v_issues := array_append(v_issues, 'data de nascimento inválida (ignorada)');
    end if;
    if v_ext is not null and length(v_ext) > 120 then
      v_issues := array_append(v_issues, 'código externo longo demais (ignorado)');
      v_ext := null;
    end if;

    if v_name is null or length(v_name) < 2 or length(v_name) > 160 then
      v_class := 'invalida';
      v_issues := array_append(v_issues, 'nome ausente ou inválido');
    elsif v_ext is not null and exists (
        select 1 from public.client_units cu
        where cu.unit_id = v_batch.unit_id and cu.source = 'trinks_csv' and cu.external_ref = v_ext) then
      v_class := 'duplicada_na_unidade';
      select cu.id, cu.identity_id into v_client, v_identity from public.client_units cu
      where cu.unit_id = v_batch.unit_id and cu.source = 'trinks_csv' and cu.external_ref = v_ext;
      v_hint := 'mesmo código do Trinks já importado';
    elsif exists (
        select 1 from public.import_rows r
        where r.batch_id = p_batch_id and r.row_number < v_num
          and ((v_ext is not null and r.external_ref = v_ext)
               or (v_phone is not null and r.phone = v_phone)
               or (v_email is not null and r.email = v_email))) then
      v_class := 'duplicada_no_arquivo';
      v_hint := 'repetida em linha anterior do arquivo';
    else
      select i.id into v_identity
      from public.client_identities i
      where i.merged_into_id is null
        and ((v_phone is not null and i.phone = v_phone) or (v_email is not null and lower(i.email) = v_email))
      order by (i.phone = v_phone) desc nulls last
      limit 1;

      if v_identity is not null then
        select cu.id into v_client from public.client_units cu
        where cu.identity_id = v_identity and cu.unit_id = v_batch.unit_id;
        if v_client is not null then
          v_class := 'duplicada_na_unidade';
          v_hint := 'já cadastrada nesta unidade (mesmo telefone/e-mail)';
        elsif split_part(public.normalize_name(v_name), ' ', 1) =
              split_part(public.normalize_name((select full_name from public.client_identities where id = v_identity)), ' ', 1) then
          v_class := 'vincular';
          v_hint := 'cadastro existente em outra unidade (mesmo telefone/e-mail e primeiro nome)';
        else
          v_class := 'possivel_duplicidade';
          v_hint := 'mesmo telefone/e-mail de outro cadastro, com nome diferente';
        end if;
      else
        select cu.id, cu.identity_id into v_client, v_identity
        from public.client_units cu join public.client_identities i on i.id = cu.identity_id
        where cu.unit_id = v_batch.unit_id and public.normalize_name(i.full_name) = public.normalize_name(v_name)
        limit 1;
        if v_client is not null then
          v_class := 'possivel_duplicidade';
          v_hint := 'mesmo nome de cliente desta unidade';
        else
          v_class := 'nova';
        end if;
      end if;
    end if;

    v_decision := case v_class
      when 'nova' then 'criar'
      when 'vincular' then 'vincular'
      when 'possivel_duplicidade' then null
      else 'ignorar'
    end;

    insert into public.import_rows (batch_id, unit_id, row_number, full_name, phone_raw, phone, email, birth_date,
      external_ref, notes, classification, match_identity_id, match_client_unit_id, match_hint, issues, decision)
    values (p_batch_id, v_batch.unit_id, v_num, v_name, v_phone_raw, v_phone, v_email, v_birth,
      v_ext, v_notes, v_class, v_identity, v_client, v_hint, v_issues, v_decision)
    on conflict (batch_id, row_number) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Decisão humana sobre uma linha (criar, vincular ao cadastro encontrado ou ignorar).
create or replace function public.import_decide_row(p_row_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.import_rows%rowtype;
begin
  select * into v_row from public.import_rows where id = p_row_id;
  if not found or not public.has_permission(v_row.unit_id, 'imports.run') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if (select status from public.import_batches where id = v_row.batch_id) <> 'rascunho' then
    raise exception 'Lote já encerrado' using errcode = '22023';
  end if;
  if p_decision not in ('criar', 'vincular', 'ignorar') then
    raise exception 'Decisão inválida' using errcode = '22023';
  end if;
  if v_row.classification in ('invalida', 'duplicada_na_unidade', 'duplicada_no_arquivo') and p_decision <> 'ignorar' then
    raise exception 'Esta linha só pode ser ignorada' using errcode = '22023';
  end if;
  if p_decision = 'vincular' and (v_row.match_identity_id is null or v_row.match_client_unit_id is not null) then
    raise exception 'Não há cadastro de outra unidade para vincular' using errcode = '22023';
  end if;
  update public.import_rows set decision = p_decision, decided_by = public.current_actor_id() where id = p_row_id;
end;
$$;

create or replace function public.import_batch_summary(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
begin
  select unit_id into v_unit from public.import_batches where id = p_batch_id;
  if v_unit is null or not public.has_permission(v_unit, 'imports.run') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'total', (select count(*) from public.import_rows where batch_id = p_batch_id),
    'por_classificacao', coalesce((select jsonb_object_agg(classification, n) from (
        select classification, count(*) as n from public.import_rows where batch_id = p_batch_id group by 1) x), '{}'),
    'por_decisao', coalesce((select jsonb_object_agg(coalesce(decision, 'pendente'), n) from (
        select decision, count(*) as n from public.import_rows where batch_id = p_batch_id group by 1) x), '{}'),
    'pendentes', (select count(*) from public.import_rows where batch_id = p_batch_id and decision is null));
end;
$$;

-- Confirma o lote: cria identidades/vínculos ou vincula identidades
-- existentes, conforme as decisões. Exige todas as linhas decididas e todas as
-- linhas do arquivo recebidas.
create or replace function public.import_commit_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row public.import_rows%rowtype;
  v_identity uuid;
  v_client uuid;
  v_created integer := 0;
  v_linked integer := 0;
  v_ignored integer := 0;
  v_summary jsonb;
begin
  select * into v_batch from public.import_batches where id = p_batch_id for update;
  if not found or not public.has_permission(v_batch.unit_id, 'imports.run') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v_batch.status <> 'rascunho' then
    raise exception 'Lote já encerrado' using errcode = '22023';
  end if;
  if (select count(*) from public.import_rows where batch_id = p_batch_id) <> v_batch.row_count then
    raise exception 'Prévia incompleta: nem todas as linhas do arquivo foram recebidas' using errcode = '22023';
  end if;
  if exists (select 1 from public.import_rows where batch_id = p_batch_id and decision is null) then
    raise exception 'Há linhas com dúvida aguardando decisão' using errcode = '22023';
  end if;
  if exists (select 1 from public.import_batches
             where unit_id = v_batch.unit_id and file_sha256 = v_batch.file_sha256 and status = 'confirmado') then
    raise exception 'Este arquivo já foi importado nesta unidade' using errcode = '23505';
  end if;

  for v_row in select * from public.import_rows where batch_id = p_batch_id order by row_number loop
    if v_row.decision = 'ignorar' then
      v_ignored := v_ignored + 1;
      continue;
    end if;

    if v_row.decision = 'vincular' then
      v_identity := v_row.match_identity_id;
      -- Completa somente campos vazios da identidade existente.
      update public.client_identities
      set phone = coalesce(phone, v_row.phone), email = coalesce(email, v_row.email),
          birth_date = coalesce(birth_date, v_row.birth_date)
      where id = v_identity and (phone is null or email is null or birth_date is null);
    else
      insert into public.client_identities (full_name, phone, email, birth_date)
      values (v_row.full_name, v_row.phone, v_row.email, v_row.birth_date)
      returning id into v_identity;
    end if;

    select id into v_client from public.client_units where unit_id = v_batch.unit_id and identity_id = v_identity;
    if v_client is null then
      insert into public.client_units (unit_id, identity_id, source, external_ref)
      values (v_batch.unit_id, v_identity, 'trinks_csv', v_row.external_ref)
      returning id into v_client;
    end if;

    if v_row.notes is not null then
      insert into public.crm_interactions (unit_id, client_unit_id, kind, body)
      values (v_batch.unit_id, v_client, 'nota', 'Importado do Trinks: ' || v_row.notes);
    end if;

    update public.import_rows set result_client_unit_id = v_client where id = v_row.id;
    if v_row.decision = 'vincular' then v_linked := v_linked + 1; else v_created := v_created + 1; end if;
  end loop;

  v_summary := jsonb_build_object('criadas', v_created, 'vinculadas', v_linked, 'ignoradas', v_ignored);
  update public.import_batches
  set status = 'confirmado', confirmed_by = public.current_actor_id(), confirmed_at = now(), summary = v_summary
  where id = p_batch_id;
  return v_summary;
end;
$$;

create or replace function public.import_discard_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.import_batches%rowtype;
begin
  select * into v_batch from public.import_batches where id = p_batch_id for update;
  if not found or not public.has_permission(v_batch.unit_id, 'imports.run') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v_batch.status <> 'rascunho' then
    raise exception 'Lote já encerrado' using errcode = '22023';
  end if;
  delete from public.import_rows where batch_id = p_batch_id;
  update public.import_batches set status = 'descartado' where id = p_batch_id;
end;
$$;

-- Expurgo de linhas de staging (dados pessoais) de lotes encerrados há mais de
-- p_days dias. Executado pelo administrador do banco (rotina documentada).
create or replace function public.import_purge_staging(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.import_rows r
  using public.import_batches b
  where b.id = r.batch_id and b.status in ('confirmado', 'descartado')
    and coalesce(b.confirmed_at, b.updated_at) < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Gatilhos, RLS e privilégios
-- -----------------------------------------------------------------------------

create trigger import_mappings_stamp before insert or update on public.import_mappings
  for each row execute function public.tg_stamp();
create trigger import_batches_stamp before insert or update on public.import_batches
  for each row execute function public.tg_stamp();
create trigger import_batches_unit before update on public.import_batches
  for each row execute function public.tg_unit_immutable();
create trigger import_mappings_audit after insert or update or delete on public.import_mappings
  for each row execute function public.tg_audit();
create trigger import_batches_audit after insert or update or delete on public.import_batches
  for each row execute function public.tg_audit();
-- import_rows não é auditada linha a linha (dados de staging, expurgados); o
-- resultado fica na auditoria de clientes e no resumo do lote.

alter table public.import_mappings enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;

create policy import_mappings_select on public.import_mappings for select to authenticated
  using ((select public.can_import_any_unit()));
create policy import_batches_select on public.import_batches for select to authenticated
  using (public.has_permission(unit_id, 'imports.run'));
create policy import_rows_select on public.import_rows for select to authenticated
  using (public.has_permission(unit_id, 'imports.run'));

revoke all on public.import_mappings, public.import_batches, public.import_rows from anon, authenticated;
grant select on public.import_mappings, public.import_batches, public.import_rows to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.can_import_any_unit(),
  public.parse_import_date(text, text),
  public.import_save_mapping(uuid, text, jsonb, text, text[]),
  public.import_approve_mapping(uuid),
  public.import_create_batch(uuid, uuid, text, text, integer),
  public.import_stage_rows(uuid, jsonb),
  public.import_decide_row(uuid, text),
  public.import_batch_summary(uuid),
  public.import_commit_batch(uuid),
  public.import_discard_batch(uuid)
to authenticated;
-- import_purge_staging: somente administrador do banco.
revoke execute on function public.import_purge_staging(integer) from authenticated;
