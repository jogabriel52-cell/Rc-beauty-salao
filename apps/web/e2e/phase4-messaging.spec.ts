import { expect, test } from "@playwright/test";
import { admin, completeMfaEnrollment, createPerson, login, run, seedCatalog, seedClient, unitId } from "./support";

// Fase 4 na unidade VIP (os testes de integração usam o canal da Geral).
const digits = run.replace(/\D/g, "4").padEnd(8, "6").slice(0, 8);
const phoneNumberId = `80${digits}`;
const clientPhone = `55116${digits}`;

test.afterAll(async () => {
  await admin().from("messaging_channels").update({
    status: "desativado", ai_enabled: false, phone_number_id: null, display_phone: null, consent_text: null,
    credentials_verified_at: null, webhook_verified_at: null, test_message_at: null,
  }).eq("unit_id", await unitId("vip"));
});

test("Direção configura o canal; sem credencial oficial a verificação falha e o envio não pode ser ativado", async ({ page }) => {
  const dir = await createPerson("e2e-p4-dir", [{ unit: "vip", profile: "direcao" }]);
  await login(page, dir.email);
  await completeMfaEnrollment(page);
  await page.getByRole("link", { name: "Mensagens" }).click();
  await expect(page.getByText(/Envio desativado/)).toBeVisible();
  await page.getByRole("link", { name: "Configurar canal" }).click();

  await expect(page.getByRole("button", { name: "Ativar envio" })).toBeDisabled();
  await page.getByLabel("Número exibido (com DDI e DDD)").fill("5511900000000");
  await page.getByLabel("ID do número (phone_number_id)").fill(phoneNumberId);
  await page.getByLabel("Texto de consentimento apresentado à cliente").fill(
    "Autorizo o salão a me enviar mensagens pelo WhatsApp. Para sair, responda PARAR.");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Dados salvos.")).toBeVisible();

  await page.getByRole("button", { name: "Verificar credencial" }).click();
  await expect(page.getByText("Credencial oficial do WhatsApp ausente para a unidade")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ativar envio" })).toBeDisabled();

  await page.getByRole("button", { name: "Novo modelo" }).click();
  const m = page.getByRole("dialog", { name: "Novo modelo" });
  await m.getByLabel("Nome (igual ao da Meta: minúsculas, números e _)").fill(`retorno_${digits}`);
  await m.getByLabel("Texto (variáveis como {{1}})").fill("Olá {{1}}, sentimos sua falta! Quer agendar um horário?");
  await m.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`retorno_${digits}`) }).getByText("Rascunho")).toBeVisible();
});

test("Vendedora vê a conversa recebida, salva rascunho (envio bloqueado) e registra consentimento", async ({ page }) => {
  const vend = await createPerson("e2e-p4-vend", [{ unit: "vip", profile: "vendedora" }]);
  const vip = await unitId("vip");
  const cli = await seedClient("vip", `Paula ${run}`, clientPhone);
  const a = admin();
  const conv = await a.from("conversations").insert({
    unit_id: vip, client_unit_id: cli.clientUnitId, contact_phone: clientPhone, contact_name: `Paula ${run}`,
    last_inbound_at: new Date().toISOString(), last_message_at: new Date().toISOString(),
  }).select("id").single();
  if (conv.error) throw conv.error;
  await a.from("messages").insert({ unit_id: vip, conversation_id: conv.data.id, direction: "entrada", body: `Tem horário sábado? ${run}`, status: "recebida" });

  await login(page, vend.email);
  await page.getByRole("link", { name: "Mensagens" }).click();
  await expect(page.getByText(/Envio desativado/)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`Paula ${run}`) }).click();
  await expect(page.getByText(`Tem horário sábado? ${run}`)).toBeVisible();
  await page.getByLabel("Mensagem").fill("Temos sim! Prefere manhã ou tarde?");
  await expect(page.getByRole("button", { name: "Enviar" })).toBeDisabled();
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByText("Rascunho salvo.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Rascunhos" }).getByText("Temos sim! Prefere manhã ou tarde?")).toBeVisible();

  await page.getByRole("link", { name: "ver cliente" }).click();
  await page.getByRole("tab", { name: "Consentimento" }).click();
  await page.getByLabel("Finalidade").selectOption("marketing");
  await page.getByLabel("Evidência (ex.: ficha assinada nº, print, formulário)").fill(`Ficha ${run}`);
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: `Ficha ${run}` })).toBeVisible();
  await expect(page.getByRole("group", { name: "Situação do consentimento" })).toContainText("Marketing: Autorizou");
});

