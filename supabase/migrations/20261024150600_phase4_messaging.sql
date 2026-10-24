-- =============================================================================
-- RC Beauty — Fase 4: mensagens e relacionamento
--
--   * WhatsApp oficial (WhatsApp Business Platform / Cloud API): canal por
--     unidade. Credenciais SÓ em segredos de Edge Functions. O canal só pode
--     ficar 'ativo' com credenciais verificadas, webhook verificado, texto de
--     consentimento definido e mensagem de teste bem-sucedida (marcas gravadas
--     apenas pelo servidor).
--   * Consentimento e opt-out por cliente, unidade e finalidade (atendimento /
--     marketing), em eventos somente de inclusão. Envio sem opt-in é recusado.
--   * Caixa de entrada (conversas e mensagens), modelos de mensagem.
--   * Follow-ups, pesquisa de satisfação (NPS) e reengajamento de inativas.
--   * SDR IA: somente rascunhos, revisados e enviados por uma pessoa; desligada
--     por padrão.
-- =============================================================================

insert into public.permissions (code, module, action, module_label, description, allowed_scopes, sort_order) values
  ('messaging.view', 'messaging', 'view', 'Mensagens', 'Ver caixa de entrada (conversas atribuídas a si ou de toda a unidade)', '{own,unit}', 400),
  ('messaging.send', 'messaging', 'send', 'Mensagens', 'Responder e enviar mensagens (quando o canal estiver ativo)', '{unit}', 401),
  ('messaging.manage', 'messaging', 'manage', 'Mensagens', 'Configurar canal, modelos de mensagem e IA; ativar envio', '{unit}', 402),
  ('consent.manage', 'consent', 'manage', 'Consentimento', 'Registrar consentimento e opt-out de clientes', '{unit}', 410),
  ('followups.manage', 'followups', 'manage', 'Follow-ups', 'Criar e concluir follow-ups (próprios ou da unidade)', '{own,unit}', 420),
  ('surveys.manage', 'surveys', 'manage', 'Pesquisas', 'Pesquisas de satisfação: registrar respostas e ver resultados', '{unit}', 430);

insert into public.access_profile_permissions (profile_id, permission_code, scope)
select ap.id, p.code, 'unit'
from public.access_profiles ap cross join public.permissions p
where ap.key in ('admin_geral', 'direcao') and p.module in ('messaging', 'consent', 'followups', 'surveys');

insert into public.access_profile_permissions (profile_id, permission_code, scope)
select ap.id, x.code, x.scope::public.access_scope
from (values
  ('gerente', 'messaging.view', 'unit'), ('gerente', 'messaging.send', 'unit'), ('gerente', 'consent.manage', 'unit'),
  ('gerente', 'followups.manage', 'unit'), ('gerente', 'surveys.manage', 'unit'),
  ('vendedora', 'messaging.view', 'unit'), ('vendedora', 'messaging.send', 'unit'), ('vendedora', 'consent.manage', 'unit'),
  ('vendedora', 'followups.manage', 'own'),
  ('recepcao', 'consent.manage', 'unit'), ('recepcao', 'followups.manage', 'own')
) as x(key, code, scope)
join public.access_profiles ap on ap.key = x.key;

-- -----------------------------------------------------------------------------
-- 1. Canal WhatsApp por unidade
-- -----------------------------------------------------------------------------

create table public.messaging_channels (
  id                      uuid primary key default gen_random_uuid(),
  unit_id                 uuid not null unique references public.units (id) on delete restrict,
  provider                text not null default 'whatsapp_cloud_api' check (provider in ('whatsapp_cloud_api')),
  display_phone           text check (display_phone is null or display_phone ~ '^\d{12,15}$'),
  phone_number_id         text unique check (phone_number_id is null or phone_number_id ~ '^\d{5,30}$'),
  waba_id                 text check (waba_id is null or waba_id ~ '^\d{5,30}$'),
  consent_text            text check (consent_text is null or length(btrim(consent_text)) between 20 and 2000),
  status                  text not null default 'desativado'
                          check (status in ('desativado', 'configurado', 'ativo', 'suspenso')),
  credentials_verified_at timestamptz,
  webhook_verified_at     timestamptz,
  test_message_at         timestamptz,
  activated_by            uuid,
  activated_at            timestamptz,
  status_reason           text check (status_reason is null or length(status_reason) <= 300),
  ai_enabled              boolean not null default false,
  ai_enabled_by           uuid,
  ai_enabled_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid,
  check (status <> 'ativo' or (credentials_verified_at is not null and webhook_verified_at is not null
                               and test_message_at is not null and consent_text is not null
                               and phone_number_id is not null))
);

insert into public.messaging_channels (unit_id) select id from public.units;

