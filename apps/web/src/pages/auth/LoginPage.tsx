import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { Alert, Button, TextInput } from "../../components/ui";
import { supabase } from "../../lib/supabase";

export function LoginPage() {
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (session) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError("E-mail ou senha incorretos, ou acesso bloqueado.");
  }

  async function forgot() {
    if (!email.trim()) {
      setError("Informe seu e-mail para receber o link de redefinição.");
      return;
    }
    setError(null);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/definir-senha` });
    // Mensagem neutra: não revela se o e-mail existe.
    setInfo("Se o e-mail estiver cadastrado, você receberá um link para definir uma nova senha.");
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand brand-center"><span className="brand-mark">RC</span><span>RC Beauty</span></div>
        <h1>Entrar</h1>
        <Alert kind="error">{error}</Alert>
        <Alert kind="info">{info}</Alert>
        <TextInput label="E-mail" type="email" autoComplete="username" required value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <TextInput label="Senha" type="password" autoComplete="current-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" busy={busy}>Entrar</Button>
        <button type="button" className="link-btn" onClick={() => void forgot()}>Esqueci minha senha</button>
        <p className="muted small">O acesso é feito somente por convite da direção.</p>
      </form>
    </div>
  );
}
