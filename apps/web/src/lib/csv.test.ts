import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chunk, decodeCsv, mapRows, missingHeaders, parseCsv, sha256Hex } from "./csv";

describe("CSV da importação", () => {
  it("decodifica UTF-8 e remove BOM", () => {
    const bytes = new TextEncoder().encode("﻿Nome;Observação\nAna;café");
    const { text, encoding } = decodeCsv(bytes.buffer as ArrayBuffer);
    expect(encoding).toBe("utf-8");
    expect(text.startsWith("Nome")).toBe(true);
  });

  it("cai para Windows-1252 quando não é UTF-8", () => {
    // "Observação" em Windows-1252: ç = 0xE7, ã = 0xE3
    const bytes = new Uint8Array([0x4f, 0x62, 0x73, 0x65, 0x72, 0x76, 0x61, 0xe7, 0xe3, 0x6f]);
    const { text, encoding } = decodeCsv(bytes.buffer);
    expect(encoding).toBe("windows-1252");
    expect(text).toBe("Observação");
  });

  it("detecta ponto e vírgula e mapeia colunas do arquivo fictício", () => {
    const raw = readFileSync(new URL("../../../../supabase/tests/fixtures/trinks_clientes_ficticio.csv", import.meta.url));
    const { text } = decodeCsv(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer);
    const { headers, rows, delimiter } = parseCsv(text);
    expect(delimiter).toBe(";");
    expect(headers).toContain("Cliente");
    expect(rows).toHaveLength(5);
    const map = { full_name: "Cliente", phone: "Celular", external_ref: "Código" };
    expect(missingHeaders(map, headers)).toEqual([]);
    expect(missingHeaders({ full_name: "Nome" }, headers)).toEqual(["Nome"]);
    const mapped = mapRows(rows, map);
    expect(mapped[0]).toEqual({ row_number: 1, full_name: "Amanda Ficticia", phone: "(11) 90000-0101", external_ref: "F-001" });
    expect(mapped[3]!.full_name).toBe("");
  });

  it("gera SHA-256 e divide em lotes", async () => {
    const hash = await sha256Hex(new TextEncoder().encode("abc").buffer as ArrayBuffer);
    expect(hash).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

import { parseBankAmount, parseBankDate } from "./csv";

describe("extrato bancário", () => {
  it("interpreta valores em formatos comuns", () => {
    expect(parseBankAmount("1.234,56")).toBe(123456);
    expect(parseBankAmount("-1.234,56")).toBe(-123456);
    expect(parseBankAmount("1234.56")).toBe(123456);
    expect(parseBankAmount("(123,45)")).toBe(-12345);
    expect(parseBankAmount("R$ -10,00")).toBe(-1000);
    expect(parseBankAmount("50,00-")).toBe(-5000);
    expect(parseBankAmount("abc")).toBeNull();
    expect(parseBankAmount("")).toBeNull();
  });
  it("interpreta datas e rejeita inválidas", () => {
    expect(parseBankDate("05/01/2031", "DD/MM/YYYY")).toBe("2031-01-05");
    expect(parseBankDate("2031-01-05", "YYYY-MM-DD")).toBe("2031-01-05");
    expect(parseBankDate("01/05/2031", "MM/DD/YYYY")).toBe("2031-01-05");
    expect(parseBankDate("31/02/2031", "DD/MM/YYYY")).toBeNull();
    expect(parseBankDate("x", "DD/MM/YYYY")).toBeNull();
  });
});
