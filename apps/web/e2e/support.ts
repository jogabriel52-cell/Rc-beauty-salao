// Apoio aos testes E2E: reaproveita os helpers dos testes de integração
// (usuários reais na stack local) e oferece ações comuns de interface.
import { expect, type Page } from "@playwright/test";
import { env, PASSWORD, totp } from "../../../tests/integration/helpers";

export * from "../../../tests/integration/helpers";

export async function login(page: Page, email: string) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/entrar/);
}

// Conclui o cadastro de MFA pela interface; retorna o segredo TOTP.
export async function completeMfaEnrollment(page: Page): Promise<string> {
  await expect(page.getByRole("heading", { name: "Verificação em duas etapas" })).toBeVisible();
  await page.getByText("Não consegue escanear? Digite a chave").click();
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await page.getByLabel("Código").fill(totp(secret));
  await page.getByRole("button", { name: "Verificar" }).click();
  return secret;
}

export async function latestMailLink(to: string): Promise<string> {
  const base = env().MAILPIT_URL;
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const data = (await res.json()) as { messages?: { ID: string }[] };
    if (data.messages?.length) {
      const msg = await (await fetch(`${base}/api/v1/message/${data.messages[0]!.ID}`)).json() as { HTML: string; Text: string };
      const m = (msg.HTML || msg.Text).match(/href="([^"]+verify[^"]+)"/) ?? msg.Text.match(/(http\S+verify\S+)/);
      if (m) return m[1]!.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Nenhum e-mail para ${to}`);
}
