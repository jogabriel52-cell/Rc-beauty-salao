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
