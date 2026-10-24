import { expect, test } from "@playwright/test";
import { admin, completeMfaEnrollment, createPerson, login, run, seedCatalog, seedClient, unitId } from "./support";

const cents = 100000 + (parseInt(run.replace(/\D/g, "").slice(0, 4) || "1", 10) % 9000) * 10; // valor único por execução
const brl = (c: number) => (c / 100).toFixed(2).replace(".", ",");

test("Gerente lança despesa, importa extrato CSV e concilia; fluxo de caixa mostra a saída", async ({ page }) => {
  const ger = await createPerson("e2e-p3-ger", [{ unit: "geral", profile: "gerente" }]);
  await login(page, ger.email);
  await page.getByRole("link", { name: "Financeiro" }).click();

  await page.getByRole("tab", { name: "Contas e categorias" }).click();
  const accounts = page.locator("section", { has: page.getByRole("heading", { name: "Contas" }) });
  await accounts.getByLabel("Nome").fill(`Banco ${run}`);
  await accounts.getByRole("button", { name: "Adicionar conta" }).click();
  await expect(page.getByText(`Banco ${run}`)).toBeVisible();

  await page.getByRole("tab", { name: "Lançamentos" }).click();
  await page.getByLabel("Mês de vencimento").fill("2031-01");
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  const m = page.getByRole("dialog", { name: "Novo lançamento" });
  await m.getByLabel("Categoria").selectOption({ label: "Aluguel" });
  await m.getByLabel("Descrição").fill(`Aluguel ${run}`);
  await m.getByLabel("Valor (R$)").fill(brl(cents));
  await m.getByLabel("Vencimento", { exact: true }).fill("2031-01-05");
  await m.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`Aluguel ${run}`) }).getByText("previsto")).toBeVisible();

  await page.getByRole("tab", { name: "Conciliação" }).click();
  await page.getByLabel("Conta").selectOption({ label: `Banco ${run} (banco)` });
  await page.getByRole("button", { name: "Importar extrato (CSV)" }).click();
  const imp = page.getByRole("dialog", { name: "Importar extrato" });
  const csv = `Data;Histórico;Valor\n06/01/2031;PAG ALUGUEL ${run};-${brl(cents)}\n07/01/2031;TARIFA ${run};-12,90\n`;
  await imp.getByLabel("Arquivo CSV do banco ou da adquirente").setInputFiles({ name: `extrato-${run}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) });
  await imp.getByLabel("Coluna da data").selectOption("Data");
  await imp.getByLabel("Coluna da descrição").selectOption("Histórico");
  await imp.getByLabel("Coluna do valor").selectOption("Valor");
  await expect(imp.getByText("2 linhas válidas")).toBeVisible();
  await imp.getByRole("button", { name: "Importar 2 linhas" }).click();

  const line = page.getByRole("row", { name: new RegExp(`PAG ALUGUEL ${run}`) });
  await line.getByRole("button", { name: "Conciliar" }).click();
  const sug = page.getByRole("dialog", { name: "Conciliar linha" });
  await expect(sug.getByText(`Aluguel ${run}`)).toBeVisible();
  await sug.getByRole("button", { name: "Conciliar com este" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`PAG ALUGUEL ${run}`) })).toHaveCount(0);

  const fee = page.getByRole("row", { name: new RegExp(`TARIFA ${run}`) });
  await fee.getByRole("button", { name: "Criar lançamento" }).click();
  const cf = page.getByRole("dialog", { name: "Criar lançamento a partir da linha" });
  await cf.getByLabel("Categoria").selectOption({ label: "Tarifas bancárias e de cartão" });
  await cf.getByRole("button", { name: "Criar e conciliar" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`TARIFA ${run}`) })).toHaveCount(0);

  await page.getByRole("tab", { name: "Lançamentos" }).click();
  await page.getByLabel("Mês de vencimento").fill("2031-01");
  await expect(page.getByRole("row", { name: new RegExp(`Aluguel ${run}`) }).getByText("pago")).toBeVisible();

  await page.getByRole("tab", { name: "Fluxo de caixa" }).click();
  await page.getByLabel("De", { exact: true }).fill("2031-01-01");
  await page.getByLabel("Até", { exact: true }).fill("2031-01-31");
  await expect(page.getByRole("row", { name: /06\/01\/2031/ })).toBeVisible();
});

test("Comissões: parâmetros a confirmar, apuração, aprovação por outra pessoa e vendedora vê a própria", async ({ browser }) => {
  const dirA = await createPerson("e2e-p3-dirA", [{ unit: "geral", profile: "direcao" }, { unit: "vip", profile: "direcao" }]);
  const dirB = await createPerson("e2e-p3-dirB", [{ unit: "geral", profile: "direcao" }, { unit: "vip", profile: "direcao" }]);
  const vend = await createPerson("e2e-p3-vend", [{ unit: "geral", profile: "vendedora" }]);
  const cat = await seedCatalog("geral");
  const cli = await seedClient("geral", `Cliente comissão ${run}`, null);
  const geral = await unitId("geral");
  const a = admin();
  const sale = await a.from("sales").insert({ unit_id: geral, client_unit_id: cli.clientUnitId, opened_by: vend.id, sold_by: vend.id } as never)
    .select("id").single();
  await a.from("sale_items").insert({ unit_id: geral, sale_id: sale.data!.id, kind: "servico", service_id: cat.serviceId, quantity: 5 } as never);
  await a.from("sale_payments").insert({ unit_id: geral, sale_id: sale.data!.id, method: "pix", amount_cents: 40000 } as never);
  await a.from("sales").update({ status: "finalizada", finalized_at: "2031-03-10T15:00:00-03:00", finalized_by: vend.id } as never).eq("id", sale.data!.id);

  const pa = await (await browser.newContext()).newPage();
  await login(pa, dirA.email);
  await completeMfaEnrollment(pa);
  await pa.getByRole("link", { name: "Comissões" }).click();
  await pa.getByRole("button", { name: "Novo plano a partir de modelo" }).click();
  const np = pa.getByRole("dialog", { name: "Novo plano de comissão" });
  await np.getByLabel("Modelo").selectOption("meta_individual_referencia");
  await np.getByLabel("Pessoa beneficiária").selectOption({ label: vend.fullName });
  await np.getByLabel("Nome do plano").fill(`Vendedora ${run}`);
  await np.getByRole("button", { name: "Criar rascunho" }).click();

  const ed = pa.getByRole("dialog", { name: new RegExp(`Vendedora ${run}`) });
  await expect(ed.getByText(/A confirmar: fonte do faturamento/)).toBeVisible();
  await ed.getByRole("button", { name: "Ativar plano" }).click();
  await expect(ed.getByText(/Defina antes de ativar/)).toBeVisible();
  await ed.getByLabel("Fonte do faturamento").selectOption("comandas_finalizadas");
  await ed.getByLabel("Base de cálculo").selectOption("vendas_do_beneficiario");
  await ed.getByLabel("Itens considerados").selectOption("todos");
  await ed.getByLabel("Valor considerado").selectOption("liquido_comanda");
  await ed.getByLabel("Período", { exact: true }).selectOption("mensal");
  await ed.getByLabel("Estornos").selectOption("excluir_canceladas_ate_apuracao");
  await ed.getByLabel("Aplicação das faixas").selectOption("faixa_sobre_total");
  await ed.getByLabel("Dia de início do período (1–28)").fill("1");
  await ed.getByRole("button", { name: "Salvar parâmetros" }).click();
  await ed.getByRole("button", { name: "Ativar plano" }).click();
  await expect(ed.getByText("Plano ativo: para mudar regras ou faixas, volte para rascunho.")).toBeVisible();
  await ed.getByLabel("Início", { exact: true }).fill("2031-03-01");
  await ed.getByLabel("Fim", { exact: true }).fill("2031-03-31");
  await ed.getByLabel("Meta (R$)").fill("1000,00");
  await ed.getByRole("button", { name: "Adicionar meta" }).click();
  await expect(ed.getByText("R$ 1.000,00").or(ed.getByText("R$ 1.000,00"))).toBeVisible();
  await ed.getByRole("button", { name: "Fechar" }).click();

  await pa.getByRole("tab", { name: "Apuração" }).click();
  await pa.getByLabel("Plano ativo").selectOption({ label: `Vendedora ${run}` });
  await pa.getByLabel("Período (meta)").selectOption({ index: 1 });
  await pa.getByRole("button", { name: "Apurar" }).click();
  const row = pa.getByRole("row", { name: new RegExp(`Vendedora ${run}`) });
  await expect(row.getByText("calculada")).toBeVisible();
  await expect(row.getByText(/R\$\s?3,20/)).toBeVisible(); // 0,8% de R$ 400,00
  await expect(row.getByRole("button", { name: "Aprovar" })).toHaveCount(0);

  const pb = await (await browser.newContext()).newPage();
  await login(pb, dirB.email);
  await completeMfaEnrollment(pb);
  await pb.goto("/comissoes");
  await pb.getByRole("tab", { name: "Apuração" }).click();
  const rowB = pb.getByRole("row", { name: new RegExp(`Vendedora ${run}`) });
  await rowB.getByRole("button", { name: "Aprovar" }).click();
  await rowB.getByRole("button", { name: "Gerar pagamento" }).click();
  await expect(rowB.getByText("paga")).toBeVisible();

  const pv = await (await browser.newContext()).newPage();
  await login(pv, vend.email);
  await pv.getByRole("link", { name: "Comissões" }).click();
  await expect(pv.getByRole("tab", { name: "Minhas comissões" })).toBeVisible();
  await expect(pv.getByRole("row", { name: /01\/03\/2031 – 31\/03\/2031/ }).getByText(/R\$\s?3,20/)).toBeVisible();
  await expect(pv.getByRole("tab", { name: "Regras e metas" })).toHaveCount(0);
});
