import { mergeStates, statesDiffer } from "./merge";
import type { AppState } from "./types";
import { mergeCloudReviews } from "./store";

export function tieneFocoEdicion(activeElement: Element | null): boolean {
  const el = activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

export function aplicarMergeRemotoSiSeguro(
  estadoLocal: AppState,
  estadoRemoto: AppState,
  estaFocoActivo: boolean,
): { merge: boolean; merged: AppState } {
  if (estaFocoActivo) {
    return { merge: false, merged: estadoLocal };
  }
  let merged = mergeStates(estadoLocal, estadoRemoto);
  merged = mergeCloudReviews(merged, estadoRemoto);
  return { merge: statesDiffer(estadoLocal, merged), merged };
}
