# Revisão de segurança

Registro do que foi desenhado, verificado e do que falta. **Não atesta que o
sistema é seguro**: a validação no projeto Supabase Cloud de desenvolvimento
(nível 2) ainda não foi feita e nada foi exposto a usuários reais.

## Ativos e ameaças principais

| Ativo | Ameaça | Controle |
|---|---|---|
| Dados de clientes (identidade, contato, notas de CRM) | Leitura sem vínculo ou de outra unidade | RLS por `permission_scope`; vínculo explícito por unidade; nada para `anon` |
| Dados da cliente na agenda do profissional | Exposição de telefone, e-mail e notas privadas | Profissional não lê cadastro; agenda própria via função com campos mínimos (Fase 1) |
| Contas e permissões | Autoescalada, autoconcessão, rebaixamento do Admin Geral | Anti-escalada, autoproteção, proteção do Admin Geral, MFA, auditoria |
| Chave secreta | Vazamento | Só em Edge Functions, só no cabeçalho `apikey`; lint e verificação do bundle no frontend |
| Auditoria | Apagamento ou falsificação | Gravada só por gatilho `SECURITY DEFINER`; sem escrita pela API; ator forçado pelo banco |
| Ex-funcionário | Acesso após desligamento | `profiles.active` verificado em toda permissão (corte imediato) + bloqueio de login |
| Sessão roubada de diretor | Uso de senha vazada | MFA obrigatório (`aal2`) para Admin Geral e Direção |

## Controles implementados (Fase 0)

- RLS em todas as tabelas de `public`; GRANTs explícitos por tabela e coluna;
  privilégios padrão revogados para objetos futuros.
- `execute` de funções revogado de `public`/`anon`; liberado a `authenticated`
  apenas onde necessário; `admin_find_user_id_by_email` só para `service_role`.
- Funções `SECURITY DEFINER` com `search_path = ''` (verificado por teste).
- Perfis de acesso editáveis com escopo; anti-escalada; ninguém altera as
  próprias permissões; acessos do Admin Geral só por Admin Geral; último Admin
  Geral protegido; perfil em uso não pode ser desativado.
- MFA (`aal2`) exigido no banco para perfis marcados e para o Admin Geral.
- Auditoria de todas as concessões de acesso, inclusive de modelos.
- Cadastro público desativado; login só por convite; senha mínima de 10
  caracteres com letras e números (configuração local; replicar no Cloud).
- Edge Functions sem dependências externas, com CORS por lista, autenticação
  antes de qualquer processamento e validação estrita do corpo.

## Verificações executadas

Detalhes e histórico em `docs/BUILD_AND_VALIDATION.md`.

| Data | Nível | O quê | Resultado |
|---|---|---|---|
| 2026-10-24 | 0 — **preliminar** (PostgreSQL 16 + imitação do Auth) | Modelo inicial, 70 asserções | Passou. Não é validação oficial do Supabase. |
| 2026-10-24 | 1 — stack local oficial | Modelo inicial, mesmas 70 asserções | Passou |
| 2026-10-24 | 1 — stack local oficial | Fase 0: pgTAP 69, integração 20 (Auth real, MFA, funções) | Passou após correção de 7 falhas (listadas em BUILD_AND_VALIDATION) |
| 2026-10-24 | 3 — aplicação local | E2E 3, build sem segredo | Passou |

## Não verificado

- Projeto Supabase Cloud de desenvolvimento (nível 2) e **Security Advisor** —
  aguardando a referência do projeto Cloud da RC Beauty.
- Configurações do Auth no Cloud (SMTP próprio, URLs de redirecionamento,
  proteção contra senha vazada) — dependem do projeto Cloud.
- Testes de carga/desempenho das políticas com volume realista.

## Pendências antes de dados reais

