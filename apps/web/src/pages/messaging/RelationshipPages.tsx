// Relacionamento: follow-ups, reengajamento de inativas e pesquisa de
// satisfação (NPS). Nenhuma tela envia mensagem automaticamente: o contato é
// feito pela pessoa responsável (caixa de entrada, telefone ou presencial).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useUnit } from "../../auth/AuthProvider";
import { ClientPicker } from "../../components/ClientPicker";
import { Alert, Badge, Button, Checkbox, Empty, Modal, PageHeader, SelectInput, Spinner, Stat, Tabs, TextArea, TextInput } from "../../components/ui";
import { unwrap, useAction, useAsync } from "../../components/useAsync";
import { can } from "../../lib/access";
import { CONSENT_STATUS, FOLLOWUP_KIND, FOLLOWUP_STATUS, SURVEY_CHANNEL, consentTone, type ClientRow, type Survey } from "../../lib/db";
import { formatDate, formatDateTime, localDate, localToIso } from "../../lib/format";
import { supabase } from "../../lib/supabase";

interface Person { user_id: string; full_name: string }

// Pessoas da unidade para atribuição (só quem tem escopo de unidade atribui a outras pessoas).
function useAssignees() {
  const unit = useUnit();
  const { access } = useAuth();
  const unitScope = can(unit, "followups.manage", "unit");
  const people = useAsync(async () => {
    if (!unitScope) return [] as Person[];
    const { data } = await supabase.rpc("unit_people", { p_unit_id: unit.unit_id });
    return (data ?? []) as Person[];
  }, [unit.unit_id, unitScope]);
  const me: Person | null = access ? { user_id: access.user_id, full_name: access.full_name } : null;
  const list = unitScope && people.data?.length ? people.data : me ? [me] : [];
  return { list, unitScope, me, name: (id: string) => list.find((p) => p.user_id === id)?.full_name ?? (id === me?.user_id ? me.full_name : "—") };
}

// Abre (ou cria) a conversa de WhatsApp da cliente na caixa de entrada.
function useOpenConversation() {
  const navigate = useNavigate();
  const action = useAction();
  async function open(clientUnitId: string) {
    let convId: string | null = null;
    const ok = await action.run(async () => {
      convId = unwrap(await supabase.rpc("messaging_start_conversation", { p_client_unit_id: clientUnitId })) as string;
    });
    if (ok && convId) navigate(`/mensagens?c=${convId}`);
  }
  return { open, error: action.error, busy: action.busy };
}

interface FollowupRow {
  id: string;
  client_unit_id: string;
  assigned_to: string;
  kind: string;
  reason: string;
  due_at: string;
  status: string;
  outcome: string | null;
  done_at: string | null;
  client_units: { client_identities: { full_name: string } } | null;
}

