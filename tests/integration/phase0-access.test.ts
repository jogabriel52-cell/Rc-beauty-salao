// Fase 0 — acesso com usuários reais: login, MFA, convite, desativação e RLS
// pela Data API e pelas Edge Functions da stack local.
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  anonClient, callFunction, createPerson, enrollMfa, mailpitHasMessageTo, profileId,
  signIn, testEmail, totp, unitId,
} from "./helpers";

let adminUser: { id: string; email: string };
let dirUser: { id: string; email: string };
let recepUser: { id: string; email: string };
let dirNoMfa: SupabaseClient;
let adminAal2: SupabaseClient;
let dir: SupabaseClient;
let dirSecret: string;
let recep: SupabaseClient;
let geral: string;
let vip: string;

beforeAll(async () => {
  geral = await unitId("geral");
  vip = await unitId("vip");
  adminUser = await createPerson("admin", [
    { unit: "geral", profile: "admin_geral" }, { unit: "vip", profile: "admin_geral" },
  ], { platformAdmin: true });
  dirUser = await createPerson("direcao", [
    { unit: "geral", profile: "direcao" }, { unit: "vip", profile: "direcao" },
  ]);
  recepUser = await createPerson("recepcao", [{ unit: "geral", profile: "recepcao" }]);

  const dirSemMfa = await createPerson("direcao-sem-mfa", [{ unit: "geral", profile: "direcao" }]);
  dirNoMfa = await signIn(dirSemMfa.email);
  adminAal2 = await signIn(adminUser.email);
  await enrollMfa(adminAal2);
  dir = await signIn(dirUser.email);
  dirSecret = await enrollMfa(dir);
  recep = await signIn(recepUser.email);
});

describe("Data API sem login", () => {
  it("não lê tabelas", async () => {
    const { data, error } = await anonClient().from("unit_memberships").select("*");
    expect(error?.code).toBe("42501");
    expect(data).toBeNull();
  });
});

describe("MFA obrigatório para Admin Geral e Direção", () => {
  it("sem MFA, my_access exige MFA e não há permissões", async () => {
    const { data } = await dirNoMfa.rpc("my_access");
    expect(data.mfa_required).toBe(true);
    expect(data.aal).toBe("aal1");
    for (const u of data.units) expect(u.permissions).toEqual({});
  });

  it("sem MFA, convite é recusado", async () => {
    const r = await callFunction("admin-invite-user", {
      email: testEmail("x"), full_name: "Pessoa X",
      memberships: [{ unit_id: geral, access_profile_id: await profileId("recepcao") }],
    }, dirNoMfa);
    expect(r.status).toBe(403);
  });

  it("verificar MFA encerra as outras sessões da pessoa no Auth", async () => {
    const other = await signIn(dirUser.email); // sessão aal1 já após o MFA cadastrado
    const second = await signIn(dirUser.email);
    await second.auth.mfa.challengeAndVerify({
      factorId: (await second.auth.mfa.listFactors()).data!.totp[0].id,
      code: totp(dirSecret),
    });
    const { error } = await other.auth.getUser();
    expect(error).not.toBeNull();
  });

  it("com MFA, permissões efetivas aparecem", async () => {
    const { data } = await adminAal2.rpc("my_access");
    expect(data.aal).toBe("aal2");
    expect(data.is_platform_admin).toBe(true);
    expect(data.units).toHaveLength(2);
    expect(data.units[0].permissions["access.manage"]).toBe("unit");
  });
});