| # | Item | Tipo | Situação |
|---|---|---|---|
| P1 | Validar migrações e testes na stack local oficial | Bloqueante | **Feito** (Fase 0) |
| P2 | Validar no Cloud de desenvolvimento; Security Advisor sem erros, avisos justificados | Bloqueante | Pendente — falta a referência do projeto |
| P3 | Funções de convite e desativação conforme contrato | Bloqueante | **Feito** e testado localmente |
| P4 | Cadastro público desativado, URLs restritas, SMTP próprio no Cloud | Bloqueante | Local feito; Cloud pendente |
| P5 | MFA obrigatório para Admin Geral e Direção | Bloqueante | **Feito** (banco + tela) |
| P6 | LGPD: base legal, aviso de privacidade, retenção (inclusive auditoria com dados pessoais), atendimento a titulares | Bloqueante | Pendente — decisão jurídica/negócio |
| P7 | Backup e restauração testados; PITR conforme plano | Bloqueante | Pendente — depende do projeto Cloud e do plano |
| P8 | Projeto de produção separado, com chaves próprias | Bloqueante | Fora do escopo atual (não conectar produção) |
| P9 | Proteção contra senha vazada (conforme plano) | Recomendado | Pendente — Cloud |
| P10 | CSP e cabeçalhos de segurança na hospedagem | Recomendado | Pendente — hospedagem não escolhida |
| P11 | Desempenho das políticas com volume realista | Recomendado | Pendente |
| P12 | Proteção de branch e varredura de segredos no repositório | Recomendado | Pendente — configuração do GitHub |

### Fase 1

Controles: identidade única com visibilidade restrita a quem tem `clients.view`
em unidade vinculada; busca entre unidades só por telefone/e-mail idênticos,
com nome e telefone mascarados; vínculo exige prova (mesmo telefone/e-mail);
notas privadas em tabela própria (`crm.view`); profissional sem acesso a
cadastro e CRM, com agenda por função de campos mínimos; mescla só na unidade;
comandas e estoque com regras no banco; movimentos e CRM somente inclusão.

| # | Item | Tipo | Situação |
|---|---|---|---|
| P13 | Confirmar com o jurídico que compartilhar nome/contato entre as duas unidades (identidade única) é compatível com o aviso de privacidade e a base legal | Bloqueante (LGPD) | Pendente — decisão externa |
| P14 | A busca mascarada revela a existência de um cadastro com aquele telefone/e-mail em outra unidade (primeiro nome + inicial). Risco aceito pelo requisito de evitar duplicidade; revisar com a direção | Decisão | Pendente |
| P15 | Conflito de horário do mesmo profissional entre unidades não é detectado | Recomendado | Pendente |
| P16 | Retenção e anonimização de clientes inativas (direito de eliminação) | Bloqueante (LGPD) | Pendente — política a definir |

### Fase 2

Controles: arquivo lido no navegador (só campos mapeados chegam ao banco);
mapeamento com dupla conferência; funções `import_*` verificam `imports.run`;
prévia sem gravar em clientes; nenhuma mescla automática; reimportação do mesmo
arquivo bloqueada; linhas de prévia apagadas no descarte e expurgáveis.

| # | Item | Tipo | Situação |
|---|---|---|---|
| P17 | Conferir mapeamento com exportação real do Trinks (sem versionar o arquivo) | Bloqueante para importar dados reais | Pendente — depende do arquivo |
| P18 | Definir prazo de retenção das linhas de prévia e agendar o expurgo | Recomendado (LGPD) | Função pronta; agendamento pendente |
| P19 | Dados reais só podem ser importados no ambiente aprovado para dados reais (não no Cloud de desenvolvimento) | Bloqueante | Regra registrada |

### Fase 3

Controles: permissões separadas para ver, lançar e conciliar; comissões com
visão própria; ninguém configura/apura/aprova/paga a própria comissão;
aprovação por outra pessoa; regras de lançamento e conciliação no banco;
extratos entram só por CSV (nenhuma credencial bancária armazenada).

