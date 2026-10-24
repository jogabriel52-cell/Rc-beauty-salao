// Comandas: lista e detalhe (itens, pagamentos, vendedor, finalização, cancelamento).
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth, useUnit } from "../../auth/AuthProvider";
import { ClientPicker } from "../../components/ClientPicker";
import { Alert, Badge, Button, Empty, Modal, PageHeader, SelectInput, Spinner, TextInput } from "../../components/ui";
import { unwrap, useAction, useAsync } from "../../components/useAsync";
import { can } from "../../lib/access";
import { PAYMENT_METHOD, SALE_STATUS, type ClientRow, type ProductStock, type Professional, type Service } from "../../lib/db";
import { centsToInput, formatDateTime, formatMoney, localDate, dayRange, parseMoney } from "../../lib/format";
import { supabase } from "../../lib/supabase";

interface SaleRow {
  id: string;
  number: number;
  status: string;
  opened_at: string;
  finalized_at: string | null;
  total_cents: number;
  opened_by: string;
  sold_by: string | null;
  finalized_by: string | null;
  client_units: { client_identities: { full_name: string } } | null;
}

const TONE: Record<string, "info" | "success" | "danger"> = { aberta: "info", finalizada: "success", cancelada: "danger" };

export function SalesPage() {
  const unit = useUnit();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("aberta");
  const [date, setDate] = useState(localDate());
  const [creating, setCreating] = useState(false);

  const list = useAsync(async () => {
    let q = supabase.from("sales").select("id, number, status, opened_at, finalized_at, total_cents, opened_by, sold_by, finalized_by, client_units(client_identities(full_name))")
      .eq("unit_id", unit.unit_id).order("opened_at", { ascending: false }).limit(200);
    if (status) q = q.eq("status", status as "aberta");
    if (status !== "aberta") {
      const { from, to } = dayRange(date);
      q = q.gte("opened_at", from).lt("opened_at", to);
    }
    return unwrap(await q) as unknown as SaleRow[];
  }, [unit.unit_id, status, date]);

  return (
    <>
      <PageHeader title="Comandas" subtitle={unit.name} actions={can(unit, "sales.open") && <Button onClick={() => setCreating(true)}>Abrir comanda</Button>} />
      <div className="toolbar">
        <SelectInput label="Situação" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="aberta">Abertas</option>
          <option value="finalizada">Finalizadas</option>
          <option value="cancelada">Canceladas</option>
          <option value="">Todas</option>
        </SelectInput>
        {status !== "aberta" && <TextInput label="Data de abertura" type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
      </div>
      <Alert kind="error">{list.error}</Alert>
      {list.loading ? <Spinner /> : !list.data?.length ? <Empty>Nenhuma comanda.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nº</th><th>Cliente</th><th>Abertura</th><th>Situação</th><th className="num">Total</th></tr></thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => navigate(`/comandas/${s.id}`)}>
                  <td><Link to={`/comandas/${s.id}`}>#{s.number}</Link></td>
                  <td>{s.client_units?.client_identities.full_name ?? "Sem cliente"}</td>
                  <td>{formatDateTime(s.opened_at)}</td>
                  <td><Badge tone={TONE[s.status]}>{SALE_STATUS[s.status]}</Badge></td>
                  <td className="num">{formatMoney(s.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewSaleModal onClose={() => setCreating(false)} onCreated={(id) => navigate(`/comandas/${id}`)} />}
    </>
  );
}

function NewSaleModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const unit = useUnit();
  const [client, setClient] = useState<ClientRow | null>(null);
  const action = useAction();
  return (
    <Modal title="Abrir comanda" onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button busy={action.busy} onClick={async () => {
          await action.run(async () => {
            const s = unwrap(await supabase.from("sales").insert({ unit_id: unit.unit_id, client_unit_id: client?.id ?? null } as never)
              .select("id").single()) as { id: string };
            onCreated(s.id);
          });
        }}>Abrir</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <ClientPicker unitId={unit.unit_id} value={client} onChange={setClient} label="Cliente (opcional)" />
    </Modal>
  );
}

interface SaleDetail {
  id: string; unit_id: string; number: number; status: string; opened_by: string; opened_at: string;
  sold_by: string | null; finalized_by: string | null; finalized_at: string | null;
  cancelled_by: string | null; cancelled_at: string | null; cancel_reason: string | null;
  subtotal_cents: number; discount_cents: number; total_cents: number; notes: string | null;
  client_units: { id: string; client_identities: { full_name: string } } | null;
  sale_items: { id: string; kind: string; description: string; quantity: number; unit_price_cents: number;
    discount_cents: number; total_cents: number; professional_id: string | null }[];
  sale_payments: { id: string; method: string; amount_cents: number; installments: number }[];
}

export function SaleDetailPage() {
  const { id } = useParams();
  const unit = useUnit();
  const { access } = useAuth();
  const action = useAction();
  const [reason, setReason] = useState("");
  const [discount, setDiscount] = useState<string | null>(null);

  const sale = useAsync(async () => unwrap(await supabase.from("sales")
    .select("*, client_units(id, client_identities(full_name)), sale_items(*), sale_payments(*)")
    .eq("id", id!).single()) as unknown as SaleDetail, [id]);

  const refs = useAsync(async () => {
    const [svc, prd, pros] = await Promise.all([
      supabase.from("services").select("*").eq("unit_id", unit.unit_id).eq("active", true).order("name"),
      supabase.from("product_stock").select("*").eq("unit_id", unit.unit_id).eq("active", true).order("name"),
      supabase.from("professionals").select("*").eq("unit_id", unit.unit_id).eq("active", true).order("display_name"),
    ]);
    let people: { user_id: string; full_name: string }[] = [];
    if (can(unit, "sales.edit") || can(unit, "sales.view", "unit")) {
      const r = await supabase.rpc("unit_people", { p_unit_id: unit.unit_id });
      people = (r.data ?? []) as { user_id: string; full_name: string }[];
    }
    return { services: (svc.data ?? []) as Service[], products: (prd.data ?? []) as ProductStock[],
      professionals: (pros.data ?? []) as Professional[], people };
  }, [unit.unit_id]);

  if (sale.loading || refs.loading) return <Spinner />;
  if (!sale.data) return <Alert kind="error">{sale.error ?? "Comanda não encontrada."}</Alert>;
  const s = sale.data;
  const r = refs.data!;
  const open = s.status === "aberta";
  const canEdit = open && can(unit, "sales.edit");
  const paid = s.sale_payments.reduce((sum, p) => sum + p.amount_cents, 0);
  const personName = (uid: string | null) => !uid ? "—" : uid === access?.user_id ? "Você"
    : r.people.find((p) => p.user_id === uid)?.full_name ?? "—";
  const proName = (pid: string | null) => r.professionals.find((p) => p.id === pid)?.display_name ?? "—";

  async function update(values: Record<string, unknown>) {
    const ok = await action.run(async () => unwrap(await supabase.from("sales").update(values as never).eq("id", s.id).select()));
    if (ok) void sale.reload();
    return ok;
  }
  async function removeRow(table: "sale_items" | "sale_payments", rowId: string) {
    const ok = await action.run(async () => unwrap(await supabase.from(table).delete().eq("id", rowId).select()));
    if (ok) void sale.reload();
  }

  return (
    <>
      <PageHeader title={`Comanda #${s.number}`} subtitle={<Link to="/comandas">← Comandas</Link>}
        actions={<Badge tone={TONE[s.status]}>{SALE_STATUS[s.status]}</Badge>} />
      <Alert kind="error">{action.error}</Alert>
      <section className="card">
        <dl className="details">
          <dt>Cliente</dt><dd>{s.client_units ? <Link to={`/clientes/${s.client_units.id}`}>{s.client_units.client_identities.full_name}</Link> : "Sem cliente"}</dd>
          <dt>Abriu</dt><dd>{personName(s.opened_by)} · {formatDateTime(s.opened_at)}</dd>
          <dt>Vendeu</dt>
          <dd>{canEdit ? (
            <select aria-label="Quem vendeu" value={s.sold_by ?? ""} onChange={(e) => void update({ sold_by: e.target.value || null })}>
              <option value="">Mesmo de quem abriu</option>
              {r.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
            </select>
          ) : personName(s.sold_by)}</dd>
          {s.finalized_at && <><dt>Finalizou</dt><dd>{personName(s.finalized_by)} · {formatDateTime(s.finalized_at)}</dd></>}
          {s.cancelled_at && <><dt>Cancelou</dt><dd>{personName(s.cancelled_by)} · {formatDateTime(s.cancelled_at)} — {s.cancel_reason}</dd></>}
        </dl>
      </section>

      <section className="card">
        <h3>Itens</h3>
        {s.sale_items.length === 0 ? <p className="muted">Nenhum item.</p> : (
          <table className="table">
            <thead><tr><th>Item</th><th>Profissional</th><th className="num">Qtd</th><th className="num">Unitário</th><th className="num">Desconto</th><th className="num">Total</th><th /></tr></thead>
            <tbody>
              {s.sale_items.map((i) => (
                <tr key={i.id}>
                  <td>{i.description} <span className="muted small">{i.kind === "servico" ? "serviço" : "produto"}</span></td>
                  <td>{proName(i.professional_id)}</td>
                  <td className="num">{i.quantity}</td>
                  <td className="num">{formatMoney(i.unit_price_cents)}</td>
                  <td className="num">{formatMoney(i.discount_cents)}</td>
                  <td className="num">{formatMoney(i.total_cents)}</td>
                  <td>{canEdit && <button className="link-btn" onClick={() => void removeRow("sale_items", i.id)}>remover</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {canEdit && <AddItem saleId={s.id} refs={r} onAdded={() => void sale.reload()} />}
      </section>

      <section className="card totals">
        <div><span>Subtotal</span><strong>{formatMoney(s.subtotal_cents)}</strong></div>
        <div><span>Desconto</span>
          {canEdit ? (
            <span className="row">
              <input aria-label="Desconto da comanda" value={discount ?? centsToInput(s.discount_cents)} onChange={(e) => setDiscount(e.target.value)} style={{ width: 120 }} />
              {discount !== null && <Button variant="secondary" onClick={async () => {
                if (await update({ discount_cents: parseMoney(discount) ?? 0 })) setDiscount(null);
              }}>Aplicar</Button>}
            </span>
          ) : <strong>{formatMoney(s.discount_cents)}</strong>}
        </div>
        <div className="grand"><span>Total</span><strong>{formatMoney(s.total_cents)}</strong></div>
      </section>

      <section className="card">
        <h3>Pagamentos</h3>
        {s.sale_payments.length === 0 ? <p className="muted">Nenhum pagamento.</p> : (
          <ul className="list">
            {s.sale_payments.map((p) => (
              <li key={p.id}>{PAYMENT_METHOD[p.method]}{p.installments > 1 && ` (${p.installments}x)`}: <strong>{formatMoney(p.amount_cents)}</strong>
                {canEdit && <button className="link-btn" onClick={() => void removeRow("sale_payments", p.id)}>remover</button>}</li>
            ))}
          </ul>
        )}
        <p className={paid === s.total_cents ? "muted" : "error-text"}>Pago {formatMoney(paid)} de {formatMoney(s.total_cents)}
          {paid !== s.total_cents && ` · falta ${formatMoney(s.total_cents - paid)}`}</p>
        {canEdit && <AddPayment saleId={s.id} remaining={s.total_cents - paid} onAdded={() => void sale.reload()} />}
      </section>

      {open && can(unit, "sales.finalize") && (
        <Button busy={action.busy} disabled={s.sale_items.length === 0 || paid !== s.total_cents}
          onClick={() => void update({ status: "finalizada" })}>Finalizar comanda</Button>
      )}
      {s.status !== "cancelada" && can(unit, "sales.cancel") && (
        <section className="card">
          <h3>Cancelar comanda</h3>
          {s.status === "finalizada" && <p className="muted small">Produtos vendidos voltam ao estoque.</p>}
          <TextInput label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="danger" disabled={reason.trim().length < 3} busy={action.busy}
            onClick={() => void update({ status: "cancelada", cancel_reason: reason.trim() })}>Cancelar comanda</Button>
        </section>
      )}
    </>
  );
}

function AddItem({ saleId, refs, onAdded }: { saleId: string; onAdded: () => void;
  refs: { services: Service[]; products: ProductStock[]; professionals: Professional[] } }) {
  const unit = useUnit();
  const [kind, setKind] = useState<"servico" | "produto">("servico");
  const [ref, setRef] = useState("");
  const [pro, setPro] = useState("");
  const [qty, setQty] = useState(1);
  const action = useAction();

  async function add() {
    const ok = await action.run(async () => unwrap(await supabase.from("sale_items").insert({
      unit_id: unit.unit_id, sale_id: saleId, kind, quantity: qty,
      service_id: kind === "servico" ? ref : null, product_id: kind === "produto" ? ref : null,
      professional_id: pro || null,
    } as never).select()));
    if (ok) { setRef(""); setQty(1); onAdded(); }
  }

  return (
    <div className="row wrap">
      <Alert kind="error">{action.error}</Alert>
      <SelectInput label="Tipo" value={kind} onChange={(e) => { setKind(e.target.value as "servico" | "produto"); setRef(""); }}>
        <option value="servico">Serviço</option>
        <option value="produto">Produto</option>
      </SelectInput>
      <SelectInput label={kind === "servico" ? "Serviço" : "Produto"} value={ref} onChange={(e) => setRef(e.target.value)}>
        <option value="">Selecione</option>
        {kind === "servico"
          ? refs.services.map((s) => <option key={s.id} value={s.id}>{s.name} — {formatMoney(s.price_cents)}</option>)
          : refs.products.map((p) => <option key={p.id!} value={p.id!}>{p.name} — {formatMoney(p.sale_price_cents)} (saldo {p.quantity})</option>)}
      </SelectInput>
      <SelectInput label="Profissional" value={pro} onChange={(e) => setPro(e.target.value)}>
        <option value="">—</option>
        {refs.professionals.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
      </SelectInput>
      <TextInput label="Qtd" type="number" min={1} max={999} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
      <Button variant="secondary" disabled={!ref} busy={action.busy} onClick={() => void add()}>Adicionar item</Button>
    </div>
  );
}

function AddPayment({ saleId, remaining, onAdded }: { saleId: string; remaining: number; onAdded: () => void }) {
  const unit = useUnit();
  const [method, setMethod] = useState("pix");
  const [amount, setAmount] = useState("");
  const [installments, setInstallments] = useState(1);
  const action = useAction();
  async function add() {
    const cents = parseMoney(amount || centsToInput(remaining));
    const ok = await action.run(async () => unwrap(await supabase.from("sale_payments").insert({
      unit_id: unit.unit_id, sale_id: saleId, method, amount_cents: cents ?? 0,
      installments: method === "cartao_credito" ? installments : 1,
    } as never).select()));
    if (ok) { setAmount(""); setInstallments(1); onAdded(); }
  }
  return (
    <div className="row wrap">
      <Alert kind="error">{action.error}</Alert>
      <SelectInput label="Forma" value={method} onChange={(e) => setMethod(e.target.value)}>
        {Object.entries(PAYMENT_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </SelectInput>
      <TextInput label="Valor (R$)" value={amount} placeholder={centsToInput(Math.max(remaining, 0))}
        onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      {method === "cartao_credito" && (
        <TextInput label="Parcelas" type="number" min={1} max={24} value={installments} onChange={(e) => setInstallments(Number(e.target.value))} />
      )}
      <Button variant="secondary" busy={action.busy} disabled={remaining <= 0 && !amount} onClick={() => void add()}>Adicionar pagamento</Button>
    </div>
  );
}
