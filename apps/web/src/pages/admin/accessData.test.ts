import { describe, expect, it } from "vitest";
import { effectivePermissions } from "./accessData";

const pp = [
  { profile_id: "p", permission_code: "a.view", scope: "own" as const },
  { profile_id: "p", permission_code: "a.create", scope: "unit" as const },
  { profile_id: "q", permission_code: "b.view", scope: "unit" as const },
];

describe("permissões efetivas (espelho da regra do banco)", () => {
  it("usa o perfil", () => {
    expect(effectivePermissions("p", [], pp)).toEqual({ "a.view": "own", "a.create": "unit" });
  });
  it("revogação remove", () => {
    expect(effectivePermissions("p", [{ permission_code: "a.create", effect: "revoke", scope: null, reason: "x" }], pp))
      .toEqual({ "a.view": "own" });
  });
  it("concessão amplia escopo, nunca reduz", () => {
    expect(effectivePermissions("p", [
      { permission_code: "a.view", effect: "grant", scope: "unit", reason: "x" },
      { permission_code: "a.create", effect: "grant", scope: "own", reason: "x" },
      { permission_code: "c.view", effect: "grant", scope: "own", reason: "x" },
    ], pp)).toEqual({ "a.view": "unit", "a.create": "unit", "c.view": "own" });
  });
});
