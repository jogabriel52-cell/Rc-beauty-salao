# Pedido inicial para o Claude Code

Copie o bloco abaixo como primeira mensagem ao Claude Code, na raiz do
repositório.

---

```
Você vai trabalhar no projeto RC Beauty. Antes de escrever qualquer código:

1. Leia README.md e CLAUDE.md inteiros e siga CLAUDE.md como regra.
2. Leia docs/SECURITY_REVIEW.md, docs/ACCESS_CONTROL.md, docs/PHASE_PLAN.md,
   docs/ARCHITECTURE.md e docs/SERVER_FUNCTIONS.md.
3. Me diga, em poucas linhas, o que entendeu do escopo da Fase 1 e quais
   pendências bloqueantes existem. Não comece a implementar antes da minha
   confirmação.

Depois da minha confirmação, execute a Fase 0 e o início da Fase 1 nesta ordem,
parando ao fim de cada etapa para me mostrar o resultado:

Etapa A — Banco
- Rode ./scripts/precheck-migrations.sh e mostre o resultado.
- Se a Supabase CLI e o Docker estiverem disponíveis: supabase init (sem apagar
  supabase/migrations), supabase start, supabase db reset e rode
  supabase/tests/rls_phase1_test.sql contra o banco local. Mostre a saída.
- Não aplique nada em projeto remoto sem eu pedir.

Etapa B — Esqueleto do frontend em apps/web
- React + TypeScript + Vite, modo estrito do TypeScript, ESLint.
- Cliente Supabase com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
  (crie apps/web/.env.example sem valores reais).
- Tipos gerados com supabase gen types (não escreva tipos de tabela à mão).
- Telas: login, definição de senha pelo link do convite, seletor de unidade a
  partir dos vínculos ativos do usuário, layout com navegação conforme
  my_permissions(unit_id), logout.
- Interface em português do Brasil.
- Testes: typecheck, lint, build, e um teste de ponta a ponta do login contra
  a stack local, se disponível.

Etapa C — Agenda e clientes
- Agenda do dia por profissional (criar, remarcar, confirmar, concluir, falta,
  cancelar com motivo), "Minha agenda" via get_my_agenda, busca e cadastro de
  clientes com aviso de possíveis duplicados.
- Mensagens claras para 42501 (sem permissão) e 23P01 (conflito de horário).

Regras durante todo o trabalho:
- Não crie tabelas ou migrações fora do escopo da Fase 1.
- Qualquer mudança de banco é uma migração nova, com testes em supabase/tests.
- Nunca coloque chave secreta no frontend, em VITE_*, no repositório ou em logs.
- Não use dados reais. Use dados fictícios com domínio .invalid.
- Ao final de cada etapa, informe: o que mudou, comandos executados com
  resultado, o que não foi testado e próximos passos. Não descreva nada como
  "seguro" ou "validado" além do que foi efetivamente testado.
```

---

Próximos pedidos sugeridos, um de cada vez, depois das etapas acima:

1. Implementar `admin-invite-user`, `admin-deactivate-user` e
   `admin-reactivate-user` exatamente conforme `docs/SERVER_FUNCTIONS.md`, com
   a migração auxiliar e os testes.
2. Telas de administração (usuários, vínculos, exceções) e de auditoria.
3. MFA para Admin Geral (pendência P5), com migração exigindo `aal2`.
4. Cadastro de serviços e profissionais.
