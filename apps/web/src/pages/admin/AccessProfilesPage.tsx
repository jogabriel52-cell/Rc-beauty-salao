import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Alert, Badge, Button, Checkbox, PageHeader, Spinner, TextArea, TextInput } from "../../components/ui";
import { unwrap, useAction, useAsync } from "../../components/useAsync";
import { supabase } from "../../lib/supabase";
import type { Scope } from "../../lib/access";
import { ACTION_LABEL, groupByModule, loadCatalog, SCOPE_LABEL, type AccessProfile } from "./accessData";

// Perfis são modelos editáveis: alterar um perfil altera o acesso de todas as
// pessoas que o usam, em todas as unidades. Por isso só quem gere acessos em
// todas as unidades (ou o Admin Geral) edita, e ninguém edita o próprio perfil.
export function AccessProfilesPage() {
  const { access } = useAuth();
  const catalog = useAsync(loadCatalog, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const canEdit = !!access?.can_manage_templates;

  const profiles = catalog.data?.profiles ?? [];
  const selected = profiles.find((p) => p.id === selectedId) ?? profiles[0] ?? null;
  const holds = new Set(access?.units.map((u) => u.access_profile));

  if (catalog.loading) return <Spinner />;

  return (
    <>
      <PageHeader title="Perfis de acesso"
        subtitle="Modelos editáveis de permissões por módulo, ação e escopo. Exceções individuais são feitas em Pessoas e acessos."
        actions={canEdit && <Button onClick={() => { setCreating(true); setSelectedId(null); }}>Novo perfil</Button>} />
      <Alert kind="error">{catalog.error}</Alert>
      {!canEdit && <Alert kind="info">Somente quem gere acessos em todas as unidades (ou o Admin Geral) edita perfis.</Alert>}
      <div className="split">
        <ul className="side-list">
          {profiles.map((p) => (
            <li key={p.id}>
              <button className={`side-item ${selected?.id === p.id && !creating ? "active" : ""}`}
                onClick={() => { setSelectedId(p.id); setCreating(false); }}>
                {p.name} {!p.active && <Badge tone="danger">inativo</Badge>} {p.requires_mfa && <Badge tone="info">MFA</Badge>}
              </button>
            </li>
          ))}
        </ul>
        <div className="split-main">
          {creating ? (
            <ProfileEditor key="new" profile={null} catalog={catalog.data!} canEdit={canEdit}
              onSaved={(id) => { setCreating(false); setSelectedId(id); void catalog.reload(); }} />
          ) : selected && (
            <ProfileEditor key={selected.id} profile={selected} catalog={catalog.data!}
              canEdit={canEdit && !holds.has(selected.name)}
              lockedReason={holds.has(selected.name) ? "Você possui este perfil e não pode alterá-lo." : undefined}
              onSaved={() => void catalog.reload()} />
          )}
        </div>
      </div>
    </>
  );
}

type Catalog = Awaited<ReturnType<typeof loadCatalog>>;

function ProfileEditor({ profile, catalog, canEdit, lockedReason, onSaved }:
  { profile: AccessProfile | null; catalog: Catalog; canEdit: boolean; lockedReason?: string; onSaved: (id: string) => void }) {
  const initial = useMemo(() => {
    const m: Record<string, Scope | ""> = {};
    for (const pp of catalog.profilePermissions.filter((x) => x.profile_id === profile?.id)) m[pp.permission_code] = pp.scope;
    return m;
  }, [catalog.profilePermissions, profile?.id]);
  const [matrix, setMatrix] = useState(initial);
  const [name, setName] = useState(profile?.name ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [requiresMfa, setRequiresMfa] = useState(profile?.requires_mfa ?? false);
  const [active, setActive] = useState(profile?.active ?? true);
  const action = useAction();
  const [saved, setSaved] = useState(false);

  useEffect(() => setMatrix(initial), [initial]);

  async function save() {
    setSaved(false);
    const ok = await action.run(async () => {
      let id = profile?.id;
      if (!id) {
        const r = unwrap(await supabase.from("access_profiles")
          .insert({ name: name.trim(), description: description.trim() || null, requires_mfa: requiresMfa })
          .select("id").single()) as { id: string };
        id = r.id;
      } else {
        unwrap(await supabase.from("access_profiles")
          .update({ name: name.trim(), description: description.trim() || null, requires_mfa: requiresMfa, active })
          .eq("id", id).select());
      }
      for (const p of catalog.permissions) {
        const before = initial[p.code] ?? "";
        const after = matrix[p.code] ?? "";
        if (before === after) continue;
        if (!after) {
          unwrap(await supabase.from("access_profile_permissions").delete()
            .eq("profile_id", id).eq("permission_code", p.code).select());
        } else if (!before) {
          unwrap(await supabase.from("access_profile_permissions")
            .insert({ profile_id: id, permission_code: p.code, scope: after }).select());
        } else {
          unwrap(await supabase.from("access_profile_permissions").update({ scope: after })
            .eq("profile_id", id).eq("permission_code", p.code).select());
        }
      }
      onSaved(id);
    });
    if (ok) setSaved(true);
  }

  return (
    <div>
      {lockedReason && <Alert kind="warning">{lockedReason}</Alert>}
      <Alert kind="error">{action.error}</Alert>
      {saved && <Alert kind="success">Perfil salvo. A alteração foi registrada na auditoria.</Alert>}
      <div className="row">
        <TextInput label="Nome" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
        <div className="stack">
          <Checkbox label="Exige MFA" checked={requiresMfa} disabled={!canEdit} onChange={setRequiresMfa} />
          {profile && <Checkbox label="Ativo" checked={active} disabled={!canEdit} onChange={setActive} />}
        </div>
      </div>
      <TextArea label="Descrição" value={description} disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} />
      <div className="table-wrap">
        <table className="table matrix">
          <thead><tr><th>Módulo</th><th>Ação</th><th>Escopo</th></tr></thead>
          <tbody>
            {groupByModule(catalog.permissions).map((g) => g.items.map((p, i) => (
              <tr key={p.code}>
                {i === 0 && <th rowSpan={g.items.length} className="module-cell">{g.label}</th>}
                <td title={p.description}>{ACTION_LABEL[p.action] ?? p.action}<div className="muted small">{p.description}</div></td>
                <td>
                  <select aria-label={`Escopo de ${p.code}`} value={matrix[p.code] ?? ""} disabled={!canEdit}
                    onChange={(e) => setMatrix({ ...matrix, [p.code]: e.target.value as Scope | "" })}>
                    <option value="">Sem acesso</option>
                    {p.allowed_scopes.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
                  </select>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      {canEdit && <Button busy={action.busy} disabled={name.trim().length < 2} onClick={() => void save()}>Salvar perfil</Button>}
    </div>
  );
}
