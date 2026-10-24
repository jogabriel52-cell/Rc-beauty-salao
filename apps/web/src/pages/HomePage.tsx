import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader, Spinner } from "../components/ui";
import { can } from "../lib/access";
const DashboardPage = lazy(async () => ({ default: (await import("./ops/DashboardPage")).DashboardPage }));

// Início: painel operacional para quem tem acesso; profissionais vão para a
// própria agenda.
export function HomePage() {
  const { access, unit } = useAuth();
  if (unit && can(unit, "dashboard.view")) return <Suspense fallback={<Spinner />}><DashboardPage /></Suspense>;
  if (unit && can(unit, "appointments.view") && !can(unit, "appointments.view", "unit")) {
    return <Navigate to="/minha-agenda" replace />;
  }
  return (
    <>
      <PageHeader title={`Olá, ${access?.full_name.split(" ")[0] ?? ""}`} subtitle={unit ? `${unit.name} · ${unit.access_profile}` : undefined} />
      <p className="muted">Use o menu para acessar os módulos liberados para o seu perfil.</p>
    </>
  );
}
