"use client";

import { createContext, useContext } from "react";

interface UsuarioCtx {
  userId: string;
  nombre: string;
}

export const UsuarioContext = createContext<UsuarioCtx>({
  userId: "local",
  nombre: "Gabi",
});

export function useUsuario() {
  return useContext(UsuarioContext);
}

/** @deprecated — use useUsuario().nombre instead */
export const USUARIO_ACTUAL = "Gabi";
