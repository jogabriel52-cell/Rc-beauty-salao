import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { CLIENT_SELECT, type ClientRow } from "../lib/db";
import { formatPhone } from "../lib/format";

// Busca clientes ativos da unidade por nome ou telefone.
export function ClientPicker({ unitId, value, onChange, label = "Cliente" }:
  { unitId: string; value: ClientRow | null; onChange: (c: ClientRow | null) => void; label?: string }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ClientRow[]>([]);

  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      const digits = t.replace(/\D/g, "");
      const filter = digits.length >= 4 ? `phone.ilike.*${digits}*` : `full_name.ilike.*${t.replace(/[,()*]/g, "")}*`;
      const { data } = await supabase.from("client_units").select(CLIENT_SELECT)
        .eq("unit_id", unitId).is("archived_at", null)
        .or(filter, { referencedTable: "client_identities" })
        .limit(10);
      setResults((data ?? []) as unknown as ClientRow[]);
    }, 250);
    return () => clearTimeout(handle);
  }, [term, unitId]);

  if (value) {
    return (
      <div className="field">
        <label>{label}</label>
        <div className="row">
          <strong>{value.client_identities.full_name}</strong>
          <span className="muted small">{formatPhone(value.client_identities.phone)}</span>
          <button type="button" className="link-btn" onClick={() => onChange(null)}>trocar</button>
        </div>
      </div>
    );
  }
  return (
    <div className="field picker">
      <label htmlFor="client-search">{label}</label>
      <input id="client-search" placeholder="Nome ou telefone" value={term} onChange={(e) => setTerm(e.target.value)}
        autoComplete="off" />
      {results.length > 0 && (
        <ul className="picker-list" role="listbox">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => { onChange(r); setTerm(""); }}>
                {r.client_identities.full_name} <span className="muted small">{formatPhone(r.client_identities.phone)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
