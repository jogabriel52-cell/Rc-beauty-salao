# Integrações

Registro do que está implementado, do que não se presume e do que depende
de credenciais ou decisões externas.

| Integração | Status | Fase |
|---|---|---|
| Trinks (migração de clientes por CSV) | **Implementada e testada na stack local** com arquivo fictício; formato real ainda não conferido | 2 |
| E-mail transacional (convites) | Funciona na stack local (Mailpit); SMTP próprio no Cloud pendente | 0 |
| WhatsApp (WhatsApp Business Platform / Cloud API) | **Implementado, bloqueado até credenciais oficiais.** Testado na stack local sem a Meta (webhook com segredos fictícios, recusas por falta de credencial); **nunca testado contra a Graph API real** | 4 |
| SDR IA (sugestão de respostas, Anthropic) | **Implementada, desligada por padrão.** Testada só a recusa sem chave/IA desligada; **nunca chamada de verdade** | 4 |
| Banco / adquirente | **Extrato por CSV implementado** (conciliação manual assistida); nenhuma API conectada | 3 |

## Trinks

### O que se presume

Nada além de que é possível exportar clientes do Trinks em CSV. **Nenhuma API
é presumida** e **nenhum nome de coluna está fixado no código**.

### Como funciona (tela Importação Trinks, permissão `imports.run`)

1. **Mapeamento**: a partir de uma exportação real, a pessoa escolhe qual
   cabeçalho corresponde a cada campo (nome — obrigatório —, telefone, e-mail,
   nascimento, código no Trinks, observações) e o formato das datas. A tela
   mostra as 3 primeiras linhas para conferência. O mapeamento é salvo como
   **rascunho**.
2. **Conferência**: **outra pessoa** com permissão de importação aprova o
   mapeamento. Editar um mapeamento aprovado o devolve para rascunho.
3. **Leitura no navegador**: o arquivo (até 5 MB e 20 000 linhas) é lido no
   navegador, com detecção de codificação (UTF-8 ou Windows-1252) e de separador
   (`;`, `,`, tabulação, `|`). Só os campos mapeados são enviados; o arquivo
   bruto não sai do computador. É calculado o SHA-256 do arquivo.
4. **Prévia** (nada é gravado em clientes): o banco normaliza telefone e datas,
   valida e-mail e classifica cada linha:

   | Classificação | Sugestão | Pode mudar? |
   |---|---|---|
   | Nova | Criar | Criar ou ignorar |
   | Vincular (mesmo telefone/e-mail e mesmo primeiro nome de cadastro de outra unidade) | Vincular | Vincular, criar ou ignorar |
   | Possível duplicidade (mesmo telefone/e-mail com nome diferente, ou mesmo nome nesta unidade) | **Sem sugestão — decisão obrigatória** | Criar, vincular (se houver cadastro de outra unidade) ou ignorar |
   | Já existe nesta unidade (mesmo código do Trinks, telefone ou e-mail) | Ignorar | Não |
   | Repetida no arquivo | Ignorar | Não |
   | Inválida (sem nome) | Ignorar | Não |

   Problemas de campo (telefone, e-mail ou data inválidos) ficam registrados na
   linha e o campo é descartado.
5. **Confirmação**: só com todas as linhas recebidas e decididas. Cria
   identidades e vínculos com origem `trinks_csv` e o código do Trinks; vincular
   reaproveita a identidade e só completa campos vazios; observações viram nota
   privada de CRM. O mesmo arquivo (mesmo SHA-256) não pode ser confirmado duas
   vezes na mesma unidade.
6. **Descarte** apaga as linhas da prévia. Linhas de lotes encerrados podem ser
   expurgadas pelo administrador do banco (`select public.import_purge_staging(30);`).

### Pendências da importação

- **Conferir o formato real**: gerar uma exportação de clientes no Trinks, criar
  o mapeamento com ela (sem versionar o arquivo) e pedir a conferência de outra
  pessoa. O arquivo `supabase/tests/fixtures/trinks_clientes_ficticio.csv` é
  fictício e serve só aos testes.
- **Histórico de atendimentos/vendas** do Trinks: não importado. Exige
  exportação correspondente e mapa próprio de profissionais e serviços.
- Agendar o expurgo periódico das linhas de prévia (ex.: `pg_cron`) ou executar
  manualmente na rotina mensal.

## WhatsApp (Fase 4)

### Decisões

- Somente a **plataforma oficial** (WhatsApp Business Platform, Cloud API da
  Meta). Bibliotecas que automatizam o WhatsApp Web estão fora de questão.
- Um canal por unidade (`messaging_channels`), com número próprio. Os dados da
  Geral e da VIP não se misturam: conversas, consentimento e modelos são por
  unidade.
- **Nenhuma credencial na aplicação ou no banco.** Tokens e segredos ficam
  apenas nos segredos das Edge Functions:

  | Segredo | Uso |
  |---|---|
  | `WHATSAPP_GRAPH_VERSION` | Versão da Graph API (ex.: `v23.0`; definir conforme a conta Meta — não presumida) |
  | `WHATSAPP_ACCESS_TOKEN_GERAL`, `WHATSAPP_ACCESS_TOKEN_VIP` | Token permanente de usuário do sistema por unidade |
  | `WHATSAPP_APP_SECRET` | Segredo do app (assinatura `X-Hub-Signature-256` do webhook) |
  | `WHATSAPP_VERIFY_TOKEN` | Token de verificação do webhook (valor escolhido pela equipe) |

  Sem eles as funções respondem **503** e nada é enviado. Na stack local,
  `supabase/functions/.env` tem apenas valores **fictícios** de segredo do app
  e token de verificação, para testar o webhook.

