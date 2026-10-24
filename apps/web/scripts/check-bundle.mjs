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
if (hits.length) {
  console.error("Possível segredo no bundle:\n" + hits.join("\n"));
  process.exit(1);
}
console.log("Bundle sem chaves secretas.");
