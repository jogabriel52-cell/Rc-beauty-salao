// Configuração do WhatsApp oficial da unidade (messaging.manage): número,
// texto de consentimento, verificações exigidas para ativar, modelos de
// mensagem e SDR IA. As credenciais (token, segredo do app) NUNCA são
// digitadas aqui: ficam só nos segredos das Edge Functions.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useUnit } from "../../auth/AuthProvider";
import { Alert, Badge, Button, Checkbox, Empty, Modal, PageHeader, SelectInput, Spinner, TextArea, TextInput } from "../../components/ui";
import { unwrap, useAction, useAsync } from "../../components/useAsync";
import { can } from "../../lib/access";
import { CHANNEL_STATUS, PURPOSE, TEMPLATE_STATUS, type MessageTemplate, type MessagingChannel } from "../../lib/db";
import { formatDateTime } from "../../lib/format";
import { callFunction, supabase } from "../../lib/supabase";

export function ChannelPage() {
  const unit = useUnit();
  const channel = useAsync(async () => unwrap(await supabase.from("messaging_channels").select("*")
    .eq("unit_id", unit.unit_id).single()) as MessagingChannel, [unit.unit_id]);

  if (!can(unit, "messaging.manage")) return <Alert kind="error">Você não tem permissão para configurar o canal.</Alert>;
  if (channel.loading && !channel.data) return <Spinner />;
  if (!channel.data) return <Alert kind="error">{channel.error ?? "Canal não encontrado."}</Alert>;

  return (
    <>
      <PageHeader title="WhatsApp oficial" subtitle={<><Link to="/mensagens">← Mensagens</Link> · {unit.name}</>}
        actions={<Badge tone={channel.data.status === "ativo" ? "success" : "warning"}>{CHANNEL_STATUS[channel.data.status]}</Badge>} />
      <ChannelForm ch={channel.data} onSaved={() => void channel.reload()} />
      <Checklist ch={channel.data} onChanged={() => void channel.reload()} />
      <AiSection ch={channel.data} onChanged={() => void channel.reload()} />
      <Templates />
    </>
  );
}

function ChannelForm({ ch, onSaved }: { ch: MessagingChannel; onSaved: () => void }) {
  const [displayPhone, setDisplayPhone] = useState(ch.display_phone ?? "");
  const [phoneId, setPhoneId] = useState(ch.phone_number_id ?? "");
  const [waba, setWaba] = useState(ch.waba_id ?? "");
  const [consent, setConsent] = useState(ch.consent_text ?? "");
  const action = useAction();
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [displayPhone, phoneId, waba, consent]);

  async function save() {
    const ok = await action.run(async () => unwrap(await supabase.from("messaging_channels").update({
      display_phone: displayPhone.replace(/\D/g, "") || null, phone_number_id: phoneId.trim() || null,
      waba_id: waba.trim() || null, consent_text: consent.trim() || null,
    }).eq("id", ch.id).select()));
    if (ok) { setSaved(true); onSaved(); }
  }

  return (
    <section className="card">
      <h2 className="card-title">Número e consentimento</h2>
      <p className="muted small">Dados públicos da conta WhatsApp Business (Meta). Trocar o número ou a conta apaga as
        verificações e desativa o envio até nova verificação.</p>
      <Alert kind="error">{action.error}</Alert>
      {saved && <Alert kind="success">Dados salvos.</Alert>}
      <div className="row">
        <TextInput label="Número exibido (com DDI e DDD)" value={displayPhone} onChange={(e) => setDisplayPhone(e.target.value)} placeholder="5511999999999" />
        <TextInput label="ID do número (phone_number_id)" value={phoneId} onChange={(e) => setPhoneId(e.target.value)} />
        <TextInput label="ID da conta (WABA)" value={waba} onChange={(e) => setWaba(e.target.value)} />
      </div>
      <TextArea label="Texto de consentimento apresentado à cliente" value={consent} onChange={(e) => setConsent(e.target.value)}
        hint="Ex.: autorização para receber mensagens sobre atendimentos e, separadamente, novidades; informe como sair (PARAR)." />
      <Button busy={action.busy} onClick={() => void save()}>Salvar</Button>
    </section>
  );
}

