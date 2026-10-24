import { expect, test } from "@playwright/test";
import { completeMfaEnrollment, createPerson, login, run, seedClient } from "./support";

const digits = run.replace(/\D/g, "3").padEnd(4, "4").slice(0, 4);
const csv = [
  "Código;Cliente;Celular;E-mail;Nascimento;Observação",
  `F-${run}-1;Amanda ${run};(11) 9${digits}-0101;amanda.${run}@teste.invalid;05/03/1991;Prefere manhã`,
  `F-${run}-2;Bruna ${run};11 9${digits}-0102;;12/07/1985;`,
  `F-${run}-3;;(11) 9${digits}-0103;;;Linha sem nome`,
  `F-${run}-1;Amanda ${run};(11) 9${digits}-0101;;;Repetida`,
  `F-${run}-5;Lia Conhecida ${run};;;;`,
].join("\n");
const file = { name: `clientes-${run}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") };

test("Importação Trinks: mapeamento conferido por outra pessoa, prévia, decisão e confirmação", async ({ browser }) => {
  const dirA = await createPerson("e2e-p2-dirA", [{ unit: "geral", profile: "direcao" }, { unit: "vip", profile: "direcao" }]);
  const dirB = await createPerson("e2e-p2-dirB", [{ unit: "geral", profile: "direcao" }, { unit: "vip", profile: "direcao" }]);
  await seedClient("geral", `Lia Conhecida ${run}`, `5511966${digits}99`);

  const a = await (await browser.newContext()).newPage();
  await login(a, dirA.email);
  await completeMfaEnrollment(a);
  await a.getByRole("link", { name: "Importação Trinks" }).click();
  await a.getByRole("tab", { name: "Mapeamentos" }).click();
  await a.getByRole("button", { name: "Novo mapeamento a partir de um arquivo" }).click();
  const ed = a.getByRole("dialog", { name: "Novo mapeamento" });
  await ed.getByLabel("Nome").fill(`Trinks ${run}`);
  await ed.getByLabel("Exportação do Trinks (para ler os cabeçalhos)").setInputFiles(file);
  await ed.getByLabel("Nome da cliente *").selectOption("Cliente");
  await ed.getByLabel("Telefone/celular").selectOption("Celular");
  await ed.getByLabel("E-mail").selectOption("E-mail");
  await ed.getByLabel("Data de nascimento").selectOption("Nascimento");
  await ed.getByLabel("Código da cliente no Trinks").selectOption("Código");
  await ed.getByLabel("Observações (viram nota privada de CRM)").selectOption("Observação");
  await expect(ed.getByRole("cell", { name: `Amanda ${run}` })).toBeVisible();
  await ed.getByRole("button", { name: "Salvar rascunho" }).click();
  const mapRow = a.getByRole("row", { name: new RegExp(`Trinks ${run}`) });
  await expect(mapRow.getByText("Outra pessoa deve conferir")).toBeVisible();

  const b = await (await browser.newContext()).newPage();
  await login(b, dirB.email);
  await completeMfaEnrollment(b);
  await b.goto("/importacao");
  await b.getByRole("tab", { name: "Mapeamentos" }).click();
  await b.getByRole("row", { name: new RegExp(`Trinks ${run}`) }).getByRole("button", { name: "Conferido — aprovar" }).click();
  await expect(b.getByRole("row", { name: new RegExp(`Trinks ${run}`) }).getByText(/Aprovado em/)).toBeVisible();

  await a.reload();
  await a.getByRole("tab", { name: "Importar" }).click();
  await a.getByLabel("Mapeamento aprovado").selectOption({ label: `Trinks ${run}` });
  await a.getByLabel("Arquivo CSV exportado do Trinks").setInputFiles(file);
  await expect(a.getByText(/5 linhas · codificação utf-8 · separador “;”/)).toBeVisible();
  await a.getByRole("button", { name: "Gerar prévia" }).click();

  await expect(a.locator(".stat-label", { hasText: "Aguardando decisão" })).toBeVisible();
  await expect(a.getByRole("button", { name: "Confirmar importação" })).toBeDisabled();
  const lia = a.getByRole("row", { name: new RegExp(`Lia Conhecida ${run}`) });
  await expect(lia.getByText("Possível duplicidade")).toBeVisible();
  await lia.getByLabel(/Decisão da linha/).selectOption("ignorar");
  await expect(a.getByRole("button", { name: "Confirmar importação" })).toBeEnabled();
  await expect(a.getByRole("row", { name: /Repetida no arquivo/ })).toBeVisible();
  await a.getByRole("button", { name: "Confirmar importação" }).click();
  await expect(a.getByText("Importação confirmada: 2 cadastros criados, 0 vinculados, 3 linhas ignoradas.")).toBeVisible();

  await a.goto("/clientes");
  await a.getByLabel("Buscar clientes").fill(`Amanda ${run}`);
  await a.getByRole("link", { name: `Amanda ${run}` }).click();
  await expect(a.getByText("Importado do Trinks: Prefere manhã")).toBeVisible();

  // O mesmo arquivo não é importado de novo na unidade
  await a.goto("/importacao");
  await a.getByLabel("Mapeamento aprovado").selectOption({ label: `Trinks ${run}` });
  await a.getByLabel("Arquivo CSV exportado do Trinks").setInputFiles(file);
  await a.getByRole("button", { name: "Gerar prévia" }).click();
  await expect(a.getByText("Este arquivo já foi importado nesta unidade")).toBeVisible();
});
