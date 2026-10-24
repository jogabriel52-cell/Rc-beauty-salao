import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUnit } from "../../auth/AuthProvider";
import { ClientPicker } from "../../components/ClientPicker";
import { NewClientModal } from "../../components/NewClientModal";
import { Alert, Badge, Button, Modal, PageHeader, SelectInput, Spinner, TextArea, TextInput } from "../../components/ui";
import { unwrap, useAction, useAsync } from "../../components/useAsync";
import { can } from "../../lib/access";
import { APPOINTMENT_STATUS, CLIENT_SELECT, type ClientRow, type Professional, type Service } from "../../lib/db";
import { addMinutes, dayRange, formatPhone, formatTime, localDate, localToIso } from "../../lib/format";
import { supabase } from "../../lib/supabase";

const START_HOUR = 8;
const END_HOUR = 21;
const SLOT_MIN = 30;
const SLOT_PX = 48;

interface AgendaAppointment {
  id: string;
  professional_id: string;
  service_id: string;
  client_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  cancel_reason: string | null;
  services: { name: string } | null;
  client_units: { id: string; service_notes: string | null; client_identities: { full_name: string; phone: string | null } } | null;
}

export function AgendaPage() {
  const unit = useUnit();
  const [date, setDate] = useState(localDate());
  const [creating, setCreating] = useState<{ professionalId: string; time: string } | null>(null);
  const [selected, setSelected] = useState<AgendaAppointment | null>(null);

  const base = useAsync(async () => {
    const [pros, svcs] = await Promise.all([
      supabase.from("professionals").select("*").eq("unit_id", unit.unit_id).eq("active", true).order("display_name"),
      supabase.from("services").select("*").eq("unit_id", unit.unit_id).eq("active", true).order("name"),
    ]);
    return { professionals: unwrap(pros) as Professional[], services: unwrap(svcs) as Service[] };
  }, [unit.unit_id]);

  const appts = useAsync(async () => {
    const { from, to } = dayRange(date);
    return unwrap(await supabase.from("appointments")
      .select("id, professional_id, service_id, client_id, starts_at, ends_at, status, notes, cancel_reason, services(name), client_units(id, service_notes, client_identities(full_name, phone))")
      .eq("unit_id", unit.unit_id).gte("starts_at", from).lt("starts_at", to).order("starts_at")) as unknown as AgendaAppointment[];
  }, [unit.unit_id, date]);

  const slots = useMemo(() => {
    const list: string[] = [];
    for (let m = START_HOUR * 60; m < END_HOUR * 60; m += SLOT_MIN) {
      list.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    }
    return list;
  }, []);

  const canCreate = can(unit, "appointments.create");
  const pros = base.data?.professionals ?? [];

  function position(a: AgendaAppointment) {
    const start = new Date(a.starts_at);
    const dayStart = new Date(localToIso(date, `${String(START_HOUR).padStart(2, "0")}:00`));
    const top = ((start.getTime() - dayStart.getTime()) / 60000 / SLOT_MIN) * SLOT_PX;
    const height = Math.max(((new Date(a.ends_at).getTime() - start.getTime()) / 60000 / SLOT_MIN) * SLOT_PX - 2, 20);
    return { top, height };
  }

  function shift(days: number) {
    const d = new Date(`${date}T12:00:00-03:00`);
    d.setDate(d.getDate() + days);
    setDate(localDate(d));
  }

  return (
    <>
      <PageHeader title="Agenda" subtitle={unit.name} actions={
        <div className="row">
          <Button variant="secondary" onClick={() => shift(-1)} aria-label="Dia anterior">‹</Button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data" />
          <Button variant="secondary" onClick={() => shift(1)} aria-label="Próximo dia">›</Button>
          <Button variant="secondary" onClick={() => setDate(localDate())}>Hoje</Button>
        </div>
      } />
      <Alert kind="error">{base.error || appts.error}</Alert>
      {base.loading ? <Spinner /> : pros.length === 0 ? (
        <Alert kind="info">Nenhum profissional ativo nesta unidade. Cadastre em Profissionais.</Alert>
      ) : (
        <div className="agenda" style={{ gridTemplateColumns: `64px repeat(${pros.length}, minmax(160px, 1fr))` }}>
          <div className="agenda-col-header" />
          {pros.map((p) => <div key={p.id} className="agenda-col-header">{p.display_name}</div>)}
          <div>{slots.map((s) => <div key={s} className="agenda-time">{s}</div>)}</div>
          {pros.map((p) => (
            <div key={p.id} className="agenda-col" data-testid={`agenda-col-${p.display_name}`}>
              {slots.map((s) => (
                <div key={s} className="agenda-slot" role={canCreate ? "button" : undefined}
                  aria-label={canCreate ? `Agendar ${p.display_name} às ${s}` : undefined}
                  onClick={() => canCreate && setCreating({ professionalId: p.id, time: s })} />
              ))}
              {(appts.data ?? []).filter((a) => a.professional_id === p.id).map((a) => {
                const pos = position(a);
                return (
                  <div key={a.id} className={`appt appt-${a.status}`} style={{ top: pos.top + 0, height: pos.height }}
                    onClick={() => setSelected(a)} role="button" aria-label={`Agendamento ${a.client_units?.client_identities.full_name ?? ""}`}>
                    <strong>{formatTime(a.starts_at)} {a.client_units?.client_identities.full_name}</strong>
                    <div>{a.services?.name}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {creating && base.data && (
        <AppointmentForm unitId={unit.unit_id} date={date} initialTime={creating.time} initialProfessional={creating.professionalId}
          professionals={pros} services={base.data.services} onClose={() => setCreating(null)}
          onSaved={() => { setCreating(null); void appts.reload(); }} />
      )}
      {selected && base.data && (
        <AppointmentDetails appt={selected} professionals={pros} services={base.data.services}
          onClose={() => setSelected(null)} onChanged={() => { setSelected(null); void appts.reload(); }} />
      )}
    </>
  );
}

function AppointmentForm({ unitId, date, initialTime, initialProfessional, professionals, services, onClose, onSaved, existing }: {
  unitId: string; date: string; initialTime: string; initialProfessional: string; professionals: Professional[];
  services: Service[]; onClose: () => void; onSaved: () => void; existing?: AgendaAppointment;
}) {
  const [client, setClient] = useState<ClientRow | null>(null);
  const [newClient, setNewClient] = useState(false);
  const [serviceId, setServiceId] = useState(existing?.service_id ?? "");
  const [professionalId, setProfessionalId] = useState(existing?.professional_id ?? initialProfessional);
  const [day, setDay] = useState(date);
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState(existing
    ? Math.round((new Date(existing.ends_at).getTime() - new Date(existing.starts_at).getTime()) / 60000) : 60);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const action = useAction();

  async function save() {
    const starts = localToIso(day, time);
    const values = { service_id: serviceId, professional_id: professionalId, starts_at: starts,
      ends_at: addMinutes(starts, duration), notes: notes.trim() || null };
    const ok = await action.run(async () => {
      if (existing) {
        unwrap(await supabase.from("appointments").update(values).eq("id", existing.id).select());
      } else {
        unwrap(await supabase.from("appointments").insert({ ...values, unit_id: unitId, client_id: client!.id }).select());
      }
    });
    if (ok) onSaved();
  }

  return (
    <>
      <Modal title={existing ? "Remarcar atendimento" : "Novo agendamento"} onClose={onClose} footer={
        <><Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button busy={action.busy} disabled={(!existing && !client) || !serviceId} onClick={() => void save()}>Salvar</Button></>}>
        <Alert kind="error">{action.error}</Alert>
        {!existing && (
          <>
            <ClientPicker unitId={unitId} value={client} onChange={setClient} />
            {!client && <button type="button" className="link-btn" onClick={() => setNewClient(true)}>+ Cadastrar nova cliente</button>}
          </>
        )}
        <SelectInput label="Serviço" value={serviceId} onChange={(e) => {
          setServiceId(e.target.value);
          const s = services.find((x) => x.id === e.target.value);
          if (s) setDuration(s.duration_minutes);
        }}>
          <option value="">Selecione</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.duration_minutes} min)</option>)}
        </SelectInput>
        <SelectInput label="Profissional" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
          {professionals.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </SelectInput>
        <div className="row">
          <TextInput label="Data" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          <TextInput label="Início" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
          <TextInput label="Duração (min)" type="number" min={5} max={720} value={duration}
            onChange={(e) => setDuration(Number(e.target.value))} />
        </div>
        <TextArea label="Observações do agendamento" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Modal>
      {newClient && (
        <NewClientModal unitId={unitId} onClose={() => setNewClient(false)} onCreated={async (id) => {
          const { data } = await supabase.from("client_units").select(CLIENT_SELECT).eq("id", id).single();
          setClient(data as unknown as ClientRow);
          setNewClient(false);
        }} />
      )}
    </>
  );
}

function AppointmentDetails({ appt, professionals, services, onClose, onChanged }: {
  appt: AgendaAppointment; professionals: Professional[]; services: Service[]; onClose: () => void; onChanged: () => void;
}) {
  const unit = useUnit();
  const navigate = useNavigate();
  const action = useAction();
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const open = appt.status === "agendado" || appt.status === "confirmado";
  const canUpdate = can(unit, "appointments.update");
  const pro = professionals.find((p) => p.id === appt.professional_id);

  async function setStatus(status: string, extra: Record<string, unknown> = {}) {
    const ok = await action.run(async () =>
      unwrap(await supabase.from("appointments").update({ status, ...extra } as never).eq("id", appt.id).select()));
    if (ok) onChanged();
  }

  async function openSale() {
    await action.run(async () => {
      const sale = unwrap(await supabase.from("sales")
        .insert({ unit_id: unit.unit_id, client_unit_id: appt.client_id, appointment_id: appt.id } as never)
        .select("id").single()) as { id: string };
      unwrap(await supabase.from("sale_items").insert({
        unit_id: unit.unit_id, sale_id: sale.id, kind: "servico", service_id: appt.service_id,
        professional_id: appt.professional_id,
      } as never).select());
      navigate(`/comandas/${sale.id}`);
    });
  }

  if (editing) {
    return <AppointmentForm unitId={unit.unit_id} existing={appt}
      date={localDate(new Date(appt.starts_at))} initialTime={formatTime(appt.starts_at)} initialProfessional={appt.professional_id}
      professionals={professionals} services={services} onClose={() => setEditing(false)} onSaved={onChanged} />;
  }

  return (
    <Modal title="Agendamento" onClose={onClose}>
      <Alert kind="error">{action.error}</Alert>
      <dl className="details">
        <dt>Cliente</dt><dd><strong>{appt.client_units?.client_identities.full_name}</strong> {formatPhone(appt.client_units?.client_identities.phone)}</dd>
        <dt>Serviço</dt><dd>{appt.services?.name}</dd>
        <dt>Profissional</dt><dd>{pro?.display_name}</dd>
        <dt>Horário</dt><dd>{formatTime(appt.starts_at)} – {formatTime(appt.ends_at)}</dd>
        <dt>Situação</dt><dd><Badge>{APPOINTMENT_STATUS[appt.status]}</Badge>{appt.cancel_reason && ` — ${appt.cancel_reason}`}</dd>
        {appt.client_units?.service_notes && <><dt>Atendimento</dt><dd>{appt.client_units.service_notes}</dd></>}
        {appt.notes && <><dt>Observações</dt><dd>{appt.notes}</dd></>}
      </dl>
      {open && (
        <div className="row wrap">
          {canUpdate && appt.status === "agendado" && <Button variant="secondary" busy={action.busy} onClick={() => void setStatus("confirmado")}>Confirmar</Button>}
          {canUpdate && <Button variant="secondary" busy={action.busy} onClick={() => void setStatus("concluido")}>Concluído</Button>}
          {canUpdate && <Button variant="secondary" busy={action.busy} onClick={() => void setStatus("nao_compareceu")}>Não compareceu</Button>}
          {canUpdate && <Button variant="secondary" onClick={() => setEditing(true)}>Remarcar</Button>}
          {can(unit, "sales.open") && <Button busy={action.busy} onClick={() => void openSale()}>Abrir comanda</Button>}
        </div>
      )}
      {open && can(unit, "appointments.cancel") && (
        <section className="card">
          <TextInput label="Motivo do cancelamento" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="danger" disabled={reason.trim().length < 3} busy={action.busy}
            onClick={() => void setStatus("cancelado", { cancel_reason: reason.trim() })}>Cancelar agendamento</Button>
        </section>
      )}
    </Modal>
  );
}
