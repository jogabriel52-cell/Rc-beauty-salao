# Hospedagem do frontend (Hostinger)

Situação: **preparado, não publicado.** Nenhum arquivo foi enviado à Hostinger,
nenhum DNS foi alterado e nenhum endereço foi escolhido. O endereço final
(domínio ou subdomínio) será definido pelo responsável pelo projeto.

## Como o frontend funciona na hospedagem

- É um site **estático** (React + Vite): a pasta `apps/web/dist/` contém
  `index.html`, `assets/` e o `.htaccess`. Não há servidor de aplicação nem
  Node.js na hospedagem; tudo o que é dado vem do Supabase, protegido por RLS.
- O navegador recebe apenas a **URL do projeto Supabase** e a **chave
  publicável** (`sb_publishable_...`). A chave secreta e a `service_role` nunca
  vão para o build: `npm run -w apps/web build:hosting` falha se encontrar
  indício delas, se o build apontar para a stack local, se faltar o
  `.htaccess` ou se houver mapas de código.
- `apps/web/public/.htaccess` (copiado para `dist/`) faz o Apache/LiteSpeed da
  Hostinger devolver `index.html` para as rotas da aplicação (`/agenda`,
  `/definir-senha`…), bloqueia listagem de pastas e arquivos `.env`/`.map`, e
  envia cabeçalhos de segurança (CSP restrita ao próprio site e a
  `*.supabase.co`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`).

Verificação já feita (2026-10-24): build com o projeto de desenvolvimento,
servido localmente com o mesmo fallback e a mesma CSP do `.htaccess`; `/entrar`,
acesso direto a `/agenda` (redireciona ao login) e `/definir-senha` abriram sem
erro de console nem violação de CSP. O `.htaccess` em si só será exercitado na
Hostinger.

## Gerar o build

```bash
cp apps/web/.env.production.example apps/web/.env.production   # não versionado
# editar: VITE_SUPABASE_URL=https://<ref>.supabase.co
#         VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
npm ci
npm run -w apps/web build:hosting
```

O resultado é `apps/web/dist/`. Para o projeto de desenvolvimento use o ref
`biaezsatrxqpopeifkot`; para uso real, o projeto de **produção** (a criar,
`docs/CLOUD_SETUP.md` §9) — o build de desenvolvimento não deve receber
usuárias reais.

## Publicar quando o endereço for escolhido (passos pendentes)

1. **Escolher o endereço** (ex.: domínio principal ou um subdomínio próprio).
   Nada está presumido no código: o build usa caminhos a partir da raiz (`/`).
   Se o site for servido numa subpasta (ex.: `dominio/sistema/`), avisar antes:
   é preciso ajustar `base` no `vite.config.ts` e o `.htaccess`.
2. **Na Hostinger (hPanel)**:
   - se for subdomínio, criar o subdomínio e anotar a pasta raiz dele;
   - ativar SSL para o endereço e ligar **Forçar HTTPS**;
   - no Gerenciador de Arquivos (ou FTP/SFTP), enviar **o conteúdo** de
     `apps/web/dist/` para a pasta raiz do endereço — incluindo o arquivo
     oculto `.htaccess` — substituindo a versão anterior. Não enviar
     `.env.production`, `node_modules` nem o código-fonte.
3. **No Supabase do projeto usado pelo build** (Authentication → URL
   Configuration):
   - Site URL: `https://<endereço escolhido>`;
   - Redirect URLs: `https://<endereço escolhido>/definir-senha` (sem curingas);
   - manter `http://localhost:5173/definir-senha` só no projeto de desenvolvimento.
4. **Edge Functions** (quando publicadas no projeto): atualizar os segredos
   `ALLOWED_ORIGINS=https://<endereço escolhido>` e
   `SITE_URL=https://<endereço escolhido>` (pedir confirmação antes de mexer em
   segredos).
5. **Conferir após publicar**: abrir `/entrar` e um link direto como `/agenda`
   (não pode dar 404); ver no navegador que não há erros de CSP; testar login,
   MFA e o link de convite/definição de senha com usuário de teste.
6. **DNS**: só se o domínio não estiver apontado para a Hostinger. Alteração de
   DNS fica a cargo do responsável e não foi feita.

## O que não fazer

- Não colocar `sb_secret_...`, `service_role`, senha do banco, tokens do
  WhatsApp ou chave da IA em `.env.production`, em variável `VITE_*` ou na
  hospedagem.
- Não publicar build apontado para a stack local (o `build:hosting` recusa).
- Não publicar com dados reais enquanto houver pendências bloqueantes em
  `docs/SECURITY_REVIEW.md`.
