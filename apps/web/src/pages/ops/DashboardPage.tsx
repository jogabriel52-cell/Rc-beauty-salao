import { Link } from "react-router-dom";
import { useAuth, useUnit } from "../../auth/AuthProvider";
import { Alert, Empty, PageHeader, Spinner, Stat } from "../../components/ui";
import { unwrap, useAsync } from "../../components/useAsync";
import { can } from "../../lib/access";
import { formatDate, formatMoney } from "../../lib/format";
import { supabase } from "../../lib/supabase";

interface Dashboard {
  date: string;
  appointments?: Record<string, number>;
  sales?: { finalizadas: number; faturamento_cents: number; ticket_medio_cents: number; abertas: number };
  month_sales?: { finalizadas: number; faturamento_cents: number };
  top_services?: { nome: string; quantidade: number; total_cents: number }[];
  low_stock?: { id: string; nome: string; saldo: number; minimo: number }[];
  new_clients_month?: number;
}

export function DashboardPage() {
  const unit = useUnit();
  const { access } = useAuth();
  const d = useAsync(async () =>
    unwrap(await supabase.rpc("operational_dashboard", { p_unit_id: unit.unit_id })) as unknown as Dashboard, [unit.unit_id]);

  return (
    <>
      <PageHeader title="Painel" subtitle={`${unit.name} · ${d.data ? formatDate(d.data.date) : ""}`} />
      <Alert kind="error">{d.error}</Alert>
      {d.loading ? <Spinner /> : d.data && (
        <>
          {d.data.appointments && (
            <section>
              <h3>Agenda de hoje</h3>
              <div className="stats">
                <Stat label="Atendimentos" value={d.data.appointments.total} hint={`${d.data.appointments.proximos} ainda por vir`} />
                <Stat label="Confirmados" value={d.data.appointments.confirmado} />
                <Stat label="Concluídos" value={d.data.appointments.concluido} />
                <Stat label="Faltas" value={d.data.appointments.nao_compareceu} />
                <Stat label="Cancelados" value={d.data.appointments.cancelado} />
              </div>
            </section>
          )}
          {d.data.sales && (
            <section>
              <h3>Vendas</h3>
              <div className="stats">
                <Stat label="Faturamento hoje" value={formatMoney(d.data.sales.faturamento_cents)} hint={`${d.data.sales.finalizadas} comandas`} />
                <Stat label="Ticket médio hoje" value={formatMoney(d.data.sales.ticket_medio_cents)} />
                <Stat label="Comandas abertas" value={<Link to="/comandas">{d.data.sales.abertas}</Link>} />
                {d.data.month_sales && (
                  <Stat label="Faturamento no mês" value={formatMoney(d.data.month_sales.faturamento_cents)}
                    hint={`${d.data.month_sales.finalizadas} comandas`} />
                )}
                {d.data.new_clients_month !== undefined && <Stat label="Clientes novas no mês" value={d.data.new_clients_month} />}
              </div>
            </section>
          )}
          <div className="grid-2">
            {d.data.top_services && (
              <section className="card">
                <h3>Serviços mais vendidos no mês</h3>
                {d.data.top_services.length === 0 ? <p className="muted">Sem vendas no mês.</p> : (
                  <table className="table">
                    <tbody>
                      {d.data.top_services.map((s) => (
                        <tr key={s.nome}><td>{s.nome}</td><td className="num">{s.quantidade}</td><td className="num">{formatMoney(s.total_cents)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}
            {d.data.low_stock && (
              <section className="card">
                <h3>Estoque baixo</h3>
                {d.data.low_stock.length === 0 ? <p className="muted">Nenhum produto abaixo do mínimo.</p> : (
                  <table className="table">
                    <tbody>
                      {d.data.low_stock.map((p) => (
                        <tr key={p.id}><td>{p.nome}</td><td className="num">{p.saldo} / mín. {p.minimo}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}
          </div>
          {!d.data.appointments && !d.data.sales && <Empty>Sem indicadores liberados para o seu perfil.</Empty>}
        </>
      )}
      {access && !can(unit, "dashboard.view") && <Empty>Sem acesso ao painel.</Empty>}
    </>
  );
}
