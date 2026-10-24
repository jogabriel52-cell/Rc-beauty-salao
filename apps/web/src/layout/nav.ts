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
  { to: "/configuracoes/pessoas", label: "Pessoas e acessos", section: "Administração",
    visible: (_u, a) => a.is_platform_admin || a.units.some((x) => can(x, "access.manage")) },
  { to: "/configuracoes/perfis", label: "Perfis de acesso", section: "Administração",
    visible: (_u, a) => a.units.some((x) => can(x, "access.manage")) || a.is_platform_admin },
  { to: "/auditoria", label: "Auditoria", section: "Administração", visible: any("audit.view") },
];
