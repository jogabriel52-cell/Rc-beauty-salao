import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Alert, Badge, Button, Checkbox, Empty, Modal, PageHeader, SelectInput, Spinner, TextArea, TextInput }
  from "../../components/ui";
import { unwrap, useAction, useAsync } from "../../components/useAsync";
import { formatDateTime } from "../../lib/format";
import { callFunction, supabase } from "../../lib/supabase";
import type { Scope } from "../../lib/access";
import { can } from "../../lib/access";
import {
  ACTION_LABEL, effectivePermissions, groupByModule, loadCatalog, loadPeople, SCOPE_LABEL,
  type Person, type PersonMembership,
} from "./accessData";

type Catalog = Awaited<ReturnType<typeof loadCatalog>>;

export function PeoplePage() {
  const { access } = useAuth();
  const catalog = useAsync(loadCatalog, []);
  const people = useAsync(loadPeople, []);
  const [filter, setFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const manageableUnits = useMemo(() => {
    if (!catalog.data || !access) return [];
    return catalog.data.units.filter((u) =>
      access.is_platform_admin || can(access.units.find((x) => x.unit_id === u.id), "access.manage"));
  }, [catalog.data, access]);

  const list = (people.data ?? []).filter((p) =>
    (showInactive || p.active) &&
    `${p.full_name} ${p.email} ${p.job_title ?? ""}`.toLowerCase().includes(filter.toLowerCase()));

  const person = people.data?.find((p) => p.user_id === selected) ?? null;

  return (
    <>
      <PageHeader title="Pessoas e acessos"
        subtitle="Cadastre pessoas, defina unidades, perfil de acesso e exceções individuais. Toda concessão é auditada."
        actions={manageableUnits.length > 0 && <Button onClick={() => setInviting(true)}>Convidar pessoa</Button>} />
      <Alert kind="error">{catalog.error || people.error}</Alert>
      <div className="toolbar">
        <input className="search" placeholder="Buscar por nome, e-mail ou cargo" value={filter}
          onChange={(e) => setFilter(e.target.value)} aria-label="Buscar pessoas" />
        <Checkbox label="Mostrar desativadas" checked={showInactive} onChange={setShowInactive} />
      </div>
      {people.loading ? <Spinner /> : list.length === 0 ? <Empty>Nenhuma pessoa encontrada.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Nome</th><th>E-mail</th><th>Unidades e perfis</th><th>MFA</th><th>Situação</th><th /></tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.user_id}>
                  <td>
                    <strong>{p.full_name}</strong>
                    {p.job_title && <div className="muted small">{p.job_title}</div>}
                    {p.is_platform_admin && <Badge tone="info">Admin Geral</Badge>}
                  </td>
                  <td>{p.email}</td>
                  <td>
                    {p.memberships.filter((m) => m.active).map((m) => (
                      <div key={m.membership_id} className="small">
                        {m.unit_name}: <strong>{m.access_profile_name}</strong>
                        {m.overrides.length > 0 && <span className="muted"> (+{m.overrides.length} exceção)</span>}
                      </div>
                    ))}
                  </td>
                  <td>{p.mfa_enabled ? <Badge tone="success">Ativo</Badge> : <Badge>—</Badge>}</td>
                  <td>
                    {p.active ? (p.last_sign_in_at ? <Badge tone="success">Ativa</Badge> : <Badge tone="warning">Convite pendente</Badge>)
                      : <Badge tone="danger">Desativada</Badge>}
                  </td>
                  <td><Button variant="secondary" onClick={() => setSelected(p.user_id)}>Abrir</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {inviting && catalog.data && (
        <InviteModal catalog={catalog.data} units={manageableUnits} onClose={() => setInviting(false)}
          onDone={() => { setInviting(false); void people.reload(); }} />
      )}
      {person && catalog.data && (
        <PersonModal person={person} catalog={catalog.data} isSelf={person.user_id === access?.user_id}
          onClose={() => setSelected(null)} onChanged={() => void people.reload()} />
      )}
    </>
  );
}

function InviteModal({ catalog, units, onClose, onDone }:
  { catalog: Catalog; units: Catalog["units"]; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [job, setJob] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});
  const action = useAction();
  const [done, setDone] = useState<string | null>(null);
  const profiles = catalog.profiles.filter((p) => p.active);

  async function submit() {
    const memberships = Object.entries(links).filter(([, pid]) => pid)
      .map(([unit_id, access_profile_id]) => ({ unit_id, access_profile_id }));
    if (!memberships.length) {
      action.setError("Selecione ao menos uma unidade e um perfil.");
      return;
    }
    await action.run(async () => {
      const r = await callFunction<{ invited: boolean }>("admin-invite-user", {
        email: email.trim(), full_name: name.trim(), job_title: job.trim() || null, memberships,
      });
      if (!r.ok) throw new Error(r.message);
      setDone(r.data.invited ? "Convite enviado por e-mail." : "Cadastro concluído para usuário já existente no Auth.");
    });
  }

  return (
    <Modal title="Convidar pessoa" onClose={onClose} footer={done
      ? <Button onClick={onDone}>Concluir</Button>
      : <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={action.busy} onClick={() => void submit()}>Enviar convite</Button></>}>
      {done ? <Alert kind="success">{done}</Alert> : (
        <>
          <Alert kind="error">{action.error}</Alert>
          <TextInput label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextInput label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <TextInput label="Cargo (opcional)" value={job} onChange={(e) => setJob(e.target.value)}
            placeholder="Ex.: Cabeleireira, Manicure, Lash designer, Vendedora" />
          <h3>Unidades e perfil de acesso</h3>
          <p className="muted small">Você só pode conceder perfis cujas permissões você mesmo possui na unidade.</p>
          {units.map((u) => (
            <SelectInput key={u.id} label={u.name} value={links[u.id] ?? ""}
              onChange={(e) => setLinks({ ...links, [u.id]: e.target.value })}>
              <option value="">Sem acesso a esta unidade</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.requires_mfa ? " (exige MFA)" : ""}</option>)}
            </SelectInput>
          ))}
        </>
      )}
    </Modal>
  );
}

