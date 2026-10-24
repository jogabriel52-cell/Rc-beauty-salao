// Falha se o build de produção contiver indícios de chave secreta.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const forbidden = [/sb_secret_[A-Za-z0-9_-]+/, /"role"\s*:\s*"service_role"/, /SERVICE_ROLE_KEY/, /SUPABASE_SECRET/];
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const hits = [];
for (const file of walk("dist")) {
  const content = readFileSync(file, "utf8");
  for (const re of forbidden) if (re.test(content)) hits.push(`${file}: ${re}`);
}
// Build para hospedagem (--hosting): precisa do .htaccess das rotas, sem mapas
// de código e apontando para um projeto Supabase na nuvem, não para a stack local.
if (process.argv.includes("--hosting")) {
  const files = walk("dist");
  if (!files.some((f) => f.endsWith(".htaccess"))) hits.push("dist/.htaccess ausente (rotas da aplicação)");
  for (const f of files) if (f.endsWith(".map")) hits.push(`${f}: mapa de código não deve ser publicado`);
  const js = files.filter((f) => f.endsWith(".js")).map((f) => readFileSync(f, "utf8")).join("\n");
  if (/127\.0\.0\.1:54321|localhost:54321/.test(js)) hits.push("build aponta para a stack local (VITE_SUPABASE_URL)");
  if (!/https:\/\/[a-z0-9]{20}\.supabase\.co/.test(js)) hits.push("URL do projeto Supabase na nuvem não encontrada no build");
}
if (hits.length) {
  console.error("Problemas no build:\n" + hits.join("\n"));
  process.exit(1);
}
console.log("Bundle sem chaves secretas.");
