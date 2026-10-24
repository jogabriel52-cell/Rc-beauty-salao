# Contratos das funções de servidor (Edge Functions)

Nenhuma destas funções está implementada. Este documento é o contrato
obrigatório para implementá-las. Mudanças no contrato exigem atualizar este
arquivo e os testes no mesmo commit.

Local: `supabase/functions/<nome>/index.ts` (Deno + TypeScript).

## Regras comuns a todas as funções

1. **Método e formato.** Somente `POST` (e `OPTIONS` para CORS). Corpo JSON
   validado por esquema estrito (campos desconhecidos rejeitados). Limite de
   tamanho do corpo definido por função.
2. **CORS** restrito às origens em `ALLOWED_ORIGINS`. Nunca `*`.
3. **Autenticação no código.** Ler `Authorization: Bearer <jwt>`, validar com o
   Auth (`auth.getUser(jwt)` ou validação de claims equivalente da biblioteca
   oficial) e rejeitar com `401` se ausente ou inválido. Não depender apenas da
   configuração de verificação de JWT do gateway.
4. **Autorização no banco.** Criar um cliente com a **chave publicável** e o
   cabeçalho `Authorization` do chamador e consultar `rpc('is_platform_admin')`
   ou `rpc('has_permission', ...)`. Negar com `403`.
5. **Gravar com o JWT do chamador** sempre que a operação for permitida por RLS.
   Assim a auditoria registra o ator real e o RLS continua valendo.
6. **Chave secreta** só para o que exige: `auth.admin.*`. O cliente
   administrativo é criado dentro da função, nunca é retornado, logado ou
   reutilizado para gravações que o JWT do chamador consegue fazer. Quando uma
   gravação com a chave secreta for inevitável, ela passa por uma função SQL
   que recebe o ator e chama `set_config('app.actor_id', <ator>, true)`,
   executável somente por `service_role` (criada em migração própria).
7. **Respostas.** JSON `{ "ok": true, ... }` ou
   `{ "ok": false, "error": { "code": "...", "message": "..." } }`, mensagem em
   português e sem detalhes internos. Códigos HTTP: 400 entrada inválida,
   401 não autenticado, 403 sem permissão, 404 não encontrado, 409 conflito,
   500 erro interno.
8. **Logs** sem tokens, senhas, chaves, e-mails completos ou dados de clientes.
   Registrar id da requisição, função, id do ator, resultado e duração.
9. **Idempotência.** Repetir a mesma chamada após falha parcial não pode
   duplicar dados nem deixar estado inconsistente.
10. **Testes** automatizados para: sem token, token inválido, usuário sem
    permissão, entrada inválida, caminho feliz, repetição (idempotência).

Segredos necessários (configurados com `supabase secrets set`, nunca no
repositório): chave secreta do projeto, `ALLOWED_ORIGINS`, `SITE_URL`. As
variáveis de URL e chaves que o Supabase injeta automaticamente nas Edge
Functions mudam de nome entre versões; confirme na documentação atual antes de
implementar e registre aqui os nomes usados.

---

## `admin-invite-user` (Fase 1)

Convida um novo usuário e cria seu perfil e vínculos.

**Quem pode:** Admin Geral (`is_platform_admin()`; após P5, com `aal2`).

**Entrada** (máx. 8 KB):

```json
{
  "email": "pessoa@exemplo.com",
  "full_name": "Nome Completo",
  "memberships": [
    { "unit_id": "uuid", "role": "recepcao" }
  ]
}
```

- `email`: normalizado (trim, minúsculas), formato válido.
- `full_name`: 2 a 160 caracteres.
- `memberships`: 1 a 2 itens, `unit_id` distintos, `role` em `app_role`.

**Fluxo**

1. Validar entrada, autenticação e autorização.
2. Conferir, com o JWT do chamador, que cada `unit_id` existe e está ativo.
3. Verificar se já existe usuário no Auth com o e-mail:
   - existe **com** perfil → `409 user_exists` (usar reativação ou edição de
     vínculos);
   - existe **sem** perfil (tentativa anterior incompleta) → reutilizar o id e
     seguir para o passo 5;
   - não existe → passo 4.
   A consulta por e-mail é feita por uma função SQL `SECURITY DEFINER`
   executável apenas por `service_role`, criada na migração da função.
4. `auth.admin.inviteUserByEmail(email, { redirectTo: SITE_URL + "/definir-senha" })`.
   Não enviar papel, unidade ou permissões em `data`/`user_metadata`.
