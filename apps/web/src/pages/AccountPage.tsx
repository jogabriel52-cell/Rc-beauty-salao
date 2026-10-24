import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Alert, Badge, Button, PageHeader, TextInput } from "../components/ui";
import { useAction, useAsync } from "../components/useAsync";
import { SCOPE_LABEL } from "./admin/accessData";
import { supabase } from "../lib/supabase";

export function AccountPage() {
  const { access, session } = useAuth();
  const [password, setPassword] = useState("");
  const action = useAction();
  const [ok, setOk] = useState(false);
  const factors = useAsync(async () => (await supabase.auth.mfa.listFactors()).data?.totp ?? [], []);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setOk(false);
    if (password.length < 10 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      action.setError("A senha deve ter ao menos 10 caracteres, com letras e números.");
      return;
    }
    const done = await action.run(async () => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error("Não foi possível alterar a senha.");
    });
    if (done) { setOk(true); setPassword(""); }
  }

  if (!access) return null;
  return (
    <>
      <PageHeader title="Minha conta" subtitle={session?.user.email} />
      <section className="card">
        <h3>Meus acessos</h3>
        {access.is_platform_admin && <p><Badge tone="info">Admin Geral</Badge></p>}
        {access.units.map((u) => (
          <details key={u.unit_id}>
            <summary><strong>{u.name}</strong> — {u.access_profile}</summary>
            <ul className="perm-grid">
              {Object.entries(u.permissions).map(([code, scope]) => (
                <li key={code}><span>{code}</span><span className="muted small">{SCOPE_LABEL[scope]}</span></li>
              ))}
            </ul>
          </details>
        ))}
        <p className="muted small">Para alterar seus acessos, peça a outra pessoa responsável. Ninguém altera as próprias permissões.</p>
      </section>
      <section className="card">
        <h3>Verificação em duas etapas</h3>
        <p>{(factors.data ?? []).some((f) => f.status === "verified")
          ? <Badge tone="success">Ativa</Badge> : <Badge>Não cadastrada</Badge>}
          {access.mfa_required && <span className="muted small"> Obrigatória para o seu perfil.</span>}</p>
      </section>
      <form className="card" onSubmit={changePassword}>
        <h3>Alterar senha</h3>
        <Alert kind="error">{action.error}</Alert>
        {ok && <Alert kind="success">Senha alterada.</Alert>}
        <TextInput label="Nova senha" type="password" autoComplete="new-password" value={password}
          onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" busy={action.busy}>Salvar</Button>
      </form>
    </>
  );
}
