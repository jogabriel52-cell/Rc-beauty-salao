// Formatação e normalização (pt-BR, America/Sao_Paulo, BRL em centavos).
export const TIME_ZONE = "America/Sao_Paulo";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return money.format(cents / 100);
}

// "1.234,56" | "1234.56" | "R$ 10" -> centavos
export function parseMoney(input: string): number | null {
  const clean = input.replace(/[^\d,.-]/g, "").trim();
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: digits })}%`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: TIME_ZONE, dateStyle: "short", timeStyle: "short" });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  // Datas puras (AAAA-MM-DD) não devem sofrer deslocamento de fuso.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: TIME_ZONE });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
}

// Data local (America/Sao_Paulo) no formato AAAA-MM-DD.
export function localDate(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d);
  return parts;
}

// Converte data local + hora local (São Paulo, UTC-3 sem horário de verão desde 2019)
// em ISO com fuso explícito.
export function localToIso(date: string, time: string): string {
  return `${date}T${time}:00-03:00`;
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function dayRange(date: string): { from: string; to: string } {
  return { from: localToIso(date, "00:00"), to: addMinutes(localToIso(date, "00:00"), 24 * 60) };
}

// Telefone brasileiro: só dígitos, com DDI 55. Retorna null se inválido.
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^55\d{10,11}$/.test(digits)) return null;
  return digits;
}

export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return "—";
  const m = digits.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  if (!m) return digits;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}
