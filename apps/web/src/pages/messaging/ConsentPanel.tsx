// Consentimento de WhatsApp da cliente nesta unidade, por finalidade.
// Eventos são somente de inclusão: para revogar, registra-se um opt-out.
import { useState } from "react";
import { useUnit } from "../../auth/AuthProvider";
import { Alert, Badge, Button, SelectInput, Spinner, TextInput } from "../../components/ui";
import { unwrap, useAction, useAsync } from "../../components/useAsync";
import { can } from "../../lib/access";
import { CONSENT_SOURCE, CONSENT_STATUS, PURPOSE, consentTone, type ConsentEvent } from "../../lib/db";
import { formatDateTime, localDate, localToIso } from "../../lib/format";
import { supabase } from "../../lib/supabase";

export function ConsentPanel({ clientUnitId }: { clientUnitId: string }) {
  const unit = useUnit();
  const [purpose, setPurpose] = useState("atendimento");
  const [actionKind, setActionKind] = useState("opt_in");
  const [source, setSource] = useState("presencial");
  const [evidence, setEvidence] = useState("");
  const [date, setDate] = useState(localDate());
  const action = useAction();
  const events = useAsync(async () => unwrap(await supabase.from("consent_events").select("*")
    .eq("client_unit_id", clientUnitId).order("occurred_at", { ascending: false }).order("seq", { ascending: false })) as ConsentEvent[],
  [clientUnitId]);
  const current = (p: string) => events.data?.find((e) => e.purpose === p)?.action ?? "sem_registro";

  async function add() {
    const today = date === localDate();
    const ok = await action.run(async () => unwrap(await supabase.from("consent_events").insert({
      unit_id: unit.unit_id, client_unit_id: clientUnitId, purpose, action: actionKind, source,
      evidence: evidence.trim() || null, ...(today ? {} : { occurred_at: localToIso(date, "12:00") }),
    }).select()));
    if (ok) { setEvidence(""); void events.reload(); }
  }

  return (
    <section>
      <div className="card">
        <div className="row" role="group" aria-label="Situação do consentimento">
          {Object.entries(PURPOSE).map(([p, label]) => (
            <span key={p}>{label}: <Badge tone={consentTone(current(p))}>{CONSENT_STATUS[current(p)]}</Badge></span>
          ))}
        </div>
        <p className="muted small">Mensagens de atendimento iniciadas pelo salão e qualquer mensagem de marketing exigem
          autorização (opt-in). A cliente pode sair a qualquer momento respondendo PARAR.</p>
      </div>
      {can(unit, "consent.manage") && (
        <div className="card">
          <Alert kind="error">{action.error}</Alert>
          <div className="row">
            <SelectInput label="Finalidade" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
              {Object.entries(PURPOSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectInput>
            <SelectInput label="Registro" value={actionKind} onChange={(e) => setActionKind(e.target.value)}>
              <option value="opt_in">Autorizou (opt-in)</option>
              <option value="opt_out">Pediu para não receber (opt-out)</option>
            </SelectInput>
            <SelectInput label="Origem" value={source} onChange={(e) => setSource(e.target.value)}>
              {Object.entries(CONSENT_SOURCE).filter(([k]) => k !== "palavra_chave").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectInput>
            <TextInput label="Data" type="date" max={localDate()} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <TextInput label="Evidência (ex.: ficha assinada nº, print, formulário)" value={evidence} onChange={(e) => setEvidence(e.target.value)}
            hint="Obrigatória para autorização presencial ou outra origem." />
          <Button busy={action.busy} onClick={() => void add()}>Registrar</Button>
        </div>
      )}
      {events.loading ? <Spinner /> : !events.data?.length ? <p className="muted">Sem registros de consentimento.</p> : (
        <ul className="timeline">
          {events.data.map((e) => (
            <li key={e.id}>
              <div className="small muted">{formatDateTime(e.occurred_at)} · {PURPOSE[e.purpose]} · {CONSENT_SOURCE[e.source]}</div>
              <div><Badge tone={consentTone(e.action)}>{CONSENT_STATUS[e.action]}</Badge> {e.evidence}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
