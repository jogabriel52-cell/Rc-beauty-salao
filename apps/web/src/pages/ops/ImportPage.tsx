// Importação controlada do Trinks (CSV): mapeamento conferido por outra
// pessoa, prévia com classificação, decisões e confirmação.
import { useMemo, useState } from "react";
import { useAuth, useUnit } from "../../auth/AuthProvider";
import { Alert, Badge, Button, Empty, Modal, PageHeader, SelectInput, Spinner, Stat, Tabs, TextInput } from "../../components/ui";
import { unwrap, useAction, useAsync } from "../../components/useAsync";
import { chunk, decodeCsv, mapRows, MAX_BYTES, MAX_ROWS, missingHeaders, parseCsv, sha256Hex, TARGET_FIELDS,
  type ColumnMap } from "../../lib/csv";
import { formatDate, formatDateTime, formatPhone } from "../../lib/format";
import { supabase } from "../../lib/supabase";

interface Mapping {
  id: string; name: string; columns: ColumnMap; date_format: string; status: string;
  last_edited_by: string | null; approved_by: string | null; approved_at: string | null; source_headers: string[];
}
interface Batch {
  id: string; file_name: string; row_count: number; status: string; summary: Record<string, number> | null;
  created_at: string; confirmed_at: string | null; mapping_id: string;
}
interface Row {
  id: string; row_number: number; full_name: string | null; phone: string | null; phone_raw: string | null;
  email: string | null; birth_date: string | null; external_ref: string | null; classification: string;
  match_hint: string | null; issues: string[]; decision: string | null; match_identity_id: string | null;
  match_client_unit_id: string | null;
}

const CLASS_LABEL: Record<string, string> = {
  nova: "Nova", vincular: "Vincular a cadastro de outra unidade", duplicada_na_unidade: "Já existe nesta unidade",
  duplicada_no_arquivo: "Repetida no arquivo", possivel_duplicidade: "Possível duplicidade", invalida: "Inválida",
};
const CLASS_TONE: Record<string, "success" | "info" | "neutral" | "warning" | "danger"> = {
  nova: "success", vincular: "info", duplicada_na_unidade: "neutral", duplicada_no_arquivo: "neutral",
  possivel_duplicidade: "warning", invalida: "danger",
};
const DECISION_LABEL: Record<string, string> = { criar: "Criar cadastro", vincular: "Vincular", ignorar: "Ignorar" };

interface ParsedFile { name: string; sha: string; headers: string[]; rows: Record<string, string>[]; encoding: string; delimiter: string }

async function readFile(file: File): Promise<ParsedFile> {
  if (file.size > MAX_BYTES) throw new Error("Arquivo maior que 5 MB.");
  const buffer = await file.arrayBuffer();
  const { text, encoding } = decodeCsv(buffer);
  const { headers, rows, delimiter } = parseCsv(text);
  if (rows.length === 0) throw new Error("Arquivo sem linhas.");
  if (rows.length > MAX_ROWS) throw new Error(`Máximo de ${MAX_ROWS} linhas por arquivo.`);
  return { name: file.name, sha: await sha256Hex(buffer), headers, rows, encoding, delimiter };
}

export function ImportPage() {
  const unit = useUnit();
  const [tab, setTab] = useState<"importar" | "mapeamentos">("importar");
  const mappings = useAsync(async () => unwrap(await supabase.from("import_mappings").select("*")
    .neq("status", "arquivado").order("created_at", { ascending: false })) as unknown as Mapping[], []);
  return (
    <>
      <PageHeader title="Importação do Trinks" subtitle={`Clientes · unidade ${unit.name}`} />
      <Alert kind="info">
        O arquivo é lido no seu navegador; só os campos mapeados vão para o sistema. Nada é gravado em clientes antes da
        prévia e da sua confirmação. Use somente exportações oficiais do Trinks.
      </Alert>
      <Tabs value={tab} onChange={setTab} items={[{ value: "importar", label: "Importar" }, { value: "mapeamentos", label: "Mapeamentos" }]} />
      <Alert kind="error">{mappings.error}</Alert>
      {tab === "mapeamentos"
        ? <MappingsTab mappings={mappings.data ?? []} reload={() => void mappings.reload()} />
        : <ImportTab mappings={(mappings.data ?? []).filter((m) => m.status === "aprovado")} />}
    </>
  );
}

