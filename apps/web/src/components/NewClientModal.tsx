import { useState } from "react";
import { Alert, Badge, Button, Modal, TextArea, TextInput } from "./ui";
import { unwrap, useAction } from "./useAsync";
import { supabase } from "../lib/supabase";
import { normalizePhone } from "../lib/format";

interface Candidate {
  identity_id: string;
  client_unit_id: string | null;
  display_name: string;
  phone_hint: string | null;
  match: string;
  linked_here: boolean;
  archived: boolean;
}

// Cadastro com verificação de possíveis duplicidades ANTES de gravar.
// Nada é mesclado automaticamente: a pessoa escolhe vincular um cadastro
// existente (mesmo telefone/e-mail) ou criar um novo.
export function NewClientModal({ unitId, onClose, onCreated }:
  { unitId: string; onClose: () => void; onCreated: (clientUnitId: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birth, setBirth] = useState("");
  const [notes, setNotes] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const action = useAction();

  async function check() {
    if (phone && !normalizePhone(phone)) {
      action.setError("Telefone inválido. Use DDD + número.");
      return;
    }
    await action.run(async () => {
      const data = unwrap(await supabase.rpc("find_client_candidates", {
        p_unit_id: unitId, p_full_name: name, p_phone: phone, p_email: email,
      })) as Candidate[];
      setCandidates(data);
      if (data.length === 0) await create(null);
    });
  }

  async function create(identityId: string | null) {
    await action.run(async () => {
      const id = unwrap(await supabase.rpc("create_client", {
        p_unit_id: unitId, p_full_name: name.trim(), p_phone: phone || undefined, p_email: email || undefined,
        p_birth_date: birth || undefined, p_service_notes: notes || undefined, p_identity_id: identityId ?? undefined,
      })) as string;
      onCreated(id);
    });
  }

  return (
    <Modal title="Nova cliente" onClose={onClose} footer={candidates && candidates.length > 0 ? (
      <>
        <Button variant="secondary" onClick={() => setCandidates(null)}>Voltar</Button>
        <Button busy={action.busy} onClick={() => void create(null)}>É outra pessoa — criar novo cadastro</Button>
      </>
    ) : (
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button busy={action.busy} disabled={name.trim().length < 2} onClick={() => void check()}>Salvar</Button>
      </>
    )}>
      <Alert kind="error">{action.error}</Alert>
      {candidates && candidates.length > 0 ? (
        <>
          <Alert kind="warning">Encontramos cadastros parecidos. Confira antes de criar um novo.</Alert>
          <ul className="list">
            {candidates.map((c) => (
              <li key={c.identity_id} className="card">
                <div className="card-title">
                  <div>
                    <strong>{c.display_name}</strong> <span className="muted small">{c.phone_hint ?? ""}</span>
                    <div className="small muted">Coincide por {c.match}</div>
                  </div>
                  {c.linked_here ? (
                    <div className="stack">
                      <Badge tone="info">{c.archived ? "Já cadastrada (arquivada)" : "Já cadastrada nesta unidade"}</Badge>
                      {!c.archived && <Button variant="secondary" onClick={() => onCreated(c.client_unit_id!)}>Usar este cadastro</Button>}
                    </div>
                  ) : c.match !== "nome" ? (
                    <div className="stack">
                      <Badge>Cadastro em outra unidade</Badge>
                      <Button variant="secondary" busy={action.busy} onClick={() => void create(c.identity_id)}>
                        Vincular a esta unidade
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <p className="muted small">
            Vincular reaproveita a identidade (nome e contato). Notas, histórico e agenda continuam separados por unidade.
          </p>
        </>
      ) : (
        <>
          <TextInput label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} required />
          <div className="row">
            <TextInput label="Telefone (WhatsApp)" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 98765-4321" />
            <TextInput label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <TextInput label="Data de nascimento" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
          <TextArea label="Observações de atendimento" value={notes} onChange={(e) => setNotes(e.target.value)}
            hint="Visíveis ao profissional na agenda (ex.: alergias). Notas privadas vão no CRM." />
        </>
      )}
    </Modal>
  );
}