test("Gerente cria e conclui follow-up, gera reengajamento e registra avaliação (NPS)", async ({ page }) => {
  const ger = await createPerson("e2e-p4-ger", [{ unit: "vip", profile: "gerente" }]);
  const vip = await unitId("vip");
  const cat = await seedCatalog("vip");
  const visited = await seedClient("vip", `Renata ${run}`, null);
  await seedClient("vip", `Sumida ${run}`, null);
  const a = admin();
  const start = new Date(Date.now() - 3 * 3600 * 1000);
  const appt = await a.from("appointments").insert({
    unit_id: vip, client_id: visited.clientUnitId, professional_id: cat.professionalId, service_id: cat.serviceId,
    starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3600 * 1000).toISOString(),
  }).select("id").single();
  if (appt.error) throw appt.error;
  await a.from("appointments").update({ status: "concluido" }).eq("id", appt.data.id);

  await login(page, ger.email);

  // Follow-up a partir da ficha da cliente.
  await page.getByRole("link", { name: "Clientes" }).click();
  await page.getByPlaceholder(/nome ou telefone/i).first().fill(`Renata ${run}`);
  await page.getByRole("link", { name: `Renata ${run}` }).click();
  await page.getByRole("button", { name: "Novo follow-up" }).click();
  const nf = page.getByRole("dialog", { name: "Novo follow-up" });
  await nf.getByLabel("Motivo").fill(`Oferecer hidratação ${run}`);
  await nf.getByRole("button", { name: "Salvar" }).click();
  await expect(nf).toHaveCount(0);

  await page.getByRole("link", { name: "Follow-ups" }).click();
  const row = page.getByRole("row", { name: new RegExp(`Oferecer hidratação ${run}`) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Concluir" }).click();
  const cf = page.getByRole("dialog", { name: "Concluir follow-up" });
  await cf.getByLabel("Resultado do contato").fill("Agendou para a semana que vem");
  await cf.getByRole("button", { name: "Marcar como feito" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`Oferecer hidratação ${run}`) })).toHaveCount(0);
  await page.getByRole("tab", { name: "Feito" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`Oferecer hidratação ${run}`) })).toBeVisible();

  // Reengajamento: cliente sem visita entra na lista; a que veio hoje não.
  await page.getByRole("link", { name: "Reengajamento" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`Sumida ${run}`) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(`Renata ${run}`) })).toHaveCount(0);
  await page.getByLabel(`Selecionar Sumida ${run}`).check();
  await page.getByRole("button", { name: "Criar follow-ups" }).click();
  await expect(page.getByText("1 follow-up(s) criados.")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(`Sumida ${run}`) }).getByRole("cell").last()).toHaveText("1");

  // Pesquisa de satisfação.
  await page.getByRole("link", { name: "Pesquisas" }).click();
  await page.getByRole("button", { name: "Nova pesquisa" }).click();
  const ns = page.getByRole("dialog", { name: "Nova pesquisa" });
  await ns.getByLabel("Nome").fill(`NPS ${run}`);
  await ns.getByRole("button", { name: "Criar" }).click();
  await expect(ns).toHaveCount(0);
  await page.getByLabel("Pesquisa", { exact: true }).selectOption({ label: `NPS ${run}` });
  const cand = page.getByRole("row", { name: new RegExp(`Renata ${run}`) });
  await cand.getByRole("button", { name: "Registrar resposta" }).click();
  const rm = page.getByRole("dialog", { name: `Avaliação — Renata ${run}` });
  await rm.getByRole("radio", { name: "10" }).click();
  await rm.getByLabel("Comentário").fill("Atendimento excelente");
  await rm.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`Renata ${run}`) })).toHaveCount(0);
  await expect(page.locator(".stat", { hasText: "NPS" }).locator(".stat-value")).toHaveText("100");
});