function MappingsTab({ mappings, reload }: { mappings: Mapping[]; reload: () => void }) {
  const { access } = useAuth();
  const [editing, setEditing] = useState<Mapping | "new" | null>(null);
  const action = useAction();
  return (
    <>
      <div className="toolbar"><Button onClick={() => setEditing("new")}>Novo mapeamento a partir de um arquivo</Button></div>
      <Alert kind="error">{action.error}</Alert>
      {mappings.length === 0 ? <Empty>Nenhum mapeamento. Crie um a partir de uma exportação real do Trinks.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nome</th><th>Colunas</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td className="small">{TARGET_FIELDS.filter((f) => m.columns[f.key]).map((f) => `${f.label} ← “${m.columns[f.key]}”`).join(" · ")}
                    <div className="muted">Datas: {m.date_format}</div></td>
                  <td>{m.status === "aprovado"
                    ? <Badge tone="success">Aprovado em {formatDate(m.approved_at)}</Badge>
                    : <Badge tone="warning">Rascunho — aguarda conferência</Badge>}</td>
                  <td className="nowrap">
                    {m.status === "rascunho" && m.last_edited_by !== access?.user_id && (
                      <Button busy={action.busy} onClick={async () => {
                        if (await action.run(async () => unwrap(await supabase.rpc("import_approve_mapping", { p_id: m.id })))) reload();
                      }}>Conferido — aprovar</Button>
                    )}
                    {m.status === "rascunho" && m.last_edited_by === access?.user_id && (
                      <span className="muted small">Outra pessoa deve conferir</span>
                    )}{" "}
                    <Button variant="ghost" onClick={() => setEditing(m)}>Editar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <MappingEditor mapping={editing === "new" ? null : editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function MappingEditor({ mapping, onClose, onSaved }: { mapping: Mapping | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(mapping?.name ?? "Clientes Trinks");
  const [headers, setHeaders] = useState<string[]>(mapping?.source_headers ?? []);
  const [map, setMap] = useState<ColumnMap>(mapping?.columns ?? {});
  const [dateFormat, setDateFormat] = useState(mapping?.date_format ?? "DD/MM/YYYY");
  const [sample, setSample] = useState<Record<string, string>[]>([]);
  const action = useAction();

  async function onFile(file: File | undefined) {
    if (!file) return;
    await action.run(async () => {
      const parsed = await readFile(file);
      setHeaders(parsed.headers);
      setSample(parsed.rows.slice(0, 3));
    });
  }

  async function save() {
    const columns = Object.fromEntries(Object.entries(map).filter(([, v]) => v));
    const ok = await action.run(async () => unwrap(await supabase.rpc("import_save_mapping", {
      p_id: mapping?.id ?? null, p_name: name.trim(), p_columns: columns, p_date_format: dateFormat, p_source_headers: headers,
    } as never)));
    if (ok) onSaved();
  }

  return (
    <Modal title={mapping ? "Editar mapeamento" : "Novo mapeamento"} onClose={onClose} wide footer={
      <><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button busy={action.busy} disabled={!map.full_name || name.trim().length < 3} onClick={() => void save()}>Salvar rascunho</Button></>}>
      <Alert kind="error">{action.error}</Alert>
      <Alert kind="warning">Salvar (ou editar) deixa o mapeamento em rascunho. Outra pessoa com permissão de importação precisa conferir e aprovar.</Alert>
      <TextInput label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="field">
        <label htmlFor="mapping-file">Exportação do Trinks (para ler os cabeçalhos)</label>
        <input id="mapping-file" type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      {headers.length > 0 && (
        <>
          {TARGET_FIELDS.map((f) => (
            <SelectInput key={f.key} label={`${f.label}${f.required ? " *" : ""}`} value={map[f.key] ?? ""}
              onChange={(e) => setMap({ ...map, [f.key]: e.target.value || undefined })}>
              <option value="">{f.required ? "Selecione" : "Não importar"}</option>
              {headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </SelectInput>
          ))}
          <SelectInput label="Formato das datas" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
            <option value="DD/MM/YYYY">DD/MM/AAAA</option>
            <option value="YYYY-MM-DD">AAAA-MM-DD</option>
            <option value="MM/DD/YYYY">MM/DD/AAAA</option>
          </SelectInput>
          {sample.length > 0 && (
            <details open>
              <summary>Conferência com as 3 primeiras linhas</summary>
              <table className="table">
                <thead><tr>{TARGET_FIELDS.filter((f) => map[f.key]).map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
                <tbody>{sample.map((r, i) => (
                  <tr key={i}>{TARGET_FIELDS.filter((f) => map[f.key]).map((f) => <td key={f.key}>{r[map[f.key]!]}</td>)}</tr>
                ))}</tbody>
              </table>
            </details>
          )}
        </>
      )}
    </Modal>
  );
}

function ImportTab({ mappings }: { mappings: Mapping[] }) {
  const unit = useUnit();
  const [mappingId, setMappingId] = useState("");
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const action = useAction();
  const batches = useAsync(async () => unwrap(await supabase.from("import_batches").select("*").eq("unit_id", unit.unit_id)
    .order("created_at", { ascending: false }).limit(20)) as unknown as Batch[], [unit.unit_id, batchId]);
  const mapping = mappings.find((m) => m.id === mappingId) ?? null;
  const missing = file && mapping ? missingHeaders(mapping.columns, file.headers) : [];

  async function onFile(f: File | undefined) {
    setFile(null);
    if (!f) return;
    await action.run(async () => setFile(await readFile(f)));
  }

  async function preview() {
    if (!file || !mapping) return;
    await action.run(async () => {
      const id = unwrap(await supabase.rpc("import_create_batch", {
        p_unit_id: unit.unit_id, p_mapping_id: mapping.id, p_file_name: file.name, p_file_sha256: file.sha, p_row_count: file.rows.length,
      })) as string;
      const parts = chunk(mapRows(file.rows, mapping.columns), 500);
      for (let i = 0; i < parts.length; i++) {
        setProgress(`Enviando ${i + 1} de ${parts.length}…`);
        unwrap(await supabase.rpc("import_stage_rows", { p_batch_id: id, p_rows: parts[i] as never }));
      }
      setProgress(null);
      setBatchId(id);
      setFile(null);
    });
    setProgress(null);
  }

  if (batchId) return <BatchReview batchId={batchId} onClose={() => setBatchId(null)} />;

  return (
    <>
      <section className="card">
        <Alert kind="error">{action.error}</Alert>
        {mappings.length === 0 && <Alert kind="warning">Nenhum mapeamento aprovado. Crie e peça a conferência na aba Mapeamentos.</Alert>}
        <SelectInput label="Mapeamento aprovado" value={mappingId} onChange={(e) => setMappingId(e.target.value)}>
          <option value="">Selecione</option>
          {mappings.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </SelectInput>
        <div className="field">
          <label htmlFor="import-file">Arquivo CSV exportado do Trinks</label>
          <input id="import-file" type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
        {file && (
          <p className="small">{file.rows.length} linhas · codificação {file.encoding} · separador “{file.delimiter}”</p>
        )}
        {missing.length > 0 && <Alert kind="error">Colunas do mapeamento ausentes no arquivo: {missing.join(", ")}</Alert>}
        {progress && <p className="muted">{progress}</p>}
        <Button busy={action.busy} disabled={!file || !mapping || missing.length > 0} onClick={() => void preview()}>Gerar prévia</Button>
      </section>
      <h3>Lotes desta unidade</h3>
      {batches.loading ? <Spinner /> : !batches.data?.length ? <p className="muted">Nenhum lote.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Arquivo</th><th>Criado</th><th>Linhas</th><th>Situação</th><th>Resultado</th><th /></tr></thead>
            <tbody>
              {batches.data.map((b) => (
                <tr key={b.id}>
                  <td>{b.file_name}</td><td>{formatDateTime(b.created_at)}</td><td>{b.row_count}</td>
                  <td><Badge tone={b.status === "confirmado" ? "success" : b.status === "descartado" ? "danger" : "warning"}>{b.status}</Badge></td>
                  <td className="small">{b.summary ? `${b.summary.criadas} criadas · ${b.summary.vinculadas} vinculadas · ${b.summary.ignoradas} ignoradas` : "—"}</td>
                  <td>{b.status === "rascunho" && <Button variant="secondary" onClick={() => setBatchId(b.id)}>Revisar</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function BatchReview({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const [filter, setFilter] = useState<string>("");
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const action = useAction();
  const data = useAsync(async () => {
    const [rows, summary] = await Promise.all([
      supabase.from("import_rows").select("*").eq("batch_id", batchId).order("row_number").limit(20000),
      supabase.rpc("import_batch_summary", { p_batch_id: batchId }),
    ]);
    return { rows: unwrap(rows) as unknown as Row[], summary: unwrap(summary) as unknown as
      { total: number; pendentes: number; por_classificacao: Record<string, number> } };
  }, [batchId]);
  const rows = useMemo(() => (data.data?.rows ?? []).filter((r) => !filter || r.classification === filter
    || (filter === "pendente" && !r.decision)), [data.data, filter]);

  async function decide(row: Row, decision: string) {
    if (await action.run(async () => unwrap(await supabase.rpc("import_decide_row", { p_row_id: row.id, p_decision: decision })))) {
      void data.reload();
    }
  }

  if (result) {
    return (
      <section className="card">
        <Alert kind="success">Importação confirmada: {result.criadas} cadastros criados, {result.vinculadas} vinculados, {result.ignoradas} linhas ignoradas.</Alert>
        <Button onClick={onClose}>Voltar</Button>
      </section>
    );
  }
  if (data.loading) return <Spinner />;
  const s = data.data!.summary;

  return (
    <>
      <Alert kind="error">{action.error || data.error}</Alert>
      <div className="stats">
        <Stat label="Linhas" value={s.total} />
        {Object.entries(s.por_classificacao).map(([k, v]) => <Stat key={k} label={CLASS_LABEL[k] ?? k} value={v} />)}
        <Stat label="Aguardando decisão" value={s.pendentes} />
      </div>
      <div className="toolbar">
        <SelectInput label="Mostrar" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Todas</option>
          <option value="pendente">Aguardando decisão</option>
          {Object.keys(CLASS_LABEL).map((k) => <option key={k} value={k}>{CLASS_LABEL[k]}</option>)}
        </SelectInput>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>#</th><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Nasc.</th><th>Classificação</th><th>Decisão</th></tr></thead>
          <tbody>
            {rows.slice(0, 500).map((r) => (
              <tr key={r.id}>
                <td>{r.row_number}</td>
                <td>{r.full_name ?? "—"}{r.external_ref && <div className="muted small">Código {r.external_ref}</div>}</td>
                <td>{r.phone ? formatPhone(r.phone) : r.phone_raw ?? "—"}</td>
                <td>{r.email ?? "—"}</td>
                <td>{formatDate(r.birth_date)}</td>
                <td><Badge tone={CLASS_TONE[r.classification]}>{CLASS_LABEL[r.classification]}</Badge>
                  {r.match_hint && <div className="small muted">{r.match_hint}</div>}
                  {r.issues.length > 0 && <div className="small error-text">{r.issues.join("; ")}</div>}</td>
                <td>
                  {["invalida", "duplicada_na_unidade", "duplicada_no_arquivo"].includes(r.classification) ? DECISION_LABEL.ignorar : (
                    <select aria-label={`Decisão da linha ${r.row_number}`} value={r.decision ?? ""}
                      onChange={(e) => void decide(r, e.target.value)}>
                      {!r.decision && <option value="">Decidir…</option>}
                      <option value="criar">{DECISION_LABEL.criar}</option>
                      {r.match_identity_id && !r.match_client_unit_id && <option value="vincular">{DECISION_LABEL.vincular}</option>}
                      <option value="ignorar">{DECISION_LABEL.ignorar}</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 500 && <p className="muted small">Mostrando 500 de {rows.length}; use o filtro.</p>}
      <div className="row">
        <Button variant="danger" busy={action.busy} onClick={async () => {
          if (await action.run(async () => unwrap(await supabase.rpc("import_discard_batch", { p_batch_id: batchId })))) onClose();
        }}>Descartar lote</Button>
        <Button busy={action.busy} disabled={s.pendentes > 0} onClick={async () => {
          await action.run(async () => setResult(unwrap(await supabase.rpc("import_commit_batch", { p_batch_id: batchId })) as unknown as Record<string, number>));
        }}>Confirmar importação</Button>
        <Button variant="secondary" onClick={onClose}>Voltar</Button>
      </div>
      {s.pendentes > 0 && <p className="muted small">Decida as {s.pendentes} linhas com dúvida para liberar a confirmação.</p>}
    </>
  );
}
