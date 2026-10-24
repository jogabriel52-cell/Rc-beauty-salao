# Operação

Regras de negócio da Fase 1 e rotinas administrativas. Regras marcadas com
**(banco)** são impostas pela migração; as demais são da aplicação ou de
processo.

## Unidades

- **RC Beauty Geral** (`geral`) e **Sala VIP** (`vip`) são operadas como
  unidades separadas: cada uma tem seus clientes, profissionais, serviços e
  agenda **(banco)**.
- Um funcionário que atua nas duas unidades tem dois vínculos, um em cada,
  possivelmente com papéis diferentes.
- Um profissional que atende nas duas unidades tem um cadastro de profissional
  em cada unidade. Conflitos de horário entre unidades **não** são detectados
  nesta fase (pendência para a Fase 2, junto com a jornada de profissionais).

## Clientes

- Cadastro mínimo: nome completo. Telefone recomendado, armazenado só com
  dígitos e opcionalmente `+`, de 8 a 15 dígitos **(banco)**. A aplicação
  normaliza para o formato `55DDDNÚMERO` antes de gravar.
- Antes de criar, a aplicação busca por telefone e nome na unidade e mostra
  possíveis duplicados.
- Observações: até 2000 caracteres **(banco)**. Não registrar dados de saúde
  sensíveis além do necessário ao atendimento (ex.: alergia a um produto), e
  nunca documentos (CPF, RG) nesta fase.
- Clientes não são apagados: são **arquivados** **(banco)**. Cliente arquivado
  não aparece na busca padrão, mas o histórico de agendamentos permanece.

## Serviços

- Nome único por unidade entre serviços ativos **(banco)**.
- Duração de 5 a 720 minutos; preço em centavos, opcional **(banco)**.
- Serviço desativado não aparece para novos agendamentos, mas continua nos
  agendamentos antigos.

## Agenda

- Horários gravados em `timestamptz`, exibidos em `America/Sao_Paulo`.
- Um agendamento tem cliente, profissional e serviço **da mesma unidade**
  **(banco)**. Duração máxima de 12 horas **(banco)**.
- A aplicação sugere o horário de término a partir da duração do serviço;
  a recepção pode ajustar.
- Um profissional não pode ter dois agendamentos ativos sobrepostos
  **(banco)**. Mensagem ao usuário: "Este profissional já tem atendimento nesse
  horário."

### Status

```
agendado ──► confirmado ──► concluido
   │             │
   │             ├──► nao_compareceu
   └─────────────┴──► cancelado (final, exige motivo)
```

- `cancelado` exige motivo e é definitivo; para remarcar após cancelar, criar
  novo agendamento **(banco)**.
- Cancelado e não comparecimento liberam o horário para outro agendamento
  **(banco)**.
- Quem cancelou e quando são registrados automaticamente **(banco)**.
- A aplicação deve impedir transições sem sentido (ex.: `concluido` →
  `agendado`) na interface; o banco hoje só impõe as regras do cancelamento.

## Rotinas administrativas

### Entrada de funcionário

1. Admin Geral convida pela tela de administração (e-mail, nome, unidade(s),
   papel).
2. Se for profissional, cadastrar o profissional na unidade e ligar ao usuário.
3. Conferir com o funcionário o primeiro acesso.

### Saída ou afastamento

1. Desativar o usuário no mesmo dia, com motivo.
2. Desativar o cadastro de profissional, se houver, depois de redistribuir os
   agendamentos futuros.

### Revisão mensal de acessos (Admin Geral)

```sql
-- Vínculos ativos por unidade
select u.name as unidade, p.full_name, m.role, m.created_at
from public.unit_memberships m
join public.profiles p on p.id = m.user_id
join public.units u on u.id = m.unit_id
where m.active and p.active
order by u.name, m.role, p.full_name;

-- Exceções individuais vigentes
select u.name as unidade, p.full_name, o.permission_code, o.effect, o.reason, o.created_at
from public.membership_permission_overrides o
join public.unit_memberships m on m.id = o.membership_id
join public.profiles p on p.id = m.user_id
join public.units u on u.id = m.unit_id
order by u.name, p.full_name;

-- Admins Gerais
select p.full_name, p.active, pa.created_at
from public.platform_admins pa join public.profiles p on p.id = pa.user_id;
```

Remover exceções que deixaram de ser necessárias; preferir ajustar o papel.

### Backup e restauração

- Definir, antes de dados reais, a frequência de backup e testar uma
  restauração em projeto separado (pendência P7).
- Exportações manuais (`pg_dump`) contêm dados pessoais: armazenar
  criptografadas, fora do repositório, com acesso restrito e prazo de descarte.

### Incidentes

- Suspeita de acesso indevido: desativar a conta envolvida, consultar
  `audit_log` pelo período e preservar os registros.
- Suspeita de vazamento de chave: rotacionar a chave no painel do Supabase e
  revisar os logs.
- Registrar o incidente, a causa e as ações tomadas. Avaliar obrigação de
  comunicação prevista na LGPD com o responsável jurídico.
