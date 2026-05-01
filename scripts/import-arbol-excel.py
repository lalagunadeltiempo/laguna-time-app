#!/usr/bin/env python3
"""Importa al cloud del usuario los datos de Q1 2025, Q2 2025 y Q1 2026 desde el Excel.

Lee el estado actual de Supabase (user_data / workspace-laguna), aplica las
mutaciones en memoria y sube el nuevo estado. Imprime un diff amigable.
"""
from __future__ import annotations
import json
import os
import random
import string
import sys
import time
import unicodedata
from collections import defaultdict
from pathlib import Path

import openpyxl
import urllib.request
import urllib.parse

# --- Config ---
EXCEL = Path("/Users/gabi/Downloads/ÁRBOL 2025 - 2026.xlsx")
WORKSPACE_ID = "workspace-laguna"
RAMA_MAP_2026 = {
    "Aula": "Aulas",
    "Colaboración": "Colaboraciones y afiliados",
    "Individual": "Psicoanálisis individual",
    "Plan de Salud": "Planes de salud",
}
# Para 2025 uso los mismos nombres que en 2026 para consistencia visual.
RAMA_MAP_2025 = RAMA_MAP_2026


def load_env() -> tuple[str, str]:
    env_file = Path(__file__).resolve().parent.parent / ".env.local"
    supa_url = supa_key = None
    for line in env_file.read_text().splitlines():
        if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
            supa_url = line.split("=", 1)[1].strip()
        elif line.startswith("NEXT_PUBLIC_SUPABASE_ANON_KEY="):
            supa_key = line.split("=", 1)[1].strip()
    if not supa_url or not supa_key:
        sys.exit("Falta SUPABASE_URL o ANON_KEY en .env.local")
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


def gen_id() -> str:
    ts = int(time.time() * 1000)
    base36 = ""
    n = ts
    while n > 0:
        n, rem = divmod(n, 36)
        base36 = "0123456789abcdefghijklmnopqrstuvwxyz"[rem] + base36
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=5))
    return base36 + suffix


def norm(s: str) -> str:
    if s is None:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().strip()
    if s.endswith("s"):
        s = s[:-1]
    return s


def read_excel() -> dict[str, list[tuple]]:
    wb = openpyxl.load_workbook(EXCEL, data_only=True)
    out: dict[str, list[tuple]] = {"q1-2025": [], "q2-2025": [], "q1-2026": []}
    mapping = {"q1 - 2025": "q1-2025", "q2 - 2025": "q2-2025", "Q1 - 2026": "q1-2026"}
    for sheet_name, key in mapping.items():
        ws = wb[sheet_name]
        for r in ws.iter_rows(values_only=True):
            if not r or r[0] is None or r[0] == "Rama":
                continue
            rama, hoja, mes, uds, eur = r[0], r[1], r[2], r[3], r[4]
            out[key].append(
                (
                    str(rama).strip(),
                    str(hoja).strip(),
                    int(mes),
                    int(uds) if uds is not None else 0,
                    float(eur) if eur is not None else 0.0,
                )
            )
    return out


def aggregate(rows: list[tuple]) -> list[tuple]:
    """Suma duplicados (rama, hoja, mes) en las filas del Excel."""
    agg: dict[tuple[str, str, int], list[float]] = defaultdict(lambda: [0, 0.0])
    for rama, hoja, mes, uds, eur in rows:
        k = (rama, hoja, mes)
        agg[k][0] += uds
        agg[k][1] += eur
    return [(r, h, m, u, e) for (r, h, m), (u, e) in agg.items()]


def find_or_create_nodo(nodos: list[dict], *, anio: int, parent_id: str | None, nombre: str,
                         tipo: str = "palanca", cadencia: str = "anual",
                         relacion: str = "suma", meta_valor: float | None = None,
                         meta_unidad: str | None = None) -> tuple[dict, bool]:
    """Busca por anio + parent + nombre. Si no existe, lo crea y devuelve (nodo, True)."""
    n_nombre = norm(nombre)
    for n in nodos:
        if n.get("anio") != anio:
            continue
        if (n.get("parentId") or None) != (parent_id or None):
            continue
        if norm(n.get("nombre", "")) == n_nombre:
            return n, False
    orden = 1 + max(
        (n.get("orden", -1)
         for n in nodos
         if n.get("anio") == anio and (n.get("parentId") or None) == (parent_id or None)),
        default=-1,
    )
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    nodo: dict = {
        "id": gen_id(),
        "anio": anio,
        "orden": orden,
        "nombre": nombre,
        "tipo": tipo,
        "cadencia": cadencia,
        "relacionConPadre": relacion,
        "contadorModo": "manual",
        "creado": now,
    }
    if parent_id:
        nodo["parentId"] = parent_id
    if meta_valor is not None:
        nodo["metaValor"] = meta_valor
    if meta_unidad:
        nodo["metaUnidad"] = meta_unidad
    nodos.append(nodo)
    return nodo, True


