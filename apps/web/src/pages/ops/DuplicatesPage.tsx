import { useState } from "react";
import { Link } from "react-router-dom";
import { useUnit } from "../../auth/AuthProvider";
import { Alert, Badge, Button, Empty, Modal, PageHeader, Spinner, TextInput } from "../../components/ui";
import { unwrap, useAction, useAsync } from "../../components/useAsync";
import { formatPhone } from "../../lib/format";
import { supabase } from "../../lib/supabase";

interface Pair {
  client_a: string; name_a: string; phone_a: string | null; email_a: string | null;
  client_b: string; name_b: string; phone_b: string | null; email_b: string | null;
  reason: string;
}

// Revisão humana de possíveis duplicidades da unidade. Nada é mesclado sem
// confirmação; descartar registra o motivo.
export function DuplicatesPage() {
  const unit = useUnit();
  const pairs = useAsync(async () =>
    unwrap(await supabase.rpc("client_duplicate_candidates", { p_unit_id: unit.unit_id })) as Pair[], [unit.unit_id]);
  const [merging, setMerging] = useState<Pair | null>(null);
  const [dismissing, setDismissing] = useState<Pair | null>(null);

  return (
    <>
      <PageHeader title="Possíveis duplicidades" subtitle={<Link to="/clientes">← Clientes</Link>} />
      <Alert kind="info">A mescla vale só para esta unidade: agenda, comandas e CRM passam para o cadastro mantido e o outro é arquivado.</Alert>
      <Alert kind="error">{pairs.error}</Alert>
      {pairs.loading ? <Spinner /> : !pairs.data?.length ? <Empty>Nenhuma possível duplicidade.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Cadastro A</th><th>Cadastro B</th><th>Motivo</th><th /></tr></thead>
            <tbody>
              {pairs.data.map((p) => (
                <tr key={`${p.client_a}-${p.client_b}`}>
                  <td><Link to={`/clientes/${p.client_a}`}>{p.name_a}</Link><div className="small muted">{formatPhone(p.phone_a)} {p.email_a ?? ""}</div></td>
                  <td><Link to={`/clientes/${p.client_b}`}>{p.name_b}</Link><div className="small muted">{formatPhone(p.phone_b)} {p.email_b ?? ""}</div></td>
                  <td><Badge tone="warning">{p.reason}</Badge></td>
                  <td className="nowrap">
                    <Button variant="secondary" onClick={() => setMerging(p)}>Mesclar</Button>{" "}
                    <Button variant="ghost" onClick={() => setDismissing(p)}>Não é duplicidade</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {merging && <MergeModal pair={merging} onClose={() => setMerging(null)} onDone={() => { setMerging(null); void pairs.reload(); }} />}
      {dismissing && <DismissModal pair={dismissing} onClose={() => setDismissing(null)} onDone={() => { setDismissing(null); void pairs.reload(); }} />}
    </>
  );
}

function MergeModal({ pair, onClose, onDone }: { pair: Pair; onClose: () => void; onDone: () => void }) {
  const unit = useUnit();
  const [keep, setKeep] = useState<"a" | "b">("a");
  const action = useAction();
  return (
    <Modal title="Mesclar cadastros" onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button busy={action.busy} onClick={async () => {
          const ok = await action.run(async () => unwrap(await supabase.rpc("merge_clients", {
            p_unit_id: unit.unit_id,
            p_keep: keep === "a" ? pair.client_a : pair.client_b,
            p_merge: keep === "a" ? pair.client_b : pair.client_a,
          })));
          if (ok) onDone();
        }}>Confirmar mescla</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <p>Qual cadastro deve ser mantido?</p>
      <label className="checkbox"><input type="radio" checked={keep === "a"} onChange={() => setKeep("a")} /> {pair.name_a} {formatPhone(pair.phone_a)}</label>
      <label className="checkbox"><input type="radio" checked={keep === "b"} onChange={() => setKeep("b")} /> {pair.name_b} {formatPhone(pair.phone_b)}</label>
      <p className="muted small">Dados vazios do cadastro mantido são completados com os do outro. A operação é registrada na auditoria.</p>
    </Modal>
  );
}

function DismissModal({ pair, onClose, onDone }: { pair: Pair; onClose: () => void; onDone: () => void }) {
  const unit = useUnit();
  const [reason, setReason] = useState("");
  const action = useAction();
  return (
    <Modal title="Não é duplicidade" onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button busy={action.busy} disabled={reason.trim().length < 3} onClick={async () => {
          const ok = await action.run(async () => unwrap(await supabase.rpc("dismiss_client_duplicate", {
            p_unit_id: unit.unit_id, p_a: pair.client_a, p_b: pair.client_b, p_reason: reason.trim(),
          })));
          if (ok) onDone();
        }}>Confirmar</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <p>{pair.name_a} × {pair.name_b}</p>
      <TextInput label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: mãe e filha com o mesmo telefone" />
    </Modal>
  );
}
