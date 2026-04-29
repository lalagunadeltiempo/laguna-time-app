"use client";

import { createContext, useContext } from "react";
import type { RolUsuario } from "./types";

interface UsuarioCtx {
  userId: string;
  nombre: string;
  rol: RolUsuario;
}

export const UsuarioContext = createContext<UsuarioCtx>({
  userId: "local",
  nombre: "Gabi",
  rol: "admin",
});

export function useUsuario() {
  return useContext(UsuarioContext);
}

export function useIsMentor() {
  const { rol } = useUsuario();
  return rol === "mentor";
}

/** Solo Gabi y Beltrán pueden ver el Árbol de objetivos. */
function normalizarNombre(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
const NOMBRES_AUTORIZADOS_ARBOL = new Set(["gabi", "beltran"]);
export function puedeVerArbolObjetivos(nombre: string | undefined | null): boolean {
  if (!nombre) return false;
  return NOMBRES_AUTORIZADOS_ARBOL.has(normalizarNombre(nombre));
}
export function usePuedeVerArbol(): boolean {
  const { nombre } = useUsuario();
  return puedeVerArbolObjetivos(nombre);
}

/** @deprecated — use useUsuario().nombre instead */
export const USUARIO_ACTUAL = "Gabi";
