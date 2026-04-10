"use client";

import { useState, type ReactNode } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppProvider, useAppState } from "@/lib/context";
import { UsuarioContext, useUsuario } from "@/lib/usuario";
import { getSupabase } from "@/lib/supabase";
import { flushPendingCloudSave } from "@/lib/store";
import type { RolUsuario } from "@/lib/types";
import { PantallaHoy } from "@/components/PantallaHoy";
import { PantallaPlan } from "@/components/PantallaPlan";
import { PantallaMapa } from "@/components/PantallaMapa";
import { PantallaURLs } from "@/components/PantallaURLs";
import { PantallaCuaderno } from "@/components/PantallaCuaderno";
import { ResultadoDetalle } from "@/components/ResultadoDetalle";
import { Buscador } from "@/components/Buscador";

type Vista = "hoy" | "plan" | "mapa" | "urls" | "cuaderno" | "resultado";

const NAV_ITEMS: { id: Vista; label: string; sublabel: string; icon: React.ReactNode }[] = [
  {
    id: "hoy",
    label: "Hoy",
    sublabel: "Operativo",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    id: "plan",
    label: "Plan",
    sublabel: "Táctico",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: "mapa",
    label: "Mapa",
    sublabel: "Estratégico",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    ),
  },
  {
    id: "urls",
    label: "URLs",
    sublabel: "Directorio",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    id: "cuaderno",
    label: "Log",
    sublabel: "Cuaderno",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <AuthGate>
      {(userId, displayName) => (
        <AppShell key={userId} userId={userId} displayName={displayName} />
      )}
    </AuthGate>
  );
}

const MENTOR_VIEWS: Vista[] = ["mapa", "plan"];

function AppShell({ userId, displayName }: { userId: string; displayName: string }) {
  const isMentorUser = userId === "mentor";
  const [vista, setVista] = useState<Vista>(isMentorUser ? "mapa" : "hoy");
  const [collapsed, setCollapsed] = useState(false);
  const [showBuscador, setShowBuscador] = useState(false);
  const [detalleResultadoId, setDetalleResultadoId] = useState<string | null>(null);
  const navItems = isMentorUser ? NAV_ITEMS.filter((i) => MENTOR_VIEWS.includes(i.id)) : NAV_ITEMS;

  function openDetalle(id: string) {
    setDetalleResultadoId(id);
    setVista("resultado");
  }

  function navigate(v: Vista) {
    setVista(v);
    setDetalleResultadoId(null);
  }

  const activeVista = vista === "resultado" ? "hoy" : vista;

  return (
    <AppProvider userId={userId} displayName={displayName}>
      <UsuarioWithRol userId={userId} nombre={displayName}>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        {/* ── Sidebar (desktop md+) ── */}
        <aside
          className={`hidden flex-col border-r border-border bg-sidebar-bg transition-[width] duration-200 md:flex ${
            collapsed ? "w-16" : "w-60"
          }`}
        >
          {/* Logo */}
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
              L
            </div>
            {!collapsed && (
              <span className="truncate text-sm font-semibold text-foreground">
                Laguna Time
              </span>
            )}
          </div>

          {/* Search */}
          {!isMentorUser && (
            <div className="px-2 pt-3">
              <button
                onClick={() => setShowBuscador(true)}
                aria-label="Buscar"
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-hover ${
                  collapsed ? "justify-center" : ""
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {!collapsed && <span>Buscar...</span>}
              </button>
            </div>
          )}

          {/* Nav links */}
          <nav className="flex flex-1 flex-col gap-0.5 px-2 pt-4">
            {navItems.map((item) => {
              const active = activeVista === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    active
                      ? "bg-sidebar-active text-foreground"
                      : "text-muted hover:bg-surface-hover hover:text-foreground"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <span className={`shrink-0 ${active ? "text-accent" : ""}`}>
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <div className="flex flex-col">
                      <span className={`text-sm font-medium leading-tight ${active ? "text-foreground" : ""}`}>
                        {item.label}
                      </span>
                      <span className="text-[11px] leading-tight text-muted">
                        {item.sublabel}
                      </span>
                    </div>
                  )}
                  {active && !collapsed && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* User + Logout */}
          <UserFooter collapsed={collapsed} />

          {/* Collapse toggle */}
          <div className="border-t border-border px-2 py-2">
            <button
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
              className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <svg
                width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round"
                className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
              >
                <polyline points="11 17 6 12 11 7" />
                <polyline points="18 17 13 12 18 7" />
              </svg>
            </button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto pb-16 md:pb-0">
            {vista === "hoy" && (
              <div className="mx-auto max-w-3xl">
                <PantallaHoy />
              </div>
            )}
            {vista === "plan" && (
              <PantallaPlan />
            )}
            {vista === "mapa" && (
              <PantallaMapa onOpenDetalle={openDetalle} />
            )}
            {vista === "urls" && (
              <div className="mx-auto max-w-4xl">
                <PantallaURLs />
              </div>
            )}
            {vista === "cuaderno" && (
              <div className="mx-auto max-w-4xl">
                <PantallaCuaderno />
              </div>
            )}
            {vista === "resultado" && detalleResultadoId && (
              <div className="mx-auto max-w-3xl">
                <ResultadoDetalle resultadoId={detalleResultadoId} onBack={() => setVista("hoy")} />
              </div>
            )}
          </div>
        </main>

        {/* ── Bottom nav (mobile only) ── */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 backdrop-blur-sm md:hidden">
          {navItems.map((item) => {
            const active = activeVista === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 transition-colors ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                {item.icon}
                <span className="text-[11px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* ── Global overlays ── */}
        {showBuscador && <Buscador onClose={() => setShowBuscador(false)} />}
      </div>
      </UsuarioWithRol>
    </AppProvider>
  );
}

function UsuarioWithRol({ userId, nombre, children }: { userId: string; nombre: string; children: ReactNode }) {
  const state = useAppState();
  const isMentorLogin = userId === "mentor";
  const member = isMentorLogin ? undefined : state.miembros.find((m) => m.nombre === nombre || m.id === userId);
  const rol: RolUsuario = isMentorLogin ? "mentor" : (member?.rol as RolUsuario) ?? "miembro";
  return (
    <UsuarioContext.Provider value={{ userId, nombre, rol }}>
      {children}
    </UsuarioContext.Provider>
  );
}

function UserFooter({ collapsed }: { collapsed: boolean }) {
  const { nombre, userId } = useUsuario();

  async function handleLogout() {
    flushPendingCloudSave();
    if (userId === "mentor") {
      sessionStorage.removeItem("laguna-mentor-session");
      window.location.reload();
      return;
    }
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
  }

  return (
    <div className="border-t border-border px-2 py-2">
      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${collapsed ? "justify-center" : ""}`}>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
          {nombre.charAt(0).toUpperCase()}
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-1 items-center justify-between">
            <span className="truncate text-sm font-medium text-foreground">{nombre}</span>
            <button
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
