// Leitura de CSV no navegador para a importação: detecção de codificação,
// separador e mapeamento de colunas. O arquivo bruto não sai do navegador; só
// os campos mapeados são enviados ao banco.
import Papa from "papaparse";

export const TARGET_FIELDS = [
  { key: "full_name", label: "Nome da cliente", required: true },
  { key: "phone", label: "Telefone/celular", required: false },
  { key: "email", label: "E-mail", required: false },
  { key: "birth_date", label: "Data de nascimento", required: false },
  { key: "external_ref", label: "Código da cliente no Trinks", required: false },
  { key: "notes", label: "Observações (viram nota privada de CRM)", required: false },
] as const;

export type TargetField = (typeof TARGET_FIELDS)[number]["key"];
export type ColumnMap = Partial<Record<TargetField, string>>;

export const MAX_ROWS = 20000;
export const MAX_BYTES = 5 * 1024 * 1024;

// UTF-8 estrito; se falhar, Windows-1252 (comum em exportações para Excel).
export function decodeCsv(buffer: ArrayBuffer): { text: string; encoding: "utf-8" | "windows-1252" } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { text: text.replace(/^\uFEFF/, ""), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(buffer), encoding: "windows-1252" };
  }
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[]; delimiter: string } {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    delimitersToGuess: [";", ",", "\t", "|"],
    transformHeader: (h) => h.trim(),
  });
  return { headers: (result.meta.fields ?? []).filter(Boolean), rows: result.data, delimiter: result.meta.delimiter };
}

export function missingHeaders(map: ColumnMap, headers: string[]): string[] {
  return Object.values(map).filter((h): h is string => !!h && !headers.includes(h));
}

export interface MappedRow {
  row_number: number;
  full_name?: string;
  phone?: string;
  email?: string;
  birth_date?: string;
  external_ref?: string;
  notes?: string;
}

export function mapRows(rows: Record<string, string>[], map: ColumnMap): MappedRow[] {
  return rows.map((r, i) => {
    const out: MappedRow = { row_number: i + 1 };
    for (const [field, header] of Object.entries(map) as [TargetField, string][]) {
      if (header) out[field] = (r[header] ?? "").trim();
    }
    return out;
  });
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Valor de extrato em centavos: "1.234,56", "-1.234,56", "1234.56", "(123,45)", "R$ -10,00".
export function parseBankAmount(input: string | undefined): number | null {
  if (!input) return null;
  let s = input.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[R$\s]/g, "");
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1); }
  if (s.endsWith("-")) { negative = !negative; s = s.slice(0, -1); }
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return negative ? -cents : cents;
}

// Data de extrato para AAAA-MM-DD conforme o formato informado.
export function parseBankDate(input: string | undefined, format: "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY"): string | null {
  if (!input) return null;
  const v = input.trim().slice(0, 10);
  let y: string, m: string, d: string;
  if (format === "YYYY-MM-DD") {
    const r = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!r) return null;
    [, y, m, d] = r as unknown as [string, string, string, string];
  } else {
    const r = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!r) return null;
    if (format === "DD/MM/YYYY") { d = r[1]!; m = r[2]!; } else { m = r[1]!; d = r[2]!; }
    y = r[3]!;
  }
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const dt = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}
