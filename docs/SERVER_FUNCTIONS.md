# Funções de servidor (Edge Functions)

Contratos e estado das Edge Functions. Mudanças no contrato exigem atualizar
este arquivo e os testes no mesmo commit.

| Função | Fase | Estado |
|---|---|---|
| `admin-invite-user` | 0 | Implementada; testada na stack local |
| `admin-set-user-status` | 0 | Implementada; testada na stack local |
| `whatsapp-webhook` | 4 | Implementada; testada na stack local com segredos fictícios (sem a Meta) |
| `whatsapp-send` | 4 | Implementada; testadas na stack local só as recusas (sem credencial oficial). **Envio real não testado** |
| `whatsapp-verify-channel` | 4 | Implementada; testadas só as recusas (403, 503). **Graph API não testada** |
| `sdr-draft` | 4 | Implementada; testadas só as recusas (IA desligada, sem chave). **Chamada real à IA não testada** |

A importação do Trinks (Fase 2) **não usa Edge Function**: o CSV é lido no
navegador e o banco valida, classifica e grava por funções `SECURITY DEFINER`
que verificam `imports.run` do chamador (`import_*`). Assim nenhuma chave
secreta é necessária e a auditoria registra o ator real.

Financeiro e comissões (Fase 3) também não usam Edge Function: tudo é feito
por RLS e funções do banco.

Local: `supabase/functions/<nome>/index.ts` (Deno/TypeScript), código comum em
`supabase/functions/_shared/`.

## Regras comuns

1. **Sem dependências externas.** As funções usam apenas `fetch` nas APIs REST
   e Auth do próprio projeto (`_shared/supabase.ts`) e, na Fase 4, na Graph API
   da Meta (`_shared/whatsapp.ts`) e na Messages API da Anthropic (`sdr-draft`).
   Isso elimina download de pacotes no boot e reduz a superfície de cadeia de
   suprimentos.
2. **Método e formato.** Somente `POST` (e `OPTIONS`). Corpo JSON validado de
   forma estrita (campos desconhecidos → 400). Limite de tamanho por função.
3. **CORS e origem** restritos a `ALLOWED_ORIGINS`. Origem não autorizada → 403.
4. **Autenticação primeiro**, no código: `Authorization: Bearer <jwt>` validado
   em `/auth/v1/user` (rejeita token inválido, expirado, de sessão encerrada ou
   de usuário bloqueado). `verify_jwt = false` no `config.toml`, como orienta a
   documentação atual para as chaves `sb_publishable_`/`sb_secret_`.
5. **Autorização no banco.** As gravações usam a chave publicável + JWT do
   chamador: RLS, anti-escalada e auditoria valem e registram o ator real.
6. **Chave secreta** (`SUPABASE_SECRET_KEYS["default"]`, com recuo para a
   legada `SUPABASE_SERVICE_ROLE_KEY`) só para endpoints administrativos do Auth
   e para `admin_find_user_id_by_email` (executável apenas por `service_role`).
   Enviada somente no cabeçalho `apikey`; nunca retornada nem registrada em log.
7. **Respostas** `{ ok: true, ... }` ou `{ ok: false, error: { code, message } }`
   em português, sem detalhes internos. 400, 401, 403, 404, 409, 413, 500, 502.
8. **Logs** sem tokens, chaves, e-mails ou dados de clientes: função, id da
   requisição, status e duração.
9. **Idempotência**: repetir após falha parcial não duplica nem corrompe dados.

Exceção: `whatsapp-webhook` é chamada pela Meta, não pelo navegador — aceita
`GET` (verificação) e `POST`, sem CORS nem JWT; a autenticação é o token de
verificação (GET) e a assinatura HMAC do corpo (POST).

Segredos (local: `supabase/functions/.env`, não versionado; nuvem:
`supabase secrets set`): `ALLOWED_ORIGINS`, `SITE_URL`; Fase 4:
`WHATSAPP_GRAPH_VERSION`, `WHATSAPP_ACCESS_TOKEN_<UNIDADE>`,
`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `ANTHROPIC_API_KEY`,
`SDR_MODEL` (opcional). URL e chaves do projeto
são injetadas pelo Supabase (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`,
`SUPABASE_SECRET_KEYS`).

---

## `admin-invite-user`

Convida uma pessoa e cria perfil e vínculos por unidade.

**Quem pode:** quem tem `access.manage` em cada unidade informada (com MFA, se o
perfil exigir). O banco também aplica a regra anti-escalada ao perfil escolhido.

**Entrada** (máx. 8 KB):

```json
{
  "email": "pessoa@exemplo.com",
  "full_name": "Nome Completo",
  "job_title": "Manicure",
  "memberships": [{ "unit_id": "uuid", "access_profile_id": "uuid" }]
}
```

