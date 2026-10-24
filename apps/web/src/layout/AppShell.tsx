import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { initials } from "../lib/format";
import { NAV } from "./nav";

export function AppShell() {
  const { access, unit, setUnitId, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  if (!access) return null;

  const items = NAV.filter((i) => i.visible(unit, access));
  const sections = [...new Set(items.map((i) => i.section))];

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">RC</span>
          <span>RC Beauty</span>
        </div>
        <nav aria-label="Navegação principal" onClick={() => setOpen(false)}>
          {sections.map((s) => (
            <div key={s} className="nav-section">
              <span className="nav-section-title">{s}</span>
              {items.filter((i) => i.section === s).map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(!open)} aria-label="Abrir menu">☰</button>
          {access.units.length > 0 ? (
            <label className="unit-select">
              <span className="sr-only">Unidade</span>
              <select value={unit?.unit_id ?? ""} onChange={(e) => setUnitId(e.target.value)} aria-label="Unidade ativa">
                {access.units.map((u) => <option key={u.unit_id} value={u.unit_id}>{u.name}</option>)}
              </select>
            </label>
          ) : <span className="muted">Sem unidade vinculada</span>}
          <div className="topbar-right">
            {unit && <span className="muted small hide-mobile">{unit.access_profile}</span>}
            <NavLink to="/conta" className="avatar" title="Minha conta">{initials(access.full_name)}</NavLink>
            <button className="btn btn-ghost" onClick={() => void signOut()}>Sair</button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