describe("Convite (admin-invite-user)", () => {
  const novaEmail = testEmail("nova");

  it("rejeita sem sessão", async () => {
    const r = await callFunction("admin-invite-user", { email: novaEmail, full_name: "X", memberships: [] });
    expect(r.status).toBe(401);
  });

  it("rejeita origem não autorizada", async () => {
    const r = await callFunction("admin-invite-user", {}, dir, { Origin: "https://malicioso.invalid" });
    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe("origin_not_allowed");
  });

  it("rejeita campos desconhecidos", async () => {
    const r = await callFunction("admin-invite-user", {
      email: novaEmail, full_name: "Nova", memberships: [{ unit_id: geral, access_profile_id: geral }], role: "admin",
    }, dir);
    expect(r.status).toBe(400);
  });

  it("Recepção não convida", async () => {
    const r = await callFunction("admin-invite-user", {
      email: novaEmail, full_name: "Nova",
      memberships: [{ unit_id: geral, access_profile_id: await profileId("recepcao") }],
    }, recep);
    expect(r.status).toBe(403);
  });

  it("Direção com MFA convida; e-mail sai; vínculo e auditoria gravados", async () => {
    const r = await callFunction("admin-invite-user", {
      email: novaEmail, full_name: "Nova Vendedora", job_title: "Vendedora",
      memberships: [{ unit_id: vip, access_profile_id: await profileId("vendedora") }],
    }, dir);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.invited).toBe(true);
    expect(await mailpitHasMessageTo(novaEmail)).toBe(true);

    const people = await dir.rpc("admin_list_people");
    const nova = people.data.find((p: { email: string }) => p.email === novaEmail);
    expect(nova.memberships[0].access_profile_name).toBe("Vendedora");

    const audit = await dir.from("audit_log").select("actor_id, table_name")
      .eq("table_name", "unit_memberships").eq("record_id", nova.memberships[0].membership_id);
    expect(audit.data?.[0]?.actor_id).toBe(dirUser.id);
  });

  it("convite repetido para o mesmo e-mail retorna 409", async () => {
    const r = await callFunction("admin-invite-user", {
      email: novaEmail, full_name: "Nova",
      memberships: [{ unit_id: vip, access_profile_id: await profileId("vendedora") }],
    }, dir);
    expect(r.status).toBe(409);
  });

  it("Direção não altera o próprio vínculo pela API", async () => {
    const { error } = await dir.from("unit_memberships").update({ active: false })
      .eq("user_id", dirUser.id).eq("unit_id", vip).select();
    expect(error?.code).toBe("42501");
  });
});

describe("Recepção pela Data API", () => {
  it("vê só a própria unidade", async () => {
    const { data } = await recep.from("units").select("code");
    expect(data?.map((u) => u.code)).toEqual(["geral"]);
  });

  it("não cria vínculos", async () => {
    const { error } = await recep.from("unit_memberships").insert({
      user_id: adminUser.id, unit_id: vip, access_profile_id: await profileId("recepcao"),
    });
    expect(error?.code).toBe("42501");
  });

  it("não se torna Admin Geral", async () => {
    const { error } = await recep.from("platform_admins").insert({ user_id: recepUser.id });
    expect(error?.code).toBe("42501");
  });
});

describe("Ativação e desativação (admin-set-user-status)", () => {
  it("ninguém desativa a si mesmo", async () => {
    const r = await callFunction("admin-set-user-status", { user_id: dirUser.id, active: false, reason: "teste" }, dir);
    expect(r.status).toBe(400);
  });

  it("Direção não desativa o Admin Geral", async () => {
    const r = await callFunction("admin-set-user-status", { user_id: adminUser.id, active: false, reason: "teste" }, dir);
    expect(r.status).toBe(403);
  });

  it("desativação exige motivo", async () => {
    const r = await callFunction("admin-set-user-status", { user_id: recepUser.id, active: false }, dir);
    expect(r.status).toBe(400);
  });

  it("desativar corta dados na sessão aberta e bloqueia novo login", async () => {
    const r = await callFunction("admin-set-user-status",
      { user_id: recepUser.id, active: false, reason: "teste de desligamento" }, dir);
    expect(r.status, JSON.stringify(r.body)).toBe(200);

    const { data } = await recep.from("units").select("code");
    expect(data).toEqual([]);

    const again = anonClient();
    const login = await again.auth.signInWithPassword({ email: recepUser.email, password: "SenhaDeTeste123" });
    expect(login.error).not.toBeNull();
  });

  it("reativar devolve o acesso", async () => {
    const r = await callFunction("admin-set-user-status", { user_id: recepUser.id, active: true }, dir);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const c = await signIn(recepUser.email);
    const { data } = await c.from("units").select("code");
    expect(data?.map((u) => u.code)).toEqual(["geral"]);
  });
});