def upsert_registro(registros: list[dict], *, nodo_id: str, periodo_key: str,
                     valor: float, unidades: int | None = None) -> tuple[bool, bool]:
    """Devuelve (creado, actualizado)."""
    for r in registros:
        if r["nodoId"] == nodo_id and r["periodoTipo"] == "mes" and r["periodoKey"] == periodo_key:
            changed = r.get("valor") != valor or r.get("unidades") != unidades
            if changed:
                r["valor"] = valor
                if unidades is not None:
                    r["unidades"] = unidades
                r["actualizado"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
            return False, changed
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    registros.append(
        {
            "id": gen_id(),
            "nodoId": nodo_id,
            "periodoTipo": "mes",
            "periodoKey": periodo_key,
            "valor": valor,
            **({"unidades": unidades} if unidades is not None else {}),
            "creado": now,
            "actualizado": now,
        }
    )
    return True, False


def process_sheet(rows: list[tuple], *, anio: int, nodos: list[dict], registros: list[dict],
                   rama_map: dict[str, str], raiz: dict, stats: dict) -> None:
    rama_cache: dict[str, dict] = {}
    for rama_csv in {r[0] for r in rows}:
        rama_nombre = rama_map.get(rama_csv, rama_csv)
        rama_nodo, created = find_or_create_nodo(
            nodos,
            anio=anio,
            parent_id=raiz["id"],
            nombre=rama_nombre,
            tipo="palanca",
            relacion="suma",
            meta_unidad=raiz.get("metaUnidad"),
        )
        rama_cache[rama_csv] = rama_nodo
        if created:
            stats["ramas_creadas"].append(f"{anio} · {rama_nombre}")

    hoja_cache: dict[tuple[str, str], dict] = {}
    for rama_csv, hoja_nombre, mes, uds, eur in rows:
        rama_nodo = rama_cache[rama_csv]
        key = (rama_csv, hoja_nombre)
        hoja_nodo = hoja_cache.get(key)
        if hoja_nodo is None:
            hoja_nodo, created = find_or_create_nodo(
                nodos,
                anio=anio,
                parent_id=rama_nodo["id"],
                nombre=hoja_nombre,
                tipo="palanca",
                relacion="suma",
                meta_unidad=raiz.get("metaUnidad"),
            )
            hoja_cache[key] = hoja_nodo
            if created:
                stats["hojas_creadas"].append(f"{anio} · {rama_nodo['nombre']} > {hoja_nombre}")
        periodo_key = f"{anio}-{mes:02d}"
        creado, actualizado = upsert_registro(
            registros, nodo_id=hoja_nodo["id"], periodo_key=periodo_key,
            valor=eur, unidades=uds,
        )
        if creado:
            stats["regs_creados"] += 1
        elif actualizado:
            stats["regs_actualizados"] += 1
        else:
            stats["regs_iguales"] += 1


def main() -> None:
    url, key = load_env()
    row = supabase_select(url, key)
    state = row["state"]

    # Backup
    backup_path = Path(__file__).resolve().parent.parent / f".cloud-backup-before-import-{int(time.time())}.json"
    backup_path.write_text(json.dumps([row], ensure_ascii=False))
    print(f"Backup guardado en: {backup_path}")

    arbol = state.setdefault("arbol", {})
    nodos: list[dict] = arbol.setdefault("nodos", [])
    registros: list[dict] = arbol.setdefault("registros", [])
    configs: list[dict] = arbol.setdefault("configs", [])

    stats = {
        "ramas_creadas": [],
        "hojas_creadas": [],
        "regs_creados": 0,
        "regs_actualizados": 0,
        "regs_iguales": 0,
        "regs_borrados_raiz_2026": 0,
        "regs_ay_actualizados": 0,
    }

    raiz_2026 = next((n for n in nodos if n.get("anio") == 2026 and not n.get("parentId")), None)
    if not raiz_2026:
        sys.exit("No encuentro la raíz 2026. Abortando.")

    # Crear raíz 2025 si no existe
    raiz_2025, created_raiz = find_or_create_nodo(
        nodos,
        anio=2025,
        parent_id=None,
        nombre=raiz_2026.get("nombre", "Facturación"),
        tipo="resultado",
        cadencia="anual",
        relacion="explica",
        meta_valor=0,
        meta_unidad=raiz_2026.get("metaUnidad", "€"),
    )
    if created_raiz:
        stats["ramas_creadas"].append("2025 · (raíz)")

    # Asegurar config 2025
    if not any(c.get("anio") == 2025 for c in configs):
        configs.append({"anio": 2025, "semanasNoActivas": []})

    excel = read_excel()

    # ---------- Q1 y Q2 de 2025 ----------
    q1_25 = aggregate(excel["q1-2025"])
    q2_25 = aggregate(excel["q2-2025"])
    process_sheet(q1_25, anio=2025, nodos=nodos, registros=registros,
                   rama_map=RAMA_MAP_2025, raiz=raiz_2025, stats=stats)
    process_sheet(q2_25, anio=2025, nodos=nodos, registros=registros,
                   rama_map=RAMA_MAP_2025, raiz=raiz_2025, stats=stats)

    # ---------- Q1 2026 ----------
    q1_26 = aggregate(excel["q1-2026"])
    process_sheet(q1_26, anio=2026, nodos=nodos, registros=registros,
                   rama_map=RAMA_MAP_2026, raiz=raiz_2026, stats=stats)

    # Borrar apuntes manuales en raíz 2026 (mes 2026-01/02/03) -> el desglose por hojas manda
    to_delete = [r for r in registros
                  if r["nodoId"] == raiz_2026["id"]
                  and r["periodoTipo"] == "mes"
                  and r["periodoKey"] in {"2026-01", "2026-02", "2026-03"}]
    for r in to_delete:
        registros.remove(r)
        stats["regs_borrados_raiz_2026"] += 1

    # Actualizar referencia "año pasado" en raíz 2026 (periodoKey 2025-01/02/03)
    # con los totales del Excel Q1 2025.
    totales_q1_25 = defaultdict(float)
    for _, _, mes, _, eur in q1_25:
        totales_q1_25[mes] += eur
    for mes, total in totales_q1_25.items():
        pk = f"2025-{mes:02d}"
        found = False
        for r in registros:
            if r["nodoId"] == raiz_2026["id"] and r["periodoTipo"] == "mes" and r["periodoKey"] == pk:
                if abs(r.get("valor", 0) - total) > 0.001:
                    r["valor"] = round(total, 2)
                    r["actualizado"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
                    stats["regs_ay_actualizados"] += 1
                found = True
                break
        if not found:
            # Si no existía (caso raro dado que vi 3 en el estado), lo creamos.
            now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
            registros.append({
                "id": gen_id(),
                "nodoId": raiz_2026["id"],
                "periodoTipo": "mes",
                "periodoKey": pk,
                "valor": round(total, 2),
                "creado": now,
                "actualizado": now,
            })

    print("\n=== Cambios ===")
    for k, v in stats.items():
        if isinstance(v, list):
            print(f"  {k}: {len(v)}")
            for item in v[:20]:
                print(f"    - {item}")
            if len(v) > 20:
                print(f"    ... y {len(v)-20} más")
        else:
            print(f"  {k}: {v}")

    # Verificaciones
    for anio in (2025, 2026):
        total_eur = sum(r["valor"] for r in registros
                         if r["periodoTipo"] == "mes" and r["periodoKey"].startswith(f"{anio}-"))
        print(f"  Total € en registros 'mes' de {anio} (todas las hojas/raíces): {total_eur:,.2f}")

    # Preview: preguntar confirmación
    if "--dry-run" in sys.argv:
        print("\n(dry-run) NO se ha subido nada al cloud.")
        return
    print("\nSubiendo al cloud…")
    supabase_upsert(url, key, state)
    print("OK. El próximo sync de tu app traerá los cambios.")


if __name__ == "__main__":
    main()
