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
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError("Email o contraseña incorrectos");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-3xl font-bold text-zinc-900">Laguna Time App</h1>
        <p className="mb-8 text-center text-base text-zinc-500">
          Inicia sesión para continuar
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
              placeholder="Contraseña"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-500 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {loading ? "..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
