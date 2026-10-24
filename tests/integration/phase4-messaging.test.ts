// Fase 4 — WhatsApp oficial e SDR IA nas Edge Functions da stack local.
// Sem credenciais oficiais (token da Graph API, chave da IA): as funções devem
// recusar com 503 e nada é enviado. O webhook usa segredos FICTÍCIOS locais
// (supabase/functions/.env) para testar assinatura, ingestão e opt-out.
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, callFunction, createPerson, enrollMfa, env, run, seedClient, signIn, unitId } from "./helpers";

function localSecret(name: string): string {
  const line = readFileSync(new URL("../../supabase/functions/.env", import.meta.url), "utf8")
    .split("\n").find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} ausente em supabase/functions/.env`);
  return line.slice(name.length + 1).trim();
}

const digits = run.replace(/\D/g, "7").padEnd(8, "3").slice(0, 8);
const phoneNumberId = `90${digits}`;
const phoneOptOut = `55118${digits}`;
const phoneOk = `55117${digits}`;
const phoneUnknown = `55115${digits}`;

let geral: string;
let vend: SupabaseClient;
let dir: SupabaseClient;

function webhookUrl(query = ""): string {
  return `${env().API_URL}/functions/v1/whatsapp-webhook${query}`;
}

function inbound(from: string, body: string, id = `wamid.${randomUUID()}`) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "0",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "5511900000000", phone_number_id: phoneNumberId },
          contacts: [{ profile: { name: "Contato Teste" }, wa_id: from }],
          messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body } }],
        },
      }],
    }],
  };
}

async function postWebhook(payload: unknown, signature?: string) {
  const raw = JSON.stringify(payload);
  const sig = signature ?? `sha256=${createHmac("sha256", localSecret("WHATSAPP_APP_SECRET")).update(raw).digest("hex")}`;
  const res = await fetch(webhookUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig },
    body: raw,
  });
  return { status: res.status, text: await res.text() };
}

async function conversation(phone: string) {
  const { data } = await admin().from("conversations").select("id, client_unit_id").eq("unit_id", geral).eq("contact_phone", phone);
  return data?.[0] as { id: string; client_unit_id: string | null } | undefined;
}

async function consent(clientUnitId: string, purpose: string) {
  const { data } = await admin().rpc("consent_status", { p_client_unit_id: clientUnitId, p_purpose: purpose });
  return data as string;
}

let optOutClient: Awaited<ReturnType<typeof seedClient>>;

beforeAll(async () => {
  geral = await unitId("geral");
  const v = await createPerson("p4-vend", [{ unit: "geral", profile: "vendedora" }]);
  const d = await createPerson("p4-dir", [{ unit: "geral", profile: "direcao" }]);
  optOutClient = await seedClient("geral", `Bia ${run}`, phoneOptOut);
  await seedClient("geral", `Cris ${run}`, phoneOk);
  const r = await admin().from("messaging_channels")
    .update({ phone_number_id: phoneNumberId, status: "desativado", ai_enabled: false }).eq("unit_id", geral);
  if (r.error) throw r.error;
  vend = await signIn(v.email);
  dir = await signIn(d.email);
  await enrollMfa(dir);
});

afterAll(async () => {
  await admin().from("messaging_channels").update({
    status: "desativado", ai_enabled: false, phone_number_id: null,
    credentials_verified_at: null, webhook_verified_at: null, test_message_at: null,
  }).eq("unit_id", geral);
});

describe("webhook do WhatsApp", () => {
  it("verificação recusa token errado e aceita o token configurado", async () => {
    const bad = await fetch(webhookUrl("?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=123"));
    expect(bad.status).toBe(403);
    const token = encodeURIComponent(localSecret("WHATSAPP_VERIFY_TOKEN"));
    const ok = await fetch(webhookUrl(`?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=desafio-42`));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("desafio-42");
    const { data } = await admin().from("messaging_channels").select("webhook_verified_at").eq("unit_id", geral).single();
    expect(data!.webhook_verified_at).not.toBeNull();
  });

  it("assinatura inválida é recusada sem gravar nada", async () => {
    const res = await postWebhook(inbound(phoneOptOut, "Oi"), `sha256=${"0".repeat(64)}`);
    expect(res.status).toBe(401);
    const missing = await postWebhook(inbound(phoneOptOut, "Oi"), "");
    expect(missing.status).toBe(401);
    expect(await conversation(phoneOptOut)).toBeUndefined();
  });

  it("mensagem assinada cria conversa ligada à cliente pelo telefone; reentrega não duplica", async () => {
    const payload = inbound(phoneOptOut, "Oi, queria agendar");
    expect((await postWebhook(payload)).status).toBe(200);
    expect((await postWebhook(payload)).status).toBe(200);
    const conv = await conversation(phoneOptOut);
    expect(conv?.client_unit_id).toBe(optOutClient.clientUnitId);
    const { data } = await admin().from("messages").select("direction, status, body").eq("conversation_id", conv!.id);
    expect(data).toEqual([{ direction: "entrada", status: "recebida", body: "Oi, queria agendar" }]);
  });

  it("palavra-chave PARAR registra opt-out das duas finalidades", async () => {
    expect((await postWebhook(inbound(phoneOptOut, " parar "))).status).toBe(200);
    expect(await consent(optOutClient.clientUnitId, "marketing")).toBe("opt_out");
    expect(await consent(optOutClient.clientUnitId, "atendimento")).toBe("opt_out");
  });
});

describe("envio (whatsapp-send)", () => {
  it("sem sessão: 401", async () => {
    const conv = await conversation(phoneOptOut);
    const res = await callFunction("whatsapp-send", { conversation_id: conv!.id, body: "Olá" });
    expect(res.status).toBe(401);
  });

  it("canal não ativado: 503 e nenhuma mensagem enviada", async () => {
    const conv = await conversation(phoneOptOut);
    const res = await callFunction("whatsapp-send", { conversation_id: conv!.id, body: "Olá" }, vend);
    expect(res.status).toBe(503);
    const { data } = await admin().from("messages").select("id").eq("conversation_id", conv!.id).eq("direction", "saida");
    expect(data).toEqual([]);
  });

  describe("com canal marcado como ativo (simulação local)", () => {
    beforeAll(async () => {
      const now = new Date().toISOString();
      const r = await admin().from("messaging_channels").update({
        credentials_verified_at: now, webhook_verified_at: now, test_message_at: now,
        consent_text: "Autorizo receber mensagens do salão pelo WhatsApp. Responda PARAR para sair.", status: "ativo",
      }).eq("unit_id", geral);
      if (r.error) throw r.error;
      expect((await postWebhook(inbound(phoneOk, "Bom dia"))).status).toBe(200);
    });

    it("cliente com opt-out: recusado pelo banco (400)", async () => {
      const conv = await conversation(phoneOptOut);
      const res = await callFunction("whatsapp-send", { conversation_id: conv!.id, body: "Olá" }, vend);
      expect(res.status).toBe(400);
      expect(res.body.error?.message).toMatch(/opt-out/);
    });

    it("número sem cadastro que mandou PARAR: envio recusado pelo banco (400), sem tentativa de envio", async () => {
      expect((await postWebhook(inbound(phoneUnknown, "Oi"))).status).toBe(200);
      expect((await postWebhook(inbound(phoneUnknown, "PARAR"))).status).toBe(200);
      const conv = await conversation(phoneUnknown);
      expect(conv?.client_unit_id).toBeNull();
      const res = await callFunction("whatsapp-send", { conversation_id: conv!.id, body: "Tudo bem?" }, vend);
      expect(res.status).toBe(400);
      expect(res.body.error?.message).toMatch(/PARAR/);
      const { data } = await admin().from("messages").select("id").eq("conversation_id", conv!.id).eq("direction", "saida");
      expect(data).toEqual([]);
    });

    it("dentro da janela e sem opt-out, mas sem credencial da unidade: 503 e mensagem marcada como falha", async () => {
      const conv = await conversation(phoneOk);
      const res = await callFunction("whatsapp-send", { conversation_id: conv!.id, body: "Bom dia! Como posso ajudar?" }, vend);
      expect(res.status).toBe(503);
      expect(res.body.error?.code).toBe("whatsapp_not_configured");
      const { data } = await admin().from("messages").select("status, error, sent_by")
        .eq("conversation_id", conv!.id).eq("direction", "saida");
      expect(data).toHaveLength(1);
      expect(data![0].status).toBe("falhou");
      expect(data![0].error).toBe("credencial ausente");
      expect(data![0].sent_by).not.toBeNull();
    });
  });
});

describe("verificação do canal (whatsapp-verify-channel)", () => {
  it("vendedora sem messaging.manage: 403", async () => {
    const res = await callFunction("whatsapp-verify-channel", { unit_id: geral, action: "credentials" }, vend);
    expect(res.status).toBe(403);
  });

  it("Direção sem credencial oficial configurada: 503", async () => {
    const res = await callFunction("whatsapp-verify-channel", { unit_id: geral, action: "credentials" }, dir);
    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe("whatsapp_not_configured");
  });
});

describe("SDR IA (sdr-draft)", () => {
  it("IA desligada na unidade: 503", async () => {
    const conv = await conversation(phoneOk);
    const res = await callFunction("sdr-draft", { conversation_id: conv!.id }, vend);
    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe("disabled");
  });

  it("vendedora não liga a IA; Direção liga; sem chave da IA: 503 e nenhum rascunho", async () => {
    await vend.from("messaging_channels").update({ ai_enabled: true }).eq("unit_id", geral);
    let ch = await admin().from("messaging_channels").select("ai_enabled").eq("unit_id", geral).single();
    expect(ch.data!.ai_enabled).toBe(false);

    const upd = await dir.from("messaging_channels").update({ ai_enabled: true }).eq("unit_id", geral);
    expect(upd.error).toBeNull();
    ch = await admin().from("messaging_channels").select("ai_enabled").eq("unit_id", geral).single();
    expect(ch.data!.ai_enabled).toBe(true);

    const conv = await conversation(phoneOk);
    const res = await callFunction("sdr-draft", { conversation_id: conv!.id }, vend);
    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe("ai_not_configured");
    const { data } = await admin().from("messages").select("id").eq("conversation_id", conv!.id).eq("ai_generated", true);
    expect(data).toEqual([]);
  });
});
