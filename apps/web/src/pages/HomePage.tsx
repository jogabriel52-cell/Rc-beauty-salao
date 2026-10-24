import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/ui";

export function HomePage() {
  const { access, unit } = useAuth();
  return (
    <>
      <PageHeader title={`Olá, ${access?.full_name.split(" ")[0] ?? ""}`} subtitle={unit ? `${unit.name} · ${unit.access_profile}` : undefined} />
      <p className="muted">Use o menu para acessar os módulos liberados para o seu perfil.</p>
    </>
  );
}
