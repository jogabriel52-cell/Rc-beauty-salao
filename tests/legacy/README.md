# Testes do modelo inicial (histórico)

`rls_phase1_baseline_test.sql` contém as 70 asserções escritas para a migração
inicial (`20261024000000_phase1_core.sql`, papéis fixos em enum), preservadas
como registro.

| Data | Ambiente | Natureza | Resultado |
|---|---|---|---|
| 2026-10-24 | PostgreSQL 16.15 + simulador mínimo do Auth | **Preliminar** — não é validação do Supabase | 70/70 |
| 2026-10-24 | Stack local oficial do Supabase (CLI 2.122.0, PostgreSQL 17.11) | Validação oficial local | 70/70 |

Ambas as execuções foram no commit `31d01c2`. A migração da Fase 0 substituiu
os papéis fixos por perfis editáveis, então este arquivo não roda mais contra o
esquema atual. A cobertura equivalente está em `supabase/tests/database/`
(pgTAP) e em `tests/integration/`. Para reexecutar o original:

```bash
git checkout 31d01c2 -- supabase/migrations/20261024000000_phase1_core.sql
# aplicar só essa migração em um banco descartável e rodar este arquivo com psql
```
