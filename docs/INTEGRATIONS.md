# Integrações

Registro do que está implementado, do que não se presume e do que depende
de credenciais ou decisões externas.

| Integração | Status | Fase |
|---|---|---|
| Trinks (migração de clientes por CSV) | **Implementada e testada na stack local** com arquivo fictício; formato real ainda não conferido | 2 |
| E-mail transacional (convites) | Funciona na stack local (Mailpit); SMTP próprio no Cloud pendente | 0 |
| WhatsApp | Não implementada | 4 |
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

Pré-requisitos antes de qualquer código:

- Uso da plataforma oficial do WhatsApp Business, diretamente ou por provedor
  com contrato. Bibliotecas não oficiais que automatizam o WhatsApp Web estão
  fora de questão (risco de bloqueio do número e de segurança).
- Consentimento registrado do cliente para mensagens, com opção de saída.
- Modelos de mensagem aprovados (confirmação, lembrete, cancelamento).
- Segredos do provedor apenas em Edge Functions; webhooks com verificação de
  assinatura.
- Tabelas próprias (consentimento, fila de mensagens, registro de envio)
  desenhadas e revisadas na fase.

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