function Checklist({ ch, onChanged }: { ch: MessagingChannel; onChanged: () => void }) {
  const unit = useUnit();
  const action = useAction();
  const [testTo, setTestTo] = useState("");
  const [testTemplate, setTestTemplate] = useState("");
  const [testLang, setTestLang] = useState("pt_BR");
  const [reason, setReason] = useState("");

  async function verify(kind: "credentials" | "test") {
    const ok = await action.run(async () => {
      const res = await callFunction("whatsapp-verify-channel", kind === "credentials"
        ? { unit_id: unit.unit_id, action: "credentials" }
        : { unit_id: unit.unit_id, action: "test", to: testTo, template_name: testTemplate, template_language: testLang });
      if (!res.ok) throw new Error(res.message);
    });
    if (ok) onChanged();
  }

  async function setStatus(status: string) {
    const ok = await action.run(async () => unwrap(await supabase.from("messaging_channels")
      .update({ status, status_reason: reason.trim() || null }).eq("id", ch.id).select()));
    if (ok) { setReason(""); onChanged(); }
  }

  const item = (done: string | null, label: string) => (
    <><Badge tone={done ? "success" : "neutral"}>{done ? "OK" : "Pendente"}</Badge> <span>{label}</span>
      {done && <span className="small muted">em {formatDateTime(done)}</span>}</>
  );
  const ready = !!(ch.credentials_verified_at && ch.webhook_verified_at && ch.test_message_at && ch.consent_text && ch.phone_number_id);

  return (
    <section className="card">
      <h2 className="card-title">Ativação</h2>
      <p className="muted small">O banco só permite ativar o envio com todas as etapas concluídas. As verificações são
        registradas pelo servidor, com as credenciais oficiais configuradas nos segredos das funções.</p>
      <Alert kind="error">{action.error}</Alert>
      <ul className="checklist">
        <li>{item(ch.phone_number_id && ch.consent_text ? ch.updated_at : null, "Número e texto de consentimento cadastrados")}</li>
        <li>{item(ch.credentials_verified_at, "Credencial oficial verificada na Graph API")}
          <Button variant="secondary" busy={action.busy} disabled={!ch.phone_number_id} onClick={() => void verify("credentials")}>Verificar credencial</Button></li>
        <li>{item(ch.webhook_verified_at, "Webhook verificado pela Meta")}
          <span className="small muted">Configure na Meta a URL da função whatsapp-webhook e o token de verificação.</span></li>
        <li>{item(ch.test_message_at, "Mensagem de teste enviada com modelo aprovado")}</li>
      </ul>
      {ch.credentials_verified_at && (
        <div className="row">
          <TextInput label="Número de teste da equipe" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="5511999999999" />
          <TextInput label="Nome do modelo aprovado" value={testTemplate} onChange={(e) => setTestTemplate(e.target.value)} placeholder="hello_world" />
          <TextInput label="Idioma" value={testLang} onChange={(e) => setTestLang(e.target.value)} />
          <Button variant="secondary" busy={action.busy} disabled={!testTo || !testTemplate} onClick={() => void verify("test")}>Enviar teste</Button>
        </div>
      )}
      <TextInput label="Motivo (opcional, registrado na auditoria)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="row">
        {ch.status !== "ativo" && <Button busy={action.busy} disabled={!ready} onClick={() => void setStatus("ativo")}>Ativar envio</Button>}
        {ch.status === "ativo" && <Button variant="danger" busy={action.busy} onClick={() => void setStatus("suspenso")}>Suspender envio</Button>}
      </div>
      {ch.status_reason && <p className="small muted">Último motivo: {ch.status_reason}</p>}
    </section>
  );
}

