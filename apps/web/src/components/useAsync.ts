import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/errors";

// Carrega dados assíncronos com estado de carregamento/erro e recarga manual.
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const run = useCallback(async () => {
    const current = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      if (current === seq.current) setData(result);
    } catch (e) {
      if (current === seq.current) setError(errorMessage(e));
    } finally {
      if (current === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void run();
  }, [run]);

  return { data, error, loading, reload: run, setData };
}

// Lança o erro do Supabase para ser tratado por useAsync/handlers.
export function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

// Executa uma ação com estado de envio e mensagem de erro traduzida.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
