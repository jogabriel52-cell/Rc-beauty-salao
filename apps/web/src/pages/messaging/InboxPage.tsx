// Caixa de entrada do WhatsApp da unidade. O envio só funciona com o canal
// ativo (credenciais oficiais, webhook, texto de consentimento e teste); as
// regras de consentimento e da janela de 24 h são aplicadas pelo banco.
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth, useUnit } from "../../auth/AuthProvider";
import { Alert, Badge, Button, Empty, PageHeader, SelectInput, Spinner, Tabs, TextArea, TextInput } from "../../components/ui";
import { unwrap, useAction, useAsync } from "../../components/useAsync";
import { can } from "../../lib/access";
import { CHANNEL_STATUS, CONSENT_STATUS, MESSAGE_STATUS, PURPOSE, consentTone, type Conversation, type Message,
  type MessageTemplate, type MessagingChannel } from "../../lib/db";
import { formatDateTime, formatPhone } from "../../lib/format";
import { callFunction, supabase } from "../../lib/supabase";

type Filter = "aberta" | "encerrada";

export function InboxPage() {
  const unit = useUnit();
  const [filter, setFilter] = useState<Filter>("aberta");
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params.get("c"));
  const [search, setSearch] = useState("");

  const channel = useAsync(async () => unwrap(await supabase.from("messaging_channels").select("*")
    .eq("unit_id", unit.unit_id).maybeSingle()) as MessagingChannel | null, [unit.unit_id]);
  const list = useAsync(async () => unwrap(await supabase.from("conversations").select("*")
    .eq("unit_id", unit.unit_id).eq("status", filter).order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200)) as Conversation[], [unit.unit_id, filter]);

  const term = search.trim().toLowerCase();
  const rows = (list.data ?? []).filter((c) => !term || (c.contact_name ?? "").toLowerCase().includes(term)
    || c.contact_phone.includes(term.replace(/\D/g, "") || "\u0000"));
  const active = channel.data?.status === "ativo";

  return (
    <>
      <PageHeader title="Mensagens" subtitle={unit.name}
        actions={can(unit, "messaging.manage") && <Link className="btn btn-secondary" to="/mensagens/canal">Configurar canal</Link>} />
      {!channel.loading && !active && (
        <Alert kind="warning">
          Envio desativado: o WhatsApp oficial desta unidade está <strong>{CHANNEL_STATUS[channel.data?.status ?? "desativado"]}</strong>.
          O envio só é liberado com credenciais oficiais verificadas, webhook verificado, texto de consentimento e
          mensagem de teste. Mensagens recebidas continuam aparecendo aqui quando o webhook estiver configurado.
        </Alert>
      )}
      <div className="split">
        <aside>
          <Tabs value={filter} onChange={(v) => { setFilter(v); setSelected(null); }}
            items={[{ value: "aberta", label: "Abertas" }, { value: "encerrada", label: "Encerradas" }]} />
          <TextInput label="Buscar" placeholder="Nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Alert kind="error">{list.error}</Alert>
          {list.loading ? <Spinner /> : !rows.length ? <Empty>Nenhuma conversa.</Empty> : (
            <ul className="side-list">
              {rows.map((c) => (
                <li key={c.id}>
                  <button className={`side-item ${selected === c.id ? "active" : ""}`} onClick={() => setSelected(c.id)}>
                    <strong>{c.contact_name ?? formatPhone(c.contact_phone)}</strong>
                    <div className="small muted">{formatPhone(c.contact_phone)} · {formatDateTime(c.last_message_at)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <div className="split-main">
          {selected ? (
            <ConversationView key={selected} id={selected} channel={channel.data}
              onChanged={() => void list.reload()} />
          ) : <Empty>Selecione uma conversa.</Empty>}
        </div>
      </div>
    </>
  );
}

function ConversationView({ id, channel, onChanged }:
  { id: string; channel: MessagingChannel | null; onChanged: () => void }) {
  const unit = useUnit();
  const { access } = useAuth();
  const canSend = can(unit, "messaging.send");
  const canManageConv = canSend && can(unit, "messaging.view", "unit");
  const active = channel?.status === "ativo";

  const conv = useAsync(async () => unwrap(await supabase.from("conversations").select("*").eq("id", id).single()) as Conversation, [id]);
  const msgs = useAsync(async () => unwrap(await supabase.from("messages").select("*").eq("conversation_id", id)
    .neq("status", "descartada").order("created_at")) as Message[], [id]);
  const client = useAsync(async () => {
    const cu = conv.data?.client_unit_id;
    if (!cu) return null;
    const [mk, at] = await Promise.all([
      supabase.rpc("consent_status", { p_client_unit_id: cu, p_purpose: "marketing" }),
      supabase.rpc("consent_status", { p_client_unit_id: cu, p_purpose: "atendimento" }),
    ]);
    return { marketing: (mk.data as string) ?? "sem_registro", atendimento: (at.data as string) ?? "sem_registro" };
  }, [conv.data?.client_unit_id]);
  const templates = useAsync(async () => unwrap(await supabase.from("message_templates").select("*")
    .eq("unit_id", unit.unit_id).eq("active", true).eq("provider_status", "aprovado").order("name")) as MessageTemplate[], [unit.unit_id]);
  const people = useAsync(async () => {
    if (!canManageConv) return [];
    const { data } = await supabase.rpc("unit_people", { p_unit_id: unit.unit_id });
    return (data ?? []) as { user_id: string; full_name: string }[];
  }, [unit.unit_id, canManageConv]);

  const [body, setBody] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [vars, setVars] = useState("");
  const action = useAction();
  const [notice, setNotice] = useState<string | null>(null);

  if (conv.loading && !conv.data) return <Spinner />;
  if (!conv.data) return <Alert kind="error">{conv.error ?? "Conversa não encontrada."}</Alert>;
  const c = conv.data;
  const inWindow = !!c.last_inbound_at && Date.now() - new Date(c.last_inbound_at).getTime() < 24 * 3600 * 1000;
  const drafts = (msgs.data ?? []).filter((m) => m.status === "rascunho");
  const thread = (msgs.data ?? []).filter((m) => m.status !== "rascunho");

  async function reloadAll() {
    await Promise.all([conv.reload(), msgs.reload()]);
    onChanged();
  }

  async function saveDraft() {
    const ok = await action.run(async () => {
      if (draftId) unwrap(await supabase.from("messages").update({ body: body.trim() }).eq("id", draftId).select());
      else unwrap(await supabase.from("messages").insert({ unit_id: c.unit_id, conversation_id: c.id, direction: "saida",
        kind: "texto", body: body.trim(), status: "rascunho" }).select());
    });
    if (ok) { setBody(""); setDraftId(null); setNotice("Rascunho salvo."); void msgs.reload(); }
  }

  async function discard(m: Message) {
    const ok = await action.run(async () => unwrap(await supabase.from("messages").update({ status: "descartada" }).eq("id", m.id).select()));
    if (ok) { if (draftId === m.id) { setDraftId(null); setBody(""); } void msgs.reload(); }
  }

  async function send() {
    setNotice(null);
    const ok = await action.run(async () => {
      const res = await callFunction("whatsapp-send", templateId
        ? { conversation_id: c.id, template_id: templateId, variables: vars.split("|").map((v) => v.trim()).filter(Boolean) }
        : { conversation_id: c.id, body: body.trim(), draft_id: draftId });
      if (!res.ok) throw new Error(res.message);
    });
    if (ok) { setBody(""); setDraftId(null); setTemplateId(""); setVars(""); setNotice("Mensagem enviada."); }
    void reloadAll();
  }

  async function suggest() {
    setNotice(null);
    const ok = await action.run(async () => {
      const res = await callFunction<{ draft_id: string; body: string }>("sdr-draft", { conversation_id: c.id });
      if (!res.ok) throw new Error(res.message);
      setBody(res.data.body);
      setDraftId(res.data.draft_id);
    });
    if (ok) { setNotice("Sugestão da IA carregada como rascunho: revise antes de enviar."); void msgs.reload(); }
  }

  async function updateConv(values: { assigned_to?: string | null; status?: string }) {
    const ok = await action.run(async () => unwrap(await supabase.from("conversations").update(values).eq("id", c.id).select()));
    if (ok) void reloadAll();
  }

  return (
    <section className="card">
      <header className="row">
        <div>
          <h2 className="card-title">{c.contact_name ?? formatPhone(c.contact_phone)}</h2>
          <div className="small muted">{formatPhone(c.contact_phone)}
            {c.client_unit_id ? <> · <Link to={`/clientes/${c.client_unit_id}`}>ver cliente</Link></> : " · sem cadastro vinculado"}
            {c.opted_out_at && <> · <Badge tone="danger">Pediu para não receber (PARAR) em {formatDateTime(c.opted_out_at)}</Badge></>}
          </div>
        </div>
        {client.data && (
          <div className="row small">
            {(["atendimento", "marketing"] as const).map((p) => (
              <span key={p}>{PURPOSE[p]}: <Badge tone={consentTone(client.data![p])}>{CONSENT_STATUS[client.data![p]]}</Badge></span>
            ))}
          </div>
        )}
      </header>
      {canManageConv && (
        <div className="toolbar">
          <SelectInput label="Responsável" value={c.assigned_to ?? ""} onChange={(e) => void updateConv({ assigned_to: e.target.value || null })}>
            <option value="">Sem responsável</option>
            {(people.data ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
          </SelectInput>
          {c.status === "aberta"
            ? <Button variant="secondary" onClick={() => void updateConv({ status: "encerrada" })}>Encerrar conversa</Button>
            : <Button variant="secondary" onClick={() => void updateConv({ status: "aberta" })}>Reabrir</Button>}
          {!c.assigned_to && access && <Button variant="ghost" onClick={() => void updateConv({ assigned_to: access.user_id })}>Assumir</Button>}
        </div>
      )}

      {msgs.loading ? <Spinner /> : !thread.length ? <p className="muted">Sem mensagens.</p> : (
        <ul className="thread" aria-label="Mensagens">
          {thread.map((m) => (
            <li key={m.id} className={`bubble ${m.direction === "entrada" ? "bubble-in" : "bubble-out"}`}>
              <div className="pre">{m.body}</div>
              <div className="small muted">{formatDateTime(m.created_at)}
                {m.direction === "saida" && <> · {MESSAGE_STATUS[m.status]}{m.ai_generated && " · sugerida pela IA"}</>}
                {m.error && <> · {m.error}</>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canSend && (
        <>
          {drafts.length > 0 && (
            <ul className="thread" aria-label="Rascunhos">
              {drafts.map((m) => (
                <li key={m.id} className="bubble bubble-draft">
                  <div className="small muted">Rascunho{m.ai_generated && " sugerido pela IA"} · {formatDateTime(m.created_at)}</div>
                  <div className="pre">{m.body}</div>
                  <div className="row">
                    <Button variant="ghost" onClick={() => { setBody(m.body ?? ""); setDraftId(m.id); setTemplateId(""); }}>Editar</Button>
                    <Button variant="ghost" onClick={() => void discard(m)}>Descartar</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Alert kind="error">{action.error}</Alert>
          <Alert kind="success">{notice}</Alert>
          {!inWindow && (
            <Alert kind="info">Fora da janela de 24 h desde a última mensagem da cliente: só é possível enviar modelo
              aprovado, e somente para quem autorizou (opt-in).</Alert>
          )}
          <SelectInput label="Modelo aprovado" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">{inWindow ? "Mensagem livre (dentro da janela de 24 h)" : "Selecione um modelo"}</option>
            {(templates.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} ({PURPOSE[t.purpose]})</option>)}
          </SelectInput>
          {templateId ? (
            <>
              <p className="pre small">{templates.data?.find((t) => t.id === templateId)?.body}</p>
              <TextInput label="Variáveis do modelo (separe por |)" value={vars} onChange={(e) => setVars(e.target.value)} />
            </>
          ) : (
            <TextArea label={draftId ? "Mensagem (editando rascunho)" : "Mensagem"} value={body} onChange={(e) => setBody(e.target.value)} />
          )}
          <div className="row">
            {!templateId && <Button variant="secondary" busy={action.busy} disabled={!body.trim()} onClick={() => void saveDraft()}>Salvar rascunho</Button>}
            {channel?.ai_enabled && !templateId && (
              <Button variant="secondary" busy={action.busy} onClick={() => void suggest()}>Sugerir resposta (SDR IA)</Button>
            )}
            <Button busy={action.busy} disabled={!active || (!templateId && (!body.trim() || !inWindow))}
              title={active ? undefined : "Canal não ativado"} onClick={() => void send()}>Enviar</Button>
          </div>
        </>
      )}
    </section>
  );
}