function AiSection({ ch, onChanged }: { ch: MessagingChannel; onChanged: () => void }) {
  const action = useAction();
  async function toggle(v: boolean) {
    const ok = await action.run(async () => unwrap(await supabase.from("messaging_channels").update({ ai_enabled: v }).eq("id", ch.id).select()));
    if (ok) onChanged();
  }
  return (
    <section className="card">
      <h2 className="card-title">SDR IA (sugestão de respostas)</h2>
      <p className="muted small">A IA apenas sugere rascunhos; uma pessoa revisa e envia. Quando ligada, o primeiro nome
        da cliente, as últimas mensagens da conversa e a lista de serviços são enviados ao provedor de IA (Anthropic) —
        sem telefone, e-mail ou anotações de CRM. Ligue somente após a decisão da direção sobre esse tratamento de dados
        (LGPD) e com a chave da IA configurada nos segredos das funções.</p>
      <Alert kind="error">{action.error}</Alert>
      <Checkbox label="Permitir sugestões da IA nesta unidade" checked={ch.ai_enabled} disabled={action.busy} onChange={(v) => void toggle(v)} />
      {ch.ai_enabled_at && <p className="small muted">Ligada em {formatDateTime(ch.ai_enabled_at)}</p>}
    </section>
  );
}

function Templates() {
  const unit = useUnit();
  const [editing, setEditing] = useState<MessageTemplate | "new" | null>(null);
  const list = useAsync(async () => unwrap(await supabase.from("message_templates").select("*")
    .eq("unit_id", unit.unit_id).order("name")) as MessageTemplate[], [unit.unit_id]);
  return (
    <section className="card">
      <div className="row">
        <h2 className="card-title">Modelos de mensagem</h2>
        <Button variant="secondary" onClick={() => setEditing("new")}>Novo modelo</Button>
      </div>
      <p className="muted small">Cadastre aqui os modelos criados e aprovados no WhatsApp Manager da Meta, com o mesmo
        nome e idioma. Só modelos marcados como aprovados podem ser enviados.</p>
      <Alert kind="error">{list.error}</Alert>
      {list.loading ? <Spinner /> : !list.data?.length ? <Empty>Nenhum modelo cadastrado.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nome</th><th>Idioma</th><th>Finalidade</th><th>Situação na Meta</th><th /></tr></thead>
            <tbody>
              {list.data.map((t) => (
                <tr key={t.id}>
                  <td>{t.name} {!t.active && <Badge tone="danger">inativo</Badge>}</td><td>{t.language}</td>
                  <td>{PURPOSE[t.purpose]}</td><td>{TEMPLATE_STATUS[t.provider_status]}</td>
                  <td><Button variant="ghost" onClick={() => setEditing(t)}>Editar</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <TemplateModal t={editing === "new" ? null : editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void list.reload(); }} />}
    </section>
  );
}

function TemplateModal({ t, onClose, onSaved }: { t: MessageTemplate | null; onClose: () => void; onSaved: () => void }) {
  const unit = useUnit();
  const [name, setName] = useState(t?.name ?? "");
  const [language, setLanguage] = useState(t?.language ?? "pt_BR");
  const [purpose, setPurpose] = useState(t?.purpose ?? "atendimento");
  const [body, setBody] = useState(t?.body ?? "");
  const [status, setStatus] = useState(t?.provider_status ?? "rascunho");
  const [active, setActive] = useState(t?.active ?? true);
  const action = useAction();
  async function save() {
    const ok = await action.run(async () => {
      if (t) unwrap(await supabase.from("message_templates").update({ body: body.trim(), provider_status: status, active }).eq("id", t.id).select());
      else unwrap(await supabase.from("message_templates").insert({ unit_id: unit.unit_id, name: name.trim(), language,
        purpose, body: body.trim(), provider_status: status, active }).select());
    });
    if (ok) onSaved();
  }
  return (
    <Modal title={t ? `Modelo ${t.name}` : "Novo modelo"} onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={action.busy} onClick={() => void save()}>Salvar</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <TextInput label="Nome (igual ao da Meta: minúsculas, números e _)" value={name} disabled={!!t} onChange={(e) => setName(e.target.value)} />
      <div className="row">
        <TextInput label="Idioma" value={language} disabled={!!t} onChange={(e) => setLanguage(e.target.value)} />
        <SelectInput label="Finalidade" value={purpose} disabled={!!t} onChange={(e) => setPurpose(e.target.value)}>
          {Object.entries(PURPOSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </SelectInput>
        <SelectInput label="Situação na Meta" value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(TEMPLATE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </SelectInput>
      </div>
      <TextArea label="Texto (variáveis como {{1}})" value={body} onChange={(e) => setBody(e.target.value)} />
      <Checkbox label="Ativo" checked={active} onChange={setActive} />
    </Modal>
  );
}
