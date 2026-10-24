import { useState } from "react";
import { Alert, Badge, Empty, PageHeader, Spinner } from "../../components/ui";
import { unwrap, useAsync } from "../../components/useAsync";
import { APPOINTMENT_STATUS } from "../../lib/db";
import { formatDate, formatTime, localDate, localToIso, addMinutes } from "../../lib/format";
import { supabase } from "../../lib/supabase";

interface Item {
  appointment_id: string;
  unit_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  service_name: string;
  client_name: string;
  service_notes: string | null;
  notes: string | null;
}

// Agenda do profissional: somente os próprios atendimentos e os dados da
// cliente necessários ao atendimento (nome e observações de atendimento).
export function MyAgendaPage() {
  const [start, setStart] = useState(localDate());
  const data = useAsync(async () => {
    const from = localToIso(start, "00:00");
    return unwrap(await supabase.rpc("get_my_agenda", { p_from: from, p_to: addMinutes(from, 7 * 24 * 60) })) as Item[];
  }, [start]);

  const byDay = new Map<string, Item[]>();
  for (const i of data.data ?? []) {
    const d = localDate(new Date(i.starts_at));
    byDay.set(d, [...(byDay.get(d) ?? []), i]);
  }

  return (
    <>
      <PageHeader title="Minha agenda" subtitle="Próximos 7 dias" actions={
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="A partir de" />} />
      <Alert kind="error">{data.error}</Alert>
      {data.loading ? <Spinner /> : byDay.size === 0 ? <Empty>Nenhum atendimento no período.</Empty> : (
        [...byDay.entries()].map(([day, items]) => (
          <section key={day} className="card">
            <h3>{formatDate(day)}</h3>
            <ul className="list">
              {items.map((i) => (
                <li key={i.appointment_id} className={i.status === "cancelado" ? "muted" : ""}>
                  <strong>{formatTime(i.starts_at)}–{formatTime(i.ends_at)}</strong> · {i.client_name} · {i.service_name}{" "}
                  <Badge>{APPOINTMENT_STATUS[i.status]}</Badge> <span className="muted small">{i.unit_name}</span>
                  {i.service_notes && <div className="small">Atendimento: {i.service_notes}</div>}
                  {i.notes && <div className="small muted">{i.notes}</div>}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
