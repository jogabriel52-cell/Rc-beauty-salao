import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Alert, Button, Spinner, TextInput } from "../../components/ui";
import { supabase } from "../../lib/supabase";

interface Enrollment {
  factorId: string;
  qr: string;
  secret: string;
}

// Exigida para perfis com MFA obrigatório (Admin Geral, Direção ou outro
// marcado). Cadastra o app autenticador na primeira vez; depois só verifica.
export function MfaPage() {
  const { refresh, signOut, access } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        setError("Não foi possível consultar o MFA.");
        setLoading(false);
        return;
      }
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) {
        setFactorId(verified.id);
      } else {
        // Remove cadastros antigos não concluídos e inicia um novo.
        for (const f of data.all.filter((x) => x.status !== "verified")) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        const r = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Aplicativo autenticador" });
        if (r.error) setError("Não foi possível iniciar o cadastro do MFA.");
        else setEnrollment({ factorId: r.data.id, qr: r.data.totp.qr_code, secret: r.data.totp.secret });
      }
      setLoading(false);
    })();
  }, []);

  async function verify(e: FormEvent) {
    e.preventDefault();
    const id = factorId ?? enrollment?.factorId;
    if (!id) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: code.trim() });
    setBusy(false);
    if (error) {
      setError("Código inválido. Confira o horário do celular e tente de novo.");
      return;
    }
    await refresh();
  }

  if (loading) return <div className="auth-page"><Spinner /></div>;

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={verify}>
        <h1>Verificação em duas etapas</h1>
        <p className="muted">
          {access?.full_name ? `${access.full_name}, seu` : "Seu"} perfil exige um código do aplicativo autenticador
          (Google Authenticator, Microsoft Authenticator, 1Password etc.).
        </p>
        <Alert kind="error">{error}</Alert>
        {enrollment && (
          <div className="mfa-enroll">
            <p>1. Escaneie o QR code no aplicativo:</p>
            <img src={enrollment.qr} alt="QR code para o aplicativo autenticador" width={180} height={180} />
            <details>
              <summary>Não consegue escanear? Digite a chave</summary>
              <code className="secret" data-testid="mfa-secret">{enrollment.secret}</code>
            </details>
            <p>2. Digite o código de 6 dígitos gerado:</p>
          </div>
        )}
        <TextInput label="Código" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
          required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        <Button type="submit" busy={busy}>Verificar</Button>
        <button type="button" className="link-btn" onClick={() => void signOut()}>Sair</button>
      </form>
    </div>
  );
}
