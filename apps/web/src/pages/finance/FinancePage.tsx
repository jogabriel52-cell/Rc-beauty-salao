// Financeiro: lançamentos, fluxo de caixa, conciliação por CSV, contas e categorias.
import { useMemo, useState } from "react";
import { useUnit } from "../../auth/AuthProvider";
import { Alert, Badge, Button, Checkbox, Empty, Modal, PageHeader, SelectInput, Spinner, Stat, Tabs, TextInput }
  from "../../components/ui";
import { unwrap, useAction, useAsync } from "../../components/useAsync";
import { can } from "../../lib/access";
import { decodeCsv, parseBankAmount, parseBankDate, parseCsv, sha256Hex, MAX_BYTES } from "../../lib/csv";
import { centsToInput, formatDate, formatMoney, localDate, parseMoney } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { Tables } from "../../lib/database.types";

type Account = Tables<"finance_accounts">;
type Category = Tables<"finance_categories">;
type Entry = Tables<"finance_entries">;
type Line = Tables<"bank_statement_lines">;
type Tab = "lancamentos" | "fluxo" | "conciliacao" | "cadastros";

const STATUS_TONE: Record<string, "warning" | "success" | "danger"> = { previsto: "warning", pago: "success", cancelado: "danger" };

function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function FinancePage() {
  const unit = useUnit();
  const [tab, setTab] = useState<Tab>("lancamentos");
  const refs = useAsync(async () => {
    const [acc, cat] = await Promise.all([
      supabase.from("finance_accounts").select("*").eq("unit_id", unit.unit_id).order("name"),
      supabase.from("finance_categories").select("*").eq("unit_id", unit.unit_id).order("kind").order("name"),
    ]);
    return { accounts: unwrap(acc) as Account[], categories: unwrap(cat) as Category[] };
  }, [unit.unit_id]);

  const tabs: { value: Tab; label: string }[] = [
    { value: "lancamentos", label: "Lançamentos" },
    { value: "fluxo", label: "Fluxo de caixa" },
  ];
  if (can(unit, "finance.reconcile")) tabs.push({ value: "conciliacao", label: "Conciliação" });
  if (can(unit, "finance.manage")) tabs.push({ value: "cadastros", label: "Contas e categorias" });

  return (
    <>
      <PageHeader title="Financeiro" subtitle={unit.name} />
      <Tabs value={tab} onChange={setTab} items={tabs} />
      <Alert kind="error">{refs.error}</Alert>
      {refs.loading || !refs.data ? <Spinner /> : (
        <>
          {tab === "lancamentos" && <EntriesTab refs={refs.data} />}
          {tab === "fluxo" && <CashFlowTab />}
          {tab === "conciliacao" && <ReconcileTab refs={refs.data} />}
          {tab === "cadastros" && <SetupTab refs={refs.data} reload={() => void refs.reload()} />}
        </>
      )}
    </>
  );
}

interface Refs { accounts: Account[]; categories: Category[] }