create or replace function public.tg_messaging_channels_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_server_context() then
    return new;
  end if;
  -- Marcas de verificação são gravadas apenas pelas funções de servidor.
  if (new.credentials_verified_at, new.webhook_verified_at, new.test_message_at)
     is distinct from (old.credentials_verified_at, old.webhook_verified_at, old.test_message_at) then
    raise exception 'Verificações do canal são registradas pelo servidor' using errcode = '42501';
  end if;
  -- Trocar número/conta invalida as verificações anteriores.
  if (new.phone_number_id, new.waba_id) is distinct from (old.phone_number_id, old.waba_id) then
    new.credentials_verified_at := null;
    new.webhook_verified_at := null;
    new.test_message_at := null;
    if new.status = 'ativo' then
      new.status := 'configurado';
    end if;
  end if;
  if new.status = 'ativo' and old.status <> 'ativo' then
    if new.credentials_verified_at is null or new.webhook_verified_at is null or new.test_message_at is null
       or new.consent_text is null then
      raise exception 'Ativação exige credenciais oficiais verificadas, webhook verificado, texto de consentimento e teste de envio'
        using errcode = '23514';
    end if;
    new.activated_by := public.current_actor_id();
    new.activated_at := now();
  elsif new.status <> 'ativo' then
    new.activated_by := null;
    new.activated_at := null;
  end if;
  if new.ai_enabled is distinct from old.ai_enabled then
    new.ai_enabled_by := case when new.ai_enabled then public.current_actor_id() end;
    new.ai_enabled_at := case when new.ai_enabled then now() end;
  end if;
  return new;
end;
$$;

create trigger messaging_channels_guard before update on public.messaging_channels
  for each row execute function public.tg_messaging_channels_guard();

create table public.message_templates (
  id               uuid primary key default gen_random_uuid(),
  unit_id          uuid not null references public.units (id) on delete restrict,
  name             text not null check (name ~ '^[a-z0-9_]{3,100}$'),
  language         text not null default 'pt_BR' check (language ~ '^[a-z]{2}(_[A-Z]{2})?$'),
  purpose          text not null check (purpose in ('atendimento', 'marketing')),
  body             text not null check (length(btrim(body)) between 5 and 1024),
  provider_status  text not null default 'rascunho'
                   check (provider_status in ('rascunho', 'enviado_para_aprovacao', 'aprovado', 'rejeitado', 'pausado')),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  unique (id, unit_id),
  unique (unit_id, name, language)
);

-- -----------------------------------------------------------------------------
-- 2. Consentimento (eventos somente de inclusão)
-- -----------------------------------------------------------------------------

create table public.consent_events (
  id              uuid primary key default gen_random_uuid(),
  seq             bigint generated always as identity,
  unit_id         uuid not null references public.units (id) on delete restrict,
  client_unit_id  uuid not null,
  channel         text not null default 'whatsapp' check (channel in ('whatsapp')),
  purpose         text not null check (purpose in ('atendimento', 'marketing')),
  action          text not null check (action in ('opt_in', 'opt_out')),
  source          text not null check (source in ('presencial', 'whatsapp', 'formulario', 'palavra_chave', 'outro')),
  evidence        text check (evidence is null or length(evidence) <= 500),
  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  created_by      uuid,
  foreign key (client_unit_id, unit_id) references public.client_units (id, unit_id) on delete restrict,
  check (action <> 'opt_in' or evidence is not null or source in ('whatsapp', 'formulario'))
);
create index consent_events_client_idx on public.consent_events (client_unit_id, channel, purpose, occurred_at desc, seq desc);

-- A data informada é a do consentimento (ex.: ficha assinada antes), mas não
-- pode estar no futuro: um opt-in "futuro" anularia opt-outs posteriores.
create or replace function public.tg_consent_events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.occurred_at > now() + interval '5 minutes' then
    raise exception 'Data do consentimento não pode estar no futuro' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger consent_events_guard before insert on public.consent_events
  for each row execute function public.tg_consent_events_guard();

create or replace function public.consent_status(p_client_unit_id uuid, p_purpose text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select action from public.consent_events
                   where client_unit_id = p_client_unit_id and channel = 'whatsapp' and purpose = p_purpose
                   order by occurred_at desc, seq desc limit 1), 'sem_registro');
$$;

-- -----------------------------------------------------------------------------
-- 3. Caixa de entrada
-- -----------------------------------------------------------------------------

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  unit_id          uuid not null references public.units (id) on delete restrict,
  client_unit_id   uuid,
  contact_phone    text not null check (contact_phone ~ '^\d{8,15}$'),
  contact_name     text check (contact_name is null or length(contact_name) <= 160),
  assigned_to      uuid references public.profiles (id) on delete restrict,
  status           text not null default 'aberta' check (status in ('aberta', 'encerrada')),
  last_inbound_at  timestamptz,
  last_message_at  timestamptz,
  -- PARAR/SAIR recebido deste número, com ou sem cadastro (todas as finalidades).
  -- Gravado só pelo servidor; volta a valer envio apenas com opt-in posterior.
  opted_out_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, unit_id),
  unique (unit_id, contact_phone),
  foreign key (client_unit_id, unit_id) references public.client_units (id, unit_id) on delete restrict
);
create index conversations_unit_last_idx on public.conversations (unit_id, last_message_at desc);