function PersonModal({ person, catalog, isSelf, onClose, onChanged }:
  { person: Person; catalog: Catalog; isSelf: boolean; onClose: () => void; onChanged: () => void }) {
  const action = useAction();
  const [reason, setReason] = useState("");
  const [addUnit, setAddUnit] = useState("");
  const [addProfile, setAddProfile] = useState("");
  const { access } = useAuth();

  const linkedUnits = new Set(person.memberships.map((m) => m.unit_id));
  const canAddUnits = catalog.units.filter((u) => !linkedUnits.has(u.id) &&
    (access?.is_platform_admin || can(access?.units.find((x) => x.unit_id === u.id), "access.manage")));
  const locked = isSelf || (person.is_platform_admin && !access?.is_platform_admin);

  async function setStatus(active: boolean) {
    const ok = await action.run(async () => {
      const r = await callFunction("admin-set-user-status", active
        ? { user_id: person.user_id, active: true }
        : { user_id: person.user_id, active: false, reason: reason.trim() });
      if (!r.ok) throw new Error(r.message);
    });
    if (ok) { setReason(""); onChanged(); }
  }

  async function addMembership() {
    if (!addUnit || !addProfile) return;
    const ok = await action.run(async () => unwrap(await supabase.from("unit_memberships")
      .insert({ user_id: person.user_id, unit_id: addUnit, access_profile_id: addProfile }).select()));
    if (ok) { setAddUnit(""); setAddProfile(""); onChanged(); }
  }

  return (
    <Modal title={person.full_name} onClose={onClose} wide>
      <Alert kind="error">{action.error}</Alert>
      {isSelf && <Alert kind="warning">Ninguém pode alterar os próprios acessos. Peça a outra pessoa da direção.</Alert>}
      {!isSelf && person.is_platform_admin && !access?.is_platform_admin &&
        <Alert kind="warning">Acessos do Admin Geral só podem ser alterados por outro Admin Geral.</Alert>}
      <dl className="details">
        <dt>E-mail</dt><dd>{person.email}</dd>
        <dt>Cargo</dt><dd>{person.job_title ?? "—"}</dd>
        <dt>Último acesso</dt><dd>{formatDateTime(person.last_sign_in_at)}</dd>
        <dt>MFA</dt><dd>{person.mfa_enabled ? "Ativo" : "Não cadastrado"}</dd>
        <dt>Situação</dt>
        <dd>{person.active ? "Ativa" : `Desativada em ${formatDateTime(person.deactivated_at)} — ${person.deactivation_reason ?? ""}`}</dd>
      </dl>

      {person.memberships.map((m) => (
        <MembershipEditor key={m.membership_id} m={m} catalog={catalog} locked={locked || !m.can_manage} onChanged={onChanged} />
      ))}

      {!locked && canAddUnits.length > 0 && (
        <section className="card">
          <h3>Adicionar unidade</h3>
          <div className="row">
            <SelectInput label="Unidade" value={addUnit} onChange={(e) => setAddUnit(e.target.value)}>
              <option value="">Selecione</option>
              {canAddUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </SelectInput>
            <SelectInput label="Perfil" value={addProfile} onChange={(e) => setAddProfile(e.target.value)}>
              <option value="">Selecione</option>
              {catalog.profiles.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectInput>
            <Button variant="secondary" busy={action.busy} onClick={() => void addMembership()}>Adicionar</Button>
          </div>
        </section>
      )}

      {!locked && (
        <section className="card">
          <h3>{person.active ? "Desativar pessoa" : "Reativar pessoa"}</h3>
          {person.active ? (
            <>
              <p className="muted small">Corta o acesso aos dados imediatamente e bloqueia o login. O histórico é mantido.</p>
              <TextArea label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button variant="danger" busy={action.busy} disabled={reason.trim().length < 3}
                onClick={() => void setStatus(false)}>Desativar</Button>
            </>
          ) : (
            <Button busy={action.busy} onClick={() => void setStatus(true)}>Reativar</Button>
          )}
        </section>
      )}
    </Modal>
  );
}

function MembershipEditor({ m, catalog, locked, onChanged }:
  { m: PersonMembership; catalog: Catalog; locked: boolean; onChanged: () => void }) {
  const action = useAction();
  const [perm, setPerm] = useState("");
  const [effect, setEffect] = useState<"grant" | "revoke">("grant");
  const [scope, setScope] = useState<Scope>("unit");
  const [reason, setReason] = useState("");
  const effective = effectivePermissions(m.access_profile_id, m.overrides, catalog.profilePermissions);
  const selectedPerm = catalog.permissions.find((p) => p.code === perm);

  async function update(values: { access_profile_id?: string; active?: boolean }) {
    const ok = await action.run(async () =>
      unwrap(await supabase.from("unit_memberships").update(values).eq("id", m.membership_id).select()));
    if (ok) onChanged();
  }

  async function addOverride() {
    const ok = await action.run(async () => unwrap(await supabase.from("membership_permission_overrides").insert({
      membership_id: m.membership_id, permission_code: perm, effect,
      scope: effect === "grant" ? scope : null, reason: reason.trim(),
    }).select()));
    if (ok) { setPerm(""); setReason(""); onChanged(); }
  }

  async function removeOverride(code: string) {
    const ok = await action.run(async () => unwrap(await supabase.from("membership_permission_overrides")
      .delete().eq("membership_id", m.membership_id).eq("permission_code", code).select()));
    if (ok) onChanged();
  }

  return (
    <section className="card">
      <div className="card-title">
        <h3>{m.unit_name}</h3>
        {!m.active && <Badge tone="danger">Vínculo desativado</Badge>}
      </div>
      <Alert kind="error">{action.error}</Alert>
      <div className="row">
        <SelectInput label="Perfil de acesso" value={m.access_profile_id} disabled={locked || action.busy}
          onChange={(e) => void update({ access_profile_id: e.target.value })}>
          {catalog.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </SelectInput>
        {!locked && (
          <Button variant={m.active ? "danger" : "secondary"} busy={action.busy}
            onClick={() => void update({ active: !m.active })}>
            {m.active ? "Remover acesso à unidade" : "Restaurar acesso à unidade"}
          </Button>
        )}
      </div>

      <h4>Exceções individuais</h4>
      {m.overrides.length === 0 ? <p className="muted small">Nenhuma exceção.</p> : (
        <ul className="list">
          {m.overrides.map((o) => (
            <li key={o.permission_code}>
              <Badge tone={o.effect === "grant" ? "success" : "danger"}>{o.effect === "grant" ? "Concede" : "Revoga"}</Badge>{" "}
              <strong>{o.permission_code}</strong>{o.scope && ` — ${SCOPE_LABEL[o.scope]}`}
              <span className="muted"> · {o.reason}</span>
              {!locked && <button className="link-btn" onClick={() => void removeOverride(o.permission_code)}>remover</button>}
            </li>
          ))}
        </ul>
      )}
      {!locked && (
        <div className="row wrap">
          <SelectInput label="Permissão" value={perm} onChange={(e) => {
            setPerm(e.target.value);
            const p = catalog.permissions.find((x) => x.code === e.target.value);
            if (p && !p.allowed_scopes.includes(scope)) setScope(p.allowed_scopes[0]!);
          }}>
            <option value="">Selecione</option>
            {groupByModule(catalog.permissions).map((g) => (
              <optgroup key={g.module} label={g.label}>
                {g.items.map((p) => <option key={p.code} value={p.code}>{ACTION_LABEL[p.action] ?? p.action} — {p.description}</option>)}
              </optgroup>
            ))}
          </SelectInput>
          <SelectInput label="Efeito" value={effect} onChange={(e) => setEffect(e.target.value as "grant" | "revoke")}>
            <option value="grant">Conceder</option>
            <option value="revoke">Revogar</option>
          </SelectInput>
          {effect === "grant" && (
            <SelectInput label="Escopo" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              {(selectedPerm?.allowed_scopes ?? ["unit"]).map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
            </SelectInput>
          )}
          <TextInput label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="secondary" disabled={!perm || reason.trim().length < 3} busy={action.busy}
            onClick={() => void addOverride()}>Adicionar exceção</Button>
        </div>
      )}

      <details>
        <summary>Permissões efetivas nesta unidade ({Object.keys(effective).length})</summary>
        <ul className="perm-grid">
          {catalog.permissions.filter((p) => effective[p.code]).map((p) => (
            <li key={p.code}><span>{p.module_label}: {ACTION_LABEL[p.action] ?? p.action}</span>
              <span className="muted small">{SCOPE_LABEL[effective[p.code]!]}</span></li>
          ))}
        </ul>
      </details>
    </section>
  );
}
