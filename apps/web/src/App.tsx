import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { Button, Spinner } from "./components/ui";
import { AppShell } from "./layout/AppShell";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/auth/LoginPage";
import { MfaPage } from "./pages/auth/MfaPage";
import { SetPasswordPage } from "./pages/auth/SetPasswordPage";
import { routes as moduleRoutes } from "./routes";

function Protected({ children }: { children: ReactNode }) {
  const { loading, session, access, needsMfa, signOut } = useAuth();
  const location = useLocation();
  if (loading) return <div className="auth-page"><Spinner /></div>;
  if (!session) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (!access || !access.active) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Acesso não liberado</h1>
          <p>Sua conta não tem acesso ativo. Fale com a direção.</p>
          <Button variant="secondary" onClick={() => void signOut()}>Sair</Button>
        </div>
      </div>
    );
  }
  if (needsMfa) return <MfaPage />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/definir-senha" element={<SetPasswordPage />} />
          <Route element={<Protected><AppShell /></Protected>}>
            <Route index element={<HomePage />} />
            {moduleRoutes}
            <Route path="*" element={<p>Página não encontrada.</p>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