function EntriesTab({ refs }: { refs: Refs }) {
  const unit = useUnit();
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [paying, setPaying] = useState<Entry | null>(null);
  const [cancelling, setCancelling] = useState<Entry | null>(null);
  const list = useAsync(async () => {
    const { from, to } = monthBounds(month);
    let q = supabase.from("finance_entries").select("*").eq("unit_id", unit.unit_id).gte("due_date", from).lte("due_date", to)
      .order("due_date").limit(1000);
    if (kind) q = q.eq("kind", kind);
    if (status) q = q.eq("status", status);
    return unwrap(await q) as Entry[];
  }, [unit.unit_id, month, kind, status]);
  const manage = can(unit, "finance.manage");
  const catName = (id: string) => refs.categories.find((c) => c.id === id)?.name ?? "—";
  const accName = (id: string | null) => refs.accounts.find((a) => a.id === id)?.name ?? "—";
  const totals = useMemo(() => {
    const t = { receita: 0, despesa: 0, aberto: 0 };
    for (const e of list.data ?? []) {
      if (e.status === "cancelado") continue;
      t[e.kind as "receita" | "despesa"] += e.amount_cents;
      if (e.status === "previsto") t.aberto += e.kind === "receita" ? e.amount_cents : -e.amount_cents;
    }
    return t;
  }, [list.data]);

  return (
    <>
      <div className="toolbar">
        <TextInput label="Mês de vencimento" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <SelectInput label="Tipo" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Todos</option><option value="receita">Receitas</option><option value="despesa">Despesas</option>
        </SelectInput>
        <SelectInput label="Situação" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todas</option><option value="previsto">Previstos</option><option value="pago">Pagos</option><option value="cancelado">Cancelados</option>
        </SelectInput>
        {manage && <Button onClick={() => setEditing("new")}>Novo lançamento</Button>}
      </div>
      <div className="stats">
        <Stat label="Receitas" value={formatMoney(totals.receita)} />
        <Stat label="Despesas" value={formatMoney(totals.despesa)} />
        <Stat label="Resultado" value={formatMoney(totals.receita - totals.despesa)} />
        <Stat label="Em aberto (saldo)" value={formatMoney(totals.aberto)} />
      </div>
      <Alert kind="error">{list.error}</Alert>
      {list.loading ? <Spinner /> : !list.data?.length ? <Empty>Nenhum lançamento no mês.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th>Situação</th><th className="num">Valor</th><th /></tr></thead>
            <tbody>
              {list.data.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.due_date)}</td>
                  <td>{e.description}{e.counterparty && <div className="muted small">{e.counterparty}</div>}
                    {e.source !== "manual" && <Badge>{e.source === "comissao" ? "comissão" : "extrato"}</Badge>}</td>
                  <td>{catName(e.category_id)}</td>
                  <td><Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>
                    {e.paid_at && <div className="muted small">{formatDate(e.paid_at)} · {accName(e.account_id)}</div>}</td>
                  <td className={`num ${e.kind === "despesa" ? "error-text" : ""}`}>{e.kind === "despesa" ? "−" : ""}{formatMoney(e.amount_cents)}</td>
                  <td className="nowrap">{manage && e.status === "previsto" && <>
                    <Button variant="secondary" onClick={() => setPaying(e)}>Baixar</Button>{" "}
                    <Button variant="ghost" onClick={() => setEditing(e)}>Editar</Button></>}
                    {manage && e.status !== "cancelado" && <Button variant="ghost" onClick={() => setCancelling(e)}>Cancelar</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <EntryModal entry={editing === "new" ? null : editing} refs={refs} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void list.reload(); }} />}
      {paying && <PayModal entry={paying} refs={refs} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); void list.reload(); }} />}
      {cancelling && <CancelModal entry={cancelling} onClose={() => setCancelling(null)} onSaved={() => { setCancelling(null); void list.reload(); }} />}
    </>
  );
}

