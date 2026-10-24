import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Alert, Button, Empty, PageHeader, SelectInput, Spinner } from "../../components/ui";
import { unwrap, useAsync } from "../../components/useAsync";
import { formatDateTime } from "../../lib/format";
import { supabase } from "../../lib/supabase";

const TABLE_LABEL: Record<string, string> = {
  unit_memberships: "Vínculo de unidade",
  membership_permission_overrides: "Exceção de permissão",
  access_profiles: "Perfil de acesso",
  access_profile_permissions: "Permissão de perfil",
  profiles: "Pessoa",
  platform_admins: "Admin Geral",
  units: "Unidade",
};

const ACCESS_TABLES = ["unit_memberships", "membership_permission_overrides", "access_profiles",
  "access_profile_permissions", "profiles", "platform_admins"];

interface Row {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  db_role: string;
  unit_id: string | null;
  table_name: string;
  record_id: string | null;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
}

function changes(r: Row): string {
  if (r.action === "INSERT") return "criado";
  if (r.action === "DELETE") return "removido";
  const keys = Object.keys(r.new_data ?? {}).filter((k) =>
    !["updated_at"].includes(k) && JSON.stringify(r.new_data?.[k]) !== JSON.stringify(r.old_data?.[k]));
  return keys.map((k) => `${k}: ${JSON.stringify(r.old_data?.[k])} → ${JSON.stringify(r.new_data?.[k])}`).join("; ");
}

export function AuditPage() {
  const { unit } = useAuth();
  const [scope, setScope] = useState<"access" | "all">("access");
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const rows = useAsync(async () => {
    let q = supabase.from("audit_log").select("*").order("id", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (scope === "access") q = q.in("table_name", ACCESS_TABLES);
    if (unit) q = q.or(`unit_id.eq.${unit.unit_id},unit_id.is.null`);
    const data = unwrap(await q) as unknown as Row[];
    const actorIds = [...new Set(data.map((r) => r.actor_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (actorIds.length) {
      const p = unwrap(await supabase.from("profiles").select("id, full_name").in("id", actorIds)) as { id: string; full_name: string }[];
      p.forEach((x) => names.set(x.id, x.full_name));
    }
    return data.map((r) => ({ ...r, actor: r.actor_id ? names.get(r.actor_id) ?? `${r.actor_id.slice(0, 8)}…` : `banco (${r.db_role})` }));
  }, [scope, page, unit?.unit_id]);

  return (
    <>
      <PageHeader title="Auditoria" subtitle={`Registros da unidade ${unit?.name ?? ""} e alterações globais de acesso.`} />
      <div className="toolbar">
        <SelectInput label="Mostrar" value={scope} onChange={(e) => { setScope(e.target.value as "access" | "all"); setPage(0); }}>
          <option value="access">Concessões e alterações de acesso</option>
          <option value="all">Todos os registros</option>
        </SelectInput>
      </div>
      <Alert kind="error">{rows.error}</Alert>
      {rows.loading ? <Spinner /> : !rows.data?.length ? <Empty>Nenhum registro.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Ação</th><th>Detalhes</th></tr></thead>
            <tbody>
              {rows.data.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{formatDateTime(r.occurred_at)}</td>
                  <td>{r.actor}</td>
                  <td>{TABLE_LABEL[r.table_name] ?? r.table_name}</td>
                  <td>{r.action}</td>
                  <td className="small break">{changes(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pager">
        <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Anteriores</Button>
        <Button variant="secondary" disabled={(rows.data?.length ?? 0) < PAGE} onClick={() => setPage(page + 1)}>Próximos</Button>
      </div>
    </>
  );
}
