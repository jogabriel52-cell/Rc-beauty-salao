import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { MyAccess, UnitAccess } from "../lib/access";

interface AuthState {
  loading: boolean;
  session: Session | null;
  access: MyAccess | null;
  unit: UnitAccess | null;
  setUnitId: (id: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  needsMfa: boolean;
}

const AuthContext = createContext<AuthState | null>(null);
const UNIT_KEY = "rc.unit";

function readStoredUnit(): string | null {
  try {
    return localStorage.getItem(UNIT_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [unitId, setUnitIdState] = useState<string | null>(readStoredUnit());

  const loadAccess = useCallback(async (s: Session | null) => {
    if (!s) {
      setAccess(null);
      return;
    }
    const { data, error } = await supabase.rpc("my_access");
    if (error) {
      setAccess(null);
      return;
    }
    setAccess((data as unknown as MyAccess | null) ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadAccess(data.session);
      if (mounted) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Evita chamadas ao banco dentro do callback do Auth (recomendação do supabase-js).
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "MFA_CHALLENGE_VERIFIED" ||
          event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setTimeout(() => void loadAccess(s), 0);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadAccess]);

  const unit = useMemo(() => {
    if (!access?.units.length) return null;
    return access.units.find((u) => u.unit_id === unitId) ?? access.units[0]!;
  }, [access, unitId]);

  const setUnitId = useCallback((id: string) => {
    setUnitIdState(id);
    try {
      localStorage.setItem(UNIT_KEY, id);
    } catch {
      // armazenamento indisponível: segue sem lembrar a unidade
    }
  }, []);

  const value: AuthState = {
    loading,
    session,
    access,
    unit,
    setUnitId,
    refresh: () => loadAccess(session),
    signOut: async () => {
      await supabase.auth.signOut();
      setAccess(null);
    },
    needsMfa: !!access && access.mfa_required && access.aal !== "aal2",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}

// Unidade ativa garantida (para páginas dentro do app).
export function useUnit(): UnitAccess {
  const { unit } = useAuth();
  if (!unit) throw new Error("Sem unidade ativa");
  return unit;
}
