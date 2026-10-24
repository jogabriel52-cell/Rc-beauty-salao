// Fase 1 — operação diária com usuários reais pela Data API.
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, createPerson, run, seedCatalog, seedClient, signIn, unitId } from "./helpers";

let recep: SupabaseClient;
let recepVip: SupabaseClient;
let prof: SupabaseClient;
let vend: SupabaseClient;
let vendId: string;
let geral: string;
let vip: string;
let cat: Awaited<ReturnType<typeof seedCatalog>>;
let ana: Awaited<ReturnType<typeof seedClient>>;
const phone = `55119${run.replace(/\D/g, "0").padEnd(8, "1").slice(0, 8)}`;

beforeAll(async () => {
  geral = await unitId("geral");
  vip = await unitId("vip");
  const r = await createPerson("p1-recep", [{ unit: "geral", profile: "recepcao" }]);
  const rv = await createPerson("p1-recep-vip", [{ unit: "vip", profile: "recepcao" }]);
  const p = await createPerson("p1-prof", [{ unit: "geral", profile: "profissional" }]);
  const v = await createPerson("p1-vend", [{ unit: "geral", profile: "vendedora" }]);
  vendId = v.id;
  cat = await seedCatalog("geral", { professionalUser: p.id, stock: 5 });
  ana = await seedClient("geral", `Ana ${run}`, phone, "Alergia a amônia");
  await admin().from("appointments").insert({
    unit_id: geral, client_id: ana.clientUnitId, professional_id: cat.professionalId, service_id: cat.serviceId,
    starts_at: "2031-05-10T13:00:00-03:00", ends_at: "2031-05-10T14:00:00-03:00",
  });
  recep = await signIn(r.email);
  recepVip = await signIn(rv.email);
  prof = await signIn(p.email);
  vend = await signIn(v.email);
});

describe("clientes por unidade", () => {
  it("VIP não lê cliente da Geral", async () => {
    const { data } = await recepVip.from("client_units").select("id").eq("id", ana.clientUnitId);
    expect(data).toEqual([]);
  });

  it("VIP encontra o cadastro só por telefone, mascarado, e vincula", async () => {
    const { data } = await recepVip.rpc("find_client_candidates", { p_unit_id: vip, p_full_name: "", p_phone: phone, p_email: "" });
    expect(data).toHaveLength(1);
    expect(data![0].linked_here).toBe(false);
    expect(data![0].display_name).toMatch(/^Ana \w?\.?$|^Ana$/);
    expect(data![0].phone_hint).toBe(`…${phone.slice(-4)}`);
    const link = await recepVip.rpc("create_client", { p_unit_id: vip, p_full_name: "Ana", p_phone: phone, p_identity_id: data![0].identity_id });
    expect(link.error).toBeNull();
    const notes = await recepVip.from("client_units").select("service_notes").eq("id", link.data!);
    expect(notes.data![0].service_notes).toBeNull();
  });
});

describe("profissional", () => {
  it("não lê clientes nem identidades", async () => {
    expect((await prof.from("client_units").select("id")).data).toEqual([]);
    expect((await prof.from("client_identities").select("id")).data).toEqual([]);
  });

  it("vê a própria agenda com nome e observação de atendimento, sem telefone", async () => {
    const { data, error } = await prof.rpc("get_my_agenda", { p_from: "2031-05-10T00:00:00-03:00", p_to: "2031-05-11T00:00:00-03:00" });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].client_name).toBe(`Ana ${run}`);
    expect(data![0].service_notes).toBe("Alergia a amônia");
    expect(Object.keys(data![0])).not.toContain("phone");
  });
});

describe("comanda completa", () => {
  it("Recepção abre, lança, informa quem vendeu, recebe e finaliza; estoque baixa", async () => {
    const sale = await recep.from("sales").insert({ unit_id: geral, client_unit_id: ana.clientUnitId } as never).select("id, number").single();
    expect(sale.error).toBeNull();
    const id = sale.data!.id;
    expect((await recep.from("sale_items").insert({ unit_id: geral, sale_id: id, kind: "servico", service_id: cat.serviceId, professional_id: cat.professionalId } as never)).error).toBeNull();
    expect((await recep.from("sale_items").insert({ unit_id: geral, sale_id: id, kind: "produto", product_id: cat.productId, quantity: 2 } as never)).error).toBeNull();
    expect((await recep.from("sales").update({ sold_by: vendId }).eq("id", id)).error).toBeNull();
    const total = (await recep.from("sales").select("total_cents").eq("id", id).single()).data!.total_cents;
    expect(total).toBe(18000);
    const early = await recep.from("sales").update({ status: "finalizada" }).eq("id", id);
    expect(early.error?.message).toMatch(/Pagamentos/);
    expect((await recep.from("sale_payments").insert({ unit_id: geral, sale_id: id, method: "pix", amount_cents: 18000 } as never)).error).toBeNull();
    const fin = await recep.from("sales").update({ status: "finalizada" }).eq("id", id).select("finalized_by, sold_by").single();
    expect(fin.error).toBeNull();
    expect(fin.data!.sold_by).toBe(vendId);
    const stock = await recep.from("product_stock").select("quantity").eq("id", cat.productId).single();
    expect(stock.data!.quantity).toBe(3);

    // Vendedora vê a comanda em que vendeu (escopo próprio)
    const mine = await vend.from("sales").select("id").eq("id", id);
    expect(mine.data).toHaveLength(1);
  });

  it("Vendedora não abre comanda", async () => {
    const { error } = await vend.from("sales").insert({ unit_id: geral } as never);
    expect(error?.code).toBe("42501");
  });
});