function EntryModal({ entry, refs, onClose, onSaved }: { entry: Entry | null; refs: Refs; onClose: () => void; onSaved: () => void }) {
  const unit = useUnit();
  const [kind, setKind] = useState(entry?.kind ?? "despesa");
  const [categoryId, setCategoryId] = useState(entry?.category_id ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [amount, setAmount] = useState(centsToInput(entry?.amount_cents));
  const [due, setDue] = useState(entry?.due_date ?? localDate());
  const [counterparty, setCounterparty] = useState(entry?.counterparty ?? "");
  const [paidNow, setPaidNow] = useState(false);
  const [accountId, setAccountId] = useState(refs.accounts[0]?.id ?? "");
  const action = useAction();
  const cats = refs.categories.filter((c) => c.kind === kind && c.active);

  async function save() {
    const values = { category_id: categoryId, description: description.trim(), amount_cents: parseMoney(amount) ?? 0,
      due_date: due, counterparty: counterparty.trim() || null };
    const ok = await action.run(async () => {
      if (entry) unwrap(await supabase.from("finance_entries").update(values).eq("id", entry.id).select());
      else unwrap(await supabase.from("finance_entries").insert({ ...values, unit_id: unit.unit_id, kind,
        ...(paidNow ? { status: "pago", paid_at: due, account_id: accountId } : {}) }).select());
    });
    if (ok) onSaved();
  }

  return (
    <Modal title={entry ? "Editar lançamento" : "Novo lançamento"} onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button busy={action.busy} disabled={!categoryId || !description.trim() || !parseMoney(amount)} onClick={() => void save()}>Salvar</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      {!entry && (
        <SelectInput label="Tipo" value={kind} onChange={(e) => { setKind(e.target.value); setCategoryId(""); }}>
          <option value="despesa">Despesa</option><option value="receita">Receita</option>
        </SelectInput>
      )}
      <SelectInput label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">Selecione</option>
        {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </SelectInput>
      <TextInput label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="row">
        <TextInput label="Valor (R$)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        <TextInput label="Vencimento" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <TextInput label="Favorecido / pagador" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
      {!entry && <Checkbox label="Já pago (na data de vencimento)" checked={paidNow} onChange={setPaidNow} />}
      {!entry && paidNow && (
        <SelectInput label="Conta" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {refs.accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </SelectInput>
      )}
    </Modal>
  );
}

function PayModal({ entry, refs, onClose, onSaved }: { entry: Entry; refs: Refs; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(localDate());
  const [accountId, setAccountId] = useState(refs.accounts.find((a) => a.active)?.id ?? "");
  const action = useAction();
  return (
    <Modal title="Baixar lançamento" onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button busy={action.busy} disabled={!accountId} onClick={async () => {
          const ok = await action.run(async () => unwrap(await supabase.from("finance_entries")
            .update({ status: "pago", paid_at: date, account_id: accountId }).eq("id", entry.id).select()));
          if (ok) onSaved();
        }}>Confirmar</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <p>{entry.description} — <strong>{formatMoney(entry.amount_cents)}</strong></p>
      <TextInput label="Data do pagamento" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <SelectInput label="Conta" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
        {refs.accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </SelectInput>
    </Modal>
  );
}

function CancelModal({ entry, onClose, onSaved }: { entry: Entry; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState("");
  const action = useAction();
  return (
    <Modal title="Cancelar lançamento" onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Voltar</Button>
        <Button variant="danger" busy={action.busy} disabled={reason.trim().length < 3} onClick={async () => {
          const ok = await action.run(async () => unwrap(await supabase.from("finance_entries")
            .update({ status: "cancelado", cancel_reason: reason.trim() }).eq("id", entry.id).select()));
          if (ok) onSaved();
        }}>Cancelar lançamento</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <p>{entry.description} — {formatMoney(entry.amount_cents)}</p>
      <TextInput label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}

interface CashFlow {
  days: { dia: string; entradas: number; saidas: number; a_receber: number; a_pagar: number }[];
  by_category: { tipo: string; categoria: string; total_cents: number }[];
  accounts: { conta: string; tipo: string; saldo_cents: number }[];
}

function CashFlowTab() {
  const unit = useUnit();
  const today = localDate();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(monthBounds(today.slice(0, 7)).to);
  const [includeSales, setIncludeSales] = useState(false);
  const data = useAsync(async () => unwrap(await supabase.rpc("finance_cash_flow", {
    p_unit_id: unit.unit_id, p_from: from, p_to: to, p_include_sales: includeSales,
  })) as unknown as CashFlow, [unit.unit_id, from, to, includeSales]);
  let running = 0;
  const totals = (data.data?.days ?? []).reduce((t, d) => ({ in: t.in + d.entradas, out: t.out + d.saidas,
    rec: t.rec + d.a_receber, pay: t.pay + d.a_pagar }), { in: 0, out: 0, rec: 0, pay: 0 });
  return (
    <>
      <div className="toolbar">
        <TextInput label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextInput label="Até" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Checkbox label="Incluir vendas das comandas" checked={includeSales} onChange={setIncludeSales} />
      </div>
      <p className="muted small">Marque “Incluir vendas” se as vendas das comandas não forem lançadas manualmente como receita — assim
        nada é contado em dobro. Esta escolha deve ser definida pela direção.</p>
      <Alert kind="error">{data.error}</Alert>
      {data.loading || !data.data ? <Spinner /> : (
        <>
          <div className="stats">
            <Stat label="Entradas realizadas" value={formatMoney(totals.in)} />
            <Stat label="Saídas realizadas" value={formatMoney(totals.out)} />
            <Stat label="Saldo realizado" value={formatMoney(totals.in - totals.out)} />
            <Stat label="A receber (previsto)" value={formatMoney(totals.rec)} />
            <Stat label="A pagar (previsto)" value={formatMoney(totals.pay)} />
          </div>
          <div className="grid-2">
            <section className="card">
              <h3>Por dia</h3>
              {data.data.days.length === 0 ? <p className="muted">Sem movimento.</p> : (
                <table className="table">
                  <thead><tr><th>Dia</th><th className="num">Entradas</th><th className="num">Saídas</th><th className="num">Acumulado</th><th className="num">Previsto</th></tr></thead>
                  <tbody>{data.data.days.map((d) => {
                    running += d.entradas - d.saidas;
                    return <tr key={d.dia}><td>{formatDate(d.dia)}</td><td className="num">{formatMoney(d.entradas)}</td>
                      <td className="num">{formatMoney(d.saidas)}</td><td className="num">{formatMoney(running)}</td>
                      <td className="num small">{d.a_receber || d.a_pagar ? `+${formatMoney(d.a_receber)} / −${formatMoney(d.a_pagar)}` : "—"}</td></tr>;
                  })}</tbody>
                </table>
              )}
            </section>
            <section className="card">
              <h3>Por categoria (pagos)</h3>
              {data.data.by_category.length === 0 ? <p className="muted">Sem lançamentos pagos.</p> : (
                <table className="table"><tbody>{data.data.by_category.map((c) => (
                  <tr key={`${c.tipo}-${c.categoria}`}><td>{c.categoria} <span className="muted small">{c.tipo}</span></td>
                    <td className="num">{formatMoney(c.total_cents)}</td></tr>))}</tbody></table>
              )}
              <h3>Saldo das contas em {formatDate(to)}</h3>
              <table className="table"><tbody>{data.data.accounts.map((a) => (
                <tr key={a.conta}><td>{a.conta} <span className="muted small">{a.tipo}</span></td><td className="num">{formatMoney(a.saldo_cents)}</td></tr>))}</tbody></table>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function ReconcileTab({ refs }: { refs: Refs }) {
  const unit = useUnit();
  const [accountId, setAccountId] = useState(refs.accounts.find((a) => a.kind !== "caixa")?.id ?? refs.accounts[0]?.id ?? "");
  const [importing, setImporting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [suggesting, setSuggesting] = useState<Line | null>(null);
  const [creating, setCreating] = useState<Line | null>(null);
  const action = useAction();
  const lines = useAsync(async () => {
    if (!accountId) return [] as Line[];
    let q = supabase.from("bank_statement_lines").select("*").eq("account_id", accountId).order("line_date", { ascending: false }).limit(500);
    if (!showAll) q = q.eq("status", "pendente");
    return unwrap(await q) as Line[];
  }, [accountId, showAll]);

  async function ignore(l: Line) {
    const reason = window.prompt("Motivo para ignorar a linha (ex.: transferência entre contas):");
    if (!reason) return;
    if (await action.run(async () => unwrap(await supabase.rpc("finance_ignore_line", { p_line_id: l.id, p_reason: reason })))) void lines.reload();
  }
  async function undo(l: Line) {
    if (await action.run(async () => unwrap(await supabase.rpc("finance_unreconcile", { p_line_id: l.id })))) void lines.reload();
  }

  return (
    <>
      <div className="toolbar">
        <SelectInput label="Conta" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {refs.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>)}
        </SelectInput>
        <Checkbox label="Mostrar já tratadas" checked={showAll} onChange={setShowAll} />
        <Button disabled={!accountId} onClick={() => setImporting(true)}>Importar extrato (CSV)</Button>
      </div>
      <Alert kind="info">Extratos de banco e de adquirente entram por CSV até haver API e credenciais confirmadas. A conciliação é sempre confirmada por uma pessoa.</Alert>
      <Alert kind="error">{action.error || lines.error}</Alert>
      {lines.loading ? <Spinner /> : !lines.data?.length ? <Empty>Nenhuma linha {showAll ? "" : "pendente "}nesta conta.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Data</th><th>Descrição</th><th className="num">Valor</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {lines.data.map((l) => (
                <tr key={l.id}>
                  <td>{formatDate(l.line_date)}</td><td>{l.description}</td>
                  <td className={`num ${l.amount_cents < 0 ? "error-text" : ""}`}>{formatMoney(l.amount_cents)}</td>
                  <td><Badge tone={l.status === "conciliado" ? "success" : l.status === "ignorado" ? "neutral" : "warning"}>{l.status}</Badge>
                    {l.ignore_reason && <div className="muted small">{l.ignore_reason}</div>}</td>
                  <td className="nowrap">
                    {l.status === "pendente" ? <>
                      <Button variant="secondary" onClick={() => setSuggesting(l)}>Conciliar</Button>{" "}
                      {can(unit, "finance.manage") && <Button variant="ghost" onClick={() => setCreating(l)}>Criar lançamento</Button>}
                      <Button variant="ghost" onClick={() => void ignore(l)}>Ignorar</Button></>
                      : <Button variant="ghost" onClick={() => void undo(l)}>Desfazer</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {importing && <StatementImport accountId={accountId} onClose={() => setImporting(false)} onDone={() => { setImporting(false); void lines.reload(); }} />}
      {suggesting && <SuggestionsModal line={suggesting} onClose={() => setSuggesting(null)} onDone={() => { setSuggesting(null); void lines.reload(); }} />}
      {creating && <CreateFromLineModal line={creating} refs={refs} onClose={() => setCreating(null)} onDone={() => { setCreating(null); void lines.reload(); }} />}
    </>
  );
}

function StatementImport({ accountId, onClose, onDone }: { accountId: string; onClose: () => void; onDone: () => void }) {
  const unit = useUnit();
  const [file, setFile] = useState<{ name: string; sha: string; headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [dateCol, setDateCol] = useState("");
  const [descCol, setDescCol] = useState("");
  const [mode, setMode] = useState<"single" | "split">("single");
  const [amountCol, setAmountCol] = useState("");
  const [creditCol, setCreditCol] = useState("");
  const [debitCol, setDebitCol] = useState("");
  const [dateFormat, setDateFormat] = useState<"DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY">("DD/MM/YYYY");
  const action = useAction();

  async function onFile(f: File | undefined) {
    if (!f) return;
    await action.run(async () => {
      if (f.size > MAX_BYTES) throw new Error("Arquivo maior que 5 MB.");
      const buffer = await f.arrayBuffer();
      const { headers, rows } = parseCsv(decodeCsv(buffer).text);
      setFile({ name: f.name, sha: await sha256Hex(buffer), headers, rows });
    });
  }

  const parsed = useMemo(() => {
    if (!file || !dateCol || !descCol || (mode === "single" ? !amountCol : !creditCol && !debitCol)) return null;
    const ok: { line_number: number; line_date: string; description: string; amount_cents: number }[] = [];
    let invalid = 0;
    file.rows.forEach((r, i) => {
      const date = parseBankDate(r[dateCol], dateFormat);
      const amount = mode === "single" ? parseBankAmount(r[amountCol])
        : (parseBankAmount(r[creditCol]) ?? 0) - Math.abs(parseBankAmount(r[debitCol]) ?? 0);
      if (!date || !amount) { invalid++; return; }
      ok.push({ line_number: i + 1, line_date: date, description: (r[descCol] ?? "").trim().slice(0, 300), amount_cents: amount });
    });
    return { ok, invalid };
  }, [file, dateCol, descCol, mode, amountCol, creditCol, debitCol, dateFormat]);

  return (
    <Modal title="Importar extrato" onClose={onClose} wide footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button busy={action.busy} disabled={!parsed?.ok.length} onClick={async () => {
          const ok = await action.run(async () => unwrap(await supabase.rpc("finance_import_statement", {
            p_unit_id: unit.unit_id, p_account_id: accountId, p_file_name: file!.name, p_file_sha256: file!.sha, p_lines: parsed!.ok as never,
          })));
          if (ok) onDone();
        }}>Importar {parsed?.ok.length ?? 0} linhas</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <div className="field">
        <label htmlFor="statement-file">Arquivo CSV do banco ou da adquirente</label>
        <input id="statement-file" type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      {file && (
        <>
          <div className="row wrap">
            <SelectInput label="Coluna da data" value={dateCol} onChange={(e) => setDateCol(e.target.value)}>
              <option value="">Selecione</option>{file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </SelectInput>
            <SelectInput label="Formato da data" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as typeof dateFormat)}>
              <option value="DD/MM/YYYY">DD/MM/AAAA</option><option value="YYYY-MM-DD">AAAA-MM-DD</option><option value="MM/DD/YYYY">MM/DD/AAAA</option>
            </SelectInput>
            <SelectInput label="Coluna da descrição" value={descCol} onChange={(e) => setDescCol(e.target.value)}>
              <option value="">Selecione</option>{file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </SelectInput>
          </div>
          <div className="row wrap">
            <SelectInput label="Valores" value={mode} onChange={(e) => setMode(e.target.value as "single" | "split")}>
              <option value="single">Uma coluna (negativo = saída)</option><option value="split">Colunas de crédito e débito</option>
            </SelectInput>
            {mode === "single" ? (
              <SelectInput label="Coluna do valor" value={amountCol} onChange={(e) => setAmountCol(e.target.value)}>
                <option value="">Selecione</option>{file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </SelectInput>
            ) : (
              <>
                <SelectInput label="Coluna de crédito" value={creditCol} onChange={(e) => setCreditCol(e.target.value)}>
                  <option value="">—</option>{file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </SelectInput>
                <SelectInput label="Coluna de débito" value={debitCol} onChange={(e) => setDebitCol(e.target.value)}>
                  <option value="">—</option>{file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </SelectInput>
              </>
            )}
          </div>
          {parsed && (
            <>
              <p className="small">{parsed.ok.length} linhas válidas{parsed.invalid > 0 && `, ${parsed.invalid} ignoradas (data ou valor inválido/zero)`}</p>
              <table className="table">
                <thead><tr><th>Data</th><th>Descrição</th><th className="num">Valor</th></tr></thead>
                <tbody>{parsed.ok.slice(0, 5).map((l) => (
                  <tr key={l.line_number}><td>{formatDate(l.line_date)}</td><td>{l.description}</td><td className="num">{formatMoney(l.amount_cents)}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

function SuggestionsModal({ line, onClose, onDone }: { line: Line; onClose: () => void; onDone: () => void }) {
  const action = useAction();
  const data = useAsync(async () => unwrap(await supabase.rpc("finance_match_suggestions", { p_line_id: line.id })) as
    { entry_id: string; description: string; due_date: string; paid_at: string | null; status: string; days_apart: number }[], [line.id]);
  return (
    <Modal title="Conciliar linha" onClose={onClose}>
      <p>{formatDate(line.line_date)} · {line.description} · <strong>{formatMoney(line.amount_cents)}</strong></p>
      <Alert kind="error">{action.error || data.error}</Alert>
      {data.loading ? <Spinner /> : !data.data?.length ? (
        <p className="muted">Nenhum lançamento com o mesmo valor e data próxima. Use “Criar lançamento” ou ajuste os lançamentos.</p>
      ) : (
        <ul className="list">
          {data.data.map((s) => (
            <li key={s.entry_id} className="card">
              <div className="card-title">
                <div><strong>{s.description}</strong><div className="muted small">Vencimento {formatDate(s.due_date)} · {s.status}
                  {s.days_apart > 0 && ` · ${s.days_apart} dia(s) de diferença`}</div></div>
                <Button busy={action.busy} onClick={async () => {
                  if (await action.run(async () => unwrap(await supabase.rpc("finance_reconcile", { p_line_id: line.id, p_entry_id: s.entry_id })))) onDone();
                }}>Conciliar com este</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function CreateFromLineModal({ line, refs, onClose, onDone }: { line: Line; refs: Refs; onClose: () => void; onDone: () => void }) {
  const kind = line.amount_cents > 0 ? "receita" : "despesa";
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState(line.description);
  const action = useAction();
  return (
    <Modal title="Criar lançamento a partir da linha" onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button busy={action.busy} disabled={!categoryId} onClick={async () => {
          if (await action.run(async () => unwrap(await supabase.rpc("finance_create_from_line", {
            p_line_id: line.id, p_category_id: categoryId, p_description: description,
          })))) onDone();
        }}>Criar e conciliar</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <p>{formatDate(line.line_date)} · <strong>{formatMoney(line.amount_cents)}</strong> ({kind})</p>
      <SelectInput label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">Selecione</option>
        {refs.categories.filter((c) => c.kind === kind && c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </SelectInput>
      <TextInput label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} />
    </Modal>
  );
}

function SetupTab({ refs, reload }: { refs: Refs; reload: () => void }) {
  const unit = useUnit();
  const action = useAction();
  const [accName, setAccName] = useState("");
  const [accKind, setAccKind] = useState("banco");
  const [accOpening, setAccOpening] = useState("");
  const [catName, setCatName] = useState("");
  const [catKind, setCatKind] = useState("despesa");

  async function toggle(table: "finance_accounts" | "finance_categories", id: string, active: boolean) {
    if (await action.run(async () => unwrap(await supabase.from(table).update({ active }).eq("id", id).select()))) reload();
  }

  return (
    <div className="grid-2">
      <section className="card">
        <h3>Contas</h3>
        <Alert kind="error">{action.error}</Alert>
        <table className="table"><tbody>{refs.accounts.map((a) => (
          <tr key={a.id}><td>{a.name} <span className="muted small">{a.kind}</span> {!a.active && <Badge tone="danger">inativa</Badge>}</td>
            <td className="num small">inicial {formatMoney(a.opening_balance_cents)}</td>
            <td><button className="link-btn" onClick={() => void toggle("finance_accounts", a.id, !a.active)}>{a.active ? "desativar" : "ativar"}</button></td></tr>
        ))}</tbody></table>
        <div className="row wrap">
          <TextInput label="Nome" value={accName} onChange={(e) => setAccName(e.target.value)} />
          <SelectInput label="Tipo" value={accKind} onChange={(e) => setAccKind(e.target.value)}>
            <option value="banco">Banco</option><option value="caixa">Caixa</option><option value="adquirente">Adquirente (cartão)</option><option value="outro">Outro</option>
          </SelectInput>
          <TextInput label="Saldo inicial (R$)" value={accOpening} onChange={(e) => setAccOpening(e.target.value)} />
          <Button variant="secondary" disabled={accName.trim().length < 2} busy={action.busy} onClick={async () => {
            if (await action.run(async () => unwrap(await supabase.from("finance_accounts").insert({
              unit_id: unit.unit_id, name: accName.trim(), kind: accKind, opening_balance_cents: parseMoney(accOpening) ?? 0,
            }).select()))) { setAccName(""); setAccOpening(""); reload(); }
          }}>Adicionar conta</Button>
        </div>
      </section>
      <section className="card">
        <h3>Categorias</h3>
        <table className="table"><tbody>{refs.categories.map((c) => (
          <tr key={c.id}><td>{c.name} <span className="muted small">{c.kind}</span> {!c.active && <Badge tone="danger">inativa</Badge>}</td>
            <td><button className="link-btn" onClick={() => void toggle("finance_categories", c.id, !c.active)}>{c.active ? "desativar" : "ativar"}</button></td></tr>
        ))}</tbody></table>
        <div className="row wrap">
          <TextInput label="Nome" value={catName} onChange={(e) => setCatName(e.target.value)} />
          <SelectInput label="Tipo" value={catKind} onChange={(e) => setCatKind(e.target.value)}>
            <option value="despesa">Despesa</option><option value="receita">Receita</option>
          </SelectInput>
          <Button variant="secondary" disabled={catName.trim().length < 2} busy={action.busy} onClick={async () => {
            if (await action.run(async () => unwrap(await supabase.from("finance_categories").insert({
              unit_id: unit.unit_id, name: catName.trim(), kind: catKind,
            }).select()))) { setCatName(""); reload(); }
          }}>Adicionar categoria</Button>
        </div>
      </section>
    </div>
  );
}
