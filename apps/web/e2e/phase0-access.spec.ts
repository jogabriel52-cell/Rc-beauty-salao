import { expect, test } from "@playwright/test";
import { completeMfaEnrollment, createPerson, latestMailLink, login, run, testEmail } from "./support";

test.describe("Fase 0 — acesso", () => {
  test("Recepção entra e não vê administração", async ({ page }) => {
    const recep = await createPerson("e2e-recep", [{ unit: "geral", profile: "recepcao" }]);
    await login(page, recep.email);
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
    await expect(page.getByLabel("Unidade ativa")).toHaveValue(/.+/);
    await expect(page.getByRole("link", { name: "Pessoas e acessos" })).toHaveCount(0);
    await page.goto("/configuracoes/pessoas");
    await expect(page.getByText("Nenhuma pessoa encontrada.")).toBeVisible();
  });

  test("Direção cadastra MFA, convida, aplica exceção e desativa; convidada define senha", async ({ page, browser }) => {
    const dir = await createPerson("e2e-direcao", [{ unit: "geral", profile: "direcao" }, { unit: "vip", profile: "direcao" }]);
    await login(page, dir.email);
    await completeMfaEnrollment(page);
    await expect(page.getByRole("link", { name: "Pessoas e acessos" })).toBeVisible();

    // Convite
    const email = testEmail("e2e-convidada");
    await page.getByRole("link", { name: "Pessoas e acessos" }).click();
    await page.getByRole("button", { name: "Convidar pessoa" }).click();
    const dialog = page.getByRole("dialog", { name: "Convidar pessoa" });
    await dialog.getByLabel("Nome completo").fill(`Convidada ${run}`);
    await dialog.getByLabel("E-mail").fill(email);
    await dialog.getByLabel("Cargo (opcional)").fill("Manicure");
    await dialog.getByLabel("RC Beauty Geral").selectOption({ label: "Profissional" });
    await dialog.getByRole("button", { name: "Enviar convite" }).click();
    await expect(dialog.getByText("Convite enviado por e-mail.")).toBeVisible();
    await dialog.getByRole("button", { name: "Concluir" }).click();
    const row = page.getByRole("row", { name: new RegExp(`Convidada ${run}`) });
    await expect(row.getByText("Convite pendente")).toBeVisible();

    // Convidada aceita o convite e define a senha
    const link = await latestMailLink(email);
    const guest = await (await browser.newContext()).newPage();
    await guest.goto(link);
    await expect(guest.getByRole("heading", { name: "Definir senha" })).toBeVisible();
    await guest.getByLabel("Nova senha").fill("SenhaNova12345");
    await guest.getByLabel("Confirmar senha").fill("SenhaNova12345");
    await guest.getByRole("button", { name: "Salvar senha" }).click();
    await expect(guest.getByRole("heading", { name: "Minha agenda" })).toBeVisible();

    // Exceção individual
    await row.getByRole("button", { name: "Abrir" }).click();
    const person = page.getByRole("dialog", { name: `Convidada ${run}` });
    await person.getByLabel("Permissão").selectOption("audit.view");
    await person.getByLabel("Motivo").first().fill("Acompanhar alterações");
    await person.getByRole("button", { name: "Adicionar exceção" }).click();
    await expect(person.getByText("Acompanhar alterações")).toBeVisible();

    // Desativação
    await person.getByLabel("Motivo").last().fill("Teste de desligamento");
    await person.getByRole("button", { name: "Desativar" }).click();
    await expect(person.getByText(/Desativada em/)).toBeVisible();

    // A convidada perde o acesso imediatamente
    await guest.reload();
    await expect(guest.getByText(/Acesso não liberado|Entrar/).first()).toBeVisible();
  });

  test("Direção não altera o próprio perfil de acesso", async ({ page }) => {
    const dir = await createPerson("e2e-direcao2", [{ unit: "geral", profile: "direcao" }, { unit: "vip", profile: "direcao" }]);
    await login(page, dir.email);
    await completeMfaEnrollment(page);
    await page.getByRole("link", { name: "Perfis de acesso" }).click();
    await page.getByRole("button", { name: /^Direção/ }).click();
    await expect(page.getByText("Você possui este perfil e não pode alterá-lo.")).toBeVisible();
    await page.getByRole("button", { name: /^Recepção/ }).click();
    await expect(page.getByRole("button", { name: "Salvar perfil" })).toBeVisible();
  });
});
