import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useUnit } from "../../auth/AuthProvider";
import { Alert, Badge, Button, PageHeader, SelectInput, Spinner, Tabs, TextArea, TextInput } from "../../components/ui";
import { unwrap, useAction, useAsync } from "../../components/useAsync";
import { can } from "../../lib/access";
import { APPOINTMENT_STATUS, CLIENT_SELECT, CRM_KIND, SALE_STATUS, type ClientRow } from "../../lib/db";
import { formatDate, formatDateTime, formatMoney, formatPhone } from "../../lib/format";
import { supabase } from "../../lib/supabase";

type Tab = "crm" | "agenda" | "comandas";

export function ClientDetailPage() {
  const { id } = useParams();
  const unit = useUnit();
  const [tab, setTab] = useState<Tab>(can(unit, "crm.view") ? "crm" : "agenda");
  const [editing, setEditing] = useState(false);

  const client = useAsync(async () =>
    unwrap(await supabase.from("client_units").select(CLIENT_SELECT).eq("id", id!).eq("unit_id", unit.unit_id).single()) as unknown as ClientRow,
  [id, unit.unit_id]);

  if (client.loading) return <Spinner />;
  if (!client.data) return <Alert kind="error">{client.error ?? "Cliente não encontrada nesta unidade."}</Alert>;
  const c = client.data;

  const tabs: { value: Tab; label: string }[] = [];
  if (can(unit, "crm.view")) tabs.push({ value: "crm", label: "CRM" });
  if (can(unit, "appointments.view", "unit")) tabs.push({ value: "agenda", label: "Agendamentos" });
  if (can(unit, "sales.view", "unit")) tabs.push({ value: "comandas", label: "Comandas" });

  return (
    <>
      <PageHeader title={c.client_identities.full_name} subtitle={<Link to="/clientes">← Clientes</Link>}
        actions={c.archived_at && <Badge tone="warning">Arquivada</Badge>} />
      {editing ? (
        <EditClient c={c} onDone={() => { setEditing(false); void client.reload(); }} />
      ) : (
        <section className="card">
          <dl className="details">
            <dt>Telefone</dt><dd>{formatPhone(c.client_identities.phone)}</dd>
            <dt>E-mail</dt><dd>{c.client_identities.email ?? "—"}</dd>
            <dt>Nascimento</dt><dd>{formatDate(c.client_identities.birth_date)}</dd>
            <dt>Atendimento</dt><dd>{c.service_notes ?? "—"}</dd>
          </dl>
          <div className="row">
            {can(unit, "clients.update") && <Button variant="secondary" onClick={() => setEditing(true)}>Editar</Button>}
            {can(unit, "clients.archive") && <ArchiveButton c={c} onDone={() => void client.reload()} />}
          </div>
          <p className="muted small">Nome e contato são compartilhados se a cliente também for atendida em outra unidade.
            Observações, CRM, agenda e comandas são desta unidade.</p>
        </section>
      )}
      {tabs.length > 0 && <Tabs value={tab} onChange={setTab} items={tabs} />}
      {tab === "crm" && can(unit, "crm.view") && <CrmTimeline clientUnitId={c.id} />}
      {tab === "agenda" && can(unit, "appointments.view", "unit") && <ClientAppointments clientUnitId={c.id} />}
      {tab === "comandas" && can(unit, "sales.view", "unit") && <ClientSales clientUnitId={c.id} />}
    </>
  );
}

function EditClient({ c, onDone }: { c: ClientRow; onDone: () => void }) {
  const [name, setName] = useState(c.client_identities.full_name);
  const [phone, setPhone] = useState(c.client_identities.phone ?? "");
  const [email, setEmail] = useState(c.client_identities.email ?? "");
  const [birth, setBirth] = useState(c.client_identities.birth_date ?? "");
  const [notes, setNotes] = useState(c.service_notes ?? "");
  const action = useAction();

  async function save() {
    const ok = await action.run(async () => {
      unwrap(await supabase.from("client_identities").update({
        full_name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, birth_date: birth || null,
      }).eq("id", c.client_identities.id).select());
      unwrap(await supabase.from("client_units").update({ service_notes: notes.trim() || null }).eq("id", c.id).select());
    });
    if (ok) onDone();
  }

  return (
    <section className="card">
      <Alert kind="error">{action.error}</Alert>
      <TextInput label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="row">
        <TextInput label="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <TextInput label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextInput label="Nascimento" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
      </div>
      <TextArea label="Observações de atendimento (visíveis ao profissional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="row">
        <Button variant="secondary" onClick={onDone}>Cancelar</Button>
        <Button busy={action.busy} onClick={() => void save()}>Salvar</Button>
      </div>
    </section>
  );
}

