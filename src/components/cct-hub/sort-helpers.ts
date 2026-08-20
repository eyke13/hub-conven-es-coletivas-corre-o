import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { MESES } from "./types";

export type SortDir = "asc" | "desc";
export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/** 3-state toggle: asc → desc → sem ordenação. */
export function toggleSort<K extends string>(prev: SortState<K> | null, key: K): SortState<K> | null {
  if (!prev || prev.key !== key) return { key, dir: "asc" };
  if (prev.dir === "asc") return { key, dir: "desc" };
  return null;
}

export function SortIcon(active: boolean, dir: SortDir) {
  if (!active) return ArrowUpDown;
  return dir === "asc" ? ArrowUp : ArrowDown;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/** Aplica direção e mantém valores vazios sempre no fim, independente de asc/desc. */
export function nullsLast<T>(
  a: T | null | undefined,
  b: T | null | undefined,
  dir: SortDir,
  cmp: (x: T, y: T) => number,
): number {
  const ea = isEmpty(a);
  const eb = isEmpty(b);
  if (ea && eb) return 0;
  if (ea) return 1;
  if (eb) return -1;
  const raw = cmp(a as T, b as T);
  return dir === "asc" ? raw : -raw;
}

/** Comparador alfabético pt-BR ignorando acentos e pontuação. */
export function cmpString(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? "").localeCompare(b ?? "", "pt-BR", {
    sensitivity: "base",
    ignorePunctuation: true,
    numeric: true,
  });
}

/** Comparador para códigos alfa-numéricos (numérico quando parsável). */
export function cmpCodigo(a: string | null | undefined, b: string | null | undefined): number {
  const na = Number(String(a ?? "").replace(/\D/g, ""));
  const nb = Number(String(b ?? "").replace(/\D/g, ""));
  if (Number.isFinite(na) && Number.isFinite(nb) && (a || b)) return na - nb;
  return cmpString(a, b);
}

/** Comparador de CNPJ como número (só dígitos). */
export function cmpCnpj(a: string | null | undefined, b: string | null | undefined): number {
  const da = String(a ?? "").replace(/\D/g, "");
  const db = String(b ?? "").replace(/\D/g, "");
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.localeCompare(db, undefined, { numeric: true });
}

const MES_INDEX = new Map(MESES.map((m, i) => [m.toLowerCase(), i + 1]));

/** Comparador de data-base (nome do mês em pt-BR). */
export function cmpDataBase(a: string | null | undefined, b: string | null | undefined): number {
  const ia = MES_INDEX.get(String(a ?? "").toLowerCase()) ?? 99;
  const ib = MES_INDEX.get(String(b ?? "").toLowerCase()) ?? 99;
  return ia - ib;
}

export function withDir(cmp: number, dir: SortDir): number {
  return dir === "asc" ? cmp : -cmp;
}

/** Desempate: aplica `next` quando o comparador principal empatar. */
export function chain(primary: number, next: () => number): number {
  return primary !== 0 ? primary : next();
}