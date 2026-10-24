# Funções de servidor (Edge Functions)

Contratos e estado das Edge Functions. Mudanças no contrato exigem atualizar
este arquivo e os testes no mesmo commit.

| Função | Fase | Estado |
|---|---|---|
| `admin-invite-user` | 0 | Implementada; testada na stack local |
| `admin-set-user-status` | 0 | Implementada; testada na stack local |

A importação do Trinks (Fase 2) **não usa Edge Function**: o CSV é lido no
navegador e o banco valida, classifica e grava por funções `SECURITY DEFINER`
que verificam `imports.run` do chamador (`import_*`). Assim nenhuma chave
secreta é necessária e a auditoria registra o ator real.

Funções das fases seguintes são acrescentadas a esta tabela quando
implementadas.

Local: `supabase/functions/<nome>/index.ts` (Deno/TypeScript), código comum em
`supabase/functions/_shared/`.

## Regras comuns

1. **Sem dependências externas.** As funções usam apenas `fetch` nas APIs REST
   e Auth do próprio projeto (`_shared/supabase.ts`). Isso elimina download de
   pacotes no boot e reduz a superfície de cadeia de suprimentos.
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

Segredos (local: `supabase/functions/.env`, não versionado; nuvem:
`supabase secrets set`): `ALLOWED_ORIGINS`, `SITE_URL`. URL e chaves do projeto
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
