# Integrações

Nenhuma integração externa está implementada. Este documento registra o que
se sabe, o que não se presume e o que precisa existir antes de cada uma.

| Integração | Status | Fase |
|---|---|---|
| Trinks (migração de dados) | Não implementada — planejada por CSV | 2 |
| E-mail transacional (convites) | Configuração do SMTP no Supabase Auth | 1 |
| WhatsApp | Não implementada — sem provedor escolhido | 4 |
| Banco / conciliação | Não implementada — sem desenho | 4 |

## Trinks

### O que se presume

Nada além de que é possível exportar dados em planilha/CSV pelo próprio
Trinks. **Nenhuma API é presumida.** Se uma API oficial for confirmada no
futuro, com documentação e contrato, ela será avaliada como alternativa.

### Processo

1. Gerar uma exportação real de clientes no Trinks.
2. Analisar a exportação **sem versionar o arquivo** e sem colá-la em issues,
   prompts ou logs. Registrar apenas os nomes das colunas, a codificação
   (UTF-8 ou Windows-1252), o separador (`,` ou `;`) e os formatos de data e
   telefone.
3. Escrever o mapa de colunas em `docs/TRINKS_MAPPING.md` (a criar),
   indicando para cada coluna: campo de destino, transformação, obrigatoriedade
   e o que fazer com valores inválidos. Aprovar o mapa com a gestão do salão.
4. Gerar um arquivo de teste **fictício** com o mesmo cabeçalho para os testes
   automatizados.
5. Implementar a função de importação conforme `SERVER_FUNCTIONS.md`.
6. Importar primeiro no projeto de desenvolvimento com o arquivo fictício;
   depois, com o arquivo real, somente no ambiente aprovado para dados reais.

### Regras da importação

- Unidade de destino escolhida explicitamente em cada lote. Um lote nunca
  grava em duas unidades.
- Prévia obrigatória antes de gravar: total de linhas, válidas, inválidas
  (com motivo), possíveis duplicadas.
- Identificador do Trinks, se existir na exportação, vai para
  `clients.external_ref` com `source = 'trinks_csv'`; reimportar o mesmo arquivo
  não duplica clientes.
- Possível duplicado com cadastro manual (mesmo telefone) não é mesclado
  automaticamente: fica para revisão.
- Histórico de atendimentos só será importado se a exportação o contiver e
  houver mapa aprovado para profissionais e serviços.

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

## Banco / conciliação (Fase 4)

Depende do desenho financeiro da Fase 3. Alternativas a avaliar então:
importação de extrato (OFX/CSV) ou API do banco/Open Finance via instituição
autorizada. Nenhuma credencial bancária deve ser armazenada pela aplicação sem
projeto e revisão específicos.

## E-mail transacional (Fase 1)

O SMTP padrão do Supabase serve apenas para testes com membros da equipe do
projeto e tem limite de envio baixo. Antes de convidar usuários reais,
configurar SMTP próprio em Authentication → SMTP Settings e personalizar os
modelos de e-mail em português (`CLOUD_SETUP.md`).