create table public.messages (
  id                   uuid primary key default gen_random_uuid(),
  unit_id              uuid not null,
  conversation_id      uuid not null,
  direction            text not null check (direction in ('entrada', 'saida')),
  kind                 text not null default 'texto' check (kind in ('texto', 'template', 'midia', 'sistema')),
  body                 text check (body is null or length(body) <= 4096),
  template_id          uuid,
  status               text not null default 'rascunho'
                       check (status in ('rascunho', 'na_fila', 'enviada', 'entregue', 'lida', 'falhou', 'recebida', 'descartada')),
  ai_generated         boolean not null default false,
  provider_message_id  text unique,
  error                text check (error is null or length(error) <= 500),
  sent_by              uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  foreign key (conversation_id, unit_id) references public.conversations (id, unit_id) on delete restrict,
  foreign key (template_id, unit_id) references public.message_templates (id, unit_id) on delete restrict,
  check (direction = 'saida' or status = 'recebida'),
  check (status <> 'recebida' or direction = 'entrada')
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create or replace function public.can_view_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.conversations c
                 where c.id = p_conversation_id
                   and (public.has_unit_scope(c.unit_id, 'messaging.view')
                        or (public.has_permission(c.unit_id, 'messaging.view') and c.assigned_to = (select auth.uid()))));
$$;

-- Pessoas só criam RASCUNHOS (inclusive os sugeridos pela IA) e os descartam.
-- Envio, recebimento e status de entrega são gravados pelo servidor.
create or replace function public.tg_messages_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_server_context() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.direction <> 'saida' or new.status <> 'rascunho' or new.ai_generated or new.kind <> 'texto' then
      raise exception 'Somente rascunhos de texto podem ser criados pela aplicação' using errcode = '42501';
    end if;
  else
    if old.status <> 'rascunho' or new.status not in ('rascunho', 'descartada') then
      raise exception 'Somente rascunhos podem ser editados ou descartados' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger messages_guard before insert or update on public.messages
  for each row execute function public.tg_messages_guard();

