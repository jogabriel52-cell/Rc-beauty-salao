# Configuração do Supabase Cloud (desenvolvimento)

Objetivo: um projeto Supabase **dedicado ao RC Beauty**, usado só para
desenvolvimento, **sem dados reais de clientes**. Produção será outro projeto,
configurado depois que a Fase 1 atingir seus critérios de saída.

Os nomes de menus do painel mudam com o tempo. Se algo não estiver onde este
documento indica, procure pela função equivalente na documentação atual do
Supabase e atualize este arquivo.

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
