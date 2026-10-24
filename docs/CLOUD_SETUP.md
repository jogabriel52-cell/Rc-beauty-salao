# Configuração do Supabase Cloud (desenvolvimento)

Objetivo: um projeto Supabase **dedicado ao RC Beauty**, usado só para
desenvolvimento, **sem dados reais de clientes**. Produção será outro projeto,
configurado depois que a Fase 1 atingir seus critérios de saída.

Os nomes de menus do painel mudam com o tempo. Se algo não estiver onde este
documento indica, procure pela função equivalente na documentação atual do
Supabase e atualize este arquivo.

## Projeto de desenvolvimento em uso

| Item | Valor |
|---|---|
| Project ref | `biaezsatrxqpopeifkot` (sempre conferir antes de qualquer comando remoto) |
| Nome no painel | `jogabriel52-cell's Project` |
| Região | `us-east-1` (a recomendação abaixo era `sa-east-1`; aceitável para desenvolvimento, rever para produção) |
| PostgreSQL | 17.11 |
| Estado em 2026-10-24 | Ativo; sem tabelas em `public`, sem migrações registradas, sem Edge Functions; já possui `public.rls_auto_enable()` + event trigger `ensure_rls` (reproduzidos na migração `20261024150000_rls_auto_enable_guard.sql`); `pgtap` disponível, não instalado |
| Migrações aplicadas | **Nenhuma** até 2026-10-24 (conferido de novo, somente leitura) — ver "Aplicação pendente" |

### Aplicação pendente

O fluxo autorizado é `supabase db push --dry-run`, revisão e depois
`supabase db push`, somente neste ref. Ele ainda não foi executado porque:

1. o ambiente de trabalho do Claude Code não tinha `SUPABASE_ACCESS_TOKEN` nem
   `SUPABASE_DB_PASSWORD` configurados como segredos; e
2. a rede desse ambiente só permite HTTPS: conexões Postgres
   (`db.biaezsatrxqpopeifkot.supabase.co:5432` e
   `aws-*-us-east-1.pooler.supabase.com:5432/6543`) não abrem, e o `db push`
   precisa delas.

Não há terminal com acesso ao banco nesta sessão. A aplicação é feita **na
máquina do responsável** com o roteiro `scripts/cloud-dev-push.sh`.

#### Passo a passo (na sua máquina)

Pré-requisitos: Git, Node.js 20+ e acesso à conta Supabase dona do projeto. A
CLI é baixada pelo próprio roteiro (`npx supabase@2.122.0`, a mesma versão dos
testes locais). Docker não é necessário. Em Windows, use Git Bash ou WSL.

```bash
git clone https://github.com/jogabriel52-cell/Rc-beauty-salao.git   # ou git pull, se já tiver
cd Rc-beauty-salao
git checkout claude/rc-beauty-spec-build-r13mz3
./scripts/cloud-dev-push.sh
```

O roteiro, nesta ordem:

1. faz `supabase login` se preciso (o token fica só na sua máquina);
2. `supabase link --project-ref biaezsatrxqpopeifkot` — **a senha do banco é
   digitada no terminal**, nunca no chat (ou exportada antes no seu shell como
   `SUPABASE_DB_PASSWORD`);
3. **para** se o projeto vinculado não for `biaezsatrxqpopeifkot`;
4. mostra `supabase migration list --linked` (o remoto deve estar vazio);
5. roda `supabase db push --dry-run --linked` e **para** se a prévia não listar
   exatamente as migrações de `supabase/migrations/`;
6. pede que você digite `APLICAR`; só então roda `supabase db push --linked`;
7. mostra o histórico de migrações depois da aplicação.

Ele nunca executa `db reset`, restore ou drop no projeto remoto e não envia
dados de teste. As saídas ficam em `$TMPDIR/rc-beauty-cloud-push/` (sem senha).
Se parar em qualquer etapa, envie a saída exibida (sem senha) para revisão.

Depois do `APLICAR`, avise o Claude Code: a conferência de histórico, tabelas,
RLS, permissões e Security/Performance Advisor é feita por consulta **somente
leitura**.

Roteiro testado com uma CLI simulada (prévia correta → pede confirmação;
prévia diferente → para; ref diferente → para). A execução real ainda não
aconteceu.

#### Revisão de operações destrutivas

Em um projeto vazio, os `drop`/`delete` das migrações só atingem objetos
criados pelas próprias migrações anteriores da cadeia:

| Migração | Operação | Motivo |
|---|---|---|
| `…150200_phase0_access_model` | `delete from public.permissions`; `drop column role`; `drop table role_permissions`; `drop type app_role`; `drop function my_permissions`; troca de gatilho e de políticas | substitui os papéis fixos do modelo inicial por perfis editáveis |
| `…150300_phase1_operations` | `drop column` de nome/contato em `client_units`; troca de gatilho, políticas e de `get_my_agenda` | dados de contato passam para `client_identities` |
| `…150300`, `…150400`, `…150600` | `delete` dentro de corpos de função | executados só quando a função é chamada (descartar prévia de importação, mesclar clientes) |

Nenhuma migração altera o schema `auth`, remove `ensure_rls` ou
`rls_auto_enable`, ou toca objetos que já existiam no projeto.

#### Alternativa

Executar no ambiente do Claude Code exigiria `SUPABASE_ACCESS_TOKEN` e
`SUPABASE_DB_PASSWORD` como segredos do ambiente **e** liberação de rede para
os hosts Postgres acima; não é o caminho escolhido.

### Auth do projeto de desenvolvimento (fazer no painel)

Não foi possível aplicar pelo ambiente (sem token da Management API). Valores
a configurar em **Authentication**, iguais aos do `supabase/config.toml`,
exceto a confirmação de e-mail, que no Cloud fica ligada:

| Onde | Ajuste |
|---|---|
| Sign In / Providers → User Signups | **Allow new users to sign up: desligado** |
| Sign In / Providers → Email | Email provider ligado; **Confirm email: ligado**; Secure email change ligado |
| Sign In / Providers → demais provedores | Todos desligados (inclusive anonymous sign-ins e telefone) |
| URL Configuration → Site URL | `http://localhost:5173` |
| URL Configuration → Redirect URLs | apenas `http://localhost:5173/definir-senha` (sem curingas) |
| Multi-Factor → TOTP (App Authenticator) | **Enabled** (inscrição e verificação). A exigência para Admin Geral e Direção é aplicada pelo banco (`requires_mfa` + `aal2`) |
| Multi-Factor → Phone | Desligado |
| Passwords / Policies | Mínimo **10** caracteres; exigir **letras e números**; ligar proteção contra senhas vazadas se o plano oferecer |
| Emails → SMTP | Pendente: o SMTP padrão só envia para membros da equipe do projeto |

Não alterar tabelas do schema `auth` diretamente. Quando o endereço da
hospedagem for escolhido, acrescentar a URL dele (`docs/HOSTING.md`).

## 1. Conta e organização

- Conta do Supabase com **MFA ativado** para todas as pessoas com acesso ao
  painel.
- Organização própria do RC Beauty (ou a do responsável técnico), com o menor
  número possível de membros.

## 2. Projeto

- Novo projeto, nome `rc-beauty-dev`. **Não reutilizar** banco de outro produto:
  migrações, roles e políticas de outro sistema contaminariam o isolamento.
- Região: São Paulo (`sa-east-1`), próxima dos usuários e dos dados.
- Senha do banco forte, gerada e guardada em gerenciador de senhas. Não colar
  em chat, issue ou arquivo do repositório.

## 3. Chaves

Em **Project Settings → API Keys**:

- **Publicável** (`sb_publishable_...`): vai para o frontend
  (`VITE_SUPABASE_PUBLISHABLE_KEY`). Segura para o navegador porque todo acesso
  passa por RLS.
- **Secreta** (`sb_secret_...`): só em segredos das Edge Functions. Nunca em
  `VITE_*`, `.env` versionado, logs ou prompts. Se vazar, revogar e criar outra.
- Projetos antigos podem mostrar as chaves legadas `anon` e `service_role`. As
  regras são as mesmas: `anon` equivale à publicável, `service_role` à secreta.
  Prefira as chaves novas.

## 4. Auth

Em **Authentication**:

- **Desativar cadastro público** ("Allow new users to sign up" desligado).
  Usuários entram somente por convite do Admin Geral.
- Provedor e-mail habilitado; provedores sociais desabilitados.
- Confirmação de e-mail habilitada.
- **URL Configuration**: Site URL `http://localhost:5173` no desenvolvimento;
  Redirect URLs apenas as rotas usadas (ex.: `http://localhost:5173/definir-senha`).
  Sem curingas amplos.
- **SMTP**: o SMTP padrão só envia para membros da equipe do projeto e com
  limite baixo. Para testes com outras pessoas, configurar SMTP próprio.
- Modelos de e-mail (convite, redefinição de senha) em português.
- Política de senha: comprimento mínimo de 10+ caracteres; ativar proteção
  contra senhas vazadas se o plano oferecer.
- MFA (TOTP) habilitado — será exigido para Admin Geral (pendência P5).

## 5. Data API

- Schemas expostos: apenas `public` (e `graphql_public` se mantido pelo
  padrão). Não expor schemas adicionais sem revisão.
- Se o painel oferecer a opção de não expor automaticamente novas tabelas, a
  migração já revoga os privilégios padrão; mantenha os dois controles.

## 6. Aplicar as migrações

Na máquina de desenvolvimento, com a Supabase CLI instalada:

```bash
supabase login
supabase init                 # cria supabase/config.toml; mantém migrations/
supabase start                # stack local (Docker)
supabase db reset             # aplica as migrações no banco local
# testes no local: ver docs/BUILD_AND_VALIDATION.md

supabase link --project-ref <ref-do-projeto-dev>
supabase db push --dry-run    # conferir o que será aplicado
supabase db push              # aplicar no projeto de desenvolvimento
```

Nunca execute no painel o SQL antigo do Builder. Mudanças de banco entram
somente como novas migrações.

## 7. Depois de aplicar

1. **Advisors → Security Advisor**: zero erros; registrar justificativa para
   cada aviso mantido em `docs/SECURITY_REVIEW.md`.
2. **Table Editor**: conferir que todas as tabelas mostram RLS habilitado.
3. Bootstrap do Admin Geral: `supabase/BOOTSTRAP.md`.
4. Criar usuários de teste (e-mails `@<seu-domínio>` ou aliases controlados),
   um por papel e unidade, e executar o roteiro manual de
   `BUILD_AND_VALIDATION.md`.

## 8. Edge Functions (quando existirem)

```bash
supabase secrets set ALLOWED_ORIGINS=http://localhost:5173 SITE_URL=http://localhost:5173
supabase functions deploy admin-invite-user
```

A chave secreta é configurada como segredo da função conforme a documentação
atual do Supabase; nunca passada pelo frontend.

## 9. Produção (futuro)

Projeto separado (`rc-beauty-prod`), com: chaves e senha próprias, SMTP
próprio, domínio definitivo nas URLs do Auth, backup/PITR conforme plano,
membros mínimos e acesso ao painel revisado. Só recebe dados reais depois de
cumpridas as pendências bloqueantes de `SECURITY_REVIEW.md`.