### Ativação (bloqueada pelo banco)

O canal só pode ficar `ativo` quando **todas** as marcas abaixo existirem — e
elas são gravadas apenas pelo servidor (a aplicação não consegue marcá-las):

1. Número (`phone_number_id`) e **texto de consentimento** cadastrados
   (Mensagens → Configurar canal).
2. **Credencial verificada**: a função `whatsapp-verify-channel` confirma na
   Graph API que o token da unidade acessa o número.
3. **Webhook verificado**: a Meta chama `whatsapp-webhook` com o token de
   verificação correto.
4. **Mensagem de teste** enviada com um modelo aprovado para um número da
   equipe.

Trocar o número ou a conta apaga as verificações e tira o canal de `ativo`.

### Envio (`whatsapp-send`)

O banco (`messaging_prepare_send`, com o JWT de quem envia) decide:

| Situação | Resultado |
|---|---|
| Sem `messaging.send` ou sem acesso à conversa | Recusado (403) |
| Canal não ativo | Recusado (503) |
| Opt-out da finalidade | Recusado |
| Marketing sem opt-in | Recusado |
| Fora da janela de 24 h desde a última mensagem da cliente | Só modelo **aprovado**, e só com opt-in |
| Dentro da janela, resposta de atendimento sem opt-out | Permitido |

Modelos de mensagem são criados e aprovados no WhatsApp Manager da Meta e
**cadastrados manualmente** na tela (mesmo nome e idioma). A situação
"aprovado" é declarada por quem tem `messaging.manage`; a sincronização
automática com a Meta não foi implementada.

### Recebimento (`whatsapp-webhook`)

- Assinatura HMAC-SHA256 verificada sobre o corpo bruto antes de qualquer
  gravação; inválida → 401.
- Mensagens recebidas criam/reabrem a conversa da unidade dona do número e são
  ligadas à cliente pelo telefone normalizado. Reentregas (mesmo id) são
  ignoradas.
- Status de entrega (`sent`, `delivered`, `read`, `failed`) atualizam as
  mensagens enviadas.
- **Opt-out por palavra-chave**: `PARAR`, `SAIR`, `STOP`, `CANCELAR`,
  `DESCADASTRAR` (mensagem só com a palavra, sem diferenciar maiúsculas)
  registram o pedido **no número** (`conversations.opted_out_at`), mesmo que
  ainda não exista cadastro, e bloqueiam qualquer envio para ele — inclusive
  resposta dentro de 24 h — até haver opt-in registrado depois. Havendo cliente
  vinculada, registram também opt-out de atendimento e de marketing; se o
  cadastro for vinculado depois, o opt-out é copiado para a cliente com a data
  original. Nenhuma mensagem de confirmação é enviada automaticamente
  (decisão pendente).

### Pendências (dependem de credenciais ou decisões externas)

- Conta WhatsApp Business verificada pela Meta, números de cada unidade,
  app e usuário do sistema com token permanente.
- Definir a versão da Graph API e configurar os quatro segredos no projeto de
  desenvolvimento (`supabase secrets set`) — pedir confirmação antes.
- Configurar na Meta a URL do webhook do projeto de desenvolvimento.
- Criar e aprovar os modelos (confirmação, lembrete, retorno, pesquisa).
- **Testar de ponta a ponta contra a Graph API** (verificação de credencial,
  envio de teste, envio de texto e de modelo, status de entrega, webhook real).
  Até isso acontecer, a integração **não está validada**.
- Texto de consentimento revisado pela direção (e, se possível, por
  assessoria jurídica — LGPD).
- Mídia (imagens, áudios) recebida aparece como `[image]`/`[audio]`; download
  de mídia não foi implementado.

## SDR IA (Fase 4)

- Função `sdr-draft`: gera **somente rascunho**; a pessoa revisa, edita e envia.
  Nunca envia sozinha.
- Desligada por padrão; ligar é decisão da Direção (`messaging.manage`), por
  unidade, e fica auditado (quem e quando).
- Dados enviados ao provedor (Anthropic, Messages API): primeiro nome, últimas
  20 mensagens da conversa e lista de serviços da unidade (nome, duração,
  preço). **Não** envia telefone, e-mail, CRM nem observações de atendimento.
- Segredo `ANTHROPIC_API_KEY` só nas Edge Functions; modelo configurável em
  `SDR_MODEL`. Sem chave → 503.
- Pendências: decisão da direção sobre o tratamento de dados por terceiro
  (LGPD: base legal, aviso às clientes, contrato/termos do provedor); criar a
  chave em conta da empresa; testar a qualidade das sugestões com conversas
  fictícias antes de ligar em uma unidade.

## Banco e adquirente

- **Hoje**: extratos em CSV exportados do internet banking ou do portal da
  adquirente, importados em Financeiro → Conciliação. As colunas são escolhidas
  no envio (o formato de cada banco varia); valores aceitam `1.234,56`,
  `-1.234,56`, `(123,45)` e `50,00-`.
- **API**: só depois de confirmar instituição, contrato e credenciais. Nenhuma
  credencial bancária é armazenada pela aplicação; quando existir, ficará em
  segredos de Edge Function, com revisão de segurança própria.
- OFX ainda não é aceito (pode ser acrescentado se o banco não oferecer CSV).

## E-mail transacional (Fase 1)

O SMTP padrão do Supabase serve apenas para testes com membros da equipe do
projeto e tem limite de envio baixo. Antes de convidar usuários reais,
configurar SMTP próprio em Authentication → SMTP Settings e personalizar os
modelos de e-mail em português (`CLOUD_SETUP.md`).