**Fluxo**

1. Autenticar; validar corpo (1 a 20 unidades, sem repetição).
2. `can_manage_access(unit_id)` com o JWT do chamador para cada unidade → 403 se falso.
3. `admin_find_user_id_by_email` (chave secreta):
   - existe com perfil → `409 user_exists`;
   - existe sem perfil (tentativa anterior incompleta) → reaproveita o id;
   - não existe → `POST /auth/v1/invite` com `redirect_to = SITE_URL/definir-senha`.
   Nenhum papel ou permissão vai para metadados do usuário.
4. `admin_provision_person` com o JWT do chamador (perfil + vínculos, em uma
   transação, sob RLS e gatilhos).
5. `201 { ok, user_id, invited }`.

## `admin-set-user-status`

Desativa ou reativa uma pessoa.

**Entrada:** `{ "user_id": "uuid", "active": false, "reason": "3 a 500 caracteres" }`
(motivo obrigatório para desativar).

**Fluxo**

1. Autenticar; validar; `user_id` igual ao do chamador → `400 cannot_change_self`.
2. Com o JWT do chamador, atualizar `profiles.active` (e motivo). O banco exige
   gestão de acessos em todas as unidades da pessoa, protege o Admin Geral e o
   último Admin Geral ativo (`409 last_admin`). Linha não visível → 404.
   **A partir daqui o acesso a dados já está cortado.**
3. Com a chave secreta, `PUT /auth/v1/admin/users/{id}` com
   `ban_duration = "876000h"` (desativar) ou `"none"` (reativar).
4. `200 { ok }`. Se o passo 3 falhar: `502 auth_block_failed` com mensagem de que
   os dados já foram cortados; repetir é seguro.

---

## `whatsapp-webhook`

Recebe eventos do WhatsApp oficial.

- `GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`: compara com
  `WHATSAPP_VERIFY_TOKEN`; correto → 200 com o `challenge` e marca o webhook
  como verificado nos canais com número cadastrado; errado → 403; sem segredo
  → 503.
- `POST` (máx. 512 KB): exige `X-Hub-Signature-256` = HMAC-SHA256 do corpo bruto
  com `WHATSAPP_APP_SECRET` (comparação em tempo constante). Inválida → 401, sem
  gravar. Válida → `whatsapp_ingest` (somente `service_role`): mensagens
  recebidas, status de entrega e opt-out por palavra-chave. Responde 200 `ok`.
- Números (`phone_number_id`) que não pertencem a nenhum canal são ignorados.

## `whatsapp-send`

Envia uma mensagem de uma conversa.

**Quem pode:** `messaging.send` na unidade e acesso à conversa. Toda a regra
(canal ativo, consentimento, janela de 24 h, modelo aprovado) está em
`messaging_prepare_send`, chamado com o JWT de quem envia.

**Entrada** (máx. 8 KB): `conversation_id`; e `body` (texto, até 4096) **ou**
`template_id` (+ `variables`, até 10); opcional `draft_id` para enviar um
rascunho.

**Fluxo:** prepara (cria a mensagem `na_fila` com `sent_by`) → token da unidade
(ausente: marca `falhou` e responde 503) → Graph API `/{phone_number_id}/messages`
→ `messaging_mark_result` (`enviada` com o id do provedor, ou `falhou`).

**Saída:** `{ ok: true, message_id }`. Erros: 400 (regra de consentimento/janela/
modelo), 401, 403, 502 (WhatsApp recusou), 503 (canal não ativo ou sem credencial).

## `whatsapp-verify-channel`

Verificações exigidas para ativar o canal.

**Quem pode:** `messaging.manage` na unidade.

**Entrada:** `unit_id`, `action`:
- `"credentials"`: GET na Graph API do número cadastrado com o token da unidade;
  sucesso marca `credentials_verified_at`.
- `"test"` (exige credencial verificada): `to`, `template_name`,
  `template_language`; envia o modelo e marca `test_message_at`.

Erros: 400 (sem número cadastrado, credencial não verificada), 403, 502, 503.

## `sdr-draft`

Sugere um rascunho de resposta com IA. **Nunca envia.**

**Quem pode:** `messaging.send` e acesso à conversa; IA ligada no canal da
unidade (`sdr_context` recusa com 55000 → 503 se desligada).

**Entrada:** `conversation_id`.

**Fluxo:** `sdr_context` (JWT do chamador: primeiro nome, serviços, últimas 20
mensagens) → sem `ANTHROPIC_API_KEY` → 503 → Messages API (modelo `SDR_MODEL`,
esforço baixo, até 1024 tokens; o histórico vai delimitado e é tratado como
dado) → recusa do modelo → 422 → `sdr_save_draft` (somente `service_role`,
registra quem pediu) → `{ ok: true, draft_id, body }`.
