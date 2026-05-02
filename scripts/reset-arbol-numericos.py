#!/usr/bin/env python3
"""Resetea los datos numéricos de 2025/2026 y borra la raíz 2027 de prueba.

Operaciones:
- Borra todos los registros (`arbol.registros`) cuya `periodoKey` toque 2025, 2026 o 2027
  (formas `"YYYY"`, `"YYYY-Qn"`, `"YYYY-MM"`, `"YYYY-MM-DD"`).
- Borra todos los nodos con `anio === 2027` y sus registros residuales.
- En los nodos con `anio ∈ {2025, 2026}` elimina `metaValor` y `metaPorTrimestre`
  (estructura y nombres se conservan intactos).

Conserva el resto del estado (configs, reviews, entregables, notas, tombstones, etc.).

Uso:
  python scripts/reset-arbol-numericos.py --dry-run   # muestra el diff sin subir
  python scripts/reset-arbol-numericos.py             # aplica y sube a Supabase
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

WORKSPACE_ID = "workspace-laguna"
ANIOS_RESET = {2025, 2026, 2027}
ANIOS_BORRAR_NODOS = {2027}

PERIODO_PREFIX_RE = re.compile(r"^(20\d{2})(?:$|-)")


def load_env() -> tuple[str, str]:
    env_file = Path(__file__).resolve().parent.parent / ".env.local"
    supa_url = supa_key = None
    for line in env_file.read_text().splitlines():
        if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
            supa_url = line.split("=", 1)[1].strip()
        elif line.startswith("NEXT_PUBLIC_SUPABASE_ANON_KEY="):
            supa_key = line.split("=", 1)[1].strip()
    if not supa_url or not supa_key:
        sys.exit("Falta NEXT_PUBLIC_SUPABASE_URL o ANON_KEY en .env.local")
    return supa_url, supa_key


def supabase_select(url: str, key: str) -> dict:
    full = f"{url}/rest/v1/user_data?select=state,updated_at&user_id=eq.{WORKSPACE_ID}"
    req = urllib.request.Request(
        full,
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        rows = json.loads(resp.read())
    if not rows:
        sys.exit("No hay fila en user_data para el workspace.")
    return rows[0]


def supabase_upsert(url: str, key: str, state: dict) -> None:
    full = f"{url}/rest/v1/user_data?on_conflict=user_id"
    payload = json.dumps(
        {
            "user_id": WORKSPACE_ID,
            "state": state,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
    ).encode()
    req = urllib.request.Request(
        full,
        data=payload,
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read()
        if resp.status >= 400:
            sys.exit(f"Upsert fallido: {resp.status} {body!r}")


def registro_toca_anios(reg: dict, anios: set[int]) -> bool:
    pk = reg.get("periodoKey") or ""
    m = PERIODO_PREFIX_RE.match(pk)
    if not m:
        return False
    try:
        y = int(m.group(1))
    except ValueError:
        return False
    return y in anios


def sum_valor(regs: list[dict]) -> float:
    return sum(float(r.get("valor") or 0) for r in regs)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="no sube cambios, solo imprime el diff")
    args = parser.parse_args()

    url, key = load_env()
    row = supabase_select(url, key)
    state = row["state"] or {}
    arbol = state.get("arbol") or {}
    nodos: list[dict] = list(arbol.get("nodos") or [])
    registros: list[dict] = list(arbol.get("registros") or [])
    configs = arbol.get("configs") or []

    ts = time.strftime("%Y%m%d-%H%M%S", time.localtime())
    backup = Path(__file__).resolve().parent.parent / f".cloud-backup-before-reset-{ts}.json"
    backup.write_text(json.dumps(row, ensure_ascii=False, indent=2))
    print(f"Backup guardado en {backup}")

    # --- Resumen previo ---
    total_regs = len(registros)
    total_nodos = len(nodos)
    total_eur = sum_valor(registros)
    nodos_por_anio_antes = {}
    for n in nodos:
        nodos_por_anio_antes[n.get("anio")] = nodos_por_anio_antes.get(n.get("anio"), 0) + 1
    print("Estado previo:")
    print(f"  Nodos: {total_nodos} · Registros: {total_regs} · Total €: {total_eur:,.2f}")
    for y, c in sorted(nodos_por_anio_antes.items(), key=lambda kv: (kv[0] is None, kv[0])):
        print(f"    año {y}: {c} nodos")

    # --- 1. Borrar nodos 2027 (estructura de prueba) ---
    ids_nodos_2027 = {n["id"] for n in nodos if n.get("anio") in ANIOS_BORRAR_NODOS}
    nodos_tras_borrado = [n for n in nodos if n.get("anio") not in ANIOS_BORRAR_NODOS]
    nodos_borrados = len(nodos) - len(nodos_tras_borrado)

    # --- 2. Borrar registros: toque 2025/26/27 por periodoKey O pertenezca a nodos 2027 ---
    regs_a_borrar = [
        r
        for r in registros
        if r.get("nodoId") in ids_nodos_2027 or registro_toca_anios(r, ANIOS_RESET)
    ]
    ids_regs_a_borrar = {r["id"] for r in regs_a_borrar}
    regs_tras_borrado = [r for r in registros if r["id"] not in ids_regs_a_borrar]
    regs_borrados = len(regs_a_borrar)

    # --- 2.5. Tombstones: evitar que clientes con estado local viejo "resuciten" lo borrado. ---
    deleted = state.get("deleted") or {}
    prev_deleted_regs = set(deleted.get("arbolRegistros") or [])
    prev_deleted_nodos = set(deleted.get("arbolNodos") or [])
    new_deleted_regs = sorted(prev_deleted_regs | ids_regs_a_borrar)
    new_deleted_nodos = sorted(prev_deleted_nodos | ids_nodos_2027)
    tombstones_regs_nuevas = len(set(new_deleted_regs) - prev_deleted_regs)
    tombstones_nodos_nuevas = len(set(new_deleted_nodos) - prev_deleted_nodos)

    # --- 3. Limpiar metas en 2025/2026 ---
    nodos_limpiados = 0
    for n in nodos_tras_borrado:
        if n.get("anio") in {2025, 2026}:
            cambio = False
            if "metaValor" in n and n.get("metaValor") is not None:
                n.pop("metaValor", None)
                cambio = True
            if "metaPorTrimestre" in n and n.get("metaPorTrimestre"):
                n.pop("metaPorTrimestre", None)
                cambio = True
            if cambio:
                nodos_limpiados += 1

    # --- Diff ---
    print()
    print("Cambios previstos:")
    print(f"  Registros borrados: {regs_borrados} (de {total_regs})")
    print(f"  Nodos 2027 borrados: {nodos_borrados}")
    print(f"  Nodos 2025/26 con meta limpiada: {nodos_limpiados}")
    print(f"  Lápidas nuevas en deleted.arbolRegistros: {tombstones_regs_nuevas}")
    print(f"  Lápidas nuevas en deleted.arbolNodos:    {tombstones_nodos_nuevas}")
    print(f"  Lápidas totales tras reset: {len(new_deleted_regs)} registros + {len(new_deleted_nodos)} nodos")
    eur_borrado = sum_valor(regs_a_borrar)
    eur_restante = sum_valor(regs_tras_borrado)
    print(f"  Total € en registros a borrar: {eur_borrado:,.2f}")
    print(f"  Total € que queda tras reset:  {eur_restante:,.2f}")

    # Detalle para ayudar a auditar
    por_anio = {}
    for r in regs_a_borrar:
        m = PERIODO_PREFIX_RE.match(r.get("periodoKey") or "")
        y = int(m.group(1)) if m else "?"
        por_anio[y] = por_anio.get(y, 0) + 1
    for y, c in sorted(por_anio.items(), key=lambda kv: (kv[0] is None, kv[0])):
        print(f"    registros con periodoKey {y}: {c}")

    if args.dry_run:
        print()
        print("--dry-run activo: no se sube ningún cambio. Revisa el resumen y vuelve a ejecutar sin el flag.")
        return 0

    # --- Aplicar al state ---
    arbol["nodos"] = nodos_tras_borrado
    arbol["registros"] = regs_tras_borrado
    # configs intactos
    arbol["configs"] = configs
    state["arbol"] = arbol

    # Tombstones: garantía de que los clientes con estado local viejo no resuciten los datos.
    deleted["arbolRegistros"] = new_deleted_regs
    deleted["arbolNodos"] = new_deleted_nodos
    # Rellena defaults para no romper merge si la fila venía sin ciertos campos.
    deleted.setdefault("proyectos", [])
    deleted.setdefault("resultados", [])
    deleted.setdefault("entregables", [])
    deleted.setdefault("pasos", [])
    deleted.setdefault("plantillas", [])
    deleted.setdefault("notas", [])
    state["deleted"] = deleted

    supabase_upsert(url, key, state)
    print()
    print("Reset aplicado en Supabase. Haz hard-refresh en la app para ver el estado limpio.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
