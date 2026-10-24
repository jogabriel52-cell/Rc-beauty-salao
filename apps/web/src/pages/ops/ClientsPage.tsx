import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUnit } from "../../auth/AuthProvider";
import { NewClientModal } from "../../components/NewClientModal";
import { Alert, Button, Checkbox, Empty, PageHeader, Spinner } from "../../components/ui";
import { unwrap, useAsync } from "../../components/useAsync";
import { can } from "../../lib/access";
import { CLIENT_SELECT, type ClientRow } from "../../lib/db";
import { formatDate, formatPhone } from "../../lib/format";
import { supabase } from "../../lib/supabase";

export function ClientsPage() {
  const unit = useUnit();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const list = useAsync(async () => {
    let q = supabase.from("client_units").select(CLIENT_SELECT).eq("unit_id", unit.unit_id)
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    q = archived ? q.not("archived_at", "is", null).is("merged_into_id", null) : q.is("archived_at", null);
    const t = term.trim();
    if (t) {
      const digits = t.replace(/\D/g, "");
      q = q.or(digits.length >= 4 ? `phone.ilike.*${digits}*` : `full_name.ilike.*${t.replace(/[,()*]/g, "")}*`,
        { referencedTable: "client_identities" });
    }
    return unwrap(await q) as unknown as ClientRow[];
  }, [unit.unit_id, term, archived, page]);

  return (
    <>
      <PageHeader title="Clientes" subtitle={`Cadastro da unidade ${unit.name} · mais recentes primeiro`} actions={
        <>
          {can(unit, "clients.merge") && <Link className="btn btn-secondary" to="/clientes/duplicidades">Possíveis duplicidades</Link>}
          {can(unit, "clients.create") && <Button onClick={() => setCreating(true)}>Nova cliente</Button>}
        </>
      } />
      <div className="toolbar">
        <input className="search" placeholder="Buscar por nome ou telefone" value={term}
          onChange={(e) => { setTerm(e.target.value); setPage(0); }} aria-label="Buscar clientes" />
        <Checkbox label="Arquivadas" checked={archived} onChange={(v) => { setArchived(v); setPage(0); }} />
      </div>
      <Alert kind="error">{list.error}</Alert>
      {list.loading ? <Spinner /> : !list.data?.length ? <Empty>Nenhuma cliente encontrada.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Desde</th></tr></thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => navigate(`/clientes/${c.id}`)}>
                  <td><Link to={`/clientes/${c.id}`}>{c.client_identities.full_name}</Link></td>
                  <td>{formatPhone(c.client_identities.phone)}</td>
                  <td>{c.client_identities.email ?? "—"}</td>
                  <td>{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pager">
        <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Anteriores</Button>
        <Button variant="secondary" disabled={(list.data?.length ?? 0) < PAGE} onClick={() => setPage(page + 1)}>Próximas</Button>
      </div>
      {creating && <NewClientModal unitId={unit.unit_id} onClose={() => setCreating(false)}
        onCreated={(id) => navigate(`/clientes/${id}`)} />}
    </>
  );
}
