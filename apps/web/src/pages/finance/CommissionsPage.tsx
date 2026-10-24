// Comissões: minhas apurações, regras configuráveis (parâmetros "a confirmar"),
// metas por período e apuração com aprovação por outra pessoa.
import { useState } from "react";
import { useAuth, useUnit } from "../../auth/AuthProvider";
import { Alert, Badge, Button, Empty, Modal, PageHeader, SelectInput, Spinner, Tabs, TextInput } from "../../components/ui";
import { unwrap, useAction, useAsync } from "../../components/useAsync";
import { can } from "../../lib/access";
import { formatDate, formatMoney, formatPercent, parseMoney } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { Tables } from "../../lib/database.types";

type Plan = Tables<"commission_plans">;
type Statement = Tables<"commission_statements">;
type Goal = Tables<"commission_goals">;
type Tier = Tables<"commission_plan_tiers">;

const PARAMS: { key: keyof Plan; label: string; options: [string, string][]; hint: string }[] = [
  { key: "revenue_source", label: "Fonte do faturamento", hint: "De onde vem o valor que conta para a meta",
    options: [["comandas_finalizadas", "Comandas finalizadas no sistema"], ["pagamentos_recebidos", "Pagamentos recebidos nas comandas"],
      ["valor_informado", "Valor informado manualmente na apuração"]] },
  { key: "base_scope", label: "Base de cálculo", hint: "Quais vendas entram",
    options: [["vendas_do_beneficiario", "Vendas em que a pessoa é a vendedora"], ["servicos_do_beneficiario", "Serviços realizados pela pessoa"],
      ["vendas_da_unidade", "Todas as vendas da unidade (meta coletiva)"]] },
  { key: "item_filter", label: "Itens considerados", hint: "Serviços, produtos ou ambos",
    options: [["todos", "Serviços e produtos"], ["servicos", "Somente serviços"], ["produtos", "Somente produtos"]] },
  { key: "amount_basis", label: "Valor considerado", hint: "Antes ou depois do desconto da comanda",
    options: [["bruto_itens", "Valor dos itens (antes do desconto da comanda)"], ["liquido_comanda", "Valor líquido (após desconto da comanda)"]] },
  { key: "period_type", label: "Período", hint: "Periodicidade da meta", options: [["mensal", "Mensal"]] },
  { key: "refund_policy", label: "Estornos", hint: "O que acontece com comandas canceladas",
    options: [["excluir_canceladas_ate_apuracao", "Excluir canceladas até a apuração (sem desconto posterior)"],
      ["descontar_no_periodo_do_cancelamento", "Descontar no período em que a comanda foi cancelada"]] },
  { key: "tier_mode", label: "Aplicação das faixas", hint: "Como a taxa incide sobre a base",
    options: [["faixa_sobre_total", "A taxa da faixa atingida vale sobre toda a base"], ["progressiva", "Progressiva (cada faixa sobre a sua parte)"]] },
];

function pending(p: Plan): string[] {
  const out: string[] = [];
  if (!p.revenue_source) out.push("fonte do faturamento");
  if (p.revenue_source !== "valor_informado" && !p.base_scope) out.push("base de cálculo");
  if (p.revenue_source !== "valor_informado" && !p.item_filter) out.push("itens considerados");
  if (p.revenue_source === "comandas_finalizadas" && !p.amount_basis) out.push("valor considerado");
  if (!p.period_type || !p.period_start_day) out.push("período");
  if (!p.refund_policy) out.push("estornos");
  if (!p.tier_mode) out.push("aplicação das faixas");
  return out;
}

const STATUS_TONE: Record<string, "warning" | "info" | "success" | "danger"> = { calculada: "warning", aprovada: "info", paga: "success", cancelada: "danger" };