5. Com o JWT do chamador: inserir em `profiles` (`id`, `full_name`) e em
   `unit_memberships` (`user_id`, `unit_id`, `role`). Vínculo já existente para
   a mesma unidade não é duplicado.
6. Responder `201 { "ok": true, "user_id": "uuid" }`.

**Falhas:** se o passo 5 falhar, responder `500` sem desfazer o convite; uma
nova chamada com os mesmos dados completa o cadastro (passo 3, caso "sem
perfil").

---

## `admin-deactivate-user` (Fase 1)

Desativa um usuário: corta o acesso a dados e bloqueia novos logins.

**Quem pode:** Admin Geral.

**Entrada:** `{ "user_id": "uuid", "reason": "texto de 3 a 500 caracteres" }`

**Fluxo**

1. Validar entrada, autenticação e autorização. `user_id` igual ao do
   chamador → `400 cannot_deactivate_self`.
2. Com o JWT do chamador:
   `update profiles set active = false, deactivation_reason = :reason where id = :user_id`.
   O banco recusa se for o último Admin Geral ativo (`42501` → `409 last_admin`).
   Perfil inexistente → `404`. A partir deste passo o usuário já não lê nem
   grava nenhum dado, mesmo com sessão aberta.
3. Com a chave secreta: `auth.admin.updateUserById(user_id, { ban_duration: "876000h" })`
   para impedir novos logins e renovação de sessão.
4. Responder `200 { "ok": true }`.

**Falhas:** se o passo 3 falhar, responder `500 auth_block_failed` informando
que o acesso a dados já foi cortado; repetir a chamada é seguro (passo 2 é
idempotente).

## `admin-reactivate-user` (Fase 1)

Simétrica à desativação.

**Entrada:** `{ "user_id": "uuid" }`

**Fluxo:** validar → com a chave secreta, `ban_duration: "none"` → com o JWT do
chamador, `update profiles set active = true` → `200`. Os vínculos existentes
voltam a valer; o Admin Geral deve revisá-los antes de reativar.

---

## `import-trinks-csv` (Fase 2)

Importa clientes de uma exportação CSV do Trinks em duas etapas: prévia e
confirmação. **Não usa a chave secreta.**

**Pré-requisitos (migração da Fase 2):** permissão `imports.run`; tabelas
`import_batches` e `import_rows` com `unit_id`, RLS e auditoria; função
`import_commit_batch(batch_id)` `SECURITY DEFINER` que verifica
`has_permission(unit_id, 'imports.run')` do chamador; mapa de colunas aprovado
em `docs/TRINKS_MAPPING.md`.

**Etapa 1 — prévia**

Entrada: `multipart/form-data` com `unit_id`, `mapping_version` e `file`
(CSV, máx. 5 MB, máx. 20 000 linhas).

1. Autenticar; verificar `has_permission(unit_id, 'imports.run')`.
2. Detectar codificação e separador conforme o mapa; rejeitar arquivo que não
   tenha exatamente as colunas obrigatórias do mapa.
3. Calcular SHA-256 do arquivo; o mesmo arquivo na mesma unidade com lote já
   confirmado → `409 already_imported`.
4. Normalizar cada linha (nome, telefone `55DDDNÚMERO`, e-mail, data
   `dd/mm/aaaa` → ISO) e classificar: `valid`, `invalid` (com motivo),
   `duplicate_external_ref`, `possible_duplicate` (mesmo telefone de cliente
   existente).
5. Gravar lote e linhas em staging com o JWT do chamador. O arquivo bruto não é
   armazenado.
6. Responder com `batch_id` e contagens por classificação, mais até 50 exemplos
   de linhas inválidas com número da linha e motivo (sem repetir o conteúdo
   integral).

**Etapa 2 — confirmação**

Entrada JSON: `{ "batch_id": "uuid", "confirm": true }`

1. Autenticar; chamar `rpc('import_commit_batch', { batch_id })` com o JWT do
   chamador.
2. A função SQL insere apenas linhas `valid` como clientes com
   `source = 'trinks_csv'` e `external_ref`, em uma transação, e marca o lote
   como confirmado. `possible_duplicate` permanece para revisão manual.
3. Responder com o total inserido.

**Retenção:** linhas de staging com dados pessoais são apagadas por rotina após
30 dias da confirmação ou do abandono do lote; o lote mantém apenas contagens e
o hash.
