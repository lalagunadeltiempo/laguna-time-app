"use client";

import { useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppProvider } from "@/lib/context";
import { PantallaHoy } from "@/components/PantallaHoy";
import { PantallaPlan } from "@/components/PantallaPlan";
import { PantallaMapa } from "@/components/PantallaMapa";
import { ResultadoDetalle } from "@/components/ResultadoDetalle";
import { Buscador } from "@/components/Buscador";

type Vista = "hoy" | "plan" | "mapa" | "resultado";

export default function Home() {
  return (
    <AuthGate>
      {(userId) => <AppShell userId={userId} />}
    </AuthGate>
  );
}

function AppShell({ userId }: { userId: string }) {
  const [vista, setVista] = useState<Vista>("hoy");
  const [showBuscador, setShowBuscador] = useState(false);
  const [detalleResultadoId, setDetalleResultadoId] = useState<string | null>(null);

  function openDetalle(id: string) {
    setDetalleResultadoId(id);
    setVista("resultado");
  }

  return (
    <AppProvider userId={userId}>
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col pb-14">
        {vista === "hoy" && (
          <PantallaHoy onOpenBuscador={() => setShowBuscador(true)} />
        )}
        {vista === "plan" && (
          <PantallaPlan onOpenDetalle={openDetalle} />
        )}
        {vista === "mapa" && (
          <PantallaMapa onOpenDetalle={openDetalle} />
        )}
        {vista === "resultado" && detalleResultadoId && (
          <ResultadoDetalle resultadoId={detalleResultadoId} onBack={() => setVista("hoy")} />
        )}

        <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-lg -translate-x-1/2 border-t border-zinc-100 bg-white/95 backdrop-blur-sm">
          <NavBtn active={vista === "hoy"} label="Hoy" onClick={() => setVista("hoy")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          </NavBtn>
          <NavBtn active={vista === "plan"} label="Plan" onClick={() => setVista("plan")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          </NavBtn>
          <NavBtn active={vista === "mapa"} label="Mapa" onClick={() => setVista("mapa")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>
          </NavBtn>
        </nav>

        {showBuscador && <Buscador onClose={() => setShowBuscador(false)} />}
      </div>
    </AppProvider>
  );
}

function NavBtn({ active, label, onClick, children }: {
  active: boolean; label: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 transition-colors ${active ? "text-amber-500" : "text-zinc-400 hover:text-zinc-600"}`}>
      {children}
      <span className={`text-[10px] font-medium ${active ? "text-amber-500" : "text-zinc-400"}`}>{label}</span>
    </button>
  );
}
