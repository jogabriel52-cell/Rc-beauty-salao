// Itens de navegação. Cada item aparece se o usuário tiver alguma das
// permissões na unidade ativa (ou condição especial). Apenas conveniência de
// interface: o banco recusa o que não for permitido.
import type { MyAccess, UnitAccess } from "../lib/access";
import { can, canAny } from "../lib/access";

export interface NavItem {
  to: string;
  label: string;
  section: string;
  visible: (unit: UnitAccess | null, access: MyAccess) => boolean;
}

const any = (...perms: string[]) => (u: UnitAccess | null) => canAny(u, perms);

export const NAV: NavItem[] = [
  { to: "/", label: "Início", section: "Operação", visible: () => true },
  { to: "/agenda", label: "Agenda", section: "Operação", visible: (u) => can(u, "appointments.view", "unit") },
  { to: "/minha-agenda", label: "Minha agenda", section: "Operação",
    visible: (u) => can(u, "appointments.view") && !can(u, "appointments.view", "unit") },
  { to: "/clientes", label: "Clientes", section: "Operação", visible: any("clients.view") },
  { to: "/comandas", label: "Comandas", section: "Operação", visible: any("sales.view", "sales.open") },
  { to: "/estoque", label: "Estoque", section: "Operação", visible: any("stock.view") },
  { to: "/relatorios", label: "Relatórios", section: "Gestão", visible: any("reports.view") },
  { to: "/financeiro", label: "Financeiro", section: "Gestão", visible: any("finance.view", "finance.reconcile") },
  { to: "/comissoes", label: "Comissões", section: "Gestão", visible: any("commissions.view", "commissions.manage") },
  { to: "/servicos", label: "Serviços", section: "Cadastros", visible: any("services.view") },
  { to: "/profissionais", label: "Profissionais", section: "Cadastros", visible: any("professionals.view") },
  { to: "/importacao", label: "Importação Trinks", section: "Administração", visible: any("imports.run") },
  { to: "/configuracoes/pessoas", label: "Pessoas e acessos", section: "Administração",
    visible: (_u, a) => a.is_platform_admin || a.units.some((x) => can(x, "access.manage")) },
  { to: "/configuracoes/perfis", label: "Perfis de acesso", section: "Administração",
    visible: (_u, a) => a.units.some((x) => can(x, "access.manage")) || a.is_platform_admin },
  { to: "/auditoria", label: "Auditoria", section: "Administração", visible: any("audit.view") },
];
