"use client";

import { useState, useEffect, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

interface Props {
  children: (userId: string) => ReactNode;
}

export function AuthGate({ children }: Props) {
  const supabase = getSupabase();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return;
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  if (!supabase) {
    return <>{children("local")}</>;
  }

  if (session === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-lg text-zinc-400">Cargando...</p>
      </div>
    );
  }

  if (session) {
    return <>{children(session.user.id)}</>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError("");
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) { setError(err.message); return; }
        setError("Revisa tu email para confirmar la cuenta.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) { setError(err.message); return; }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-3xl font-bold text-zinc-900">Laguna Time App</h1>
        <p className="mb-8 text-center text-base text-zinc-500">
          {mode === "login" ? "Inicia sesión para continuar" : "Crea tu cuenta"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border-2 border-zinc-200 px-4 py-3 text-base text-zinc-900 outline-none transition-colors focus:border-amber-400"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-700">Contraseña</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border-2 border-zinc-200 px-4 py-3 text-base text-zinc-900 outline-none transition-colors focus:border-amber-400"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          {error && (
            <p className={`rounded-lg px-4 py-2 text-sm ${error.includes("email") || error.includes("Revisa") ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-600"}`}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-500 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {loading ? "..." : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
          className="mt-6 block w-full text-center text-sm text-zinc-500 hover:text-zinc-700"
        >
          {mode === "login" ? "¿No tienes cuenta? Crear una" : "Ya tengo cuenta, iniciar sesión"}
        </button>
      </div>
    </div>
  );
}