export function FollowupsPage() {
  const unit = useUnit();
  const assignees = useAssignees();
  const conv = useOpenConversation();
  const [status, setStatus] = useState("aberto");
  const [mineOnly, setMineOnly] = useState(!assignees.unitScope);
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<FollowupRow | null>(null);
  const list = useAsync(async () => {
    let q = supabase.from("followups").select("id, client_unit_id, assigned_to, kind, reason, due_at, status, outcome, done_at, client_units(client_identities(full_name))")
      .eq("unit_id", unit.unit_id).eq("status", status).order("due_at", { ascending: status === "aberto" }).limit(300);
    if (mineOnly && assignees.me) q = q.eq("assigned_to", assignees.me.user_id);
    return unwrap(await q) as unknown as FollowupRow[];
  }, [unit.unit_id, status, mineOnly, assignees.me?.user_id]);
  const now = Date.now();

  return (
    <>
      <PageHeader title="Follow-ups" subtitle={unit.name} actions={<Button onClick={() => setCreating(true)}>Novo follow-up</Button>} />
      <div className="toolbar">
        <Tabs value={status} onChange={setStatus} items={Object.entries(FOLLOWUP_STATUS).map(([value, label]) => ({ value, label }))} />
        {assignees.unitScope && <Checkbox label="Só os meus" checked={mineOnly} onChange={setMineOnly} />}
      </div>
      <Alert kind="error">{list.error ?? conv.error}</Alert>
      {list.loading ? <Spinner /> : !list.data?.length ? <Empty>Nenhum follow-up.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Prazo</th><th>Cliente</th><th>Tipo</th><th>Motivo</th><th>Responsável</th><th /></tr></thead>
            <tbody>
              {list.data.map((f) => (
                <tr key={f.id}>
                  <td className="nowrap">{formatDateTime(f.due_at)} {f.status === "aberto" && new Date(f.due_at).getTime() < now && <Badge tone="danger">atrasado</Badge>}</td>
                  <td>{f.client_units?.client_identities.full_name ?? "—"}</td>
                  <td>{FOLLOWUP_KIND[f.kind]}</td>
                  <td className="pre">{f.reason}{f.outcome && <div className="small muted">Resultado: {f.outcome}</div>}</td>
                  <td>{assignees.name(f.assigned_to)}</td>
                  <td className="nowrap">
                    {f.status === "aberto" && <>
                      {can(unit, "messaging.send") && <Button variant="ghost" busy={conv.busy} onClick={() => void conv.open(f.client_unit_id)}>WhatsApp</Button>}
                      <Button variant="secondary" onClick={() => setClosing(f)}>Concluir</Button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewFollowupModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void list.reload(); }} />}
      {closing && <CloseFollowupModal f={closing} onClose={() => setClosing(null)} onSaved={() => { setClosing(null); void list.reload(); }} />}
    </>
  );
}

function NewFollowupModal({ onClose, onSaved, client: initialClient, kind: initialKind = "retorno" }:
  { onClose: () => void; onSaved: () => void; client?: ClientRow | null; kind?: string }) {
  const unit = useUnit();
  const assignees = useAssignees();
  const [client, setClient] = useState<ClientRow | null>(initialClient ?? null);
  const [kind, setKind] = useState(initialKind);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(localDate());
  const [time, setTime] = useState("10:00");
  const [assignee, setAssignee] = useState(assignees.me?.user_id ?? "");
  const action = useAction();
  async function save() {
    const ok = await action.run(async () => unwrap(await supabase.from("followups").insert({
      unit_id: unit.unit_id, client_unit_id: client!.id, assigned_to: assignee || assignees.me!.user_id, kind,
      reason: reason.trim(), due_at: localToIso(date, time),
    }).select()));
    if (ok) onSaved();
  }
  return (
    <Modal title="Novo follow-up" onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button busy={action.busy} disabled={!client || reason.trim().length < 3} onClick={() => void save()}>Salvar</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <ClientPicker unitId={unit.unit_id} value={client} onChange={setClient} />
      <div className="row">
        <SelectInput label="Tipo" value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(FOLLOWUP_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </SelectInput>
        <TextInput label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <TextInput label="Hora" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <SelectInput label="Responsável" value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!assignees.unitScope}>
        {assignees.list.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
      </SelectInput>
      <TextArea label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}

function CloseFollowupModal({ f, onClose, onSaved }: { f: FollowupRow; onClose: () => void; onSaved: () => void }) {
  const [outcome, setOutcome] = useState("");
  const action = useAction();
  async function close(status: "feito" | "cancelado") {
    const ok = await action.run(async () => unwrap(await supabase.from("followups")
      .update({ status, outcome: outcome.trim() || null }).eq("id", f.id).select()));
    if (ok) onSaved();
  }
  return (
    <Modal title="Concluir follow-up" onClose={onClose} footer={
      <><Button variant="secondary" busy={action.busy} onClick={() => void close("cancelado")}>Cancelar follow-up</Button>
        <Button busy={action.busy} onClick={() => void close("feito")}>Marcar como feito</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <p>{f.client_units?.client_identities.full_name} — {f.reason}</p>
      <TextArea label="Resultado do contato" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
    </Modal>
  );
}

interface InactiveRow { client_unit_id: string; client_name: string; last_visit: string | null; consent_marketing: string; open_followups: number }

export function ReengagementPage() {
  const unit = useUnit();
  const assignees = useAssignees();
  const [days, setDays] = useState(90);
  const [query, setQuery] = useState(90);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [assignee, setAssignee] = useState("");
  const [reason, setReason] = useState("Cliente sem visita recente: convidar para retorno");
  const [due, setDue] = useState(localDate());
  const action = useAction();
  const [done, setDone] = useState<string | null>(null);
  const list = useAsync(async () => unwrap(await supabase.rpc("inactive_clients", { p_unit_id: unit.unit_id, p_days: query })) as InactiveRow[],
    [unit.unit_id, query]);

  function toggle(id: string, v: boolean) {
    const next = new Set(picked);
    if (v) next.add(id); else next.delete(id);
    setPicked(next);
  }

  async function create() {
    setDone(null);
    const ids = [...picked];
    const ok = await action.run(async () => unwrap(await supabase.from("followups").insert(ids.map((id) => ({
      unit_id: unit.unit_id, client_unit_id: id, assigned_to: assignee || assignees.me!.user_id, kind: "reengajamento",
      reason: reason.trim(), due_at: localToIso(due, "10:00"),
    }))).select()));
    if (ok) { setDone(`${ids.length} follow-up(s) criados.`); setPicked(new Set()); void list.reload(); }
  }

  return (
    <>
      <PageHeader title="Reengajamento" subtitle={unit.name} />
      <p className="muted small">Clientes sem atendimento concluído nem comanda finalizada no período. Mensagens de
        marketing só podem ser enviadas a quem autorizou (opt-in); as demais devem ser contatadas por outro meio ou
        convidadas a autorizar.</p>
      <div className="toolbar">
        <TextInput label="Sem visita há (dias)" type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        <Button variant="secondary" onClick={() => setQuery(Math.max(1, days))}>Atualizar</Button>
      </div>
      <Alert kind="error">{list.error ?? action.error}</Alert>
      <Alert kind="success">{done}</Alert>
      {list.loading ? <Spinner /> : !list.data?.length ? <Empty>Nenhuma cliente inativa no período.</Empty> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th /><th>Cliente</th><th>Última visita</th><th>Marketing</th><th className="num">Follow-ups abertos</th></tr></thead>
              <tbody>
                {list.data.map((r) => (
                  <tr key={r.client_unit_id}>
                    <td><input type="checkbox" aria-label={`Selecionar ${r.client_name}`} checked={picked.has(r.client_unit_id)}
                      onChange={(e) => toggle(r.client_unit_id, e.target.checked)} /></td>
                    <td>{r.client_name}</td>
                    <td>{r.last_visit ? formatDate(r.last_visit) : "Nunca"}</td>
                    <td><Badge tone={consentTone(r.consent_marketing)}>{CONSENT_STATUS[r.consent_marketing]}</Badge></td>
                    <td className="num">{r.open_followups}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="card">
            <h2 className="card-title">Criar follow-ups para {picked.size} selecionada(s)</h2>
            <div className="row">
              <SelectInput label="Responsável" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Eu mesma(o)</option>
                {assignees.list.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
              </SelectInput>
              <TextInput label="Prazo" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <TextInput label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button busy={action.busy} disabled={!picked.size || reason.trim().length < 3} onClick={() => void create()}>Criar follow-ups</Button>
          </section>
        </>
      )}
    </>
  );
}

interface Candidate { appointment_id: string; client_unit_id: string; client_name: string; service_name: string; starts_at: string; consent_atendimento: string }
interface Results { respostas: number; promotores: number; neutros: number; detratores: number; nps: number | null; media: number | null }

export function SurveysPage() {
  const unit = useUnit();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const surveys = useAsync(async () => unwrap(await supabase.from("surveys").select("*").eq("unit_id", unit.unit_id)
    .order("created_at", { ascending: false })) as Survey[], [unit.unit_id]);
  const current = surveys.data?.find((s) => s.id === selected) ?? surveys.data?.find((s) => s.active) ?? null;

  return (
    <>
      <PageHeader title="Pesquisa de satisfação" subtitle={unit.name} actions={<Button onClick={() => setCreating(true)}>Nova pesquisa</Button>} />
      <Alert kind="error">{surveys.error}</Alert>
      {surveys.loading ? <Spinner /> : !surveys.data?.length ? <Empty>Nenhuma pesquisa criada.</Empty> : (
        <>
          <SelectInput label="Pesquisa" value={current?.id ?? ""} onChange={(e) => setSelected(e.target.value)}>
            {surveys.data.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active ? "" : " (inativa)"}</option>)}
          </SelectInput>
          {current && <SurveyView key={current.id} survey={current} onChanged={() => void surveys.reload()} />}
        </>
      )}
      {creating && <SurveyModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void surveys.reload(); }} />}
    </>
  );
}

function SurveyView({ survey, onChanged }: { survey: Survey; onChanged: () => void }) {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return localDate(d); });
  const [to, setTo] = useState(localDate());
  const [answering, setAnswering] = useState<Candidate | null>(null);
  const action = useAction();
  const results = useAsync(async () => unwrap(await supabase.rpc("survey_results", { p_survey_id: survey.id, p_from: from, p_to: to })) as unknown as Results,
    [survey.id, from, to]);
  const candidates = useAsync(async () => unwrap(await supabase.rpc("survey_candidates", { p_survey_id: survey.id, p_days: 14 })) as Candidate[],
    [survey.id]);
  const r = results.data;

  async function toggleActive() {
    const ok = await action.run(async () => unwrap(await supabase.from("surveys").update({ active: !survey.active }).eq("id", survey.id).select()));
    if (ok) onChanged();
  }

  return (
    <>
      <section className="card">
        <p><strong>Pergunta:</strong> {survey.question}</p>
        <Alert kind="error">{action.error ?? results.error}</Alert>
        <div className="toolbar">
          <TextInput label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextInput label="Até" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button variant="ghost" busy={action.busy} onClick={() => void toggleActive()}>{survey.active ? "Desativar pesquisa" : "Reativar pesquisa"}</Button>
        </div>
        {r && (
          <div className="stats">
            <Stat label="NPS" value={r.nps ?? "—"} hint="% promotores − % detratores" />
            <Stat label="Respostas" value={r.respostas} />
            <Stat label="Média" value={r.media ?? "—"} />
            <Stat label="Promotores (9–10)" value={r.promotores} />
            <Stat label="Neutros (7–8)" value={r.neutros} />
            <Stat label="Detratores (0–6)" value={r.detratores} />
          </div>
        )}
      </section>
      <section className="card">
        <h2 className="card-title">Atendimentos concluídos sem avaliação (14 dias)</h2>
        <Alert kind="error">{candidates.error}</Alert>
        {candidates.loading ? <Spinner /> : !candidates.data?.length ? <Empty>Nenhum atendimento pendente de avaliação.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Data</th><th>Cliente</th><th>Serviço</th><th>Mensagens de atendimento</th><th /></tr></thead>
              <tbody>
                {candidates.data.map((c) => (
                  <tr key={c.appointment_id}>
                    <td>{formatDateTime(c.starts_at)}</td><td>{c.client_name}</td><td>{c.service_name}</td>
                    <td><Badge tone={consentTone(c.consent_atendimento)}>{CONSENT_STATUS[c.consent_atendimento]}</Badge></td>
                    <td>{survey.active && <Button variant="secondary" onClick={() => setAnswering(c)}>Registrar resposta</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {answering && <ResponseModal survey={survey} c={answering} onClose={() => setAnswering(null)}
        onSaved={() => { setAnswering(null); void candidates.reload(); void results.reload(); }} />}
    </>
  );
}

function ResponseModal({ survey, c, onClose, onSaved }: { survey: Survey; c: Candidate; onClose: () => void; onSaved: () => void }) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [channel, setChannel] = useState("presencial");
  const action = useAction();
  async function save() {
    const ok = await action.run(async () => unwrap(await supabase.from("survey_responses").insert({
      unit_id: survey.unit_id, survey_id: survey.id, client_unit_id: c.client_unit_id, appointment_id: c.appointment_id,
      score: score!, comment: comment.trim() || null, channel,
    }).select()));
    if (ok) onSaved();
  }
  return (
    <Modal title={`Avaliação — ${c.client_name}`} onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={action.busy} disabled={score === null} onClick={() => void save()}>Salvar</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <p>{survey.question}</p>
      <div className="score-row" role="radiogroup" aria-label="Nota">
        {Array.from({ length: 11 }, (_, i) => (
          <Button key={i} variant={score === i ? "primary" : "secondary"} role="radio" aria-checked={score === i} onClick={() => setScore(i)}>{i}</Button>
        ))}
      </div>
      <SelectInput label="Canal" value={channel} onChange={(e) => setChannel(e.target.value)}>
        {Object.entries(SURVEY_CHANNEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </SelectInput>
      <TextArea label="Comentário" value={comment} onChange={(e) => setComment(e.target.value)} />
    </Modal>
  );
}

function SurveyModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const unit = useUnit();
  const [name, setName] = useState("Satisfação pós-atendimento");
  const [question, setQuestion] = useState("De 0 a 10, quanto você recomendaria o salão a uma amiga?");
  const action = useAction();
  async function save() {
    const ok = await action.run(async () => unwrap(await supabase.from("surveys").insert({ unit_id: unit.unit_id, name: name.trim(), question: question.trim() }).select()));
    if (ok) onSaved();
  }
  return (
    <Modal title="Nova pesquisa" onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={action.busy} onClick={() => void save()}>Criar</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <TextInput label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
      <TextArea label="Pergunta (nota de 0 a 10)" value={question} onChange={(e) => setQuestion(e.target.value)} />
    </Modal>
  );
}

export { NewFollowupModal };
