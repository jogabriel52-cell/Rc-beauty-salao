import { useState } from "react";
import { useUnit } from "../../auth/AuthProvider";
import { Alert, Badge, Button, Checkbox, Empty, Modal, PageHeader, SelectInput, Spinner, TextInput } from "../../components/ui";
import { unwrap, useAction, useAsync } from "../../components/useAsync";
import { can } from "../../lib/access";
import { STOCK_KIND, type ProductStock, type StockMovement } from "../../lib/db";
import { centsToInput, formatDateTime, formatMoney, parseMoney } from "../../lib/format";
import { supabase } from "../../lib/supabase";

export function StockPage() {
  const unit = useUnit();
  const [editing, setEditing] = useState<ProductStock | "new" | null>(null);
  const [moving, setMoving] = useState<ProductStock | null>(null);
  const [history, setHistory] = useState<ProductStock | null>(null);
  const list = useAsync(async () => unwrap(await supabase.from("product_stock").select("*")
    .eq("unit_id", unit.unit_id).order("active", { ascending: false }).order("name")) as ProductStock[], [unit.unit_id]);
  const manage = can(unit, "stock.manage");

  return (
    <>
      <PageHeader title="Estoque" subtitle={unit.name} actions={manage && <Button onClick={() => setEditing("new")}>Novo produto</Button>} />
      <Alert kind="error">{list.error}</Alert>
      {list.loading ? <Spinner /> : !list.data?.length ? <Empty>Nenhum produto cadastrado.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Produto</th><th>SKU</th><th className="num">Preço</th><th className="num">Saldo</th><th /></tr></thead>
            <tbody>
              {list.data.map((p) => (
                <tr key={p.id!}>
                  <td>{p.name} {!p.active && <Badge tone="danger">inativo</Badge>}</td>
                  <td>{p.sku ?? "—"}</td>
                  <td className="num">{formatMoney(p.sale_price_cents)}</td>
                  <td className="num">{p.quantity}{(p.quantity ?? 0) <= (p.min_quantity ?? 0) && <> <Badge tone="warning">abaixo do mínimo ({p.min_quantity})</Badge></>}</td>
                  <td className="nowrap">
                    <Button variant="ghost" onClick={() => setHistory(p)}>Movimentos</Button>
                    {manage && <><Button variant="secondary" onClick={() => setMoving(p)}>Lançar</Button>{" "}
                      <Button variant="ghost" onClick={() => setEditing(p)}>Editar</Button></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ProductModal product={editing === "new" ? null : editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void list.reload(); }} />}
      {moving && <MovementModal product={moving} onClose={() => setMoving(null)} onSaved={() => { setMoving(null); void list.reload(); }} />}
      {history && <HistoryModal product={history} onClose={() => setHistory(null)} />}
    </>
  );
}

function ProductModal({ product, onClose, onSaved }: { product: ProductStock | null; onClose: () => void; onSaved: () => void }) {
  const unit = useUnit();
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [price, setPrice] = useState(centsToInput(product?.sale_price_cents));
  const [cost, setCost] = useState(centsToInput(product?.cost_cents));
  const [min, setMin] = useState(product?.min_quantity ?? 0);
  const [active, setActive] = useState(product?.active ?? true);
  const action = useAction();
  async function save() {
    const values = { name: name.trim(), sku: sku.trim() || null, sale_price_cents: price ? parseMoney(price) : null,
      cost_cents: cost ? parseMoney(cost) : null, min_quantity: min, active };
    const ok = await action.run(async () => {
      if (product) unwrap(await supabase.from("products").update(values).eq("id", product.id!).select());
      else unwrap(await supabase.from("products").insert({ ...values, unit_id: unit.unit_id }).select());
    });
    if (ok) onSaved();
  }
  return (
    <Modal title={product ? "Editar produto" : "Novo produto"} onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={action.busy} onClick={() => void save()}>Salvar</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <TextInput label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
      <TextInput label="SKU / código" value={sku} onChange={(e) => setSku(e.target.value)} />
      <div className="row">
        <TextInput label="Preço de venda (R$)" value={price} onChange={(e) => setPrice(e.target.value)} />
        <TextInput label="Custo (R$)" value={cost} onChange={(e) => setCost(e.target.value)} />
        <TextInput label="Estoque mínimo" type="number" min={0} value={min} onChange={(e) => setMin(Number(e.target.value))} />
      </div>
      <Checkbox label="Ativo" checked={active} onChange={setActive} />
    </Modal>
  );
}

function MovementModal({ product, onClose, onSaved }: { product: ProductStock; onClose: () => void; onSaved: () => void }) {
  const unit = useUnit();
  const [kind, setKind] = useState("entrada");
  const [qty, setQty] = useState(1);
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  const action = useAction();
  async function save() {
    const delta = kind === "saida" ? -Math.abs(qty) : kind === "entrada" ? Math.abs(qty) : qty;
    const ok = await action.run(async () => unwrap(await supabase.from("stock_movements").insert({
      unit_id: unit.unit_id, product_id: product.id!, kind, quantity_delta: delta,
      unit_cost_cents: kind === "entrada" && cost ? parseMoney(cost) : null, reason: reason.trim() || null,
    }).select()));
    if (ok) onSaved();
  }
  return (
    <Modal title={`Lançar estoque — ${product.name}`} onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={action.busy} onClick={() => void save()}>Lançar</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <p>Saldo atual: <strong>{product.quantity}</strong></p>
      <SelectInput label="Tipo" value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="entrada">Entrada (compra/recebimento)</option>
        <option value="saida">Saída (uso interno/perda)</option>
        <option value="ajuste">Ajuste de inventário (+/−)</option>
      </SelectInput>
      <TextInput label={kind === "ajuste" ? "Quantidade (negativa para reduzir)" : "Quantidade"} type="number"
        value={qty} onChange={(e) => setQty(Number(e.target.value))} />
      {kind === "entrada" && <TextInput label="Custo unitário (R$)" value={cost} onChange={(e) => setCost(e.target.value)} />}
      <TextInput label={kind === "entrada" ? "Observação" : "Motivo (obrigatório)"} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}

function HistoryModal({ product, onClose }: { product: ProductStock; onClose: () => void }) {
  const data = useAsync(async () => unwrap(await supabase.from("stock_movements").select("*")
    .eq("product_id", product.id!).order("created_at", { ascending: false }).limit(200)) as StockMovement[], [product.id]);
  return (
    <Modal title={`Movimentos — ${product.name}`} onClose={onClose} wide>
      {data.loading ? <Spinner /> : !data.data?.length ? <p className="muted">Sem movimentos.</p> : (
        <table className="table">
          <thead><tr><th>Quando</th><th>Tipo</th><th className="num">Quantidade</th><th>Motivo</th></tr></thead>
          <tbody>
            {data.data.map((m) => (
              <tr key={m.id}><td>{formatDateTime(m.created_at)}</td><td>{STOCK_KIND[m.kind]}</td>
                <td className="num">{m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}</td><td>{m.reason ?? "—"}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
