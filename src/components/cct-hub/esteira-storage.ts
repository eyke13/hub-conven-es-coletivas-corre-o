import { supabase } from "@/integrations/supabase/client";

export type ResumoStatus =
  | "nao_iniciado"
  | "em_andamento"
  | "em_conferencia"
  | "publicado"
  | "erro";

export interface ResumoRow {
  id: string;
  sindicato_id: string;
  ano: number;
  status: ResumoStatus;
  responsavel: string | null;
  integra_path: string | null;
  resumo_docx_path: string | null;
  resumo_pdf_path: string | null;
  versao: number;
  erro_msg: string | null;
  processando: boolean;
  iniciado_em: string | null;
  publicado_em: string | null;
  oficial_path: string | null;
  oficial_nome: string | null;
  oficial_em: string | null;
  publicado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface EsteiraItem extends ResumoRow {
  sindicatoNome: string;
  sindicatoCodigo: string;
  sindicatoCnpj: string;
  dataBase: string;
  prazoOposicao: string;
  empresasCount: number;
}

export interface HistoricoRow {
  id: string;
  resumo_id: string;
  status_de: ResumoStatus | null;
  status_para: ResumoStatus;
  usuario_id: string | null;
  usuario_email: string | null;
  observacao: string | null;
  created_at: string;
}

export interface VersaoRow {
  id: string;
  resumo_id: string;
  versao: number;
  path: string;
  nome: string;
  origem: string;
  criado_por: string | null;
  created_at: string;
}

export async function fetchVersoes(resumoId: string): Promise<VersaoRow[]> {
  const { data, error } = await supabase
    .from("resumos_cct_versoes")
    .select("*")
    .eq("resumo_id", resumoId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VersaoRow[];
}

/** Transições válidas na máquina de estados. */
export const NEXT_STATES: Record<ResumoStatus, ResumoStatus[]> = {
  nao_iniciado: ["em_andamento"],
  em_andamento: ["em_conferencia", "erro"],
  em_conferencia: ["publicado", "em_andamento"],
  publicado: [], // reabertura é ação explícita e separada (admin)
  erro: ["em_andamento"],
};

export const STATUS_META: Record<ResumoStatus, { label: string; className: string }> = {
  nao_iniciado: {
    label: "Não iniciado",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  em_andamento: {
    label: "Em andamento",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  em_conferencia: {
    label: "Em conferência",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  publicado: {
    label: "Publicado",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  erro: {
    label: "Erro no processamento",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

export async function fetchEsteira(): Promise<EsteiraItem[]> {
  const { data: rows, error } = await supabase
    .from("resumos_cct")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const list = (rows ?? []) as ResumoRow[];
  if (list.length === 0) return [];

  const sindicatoIds = Array.from(new Set(list.map((r) => r.sindicato_id)));
  const [sindRes, empRes] = await Promise.all([
    supabase
      .from("sindicatos")
      .select("id,nome,codigo,cnpj,data_base,prazo_oposicao")
      .in("id", sindicatoIds),
    supabase.from("empresas").select("sindicato_id").in("sindicato_id", sindicatoIds),
  ]);
  if (sindRes.error) throw sindRes.error;
  if (empRes.error) throw empRes.error;

  const sindMap = new Map<string, {
    nome: string;
    codigo: string;
    cnpj: string;
    data_base: string;
    prazo_oposicao: string;
  }>();
  for (const s of sindRes.data ?? []) sindMap.set(s.id, s);

  const empCount = new Map<string, number>();
  for (const e of empRes.data ?? []) {
    if (!e.sindicato_id) continue;
    empCount.set(e.sindicato_id, (empCount.get(e.sindicato_id) ?? 0) + 1);
  }

  return list.map((r) => {
    const s = sindMap.get(r.sindicato_id);
    return {
      ...r,
      sindicatoNome: s?.nome ?? "—",
      sindicatoCodigo: s?.codigo ?? "",
      sindicatoCnpj: s?.cnpj ?? "",
      dataBase: s?.data_base ?? "",
      prazoOposicao: s?.prazo_oposicao ?? "",
      empresasCount: empCount.get(r.sindicato_id) ?? 0,
    };
  });
}

export async function createEsteiraItem(input: {
  sindicato_id: string;
  ano: number;
  responsavel?: string | null;
}): Promise<ResumoRow> {
  // Pré-checagem amigável: evitar violação de unicidade (sindicato_id, ano).
  const existing = await supabase
    .from("resumos_cct")
    .select("id")
    .eq("sindicato_id", input.sindicato_id)
    .eq("ano", input.ano)
    .maybeSingle();
  if (existing.error) {
    console.error("[createEsteiraItem] pré-check falhou:", existing.error);
    throw existing.error;
  }
  if (existing.data) {
    const err = new Error("DUPLICATE_ESTEIRA_ITEM") as Error & {
      code?: string;
      existingId?: string;
    };
    err.code = "DUPLICATE_ESTEIRA_ITEM";
    err.existingId = existing.data.id;
    throw err;
  }
  const { data, error } = await supabase
    .from("resumos_cct")
    .insert({
      sindicato_id: input.sindicato_id,
      ano: input.ano,
      status: "nao_iniciado",
      responsavel: input.responsavel ?? "Anne Karenine",
    })
    .select("*")
    .single();
  if (error) {
    console.error("[createEsteiraItem] insert falhou:", error);
    throw error;
  }
  return data as ResumoRow;
}

export async function updateResumoStatus(
  id: string,
  currentStatus: ResumoStatus,
  nextStatus: ResumoStatus,
  publicadoPor?: string | null,
): Promise<void> {
  const allowed = NEXT_STATES[currentStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(
      `Transição inválida: ${STATUS_META[currentStatus].label} → ${STATUS_META[nextStatus].label}`,
    );
  }
  const patch: Partial<ResumoRow> = { status: nextStatus };
  if (nextStatus === "em_andamento" && currentStatus === "nao_iniciado") {
    patch.iniciado_em = new Date().toISOString();
  }
  if (nextStatus === "publicado") {
    patch.publicado_em = new Date().toISOString();
    patch.publicado_por = publicadoPor ?? null;
  }
  if (nextStatus !== "erro") patch.erro_msg = null;
  const { error } = await supabase.from("resumos_cct").update(patch).eq("id", id);
  if (error) throw error;
}

export async function updateResumoResponsavel(id: string, responsavel: string | null) {
  const { error } = await supabase
    .from("resumos_cct")
    .update({ responsavel })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteResumo(id: string) {
  const { error } = await supabase.from("resumos_cct").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Marca o sindicato e todas as empresas vinculadas como resumo/íntegra publicados.
 * Retorna a quantidade de empresas afetadas.
 */
export async function marcarPublicadoNoCadastro(
  sindicatoId: string,
): Promise<{ empresasCount: number }> {
  const nowIso = new Date().toISOString();
  const patch = {
    resumo_publicado: true,
    integra_publicada: true,
    publicado_em: nowIso,
  } as never;
  const [sindRes, empRes, empCountRes] = await Promise.all([
    supabase.from("sindicatos").update(patch).eq("id", sindicatoId),
    supabase.from("empresas").update(patch).eq("sindicato_id", sindicatoId),
    supabase
      .from("empresas")
      .select("id", { count: "exact", head: true })
      .eq("sindicato_id", sindicatoId),
  ]);
  if (sindRes.error) throw sindRes.error;
  if (empRes.error) throw empRes.error;
  return { empresasCount: empCountRes.count ?? 0 };
}

export async function fetchHistorico(resumoId: string): Promise<HistoricoRow[]> {
  const { data, error } = await supabase
    .from("resumos_cct_historico")
    .select("*")
    .eq("resumo_id", resumoId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as HistoricoRow[];
}