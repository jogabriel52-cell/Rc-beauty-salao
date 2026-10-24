import { expect, test } from "@playwright/test";
import { admin, createPerson, login, run, seedCatalog, seedClient, unitId } from "./support";

const phoneDigits = (n: number) => `5511977${run.replace(/\D/g, "1").padEnd(6, "2").slice(0, 4)}${String(n).padStart(2, "0")}`;

test.describe("Fase 1 — operação diária", () => {
  test("Recepção agenda nova cliente, confirma, abre e finaliza comanda", async ({ page }) => {
    const recep = await createPerson("e2e-p1-recep", [{ unit: "geral", profile: "recepcao" }]);
    const vend = await createPerson("e2e-p1-vend", [{ unit: "geral", profile: "vendedora" }]);
    const cat = await seedCatalog("geral", { stock: 3 });
    await login(page, recep.email);

    await page.getByRole("link", { name: "Agenda" }).click();
    await page.getByRole("button", { name: `Agendar ${cat.names.professional} às 10:00` }).click();
    const modal = page.getByRole("dialog", { name: "Novo agendamento" });
    await modal.getByText("+ Cadastrar nova cliente").click();
    const nc = page.getByRole("dialog", { name: "Nova cliente" });
    await nc.getByLabel("Nome completo").fill(`Julia ${run}`);
    await nc.getByLabel("Telefone (WhatsApp)").fill(phoneDigits(1).slice(2));
    await nc.getByLabel("Observações de atendimento").fill("Cabelo sensível");
    await nc.getByRole("button", { name: "Salvar" }).click();
    await expect(modal.getByText(`Julia ${run}`)).toBeVisible();
    await modal.getByLabel("Serviço").selectOption({ label: `${cat.names.service} (60 min)` });
    await modal.getByRole("button", { name: "Salvar" }).click();

    const appt = page.getByRole("button", { name: `Agendamento Julia ${run}` });
    await expect(appt).toBeVisible();
    await appt.click();
    const details = page.getByRole("dialog", { name: "Agendamento" });
    await expect(details.getByText("Cabelo sensível")).toBeVisible();
    await details.getByRole("button", { name: "Confirmar" }).click();
    await page.getByRole("button", { name: `Agendamento Julia ${run}` }).click();
    await page.getByRole("dialog", { name: "Agendamento" }).getByRole("button", { name: "Abrir comanda" }).click();

    await expect(page.getByRole("heading", { name: /Comanda #\d+/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: /Corte/ })).toBeVisible();
    await page.getByLabel("Tipo").first().selectOption("produto");
    const opt = page.getByLabel("Produto").locator("option", { hasText: cat.names.product });
    await page.getByLabel("Produto").selectOption((await opt.getAttribute("value"))!);
    await page.getByRole("button", { name: "Adicionar item" }).click();
    await expect(page.getByRole("cell", { name: /Shampoo/ })).toBeVisible();
    await page.getByLabel("Quem vendeu").selectOption({ label: `Teste e2e-p1-vend` });
    await page.getByRole("button", { name: "Adicionar pagamento" }).click();
    await expect(page.getByText(/Pago R\$\s?130,00 de R\$\s?130,00/)).toBeVisible();
    await page.getByRole("button", { name: "Finalizar comanda" }).click();
    await expect(page.getByText("Finalizada").first()).toBeVisible();
    await expect(page.getByText("Teste e2e-p1-vend")).toBeVisible();

    const { data } = await admin().from("product_stock").select("quantity").eq("id", cat.productId).single();
    expect(data!.quantity).toBe(2);
    expect(vend.id).toBeTruthy();
  });

  test("Profissional vê só a própria agenda, com dados mínimos da cliente", async ({ page }) => {
    const prof = await createPerson("e2e-p1-prof", [{ unit: "geral", profile: "profissional" }]);
    const cat = await seedCatalog("geral", { professionalUser: prof.id });
    const cli = await seedClient("geral", `Paula ${run}`, phoneDigits(2), "Alergia a esmalte X");
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    await admin().from("appointments").insert({
      unit_id: await unitId("geral"), client_id: cli.clientUnitId, professional_id: cat.professionalId, service_id: cat.serviceId,
      starts_at: `${tomorrow}T15:00:00-03:00`, ends_at: `${tomorrow}T16:00:00-03:00`,
    });
    await login(page, prof.email);
    await expect(page.getByRole("heading", { name: "Minha agenda" })).toBeVisible();
    await expect(page.getByText(`Paula ${run}`)).toBeVisible();
    await expect(page.getByText("Atendimento: Alergia a esmalte X")).toBeVisible();
    await expect(page.getByText(/\(11\) 977/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Clientes" })).toHaveCount(0);
    await page.goto("/clientes");
    await expect(page.getByText("Nenhuma cliente encontrada.")).toBeVisible();
  });

  test("Recepção da VIP vê cadastro de outra unidade mascarado e vincula; Gerente revisa duplicidade", async ({ page, browser }) => {
    const recepVip = await createPerson("e2e-p1-recep-vip", [{ unit: "vip", profile: "recepcao" }]);
    const existing = await seedClient("geral", `Renata Alves ${run}`, phoneDigits(3));
    await login(page, recepVip.email);
    await page.getByRole("link", { name: "Clientes" }).click();
    await page.getByRole("button", { name: "Nova cliente" }).click();
    const nc = page.getByRole("dialog", { name: "Nova cliente" });
    await nc.getByLabel("Nome completo").fill("Renata");
    await nc.getByLabel("Telefone (WhatsApp)").fill(phoneDigits(3).slice(2));
    await nc.getByRole("button", { name: "Salvar" }).click();
    await expect(nc.getByText("Cadastro em outra unidade")).toBeVisible();
    await expect(nc.getByText(/^Renata \S\.$/)).toBeVisible();
    await expect(nc.getByText(`Renata Alves ${run}`)).toHaveCount(0);
    await nc.getByRole("button", { name: "Vincular a esta unidade" }).click();
    await expect(page.getByRole("heading", { name: `Renata Alves ${run}` })).toBeVisible();
    expect(existing.identityId).toBeTruthy();

    // Duplicidade dentro da Geral: mesmo telefone, dois cadastros
    const ger = await createPerson("e2e-p1-ger", [{ unit: "geral", profile: "gerente" }]);
    await seedClient("geral", `Sofia Lima ${run}`, phoneDigits(4));
    await seedClient("geral", `Sofia  Lima ${run}`, phoneDigits(4));
    const gpage = await (await browser.newContext()).newPage();
    await login(gpage, ger.email);
    await gpage.goto("/clientes/duplicidades");
    const row = gpage.getByRole("row", { name: new RegExp(`Sofia Lima ${run}`) });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Mesclar" }).click();
    await gpage.getByRole("dialog", { name: "Mesclar cadastros" }).getByRole("button", { name: "Confirmar mescla" }).click();
    await expect(gpage.getByRole("row", { name: new RegExp(`Sofia Lima ${run}`) })).toHaveCount(0);
  });

  test("Gerente cadastra serviço e produto, lança estoque e vê painel e relatórios", async ({ page }) => {
    const ger = await createPerson("e2e-p1-ger2", [{ unit: "vip", profile: "gerente" }]);
    await login(page, ger.email);
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();

    await page.getByRole("link", { name: "Serviços" }).click();
    await page.getByRole("button", { name: "Novo serviço" }).click();
    let m = page.getByRole("dialog", { name: "Novo serviço" });
    await m.getByLabel("Nome").fill(`Extensão de cílios ${run}`);
    await m.getByLabel("Duração (min)").fill("120");
    await m.getByLabel("Preço (R$)").fill("250,00");
    await m.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("cell", { name: `Extensão de cílios ${run}` })).toBeVisible();

    await page.getByRole("link", { name: "Estoque" }).click();
    await page.getByRole("button", { name: "Novo produto" }).click();
    m = page.getByRole("dialog", { name: "Novo produto" });
    await m.getByLabel("Nome").fill(`Cola de cílios ${run}`);
    await m.getByLabel("Preço de venda (R$)").fill("80");
    await m.getByLabel("Estoque mínimo").fill("2");
    await m.getByRole("button", { name: "Salvar" }).click();
    const row = page.getByRole("row", { name: new RegExp(`Cola de cílios ${run}`) });
    await expect(row.getByText("abaixo do mínimo")).toBeVisible();
    await row.getByRole("button", { name: "Lançar" }).click();
    m = page.getByRole("dialog", { name: /Lançar estoque/ });
    await m.getByLabel("Quantidade").fill("10");
    await m.getByRole("button", { name: "Lançar" }).click();
    await expect(page.getByRole("row", { name: new RegExp(`Cola de cílios ${run}`) }).getByText("abaixo do mínimo")).toHaveCount(0);

    await page.getByRole("link", { name: "Relatórios" }).click();
    await expect(page.getByText("Faturamento").first()).toBeVisible();
  });
});
