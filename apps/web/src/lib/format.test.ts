import { describe, expect, it } from "vitest";
import { centsToInput, formatDate, formatMoney, formatPhone, normalizePhone, parseMoney } from "./format";
import { errorMessage } from "./errors";

describe("dinheiro", () => {
  it("formata centavos em BRL", () => {
    expect(formatMoney(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });
  it("interpreta entradas comuns", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("R$ 10")).toBe(1000);
    expect(parseMoney("10.5")).toBe(1050);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });
  it("converte para campo de edição", () => {
    expect(centsToInput(1050)).toBe("10,50");
  });
});

describe("telefone", () => {
  it("normaliza celulares e fixos com DDI 55", () => {
    expect(normalizePhone("(11) 98765-4321")).toBe("5511987654321");
    expect(normalizePhone("+55 11 3333-4444")).toBe("551133334444");
    expect(normalizePhone("0055 21 99999-0000")).toBe("5521999990000");
  });
  it("rejeita números inválidos", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
  it("formata para exibição", () => {
    expect(formatPhone("5511987654321")).toBe("(11) 98765-4321");
  });
});

describe("datas", () => {
  it("data pura não sofre deslocamento de fuso", () => {
    expect(formatDate("2026-01-05")).toBe("05/01/2026");
  });
});

describe("mensagens de erro", () => {
  it("traduz códigos conhecidos", () => {
    expect(errorMessage({ code: "42501", message: "permission denied for table x" })).toMatch(/permissão/);
    expect(errorMessage({ code: "23P01", message: "conflicting key value violates exclusion constraint" }))
      .toMatch(/Conflito de horário/);
  });
  it("mantém mensagens de regra de negócio em português", () => {
    expect(errorMessage({ code: "42501", message: "Ninguém pode alterar as próprias permissões" }))
      .toBe("Ninguém pode alterar as próprias permissões");
  });
});
