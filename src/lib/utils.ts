import type { Paso } from "./types";
import { minutosEfectivos } from "./duration";

/** Effective work minutes (subtracting pauses). */
export function minutosPaso(p: Paso): number {
  return minutosEfectivos(p) ?? 0;
}

export function formatMin(min: number): string {
  if (min === 0) return "";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function getISOWeek(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function weekLabel(isoWeek: string): string {
  const [yearStr, wStr] = isoWeek.split("-W");
  const year = parseInt(yearStr);
  const week = parseInt(wStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export function getWeekMonday(isoWeek: string): Date {
  const [yearStr, wStr] = isoWeek.split("-W");
  const year = parseInt(yearStr);
  const week = parseInt(wStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday;
}

export function addDuration(start: Date, cantidad: number, unidad: "dias" | "semanas" | "meses"): Date {
  const d = new Date(start);
  if (unidad === "dias") d.setDate(d.getDate() + cantidad);
  else if (unidad === "semanas") d.setDate(d.getDate() + cantidad * 7);
  else d.setMonth(d.getMonth() + cantidad);
  return d;
}

export function generateWeeks(count: number, offset = -1): string[] {
  const now = new Date();
  const weeks: string[] = [];
  for (let i = offset; i < count + offset; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i * 7);
    weeks.push(getISOWeek(d));
  }
  return [...new Set(weeks)];
}