function ArchiveButton({ c, onDone }: { c: ClientRow; onDone: () => void }) {
  const action = useAction();
  return (
    <>
      <Button variant={c.archived_at ? "secondary" : "danger"} busy={action.busy} onClick={async () => {
        const ok = await action.run(async () => unwrap(await supabase.from("client_units")
          .update({ archived_at: c.archived_at ? null : new Date().toISOString() }).eq("id", c.id).select()));
        if (ok) onDone();
      }}>{c.archived_at ? "Restaurar" : "Arquivar"}</Button>
      {action.error && <Alert kind="error">{action.error}</Alert>}
    </>
  );
}

function CrmTimeline({ clientUnitId }: { clientUnitId: string }) {
  const unit = useUnit();
  const [kind, setKind] = useState("nota");
  const [body, setBody] = useState("");
  const action = useAction();
  const items = useAsync(async () => {
    const rows = unwrap(await supabase.from("crm_interactions").select("*").eq("client_unit_id", clientUnitId)
      .order("occurred_at", { ascending: false }).limit(200)) as { id: string; kind: string; body: string; occurred_at: string; created_by: string | null }[];
    const ids = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (ids.length) {
      (unwrap(await supabase.from("profiles").select("id, full_name").in("id", ids)) as { id: string; full_name: string }[])
        .forEach((p) => names.set(p.id, p.full_name));
    }
    return rows.map((r) => ({ ...r, author: r.created_by ? names.get(r.created_by) ?? "—" : "Sistema" }));
  }, [clientUnitId]);

  async function add() {
    const ok = await action.run(async () => unwrap(await supabase.from("crm_interactions")
      .insert({ unit_id: unit.unit_id, client_unit_id: clientUnitId, kind, body: body.trim() }).select()));
    if (ok) { setBody(""); void items.reload(); }
  }

  return (
    <section>
      {can(unit, "crm.write") && (
        <div className="card">
          <Alert kind="error">{action.error}</Alert>
          <div className="row">
            <SelectInput label="Tipo" value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(CRM_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectInput>
          </div>
          <TextArea label="Registro (privado desta unidade)" value={body} onChange={(e) => setBody(e.target.value)} />
          <Button busy={action.busy} disabled={!body.trim()} onClick={() => void add()}>Registrar</Button>
        </div>
      )}
      {items.loading ? <Spinner /> : !items.data?.length ? <p className="muted">Sem registros de CRM.</p> : (
        <ul className="timeline">
          {items.data.map((i) => (
            <li key={i.id}>
              <div className="small muted">{formatDateTime(i.occurred_at)} · {CRM_KIND[i.kind]} · {i.author}</div>
              <div className="pre">{i.body}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ClientAppointments({ clientUnitId }: { clientUnitId: string }) {
  const data = useAsync(async () => unwrap(await supabase.from("appointments")
    .select("id, starts_at, status, services(name), professionals(display_name)")
    .eq("client_id", clientUnitId).order("starts_at", { ascending: false }).limit(100)) as unknown as
    { id: string; starts_at: string; status: string; services: { name: string } | null; professionals: { display_name: string } | null }[],
  [clientUnitId]);
  if (data.loading) return <Spinner />;
  if (!data.data?.length) return <p className="muted">Sem agendamentos.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Data</th><th>Serviço</th><th>Profissional</th><th>Situação</th></tr></thead>
        <tbody>
          {data.data.map((a) => (
            <tr key={a.id}><td>{formatDateTime(a.starts_at)}</td><td>{a.services?.name}</td>
              <td>{a.professionals?.display_name}</td><td>{APPOINTMENT_STATUS[a.status]}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClientSales({ clientUnitId }: { clientUnitId: string }) {
  const data = useAsync(async () => unwrap(await supabase.from("sales")
    .select("id, number, opened_at, status, total_cents").eq("client_unit_id", clientUnitId)
    .order("opened_at", { ascending: false }).limit(100)) as { id: string; number: number; opened_at: string; status: string; total_cents: number }[],
  [clientUnitId]);
  if (data.loading) return <Spinner />;
  if (!data.data?.length) return <p className="muted">Sem comandas.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Nº</th><th>Abertura</th><th>Situação</th><th className="num">Total</th></tr></thead>
        <tbody>
          {data.data.map((s) => (
            <tr key={s.id}><td><Link to={`/comandas/${s.id}`}>#{s.number}</Link></td><td>{formatDateTime(s.opened_at)}</td>
              <td>{SALE_STATUS[s.status]}</td><td className="num">{formatMoney(s.total_cents)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