export function CommissionsPage() {
  const unit = useUnit();
  const manage = can(unit, "commissions.manage");
  const [tab, setTab] = useState<"minhas" | "regras" | "apuracao">(manage ? "regras" : "minhas");
  const items: { value: "minhas" | "regras" | "apuracao"; label: string }[] = [{ value: "minhas", label: manage ? "Apurações visíveis" : "Minhas comissões" }];
  if (manage) items.push({ value: "regras", label: "Regras e metas" }, { value: "apuracao", label: "Apuração" });
  return (
    <>
      <PageHeader title="Comissões" subtitle={unit.name} />
      <Tabs value={tab} onChange={setTab} items={items} />
      {tab === "minhas" && <MyStatements />}
      {tab === "regras" && <PlansTab />}
      {tab === "apuracao" && <CalculationTab />}
    </>
  );
}

function StatementsTable({ rows, actions, planName }:
  { rows: Statement[]; actions?: (s: Statement) => React.ReactNode; planName?: (planId: string) => string }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>{planName && <th>Plano</th>}<th>Período</th><th className="num">Faturamento</th><th className="num">Meta</th><th className="num">Atingido</th>
          <th className="num">Taxa</th><th className="num">Comissão</th><th>Situação</th>{actions && <th />}</tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              {planName && <td>{planName(s.plan_id)}</td>}
              <td>{formatDate(s.period_start)} – {formatDate(s.period_end)}</td>
              <td className="num">{formatMoney(s.revenue_cents)}</td>
              <td className="num">{formatMoney(s.goal_cents)}</td>
              <td className="num">{formatPercent(Number(s.achievement_pct))}</td>
              <td className="num">{formatPercent(Number(s.rate_pct), 3)}</td>
              <td className="num"><strong>{formatMoney(s.commission_cents)}</strong></td>
              <td><Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge></td>
              {actions && <td className="nowrap">{actions(s)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MyStatements() {
  const unit = useUnit();
  const data = useAsync(async () => unwrap(await supabase.from("commission_statements").select("*")
    .eq("unit_id", unit.unit_id).order("period_start", { ascending: false }).limit(100)) as Statement[], [unit.unit_id]);
  if (data.loading) return <Spinner />;
  if (!data.data?.length) return <Empty>Nenhuma apuração de comissão.</Empty>;
  return <StatementsTable rows={data.data} />;
}

function PlansTab() {
  const unit = useUnit();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const data = useAsync(async () => {
    const [plans, people] = await Promise.all([
      supabase.from("commission_plans").select("*").eq("unit_id", unit.unit_id).order("name"),
      supabase.rpc("unit_people", { p_unit_id: unit.unit_id }),
    ]);
    return { plans: unwrap(plans) as Plan[], people: (people.data ?? []) as { user_id: string; full_name: string }[] };
  }, [unit.unit_id]);
  const person = (id: string) => data.data?.people.find((p) => p.user_id === id)?.full_name ?? "—";
  const plan = data.data?.plans.find((p) => p.id === selected) ?? null;

  return (
    <>
      <Alert kind="info">Os valores de referência (0,8%/2% meta individual; 0,5%/1,5% meta coletiva) vêm preenchidos nos modelos.
        Período, base, valor considerado, estornos, fonte do faturamento e aplicação das faixas ficam “a confirmar” até a direção definir —
        o plano não pode ser ativado nem apurado antes disso.</Alert>
      <div className="toolbar"><Button onClick={() => setCreating(true)}>Novo plano a partir de modelo</Button></div>
      <Alert kind="error">{data.error}</Alert>
      {data.loading ? <Spinner /> : !data.data?.plans.length ? <Empty>Nenhum plano de comissão.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Plano</th><th>Pessoa</th><th>Meta</th><th>Situação</th><th>A confirmar</th><th /></tr></thead>
            <tbody>
              {data.data.plans.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td><td>{person(p.beneficiary_id)}</td><td>{p.goal_type}</td>
                  <td><Badge tone={p.status === "ativo" ? "success" : p.status === "inativo" ? "danger" : "warning"}>{p.status}</Badge></td>
                  <td className="small">{pending(p).join(", ") || "—"}</td>
                  <td><Button variant="secondary" onClick={() => setSelected(p.id)}>Abrir</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && data.data && <NewPlanModal people={data.data.people} onClose={() => setCreating(false)}
        onCreated={(id) => { setCreating(false); setSelected(id); void data.reload(); }} />}
      {plan && <PlanEditor plan={plan} beneficiary={person(plan.beneficiary_id)} onClose={() => setSelected(null)}
        onChanged={() => void data.reload()} />}
    </>
  );
}

function NewPlanModal({ people, onClose, onCreated }:
  { people: { user_id: string; full_name: string }[]; onClose: () => void; onCreated: (id: string) => void }) {
  const unit = useUnit();
  const { access } = useAuth();
  const presets = useAsync(async () => unwrap(await supabase.from("commission_presets").select("*")) as
    { key: string; name: string; notes: string }[], []);
  const [preset, setPreset] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [name, setName] = useState("");
  const action = useAction();
  return (
    <Modal title="Novo plano de comissão" onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button busy={action.busy} disabled={!preset || !beneficiary || name.trim().length < 3} onClick={async () => {
          await action.run(async () => onCreated(unwrap(await supabase.rpc("commission_create_plan_from_preset", {
            p_unit_id: unit.unit_id, p_preset_key: preset, p_beneficiary_id: beneficiary, p_name: name.trim(),
          })) as string));
        }}>Criar rascunho</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <SelectInput label="Modelo" value={preset} onChange={(e) => setPreset(e.target.value)}>
        <option value="">Selecione</option>
        {(presets.data ?? []).map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
      </SelectInput>
      {preset && <p className="muted small">{presets.data?.find((p) => p.key === preset)?.notes}</p>}
      <SelectInput label="Pessoa beneficiária" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)}
        hint="Ninguém configura a própria comissão.">
        <option value="">Selecione</option>
        {people.filter((p) => p.user_id !== access?.user_id).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
      </SelectInput>
      <TextInput label="Nome do plano" value={name} onChange={(e) => setName(e.target.value)} />
    </Modal>
  );
}

function PlanEditor({ plan, beneficiary, onClose, onChanged }:
  { plan: Plan; beneficiary: string; onClose: () => void; onChanged: () => void }) {
  const action = useAction();
  const [form, setForm] = useState<Partial<Plan>>(plan);
  const [minPct, setMinPct] = useState("");
  const [rate, setRate] = useState("");
  const [goalStart, setGoalStart] = useState("");
  const [goalEnd, setGoalEnd] = useState("");
  const [goalValue, setGoalValue] = useState("");
  const extra = useAsync(async () => {
    const [tiers, goals] = await Promise.all([
      supabase.from("commission_plan_tiers").select("*").eq("plan_id", plan.id).order("min_achievement_pct"),
      supabase.from("commission_goals").select("*").eq("plan_id", plan.id).order("period_start", { ascending: false }),
    ]);
    return { tiers: unwrap(tiers) as Tier[], goals: unwrap(goals) as Goal[] };
  }, [plan.id]);
  const draft = plan.status !== "ativo";

  async function saveParams() {
    const values: Record<string, unknown> = { name: form.name };
    for (const p of PARAMS) values[p.key] = form[p.key] ?? null;
    values.period_start_day = form.period_start_day ?? null;
    if (await action.run(async () => unwrap(await supabase.from("commission_plans").update(values as never).eq("id", plan.id).select()))) onChanged();
  }
  async function setStatus(status: string) {
    if (await action.run(async () => unwrap(await supabase.from("commission_plans").update({ status }).eq("id", plan.id).select()))) onChanged();
  }

  return (
    <Modal title={`${plan.name} — ${beneficiary}`} onClose={onClose} wide>
      <Alert kind="error">{action.error || extra.error}</Alert>
      {pending({ ...plan, ...form } as Plan).length > 0 && (
        <Alert kind="warning">A confirmar: {pending({ ...plan, ...form } as Plan).join(", ")}.</Alert>
      )}
      {!draft && <Alert kind="info">Plano ativo: para mudar regras ou faixas, volte para rascunho.</Alert>}
      <TextInput label="Nome" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <div className="grid-2">
        {PARAMS.map((p) => (
          <SelectInput key={p.key} label={p.label} hint={p.hint} value={(form[p.key] as string | null) ?? ""} disabled={!draft}
            onChange={(e) => setForm({ ...form, [p.key]: e.target.value || null })}>
            <option value="">A confirmar</option>
            {p.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectInput>
        ))}
        <TextInput label="Dia de início do período (1–28)" type="number" min={1} max={28} disabled={!draft}
          value={form.period_start_day ?? ""} onChange={(e) => setForm({ ...form, period_start_day: e.target.value ? Number(e.target.value) : null })}
          hint="A confirmar com a direção (ex.: 1 = mês civil)." />
      </div>
      <div className="row">
        <Button variant="secondary" busy={action.busy} onClick={() => void saveParams()}>Salvar parâmetros</Button>
        {draft ? <Button busy={action.busy} onClick={() => void setStatus("ativo")}>Ativar plano</Button>
          : <Button variant="secondary" busy={action.busy} onClick={() => void setStatus("rascunho")}>Voltar para rascunho</Button>}
      </div>

      <section className="card">
        <h3>Faixas</h3>
        {extra.loading ? <Spinner /> : (
          <ul className="list">
            {extra.data!.tiers.map((t) => (
              <li key={String(t.min_achievement_pct)}>A partir de <strong>{formatPercent(Number(t.min_achievement_pct))}</strong> da meta:
                <strong> {formatPercent(Number(t.rate_pct), 3)}</strong>
                {draft && <button className="link-btn" onClick={async () => {
                  if (await action.run(async () => unwrap(await supabase.from("commission_plan_tiers").delete()
                    .eq("plan_id", plan.id).eq("min_achievement_pct", t.min_achievement_pct).select()))) void extra.reload();
                }}>remover</button>}</li>
            ))}
          </ul>
        )}
        {draft && (
          <div className="row">
            <TextInput label="A partir de (% da meta)" value={minPct} onChange={(e) => setMinPct(e.target.value)} inputMode="decimal" />
            <TextInput label="Taxa (%)" value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
            <Button variant="secondary" onClick={async () => {
              if (await action.run(async () => unwrap(await supabase.from("commission_plan_tiers").insert({
                plan_id: plan.id, min_achievement_pct: Number(minPct.replace(",", ".")), rate_pct: Number(rate.replace(",", ".")),
              }).select()))) { setMinPct(""); setRate(""); void extra.reload(); }
            }}>Adicionar faixa</Button>
          </div>
        )}
      </section>

      <section className="card">
        <h3>Metas por período</h3>
        {extra.data?.goals.length ? (
          <table className="table"><tbody>{extra.data.goals.map((g) => (
            <tr key={g.id}><td>{formatDate(g.period_start)} – {formatDate(g.period_end)}</td><td className="num">{formatMoney(g.goal_cents)}</td></tr>
          ))}</tbody></table>
        ) : <p className="muted">Nenhuma meta cadastrada.</p>}
        <div className="row">
          <TextInput label="Início" type="date" value={goalStart} onChange={(e) => setGoalStart(e.target.value)} />
          <TextInput label="Fim" type="date" value={goalEnd} onChange={(e) => setGoalEnd(e.target.value)} />
          <TextInput label="Meta (R$)" value={goalValue} onChange={(e) => setGoalValue(e.target.value)} inputMode="decimal" />
          <Button variant="secondary" disabled={!goalStart || !goalEnd || !parseMoney(goalValue)} onClick={async () => {
            if (await action.run(async () => unwrap(await supabase.from("commission_goals").insert({
              plan_id: plan.id, period_start: goalStart, period_end: goalEnd, goal_cents: parseMoney(goalValue)!,
            }).select()))) { setGoalValue(""); void extra.reload(); }
          }}>Adicionar meta</Button>
        </div>
      </section>
    </Modal>
  );
}

function CalculationTab() {
  const unit = useUnit();
  const { access } = useAuth();
  const [planId, setPlanId] = useState("");
  const [period, setPeriod] = useState("");
  const [manual, setManual] = useState("");
  const action = useAction();
  const data = useAsync(async () => {
    const [plans, goals, statements] = await Promise.all([
      supabase.from("commission_plans").select("*").eq("unit_id", unit.unit_id).order("name"),
      supabase.from("commission_goals").select("*").order("period_start", { ascending: false }),
      supabase.from("commission_statements").select("*").eq("unit_id", unit.unit_id).order("calculated_at", { ascending: false }).limit(200),
    ]);
    return { plans: unwrap(plans) as Plan[], goals: unwrap(goals) as Goal[], statements: unwrap(statements) as Statement[] };
  }, [unit.unit_id]);
  const plan = data.data?.plans.find((p) => p.id === planId);

  async function setStatus(s: Statement, status: string) {
    const reason = status === "cancelada" ? window.prompt("Motivo do cancelamento da apuração:") : null;
    if (status === "cancelada" && !reason) return;
    if (await action.run(async () => unwrap(await supabase.rpc("commission_set_status", {
      p_statement_id: s.id, p_status: status, p_reason: reason ?? undefined,
    })))) void data.reload();
  }

  return (
    <>
      <section className="card">
        <Alert kind="error">{action.error || data.error}</Alert>
        <div className="row wrap">
          <SelectInput label="Plano ativo" value={planId} onChange={(e) => { setPlanId(e.target.value); setPeriod(""); }}>
            <option value="">Selecione</option>
            {(data.data?.plans ?? []).filter((p) => p.status === "ativo" && p.beneficiary_id !== access?.user_id)
              .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectInput>
          <SelectInput label="Período (meta)" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="">Selecione</option>
            {(data.data?.goals ?? []).filter((g) => g.plan_id === planId).map((g) => (
              <option key={g.id} value={g.period_start}>{formatDate(g.period_start)} – {formatDate(g.period_end)} · meta {formatMoney(g.goal_cents)}</option>
            ))}
          </SelectInput>
          {plan?.revenue_source === "valor_informado" && (
            <TextInput label="Faturamento do período (R$)" value={manual} onChange={(e) => setManual(e.target.value)} />
          )}
          <Button busy={action.busy} disabled={!planId || !period} onClick={async () => {
            if (await action.run(async () => unwrap(await supabase.rpc("commission_calculate", {
              p_plan_id: planId, p_period_start: period, p_manual_revenue_cents: plan?.revenue_source === "valor_informado" ? parseMoney(manual) ?? undefined : undefined,
            })))) void data.reload();
          }}>Apurar</Button>
        </div>
        <p className="muted small">A aprovação deve ser feita por pessoa diferente de quem apurou. “Gerar pagamento” cria a despesa em Financeiro.</p>
      </section>
      {data.loading ? <Spinner /> : !data.data?.statements.length ? <Empty>Nenhuma apuração.</Empty> : (
        <StatementsTable rows={data.data.statements} planName={(id) => data.data!.plans.find((p) => p.id === id)?.name ?? "—"} actions={(s) => s.beneficiary_id === access?.user_id ? null : (
          <>
            {s.status === "calculada" && s.calculated_by !== access?.user_id && <Button variant="secondary" onClick={() => void setStatus(s, "aprovada")}>Aprovar</Button>}
            {s.status === "aprovada" && can(unit, "finance.manage") && <Button variant="secondary" onClick={() => void setStatus(s, "paga")}>Gerar pagamento</Button>}
            {(s.status === "calculada" || s.status === "aprovada") && <Button variant="ghost" onClick={() => void setStatus(s, "cancelada")}>Cancelar</Button>}
          </>
        )} />
      )}
    </>
  );
}
