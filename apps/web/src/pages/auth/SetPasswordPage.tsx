import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { Alert, Button, Spinner, TextInput } from "../../components/ui";
import { supabase } from "../../lib/supabase";

// Usada pelo link do convite e pelo link de redefinição de senha.
export function SetPasswordPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <div className="auth-page"><Spinner /></div>;
  if (!session) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Link inválido ou expirado</h1>
          <p>Peça um novo convite à direção ou use “Esqueci minha senha” na tela de entrada.</p>
          <a className="btn btn-secondary" href="/entrar">Ir para a entrada</a>
        </div>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      setError("A senha deve ter ao menos 10 caracteres, com letras e números.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError("Não foi possível definir a senha. Tente uma senha diferente.");
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Definir senha</h1>
        <p className="muted">{session.user.email}</p>
        <Alert kind="error">{error}</Alert>
        <TextInput label="Nova senha" type="password" autoComplete="new-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} hint="Mínimo de 10 caracteres, com letras e números." />
        <TextInput label="Confirmar senha" type="password" autoComplete="new-password" required value={confirm}
          onChange={(e) => setConfirm(e.target.value)} />
        <Button type="submit" busy={busy}>Salvar senha</Button>
      </form>
    </div>
  );
}