| # | Item | Tipo | Situação |
|---|---|---|---|
| P20 | Confirmar os parâmetros de comissão listados em `COMMISSIONS.md` | Bloqueante para pagar comissões | Pendente — decisão da direção |
| P21 | Definir se vendas das comandas entram no fluxo de caixa automaticamente ou por lançamento manual | Decisão | Pendente |
| P22 | Integração bancária/adquirente por API | Futuro | Sem credenciais; CSV em uso |

### Fase 4

Controles: canal oficial por unidade, bloqueado até verificações gravadas só
pelo servidor; credenciais apenas em segredos de Edge Functions (nunca no banco
ou no frontend); webhook com assinatura HMAC verificada antes de gravar;
consentimento por finalidade em eventos somente de inclusão, com opt-out por
palavra-chave e datas futuras recusadas; envio decidido no banco com o JWT de
quem envia (permissão, canal ativo, opt-in/opt-out, janela de 24 h, modelo
aprovado); pessoas só criam rascunhos; IA desligada por padrão, só rascunhos,
com dados mínimos (sem telefone, e-mail ou CRM) e o histórico tratado como dado
no prompt; conteúdo de mensagens fora da auditoria.

| # | Item | Tipo | Situação |
|---|---|---|---|
| P23 | Conta WhatsApp Business verificada, tokens permanentes por unidade, segredo do app e versão da Graph API nos segredos do projeto | Bloqueante para enviar | Pendente — credenciais externas |
| P24 | Teste de ponta a ponta contra a Graph API (credencial, teste, envio, status, webhook real com assinatura da Meta) | Bloqueante para declarar a integração validada | **Não executado** |
| P25 | Texto de consentimento e fluxo de coleta revisados (LGPD) | Bloqueante para ativar | Pendente — decisão da direção |
| P26 | Uso da SDR IA: base legal, aviso às clientes, termos do provedor, chave em conta da empresa | Bloqueante para ligar a IA | Pendente — decisão da direção |
| P27 | Retenção de mensagens e de consentimento (prazo, expurgo/anonimização) | Recomendado (LGPD) | Pendente |
| P28 | Limite de taxa no webhook e alerta para falhas de assinatura repetidas | Recomendado | Pendente (Meta já limita a origem; sem limitador próprio) |
| P29 | "Modelo aprovado" é declarado manualmente na tela; sincronizar com a Meta | Recomendado | Pendente — exige credenciais |
| P30 | PARAR de número ainda sem cadastro | Bloqueante para ativar | **Corrigido e testado localmente**: fica registrado na conversa, bloqueia qualquer envio até novo opt-in e vira opt-out da cliente quando o cadastro é vinculado |
| P31 | Confirmar ao contato que o pedido de saída foi recebido (mensagem automática) | Decisão | Não implementado (nenhum envio automático) |
| P32 | Aplicar as migrações no Cloud de desenvolvimento e repetir pgTAP, RLS/grants e advisors lá | Bloqueante para validar nível 2 | Pendente — ver `CLOUD_SETUP.md` ("Aplicação pendente") |
| P33 | Auth do Cloud de desenvolvimento (cadastro desligado, confirmação de e-mail, TOTP, senha, URLs) | Bloqueante para usuários de teste | Pendente — instruções exatas em `CLOUD_SETUP.md` |
| P34 | Frontend na Hostinger: endereço, SSL/Forçar HTTPS, URLs do Auth e `ALLOWED_ORIGINS` | Antes de publicar | Preparado (`.htaccess`, CSP, `build:hosting`); publicação pendente (`HOSTING.md`) |

## Sobre o SQL original do Builder

Descartado como fonte de execução (misturava quatro fases, descrevia funções
inexistentes, políticas insuficientes). Pode ser mantido apenas como
referência histórica fora de `supabase/migrations/`.

## Como reportar um problema de segurança

Canal privado com o responsável pelo projeto, com passos para reproduzir.
Suspeita de vazamento de chave: revogar a chave no painel imediatamente e
depois investigar.
