import { useState } from "react";
import { useUnit } from "../../auth/AuthProvider";
import { Alert, PageHeader, Spinner, Stat, TextInput } from "../../components/ui";
import { unwrap, useAsync } from "../../components/useAsync";
import { PAYMENT_METHOD } from "../../lib/db";
import { formatDate, formatMoney, localDate } from "../../lib/format";
import { supabase } from "../../lib/supabase";

interface SalesReport {
  totals: { comandas: number; faturamento_cents: number; descontos_cents: number; ticket_medio_cents: number };
  by_day: { dia: string; comandas: number; faturamento_cents: number }[];
  by_seller: { vendedor: string; comandas: number; faturamento_cents: number }[];
  by_professional: { profissional: string; itens: number; total_cents: number }[];
  by_method: { forma: string; pagamentos: number; total_cents: number }[];
  by_item: { tipo: string; item: string; quantidade: number; total_cents: number }[];
}

interface ApptReport { profissional: string; agendados: number; concluidos: number; faltas: number; cancelados: number }

function firstOfMonth(): string {
  return `${localDate().slice(0, 8)}01`;
}

export function ReportsPage() {
  const unit = useUnit();
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(localDate());
  const data = useAsync(async () => {
    const [s, a] = await Promise.all([
      supabase.rpc("report_sales", { p_unit_id: unit.unit_id, p_from: from, p_to: to }),
      supabase.rpc("report_appointments", { p_unit_id: unit.unit_id, p_from: from, p_to: to }),
    ]);
    return { sales: unwrap(s) as unknown as SalesReport, appts: unwrap(a) as unknown as ApptReport[] };
  }, [unit.unit_id, from, to]);

  return (
    <>
      <PageHeader title="Relatórios" subtitle={unit.name} />
      <div className="toolbar">
        <TextInput label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextInput label="Até" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Alert kind="error">{data.error}</Alert>
      {data.loading ? <Spinner /> : data.data && (
        <>
          <div className="stats">
            <Stat label="Faturamento" value={formatMoney(data.data.sales.totals.faturamento_cents)} />
            <Stat label="Comandas" value={data.data.sales.totals.comandas} />
            <Stat label="Ticket médio" value={formatMoney(data.data.sales.totals.ticket_medio_cents)} />
            <Stat label="Descontos" value={formatMoney(data.data.sales.totals.descontos_cents)} />
          </div>
          <div className="grid-2">
            <ReportTable title="Por vendedor(a)" head={["Vendedor(a)", "Comandas", "Faturamento"]}
              rows={data.data.sales.by_seller.map((r) => [r.vendedor, r.comandas, formatMoney(r.faturamento_cents)])} />
            <ReportTable title="Serviços por profissional" head={["Profissional", "Itens", "Total"]}
              rows={data.data.sales.by_professional.map((r) => [r.profissional, r.itens, formatMoney(r.total_cents)])} />
            <ReportTable title="Formas de pagamento" head={["Forma", "Pagamentos", "Total"]}
              rows={data.data.sales.by_method.map((r) => [PAYMENT_METHOD[r.forma] ?? r.forma, r.pagamentos, formatMoney(r.total_cents)])} />
            <ReportTable title="Por dia" head={["Dia", "Comandas", "Faturamento"]}
              rows={data.data.sales.by_day.map((r) => [formatDate(r.dia), r.comandas, formatMoney(r.faturamento_cents)])} />
            <ReportTable title="Itens vendidos" head={["Item", "Qtd", "Total"]}
              rows={data.data.sales.by_item.map((r) => [`${r.item} (${r.tipo})`, r.quantidade, formatMoney(r.total_cents)])} />
            <ReportTable title="Atendimentos por profissional" head={["Profissional", "Agendados", "Concluídos", "Faltas", "Cancelados"]}
              rows={data.data.appts.map((r) => [r.profissional, r.agendados, r.concluidos, r.faltas, r.cancelados])} />
          </div>
        </>
      )}
    </>
  );
}

function ReportTable({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="muted">Sem dados no período.</p> : (
        <table className="table">
          <thead><tr>{head.map((h, i) => <th key={h} className={i > 0 ? "num" : ""}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j > 0 ? "num" : ""}>{c}</td>)}</tr>)}</tbody>
        </table>
      )}
    </section>
  );
}
