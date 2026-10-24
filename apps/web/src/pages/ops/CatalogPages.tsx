// Cadastros de serviços e profissionais.
import { useState } from "react";
import { useUnit } from "../../auth/AuthProvider";
import { Alert, Badge, Button, Checkbox, Empty, Modal, PageHeader, SelectInput, Spinner, TextInput } from "../../components/ui";
import { unwrap, useAction, useAsync } from "../../components/useAsync";
import { can } from "../../lib/access";
import type { Professional, Service } from "../../lib/db";
import { centsToInput, formatMoney, parseMoney } from "../../lib/format";
import { supabase } from "../../lib/supabase";

export function ServicesPage() {
  const unit = useUnit();
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const list = useAsync(async () => unwrap(await supabase.from("services").select("*")
    .eq("unit_id", unit.unit_id).order("active", { ascending: false }).order("name")) as Service[], [unit.unit_id]);
  const manage = can(unit, "services.manage");

  return (
    <>
      <PageHeader title="Serviços" subtitle={unit.name} actions={manage && <Button onClick={() => setEditing("new")}>Novo serviço</Button>} />
      <Alert kind="error">{list.error}</Alert>
      {list.loading ? <Spinner /> : !list.data?.length ? <Empty>Nenhum serviço cadastrado.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Serviço</th><th>Categoria</th><th className="num">Duração</th><th className="num">Preço</th><th /></tr></thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id}>
                  <td>{s.name} {!s.active && <Badge tone="danger">inativo</Badge>}</td>
                  <td>{s.category ?? "—"}</td>
                  <td className="num">{s.duration_minutes} min</td>
                  <td className="num">{formatMoney(s.price_cents)}</td>
                  <td>{manage && <Button variant="secondary" onClick={() => setEditing(s)}>Editar</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ServiceModal service={editing === "new" ? null : editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void list.reload(); }} />}
    </>
  );
}

function ServiceModal({ service, onClose, onSaved }: { service: Service | null; onClose: () => void; onSaved: () => void }) {
  const unit = useUnit();
  const [name, setName] = useState(service?.name ?? "");
  const [category, setCategory] = useState(service?.category ?? "");
  const [duration, setDuration] = useState(service?.duration_minutes ?? 60);
  const [price, setPrice] = useState(centsToInput(service?.price_cents));
  const [active, setActive] = useState(service?.active ?? true);
  const action = useAction();

  async function save() {
    const values = { name: name.trim(), category: category.trim() || null, duration_minutes: duration,
      price_cents: price.trim() ? parseMoney(price) : null, active };
    const ok = await action.run(async () => {
      if (service) unwrap(await supabase.from("services").update(values).eq("id", service.id).select());
      else unwrap(await supabase.from("services").insert({ ...values, unit_id: unit.unit_id }).select());
    });
    if (ok) onSaved();
  }

  return (
    <Modal title={service ? "Editar serviço" : "Novo serviço"} onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={action.busy} onClick={() => void save()}>Salvar</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <TextInput label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
      <TextInput label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Cabelo, Unhas, Cílios…" />
      <div className="row">
        <TextInput label="Duração (min)" type="number" min={5} max={720} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        <TextInput label="Preço (R$)" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
      </div>
      <Checkbox label="Ativo" checked={active} onChange={setActive} />
    </Modal>
  );
}

export function ProfessionalsPage() {
  const unit = useUnit();
  const [editing, setEditing] = useState<Professional | "new" | null>(null);
  const list = useAsync(async () => unwrap(await supabase.from("professionals").select("*")
    .eq("unit_id", unit.unit_id).order("active", { ascending: false }).order("display_name")) as Professional[], [unit.unit_id]);
  const manage = can(unit, "professionals.manage");

  return (
    <>
      <PageHeader title="Profissionais" subtitle={unit.name} actions={manage && <Button onClick={() => setEditing("new")}>Novo profissional</Button>} />
      <Alert kind="error">{list.error}</Alert>
      {list.loading ? <Spinner /> : !list.data?.length ? <Empty>Nenhum profissional cadastrado.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nome na agenda</th><th>Especialidade</th><th>Acesso ao sistema</th><th /></tr></thead>
            <tbody>
              {list.data.map((p) => (
                <tr key={p.id}>
                  <td>{p.display_name} {!p.active && <Badge tone="danger">inativo</Badge>}</td>
                  <td>{p.specialty ?? "—"}</td>
                  <td>{p.user_id ? <Badge tone="success">Vê a própria agenda</Badge> : <Badge>Sem usuário</Badge>}</td>
                  <td>{manage && <Button variant="secondary" onClick={() => setEditing(p)}>Editar</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ProfessionalModal professional={editing === "new" ? null : editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void list.reload(); }} />}
    </>
  );
}

function ProfessionalModal({ professional, onClose, onSaved }:
  { professional: Professional | null; onClose: () => void; onSaved: () => void }) {
  const unit = useUnit();
  const [name, setName] = useState(professional?.display_name ?? "");
  const [specialty, setSpecialty] = useState(professional?.specialty ?? "");
  const [userId, setUserId] = useState(professional?.user_id ?? "");
  const [active, setActive] = useState(professional?.active ?? true);
  const action = useAction();
  const people = useAsync(async () => unwrap(await supabase.rpc("unit_people", { p_unit_id: unit.unit_id })) as
    { user_id: string; full_name: string; job_title: string | null }[], [unit.unit_id]);

  async function save() {
    const values = { display_name: name.trim(), specialty: specialty.trim() || null, user_id: userId || null, active };
    const ok = await action.run(async () => {
      if (professional) unwrap(await supabase.from("professionals").update(values).eq("id", professional.id).select());
      else unwrap(await supabase.from("professionals").insert({ ...values, unit_id: unit.unit_id }).select());
    });
    if (ok) onSaved();
  }

  return (
    <Modal title={professional ? "Editar profissional" : "Novo profissional"} onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={action.busy} onClick={() => void save()}>Salvar</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <TextInput label="Nome na agenda" value={name} onChange={(e) => setName(e.target.value)} />
      <TextInput label="Especialidade" value={specialty} onChange={(e) => setSpecialty(e.target.value)}
        placeholder="Cabeleireira, Manicure, Lash designer…" />
      <SelectInput label="Usuário (para ver a própria agenda)" value={userId} onChange={(e) => setUserId(e.target.value)}
        hint="Somente pessoas com acesso ativo a esta unidade.">
        <option value="">Sem usuário</option>
        {(people.data ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}{p.job_title ? ` — ${p.job_title}` : ""}</option>)}
      </SelectInput>
      <Checkbox label="Ativo" checked={active} onChange={setActive} />
    </Modal>
  );
}