-- Prepara um envio (chamada pela Edge Function whatsapp-send com o JWT de quem
-- envia). Verifica permissão, canal ativo, consentimento e janela de 24 h.
-- Retorna os dados para o envio e cria a mensagem 'na_fila'.
create or replace function public.messaging_prepare_send(
  p_conversation_id uuid, p_body text, p_template_id uuid, p_draft_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations%rowtype;
  ch public.messaging_channels%rowtype;
  t public.message_templates%rowtype;
  v_purpose text := 'atendimento';
  v_in_window boolean;
  v_msg uuid;
begin
  select * into c from public.conversations where id = p_conversation_id;
  if not found or not public.has_permission(c.unit_id, 'messaging.send') or not public.can_view_conversation(c.id) then
    raise exception 'Sem permissão para enviar' using errcode = '42501';
  end if;
  select * into ch from public.messaging_channels where unit_id = c.unit_id;
  if ch.status <> 'ativo' then
    raise exception 'Envio desativado: canal sem credenciais oficiais, consentimento e testes concluídos' using errcode = '55000';
  end if;

  v_in_window := c.last_inbound_at is not null and c.last_inbound_at > now() - interval '24 hours';

  if p_template_id is not null then
    select * into t from public.message_templates
    where id = p_template_id and unit_id = c.unit_id and active and provider_status = 'aprovado';
    if not found then
      raise exception 'Modelo de mensagem não aprovado' using errcode = '23514';
    end if;
    v_purpose := t.purpose;
  elsif not v_in_window then
    raise exception 'Fora da janela de 24 h: use um modelo de mensagem aprovado' using errcode = '23514';
  end if;

  -- Regras de consentimento:
  --   * opt-out da finalidade bloqueia sempre;
  --   * marketing exige opt-in;
  --   * fora da janela de 24 h (mensagem iniciada pelo salão) exige opt-in;
  --   * dentro da janela, responder sobre o atendimento é permitido se não
  --     houver opt-out (a cliente iniciou a conversa).
  if c.client_unit_id is not null and public.consent_status(c.client_unit_id, v_purpose) = 'opt_out' then
    raise exception 'Cliente pediu para não receber mensagens desta finalidade (opt-out)' using errcode = '23514';
  end if;
  -- PARAR recebido do número (inclusive antes de existir cadastro): bloqueia
  -- até haver opt-in registrado depois dele.
  if c.opted_out_at is not null
     and (c.client_unit_id is null
          or not exists (select 1 from public.consent_events e
                         where e.client_unit_id = c.client_unit_id and e.purpose = v_purpose
                           and e.action = 'opt_in' and e.occurred_at > c.opted_out_at)) then
    raise exception 'Contato pediu para não receber mensagens (opt-out por PARAR)' using errcode = '23514';
  end if;
  if (v_purpose = 'marketing' or not v_in_window)
     and (c.client_unit_id is null or public.consent_status(c.client_unit_id, v_purpose) <> 'opt_in') then
    raise exception 'Sem consentimento registrado (opt-in) para esta finalidade' using errcode = '23514';
  end if;

  if p_draft_id is not null then
    update public.messages set status = 'na_fila', body = coalesce(p_body, body), sent_by = public.current_actor_id()
    where id = p_draft_id and conversation_id = c.id and status = 'rascunho'
    returning id into v_msg;
    if v_msg is null then
      raise exception 'Rascunho inválido' using errcode = '22023';
    end if;
  else
    insert into public.messages (unit_id, conversation_id, direction, kind, body, template_id, status, sent_by, created_by)
    values (c.unit_id, c.id, 'saida', case when p_template_id is null then 'texto' else 'template' end,
            coalesce(p_body, t.body), p_template_id, 'na_fila', public.current_actor_id(), public.current_actor_id())
    returning id into v_msg;
  end if;

  return jsonb_build_object('message_id', v_msg, 'unit_code', (select code from public.units where id = c.unit_id),
    'phone_number_id', ch.phone_number_id, 'to', c.contact_phone, 'body', coalesce(p_body, t.body),
    'template', case when p_template_id is null then null
                     else jsonb_build_object('name', t.name, 'language', t.language) end);
end;
$$;

-- Funções exclusivas do servidor (service_role).
create or replace function public.messaging_mark_result(p_message_id uuid, p_provider_id text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages
  set status = case when p_error is null then 'enviada' else 'falhou' end,
      provider_message_id = p_provider_id, error = left(p_error, 500)
  where id = p_message_id and status = 'na_fila';
  update public.conversations c set last_message_at = now()
  from public.messages m where m.id = p_message_id and c.id = m.conversation_id;
end;
$$;

create or replace function public.messaging_mark_channel(p_unit_code text, p_field text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_field = 'credentials' then
    update public.messaging_channels set credentials_verified_at = now(),
      status = case when status = 'desativado' then 'configurado' else status end
    where unit_id = (select id from public.units where code = p_unit_code);
  elsif p_field = 'webhook' then
    update public.messaging_channels set webhook_verified_at = now() where phone_number_id is not null;
  elsif p_field = 'test' then
    update public.messaging_channels set test_message_at = now()
    where unit_id = (select id from public.units where code = p_unit_code) and credentials_verified_at is not null;
  else
    raise exception 'Campo inválido' using errcode = '22023';
  end if;
end;
$$;

-- Recebe o payload do webhook (já com assinatura verificada pela Edge Function).
create or replace function public.whatsapp_ingest(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change jsonb;
  v_msg jsonb;
  v_status jsonb;
  v_contact jsonb;
  v_channel public.messaging_channels%rowtype;
  v_phone text;
  v_conv uuid;
  v_client uuid;
  v_body text;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_optouts integer := 0;
begin
  for v_change in
    select c from jsonb_array_elements(coalesce(p_payload -> 'entry', '[]')) e,
                  jsonb_array_elements(coalesce(e -> 'changes', '[]')) c
  loop
    select * into v_channel from public.messaging_channels
    where phone_number_id = v_change -> 'value' -> 'metadata' ->> 'phone_number_id';
    if not found then
      continue;
    end if;

    for v_msg in select * from jsonb_array_elements(coalesce(v_change -> 'value' -> 'messages', '[]')) loop
      v_phone := regexp_replace(coalesce(v_msg ->> 'from', ''), '\D', '', 'g');
      if v_phone !~ '^\d{8,15}$' then continue; end if;
      v_body := coalesce(v_msg -> 'text' ->> 'body', v_msg -> 'button' ->> 'text', '[' || coalesce(v_msg ->> 'type', 'mensagem') || ']');
      select c -> 'profile' into v_contact from jsonb_array_elements(coalesce(v_change -> 'value' -> 'contacts', '[]')) c limit 1;

      select cu.id into v_client from public.client_units cu join public.client_identities i on i.id = cu.identity_id
      where cu.unit_id = v_channel.unit_id and i.phone = v_phone and cu.archived_at is null limit 1;

      insert into public.conversations (unit_id, client_unit_id, contact_phone, contact_name, last_inbound_at, last_message_at)
      values (v_channel.unit_id, v_client, v_phone, left(v_contact ->> 'name', 160), now(), now())
      on conflict (unit_id, contact_phone) do update
        set last_inbound_at = now(), last_message_at = now(), status = 'aberta',
            client_unit_id = coalesce(public.conversations.client_unit_id, excluded.client_unit_id)
      returning id into v_conv;

      insert into public.messages (unit_id, conversation_id, direction, kind, body, status, provider_message_id)
      values (v_channel.unit_id, v_conv, 'entrada', case when v_msg ? 'text' then 'texto' else 'midia' end,
              left(v_body, 4096), 'recebida', v_msg ->> 'id')
      on conflict (provider_message_id) do nothing;
      -- Reentrega da Meta (mesmo id): não conta nem repete o opt-out.
      if not found then continue; end if;
      v_inserted := v_inserted + 1;

      -- Opt-out por palavra-chave: vale para o número mesmo sem cadastro
      -- (conversations.opted_out_at) e, havendo cliente vinculada, também
      -- como evento de consentimento das duas finalidades.
      if upper(btrim(v_body)) in ('PARAR', 'SAIR', 'STOP', 'CANCELAR', 'DESCADASTRAR') then
        update public.conversations set opted_out_at = now() where id = v_conv;
        select client_unit_id into v_client from public.conversations where id = v_conv;
        if v_client is not null then
          insert into public.consent_events (unit_id, client_unit_id, purpose, action, source, evidence)
          values (v_channel.unit_id, v_client, 'marketing', 'opt_out', 'palavra_chave', 'Mensagem: ' || left(v_body, 50)),
                 (v_channel.unit_id, v_client, 'atendimento', 'opt_out', 'palavra_chave', 'Mensagem: ' || left(v_body, 50));
        end if;
        v_optouts := v_optouts + 1;
      end if;
    end loop;

    for v_status in select * from jsonb_array_elements(coalesce(v_change -> 'value' -> 'statuses', '[]')) loop
      update public.messages
      set status = case v_status ->> 'status' when 'sent' then 'enviada' when 'delivered' then 'entregue'
                                              when 'read' then 'lida' when 'failed' then 'falhou' else status end,
          error = case when v_status ->> 'status' = 'failed' then left(v_status -> 'errors' -> 0 ->> 'title', 500) else error end
      where provider_message_id = v_status ->> 'id' and direction = 'saida';
      v_updated := v_updated + 1;
    end loop;
  end loop;
  return jsonb_build_object('mensagens', v_inserted, 'status', v_updated, 'opt_outs', v_optouts);
end;
$$;

-- Contexto mínimo para a SDR IA (chamada com o JWT de quem pediu a sugestão):
-- últimas mensagens da conversa e primeiro nome; sem telefone, e-mail ou CRM.
create or replace function public.sdr_context(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.conversations%rowtype;
  ch public.messaging_channels%rowtype;
begin
  select * into c from public.conversations where id = p_conversation_id;
  if not found or not public.has_permission(c.unit_id, 'messaging.send') or not public.can_view_conversation(c.id) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into ch from public.messaging_channels where unit_id = c.unit_id;
  if not ch.ai_enabled then
    raise exception 'SDR IA desativada para esta unidade' using errcode = '55000';
  end if;
  return jsonb_build_object(
    'unit_id', c.unit_id,
    'unit_name', (select name from public.units where id = c.unit_id),
    'first_name', split_part(coalesce((select i.full_name from public.client_units cu
                                        join public.client_identities i on i.id = cu.identity_id
                                        where cu.id = c.client_unit_id), c.contact_name, ''), ' ', 1),
    'services', coalesce((select jsonb_agg(jsonb_build_object('nome', s.name, 'duracao_min', s.duration_minutes,
                                                              'preco_cents', s.price_cents) order by s.name)
                          from public.services s where s.unit_id = c.unit_id and s.active), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('de', case m.direction when 'entrada' then 'cliente' else 'salao' end,
                                                              'texto', m.body) order by m.created_at)
                          from (select * from public.messages
                                where conversation_id = c.id and status not in ('rascunho', 'descartada')
                                order by created_at desc limit 20) m), '[]'::jsonb));
end;
$$;

-- Inicia (ou reabre) a conversa com uma cliente da unidade que tenha telefone,
-- para contato iniciado pelo salão (follow-up, reengajamento). Não envia nada:
-- fora da janela de 24 h o envio exige modelo aprovado e opt-in.
create or replace function public.messaging_start_conversation(p_client_unit_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_phone text;
  v_name text;
  v_conv uuid;
begin
  select cu.unit_id, i.phone, i.full_name into v_unit, v_phone, v_name
  from public.client_units cu join public.client_identities i on i.id = cu.identity_id
  where cu.id = p_client_unit_id and cu.archived_at is null;
  if v_unit is null or not public.has_permission(v_unit, 'messaging.send')
     or not public.has_permission(v_unit, 'clients.view') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v_phone is null or v_phone !~ '^\d{8,15}$' then
    raise exception 'Cliente sem telefone válido para WhatsApp' using errcode = '23514';
  end if;
  insert into public.conversations (unit_id, client_unit_id, contact_phone, contact_name, assigned_to)
  values (v_unit, p_client_unit_id, v_phone, left(v_name, 160), (select auth.uid()))
  on conflict (unit_id, contact_phone) do update
    set status = 'aberta',
        client_unit_id = coalesce(public.conversations.client_unit_id, excluded.client_unit_id),
        assigned_to = coalesce(public.conversations.assigned_to, excluded.assigned_to)
  returning id into v_conv;
  if not public.can_view_conversation(v_conv) then
    -- Escopo próprio e conversa atribuída a outra pessoa.
    raise exception 'Conversa atribuída a outra pessoa' using errcode = '42501';
  end if;
  return v_conv;
end;
$$;

-- Grava o rascunho sugerido pela IA (somente servidor), registrando quem pediu.
create or replace function public.sdr_save_draft(p_conversation_id uuid, p_body text, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform set_config('app.actor_id', p_actor::text, true);
  insert into public.messages (unit_id, conversation_id, direction, kind, body, status, ai_generated)
  select c.unit_id, c.id, 'saida', 'texto', left(p_body, 4096), 'rascunho', true
  from public.conversations c where c.id = p_conversation_id
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Follow-ups, pesquisas e reengajamento
-- -----------------------------------------------------------------------------

create table public.followups (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units (id) on delete restrict,
  client_unit_id  uuid not null,
  assigned_to     uuid not null references public.profiles (id) on delete restrict,
  kind            text not null check (kind in ('retorno', 'pos_atendimento', 'reengajamento', 'sdr', 'outro')),
  reason          text not null check (length(btrim(reason)) between 3 and 500),
  due_at          timestamptz not null,
  status          text not null default 'aberto' check (status in ('aberto', 'feito', 'cancelado')),
  outcome         text check (outcome is null or length(outcome) <= 1000),
  done_at         timestamptz,
  done_by         uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  foreign key (client_unit_id, unit_id) references public.client_units (id, unit_id) on delete restrict
);
create index followups_assignee_idx on public.followups (assigned_to, status, due_at);

create or replace function public.tg_followups_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_server_context()
     and not public.is_active_unit_member(new.assigned_to, new.unit_id) then
    raise exception 'Responsável precisa ter vínculo ativo com a unidade' using errcode = '23514';
  end if;
  if not public.is_server_context() and not public.has_unit_scope(new.unit_id, 'followups.manage')
     and new.assigned_to <> (select auth.uid()) then
    raise exception 'Com escopo próprio, o follow-up deve ser atribuído a você' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.status <> 'aberto' then
      raise exception 'Follow-up encerrado não pode ser reaberto' using errcode = '23514';
    end if;
    new.done_at := now();
    new.done_by := public.current_actor_id();
  end if;
  return new;
end;
$$;

create trigger followups_guard before insert or update on public.followups
  for each row execute function public.tg_followups_guard();

create table public.surveys (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.units (id) on delete restrict,
  name        text not null check (length(btrim(name)) between 3 and 120),
  question    text not null default 'De 0 a 10, quanto você recomendaria o salão a uma amiga?'
              check (length(btrim(question)) between 5 and 300),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  unique (id, unit_id)
);

create table public.survey_responses (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null,
  survey_id       uuid not null,
  client_unit_id  uuid not null,
  appointment_id  uuid,
  score           smallint not null check (score between 0 and 10),
  comment         text check (comment is null or length(comment) <= 1000),
  channel         text not null default 'presencial' check (channel in ('presencial', 'whatsapp', 'telefone', 'outro')),
  created_at      timestamptz not null default now(),
  created_by      uuid,
  foreign key (survey_id, unit_id) references public.surveys (id, unit_id) on delete restrict,
  foreign key (client_unit_id, unit_id) references public.client_units (id, unit_id) on delete restrict,
  foreign key (appointment_id, unit_id) references public.appointments (id, unit_id) on delete restrict
);
create unique index survey_responses_appointment_uidx on public.survey_responses (survey_id, appointment_id)
  where appointment_id is not null;

create or replace function public.survey_results(p_survey_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
begin
  select unit_id into v_unit from public.surveys where id = p_survey_id;
  if v_unit is null or not public.has_permission(v_unit, 'surveys.manage') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'respostas', count(*),
      'promotores', count(*) filter (where score >= 9),
      'neutros', count(*) filter (where score between 7 and 8),
      'detratores', count(*) filter (where score <= 6),
      'nps', case when count(*) = 0 then null
                  else round(100.0 * (count(*) filter (where score >= 9) - count(*) filter (where score <= 6)) / count(*)) end,
      'media', round(avg(score)::numeric, 1))
    from public.survey_responses
    where survey_id = p_survey_id
      and created_at >= (p_from::timestamp at time zone 'America/Sao_Paulo')
      and created_at < ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo'));
end;
$$;

-- Atendimentos concluídos recentemente sem resposta da pesquisa (para pedir avaliação).
create or replace function public.survey_candidates(p_survey_id uuid, p_days integer default 7)
returns table (appointment_id uuid, client_unit_id uuid, client_name text, service_name text, starts_at timestamptz,
               consent_atendimento text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
begin
  select unit_id into v_unit from public.surveys where id = p_survey_id;
  if v_unit is null or not public.has_permission(v_unit, 'surveys.manage') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return query
  select a.id, a.client_id, i.full_name, s.name, a.starts_at, public.consent_status(a.client_id, 'atendimento')
  from public.appointments a
  join public.client_units cu on cu.id = a.client_id
  join public.client_identities i on i.id = cu.identity_id
  join public.services s on s.id = a.service_id
  where a.unit_id = v_unit and a.status = 'concluido'
    and a.starts_at >= now() - make_interval(days => greatest(least(p_days, 60), 1))
    and not exists (select 1 from public.survey_responses r where r.survey_id = p_survey_id and r.appointment_id = a.id)
  order by a.starts_at desc
  limit 200;
end;
$$;

-- Clientes sem atendimento nem compra há p_days dias (ou nunca), com o status
-- de consentimento de marketing.
create or replace function public.inactive_clients(p_unit_id uuid, p_days integer)
returns table (client_unit_id uuid, client_name text, last_visit timestamptz, consent_marketing text, open_followups bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_unit_scope(p_unit_id, 'followups.manage') and public.has_permission(p_unit_id, 'clients.view')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return query
  select x.id, x.full_name, x.last_visit, public.consent_status(x.id, 'marketing'),
         (select count(*) from public.followups f where f.client_unit_id = x.id and f.status = 'aberto')
  from (
    select cu.id, i.full_name,
           greatest((select max(a.starts_at) from public.appointments a where a.client_id = cu.id and a.status = 'concluido'),
                    (select max(s.finalized_at) from public.sales s where s.client_unit_id = cu.id and s.status = 'finalizada')) as last_visit
    from public.client_units cu join public.client_identities i on i.id = cu.identity_id
    where cu.unit_id = p_unit_id and cu.archived_at is null
  ) x
  where x.last_visit is null or x.last_visit < now() - make_interval(days => greatest(p_days, 1))
  order by x.last_visit nulls first
  limit 500;
end;
$$;

-- Mescla de clientes passa a mover também consentimento, conversas,
-- follow-ups e respostas de pesquisa da unidade.
create or replace function public.merge_clients(p_unit_id uuid, p_keep uuid, p_merge uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep public.client_units%rowtype;
  v_merge public.client_units%rowtype;
begin
  if not public.has_permission(p_unit_id, 'clients.merge') then
    raise exception 'Sem permissão para mesclar clientes' using errcode = '42501';
  end if;
  if p_keep = p_merge then
    raise exception 'Escolha dois cadastros diferentes' using errcode = '22023';
  end if;
  select * into v_keep from public.client_units where id = p_keep and unit_id = p_unit_id and archived_at is null;
  select * into v_merge from public.client_units where id = p_merge and unit_id = p_unit_id and archived_at is null;
  if v_keep.id is null or v_merge.id is null then
    raise exception 'Cadastros devem ser da mesma unidade e estar ativos' using errcode = '22023';
  end if;

  update public.appointments set client_id = p_keep where client_id = p_merge and unit_id = p_unit_id;
  update public.sales set client_unit_id = p_keep where client_unit_id = p_merge and unit_id = p_unit_id;
  update public.crm_interactions set client_unit_id = p_keep where client_unit_id = p_merge and unit_id = p_unit_id;
  update public.consent_events set client_unit_id = p_keep where client_unit_id = p_merge and unit_id = p_unit_id;
  update public.conversations set client_unit_id = p_keep where client_unit_id = p_merge and unit_id = p_unit_id;
  update public.followups set client_unit_id = p_keep where client_unit_id = p_merge and unit_id = p_unit_id;
  update public.survey_responses set client_unit_id = p_keep where client_unit_id = p_merge and unit_id = p_unit_id;
  delete from public.client_duplicate_dismissals
   where unit_id = p_unit_id and (client_a = p_merge or client_b = p_merge);

  update public.client_units
  set service_notes = nullif(concat_ws(E'\n', v_keep.service_notes, v_merge.service_notes), '')
  where id = p_keep;

  insert into public.crm_interactions (unit_id, client_unit_id, kind, body, created_by)
  values (p_unit_id, p_keep, 'nota', 'Cadastro mesclado com outro cadastro duplicado da unidade.', public.current_actor_id());

  update public.client_units
  set archived_at = now(), archived_by = public.current_actor_id(), merged_into_id = p_keep
  where id = p_merge;

  if v_keep.identity_id <> v_merge.identity_id then
    update public.client_identities k
    set phone = coalesce(k.phone, m.phone), email = coalesce(k.email, m.email),
        birth_date = coalesce(k.birth_date, m.birth_date)
    from public.client_identities m
    where k.id = v_keep.identity_id and m.id = v_merge.identity_id;

    if not exists (select 1 from public.client_units
                   where identity_id = v_merge.identity_id and archived_at is null) then
      update public.client_identities set merged_into_id = v_keep.identity_id where id = v_merge.identity_id;
    end if;
  end if;
  return p_keep;
end;
$$;

-- Quando uma conversa com PARAR registrado passa a ter cliente vinculada
-- (cadastro posterior, vínculo manual, mescla), o opt-out do número vira
-- evento de consentimento da cliente, com a data original.
create or replace function public.tg_conversations_optout_to_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p text;
begin
  if new.opted_out_at is null or new.client_unit_id is null
     or (tg_op = 'UPDATE' and new.client_unit_id is not distinct from old.client_unit_id) then
    return null;
  end if;
  foreach p in array array['atendimento', 'marketing'] loop
    if not exists (select 1 from public.consent_events e
                   where e.client_unit_id = new.client_unit_id and e.purpose = p
                     and e.occurred_at >= new.opted_out_at) then
      insert into public.consent_events (unit_id, client_unit_id, purpose, action, source, evidence, occurred_at)
      values (new.unit_id, new.client_unit_id, p, 'opt_out', 'palavra_chave',
              'PARAR recebido do número antes do vínculo com o cadastro', new.opted_out_at);
    end if;
  end loop;
  return null;
end;
$$;

create trigger conversations_optout_to_client after insert or update of client_unit_id on public.conversations
  for each row execute function public.tg_conversations_optout_to_client();

-- -----------------------------------------------------------------------------
-- 5. Gatilhos padrão, RLS e privilégios
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['messaging_channels', 'message_templates', 'consent_events', 'conversations', 'messages',
                           'followups', 'surveys', 'survey_responses'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.tg_stamp()',
                   t || '_stamp', t);
  end loop;
  foreach t in array array['messaging_channels', 'message_templates', 'conversations', 'followups', 'surveys'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.tg_unit_immutable()',
                   t || '_unit', t);
  end loop;
  -- Conteúdo de mensagens não é copiado para a auditoria (volume e dados
  -- pessoais); canal, modelos, consentimento, follow-ups e pesquisas são.
  foreach t in array array['messaging_channels', 'message_templates', 'consent_events', 'followups', 'surveys',
                           'survey_responses'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.tg_audit()',
                   t || '_audit', t);
  end loop;
end;
$$;

alter table public.messaging_channels enable row level security;
alter table public.message_templates enable row level security;
alter table public.consent_events enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.followups enable row level security;
alter table public.surveys enable row level security;
alter table public.survey_responses enable row level security;

create policy channels_select on public.messaging_channels for select to authenticated
  using (public.has_permission(unit_id, 'messaging.view') or public.has_permission(unit_id, 'messaging.manage'));
create policy channels_update on public.messaging_channels for update to authenticated
  using (public.has_permission(unit_id, 'messaging.manage')) with check (public.has_permission(unit_id, 'messaging.manage'));

create policy templates_select on public.message_templates for select to authenticated
  using (public.has_permission(unit_id, 'messaging.view') or public.has_permission(unit_id, 'messaging.manage'));
create policy templates_insert on public.message_templates for insert to authenticated
  with check (public.has_permission(unit_id, 'messaging.manage'));
create policy templates_update on public.message_templates for update to authenticated
  using (public.has_permission(unit_id, 'messaging.manage')) with check (public.has_permission(unit_id, 'messaging.manage'));

create policy consent_select on public.consent_events for select to authenticated
  using (public.has_permission(unit_id, 'consent.manage') or public.has_permission(unit_id, 'messaging.view'));
create policy consent_insert on public.consent_events for insert to authenticated
  with check (public.has_permission(unit_id, 'consent.manage'));

create policy conversations_select on public.conversations for select to authenticated
  using (public.can_view_conversation(id));
create policy conversations_update on public.conversations for update to authenticated
  using (public.has_unit_scope(unit_id, 'messaging.view') and public.has_permission(unit_id, 'messaging.send'))
  with check (public.has_unit_scope(unit_id, 'messaging.view') and public.has_permission(unit_id, 'messaging.send'));

create policy messages_select on public.messages for select to authenticated
  using (public.can_view_conversation(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (public.has_permission(unit_id, 'messaging.send') and public.can_view_conversation(conversation_id));
create policy messages_update on public.messages for update to authenticated
  using (public.has_permission(unit_id, 'messaging.send') and public.can_view_conversation(conversation_id))
  with check (public.has_permission(unit_id, 'messaging.send'));

create policy followups_select on public.followups for select to authenticated
  using (public.has_unit_scope(unit_id, 'followups.manage')
         or (public.has_permission(unit_id, 'followups.manage') and assigned_to = (select auth.uid())));
create policy followups_insert on public.followups for insert to authenticated
  with check (public.has_permission(unit_id, 'followups.manage'));
create policy followups_update on public.followups for update to authenticated
  using (public.has_unit_scope(unit_id, 'followups.manage')
         or (public.has_permission(unit_id, 'followups.manage') and assigned_to = (select auth.uid())))
  with check (public.has_permission(unit_id, 'followups.manage'));

create policy surveys_select on public.surveys for select to authenticated
  using (public.has_permission(unit_id, 'surveys.manage'));
create policy surveys_insert on public.surveys for insert to authenticated
  with check (public.has_permission(unit_id, 'surveys.manage'));
create policy surveys_update on public.surveys for update to authenticated
  using (public.has_permission(unit_id, 'surveys.manage')) with check (public.has_permission(unit_id, 'surveys.manage'));
create policy survey_responses_select on public.survey_responses for select to authenticated
  using (public.has_permission(unit_id, 'surveys.manage'));
create policy survey_responses_insert on public.survey_responses for insert to authenticated
  with check (public.has_permission(unit_id, 'surveys.manage'));

revoke all on public.messaging_channels, public.message_templates, public.consent_events, public.conversations,
  public.messages, public.followups, public.surveys, public.survey_responses from anon, authenticated;

grant select on public.messaging_channels, public.message_templates, public.consent_events, public.conversations,
  public.messages, public.followups, public.surveys, public.survey_responses to authenticated;
grant update (display_phone, phone_number_id, waba_id, consent_text, status, status_reason, ai_enabled)
  on public.messaging_channels to authenticated;
grant insert (unit_id, name, language, purpose, body, provider_status, active) on public.message_templates to authenticated;
grant update (body, provider_status, active) on public.message_templates to authenticated;
grant insert (unit_id, client_unit_id, channel, purpose, action, source, evidence, occurred_at) on public.consent_events to authenticated;
grant update (assigned_to, status, client_unit_id) on public.conversations to authenticated;
grant insert (unit_id, conversation_id, direction, kind, body, status) on public.messages to authenticated;
grant update (body, status) on public.messages to authenticated;
grant insert (unit_id, client_unit_id, assigned_to, kind, reason, due_at) on public.followups to authenticated;
grant update (assigned_to, due_at, reason, status, outcome) on public.followups to authenticated;
grant insert (unit_id, name, question, active) on public.surveys to authenticated;
grant update (name, question, active) on public.surveys to authenticated;
grant insert (unit_id, survey_id, client_unit_id, appointment_id, score, comment, channel) on public.survey_responses to authenticated;

revoke execute on all functions in schema public from public, anon;
revoke execute on function public.tg_messaging_channels_guard(), public.tg_messages_guard(), public.tg_followups_guard(),
  public.tg_consent_events_guard(), public.tg_conversations_optout_to_client(),
  public.messaging_mark_result(uuid, text, text), public.messaging_mark_channel(text, text), public.whatsapp_ingest(jsonb),
  public.sdr_save_draft(uuid, text, uuid)
from authenticated;
grant execute on function public.messaging_mark_result(uuid, text, text), public.messaging_mark_channel(text, text),
  public.whatsapp_ingest(jsonb), public.sdr_save_draft(uuid, text, uuid) to service_role;
grant execute on function
  public.consent_status(uuid, text),
  public.can_view_conversation(uuid),
  public.messaging_prepare_send(uuid, text, uuid, uuid),
  public.messaging_start_conversation(uuid),
  public.sdr_context(uuid),
  public.survey_results(uuid, date, date),
  public.survey_candidates(uuid, integer),
  public.inactive_clients(uuid, integer),
  public.merge_clients(uuid, uuid, uuid)
to authenticated;
