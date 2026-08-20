import { supabase } from "@/integrations/supabase/client";
import type { HistoricoDocumento, Registro, StatusConvencao, VinculoSindicato } from "./types";

type EmpresaRow = {
  id: string;
  nome: string;
  codigo: string;
  cnpj: string;
  uf: string | null;
  cidade: string | null;
  responsavel: string | null;
  funcionarios_contemplados: number;
  colaboradores: number | null;
  observacoes: string;
  pessoa_contato: string;
  data_contato: string;
  sindicato_id: string | null;
  updated_at: string;
  resumo_publicado?: boolean | null;
  integra_publicada?: boolean | null;
};

type SindRow = {
  id: string;
  nome: string;
  codigo: string;
  cnpj: string;
  abrangencia: string;
  data_base: string;
  vigencia_inicio: string;
  vigencia_fim: string;
  segmento: string | null;
  prazo_oposicao: string;
  status: string;
  historico_documentos: HistoricoDocumento[] | null;
};

type VinculoRow = {
  id: string;
  empresa_id: string;
  sindicato_id: string;
  principal: boolean;
  categoria: string | null;
  funcionarios_contemplados: number;
};

export interface Empresa {
  id: string;
  nome: string;
  codigo: string;
  cnpj: string;
  uf: string;
  cidade: string;
  responsavel: string;
  funcionariosContemplados: number;
  colaboradores: number;
  observacoes: string;
  pessoaContato: string;
  dataContato: string;
  sindicatoId: string | null;
  ultimaAtualizacao: string;
}

function joinToRegistro(e: EmpresaRow, s: SindRow | null): Registro {
  return {
    id: e.id,
    empresaNome: e.nome ?? "",
    empresaCodigo: e.codigo ?? "",
    empresaCnpj: e.cnpj ?? "",
    sindicatoNome: s?.nome ?? "",
    sindicatoCodigo: s?.codigo ?? "",
    sindicatoCnpj: s?.cnpj ?? "",
    dataBase: s?.data_base ?? "",
    vigenciaInicio: s?.vigencia_inicio ?? "",
    vigenciaFim: s?.vigencia_fim ?? "",
    funcionariosContemplados: e.funcionarios_contemplados ?? 0,
    abrangencia: s?.abrangencia ?? "",
    observacoes: e.observacoes ?? "",
    segmento: s?.segmento ?? undefined,
    uf: e.uf ?? undefined,
    cidade: e.cidade ?? undefined,
    colaboradores: e.colaboradores ?? undefined,
    responsavel: e.responsavel ?? undefined,
    historicoDocumentos: Array.isArray(s?.historico_documentos)
      ? (s!.historico_documentos as HistoricoDocumento[])
      : [],
    ultimaAtualizacao: e.updated_at ?? new Date().toISOString(),
    status: ((s?.status ?? undefined) as StatusConvencao | undefined),
    prazoOposicao: s?.prazo_oposicao ?? undefined,
    dataContato: e.data_contato ?? undefined,
    pessoaContato: e.pessoa_contato ?? undefined,
    resumoPublicado: !!e.resumo_publicado,
    integraPublicada: !!e.integra_publicada,
    // sindicatoId é utilizado apenas no formulário; guardamos em ultimoContacto
    // não — expomos via campo separado no form através de empresaSindicatoId map.
  };
}

export interface EmpresasResult {
  registros: Registro[];
  sindicatoIdByEmpresa: Record<string, string | null>;
}

function vinculosDaEmpresa(
  empresaId: string,
  vinculos: VinculoRow[],
  sindMap: Map<string, SindRow>,
): VinculoSindicato[] {
  const out: VinculoSindicato[] = [];
  for (const v of vinculos) {
    if (v.empresa_id !== empresaId) continue;
    const s = sindMap.get(v.sindicato_id);
    if (!s) continue;
    const st = s.status;
    const statusTyped: StatusConvencao | "" =
      st === "vigente" || st === "negociacao" || st === "pendente" ? st : "";
    out.push({
      id: v.id,
      sindicatoId: v.sindicato_id,
      sindicatoNome: s.nome ?? "",
      sindicatoCodigo: s.codigo ?? "",
      sindicatoCnpj: s.cnpj ?? "",
      principal: !!v.principal,
      categoria: v.categoria ?? null,
      funcionariosContemplados: v.funcionarios_contemplados ?? 0,
      status: statusTyped,
      dataBase: s.data_base ?? "",
      vigenciaInicio: s.vigencia_inicio ?? "",
      vigenciaFim: s.vigencia_fim ?? "",
      abrangencia: s.abrangencia ?? "",
      segmento: s.segmento ?? null,
    });
  }
  // Principal primeiro; depois nome do sindicato.
  out.sort((a, b) => {
    if (a.principal !== b.principal) return a.principal ? -1 : 1;
    return a.sindicatoNome.localeCompare(b.sindicatoNome, "pt-BR");
  });
  return out;
}

export async function fetchEmpresasComoRegistros(): Promise<EmpresasResult> {
  const [empRes, sindRes, vinRes] = await Promise.all([
    supabase.from("empresas").select("*").order("nome", { ascending: true }),
    supabase.from("sindicatos").select(
      "id,nome,codigo,cnpj,abrangencia,data_base,vigencia_inicio,vigencia_fim,segmento,prazo_oposicao,status,historico_documentos",
    ),
    supabase.from("empresa_sindicatos").select(
      "id,empresa_id,sindicato_id,principal,categoria,funcionarios_contemplados",
    ),
  ]);
  if (empRes.error) throw empRes.error;
  if (sindRes.error) throw sindRes.error;
  if (vinRes.error) throw vinRes.error;
  const sindMap = new Map<string, SindRow>();
  for (const s of (sindRes.data ?? []) as unknown as SindRow[]) sindMap.set(s.id, s);
  const vinculosAll = (vinRes.data ?? []) as unknown as VinculoRow[];
  const registros: Registro[] = [];
  const sindicatoIdByEmpresa: Record<string, string | null> = {};
  for (const e of (empRes.data ?? []) as unknown as EmpresaRow[]) {
    const vinculos = vinculosDaEmpresa(e.id, vinculosAll, sindMap);
    const principal = vinculos.find((v) => v.principal) ?? vinculos[0] ?? null;
    // Compat legacy: sindicatoNome/Codigo/... vêm do principal; se não houver
    // vínculo ainda, cai no antigo empresas.sindicato_id.
    const legacyS = principal
      ? sindMap.get(principal.sindicatoId) ?? null
      : e.sindicato_id
        ? sindMap.get(e.sindicato_id) ?? null
        : null;
    const reg = joinToRegistro(e, legacyS);
    reg.sindicatos = vinculos;
    // funcionariosContemplados no Registro continua sendo o TOTAL da empresa
    // (usado no formulário e no total geral). O rateio por vínculo vive em
    // reg.sindicatos[].funcionariosContemplados.
    registros.push(reg);
    sindicatoIdByEmpresa[e.id] = principal?.sindicatoId ?? e.sindicato_id ?? null;
  }
  return { registros, sindicatoIdByEmpresa };
}

export async function upsertEmpresa(e: Empresa): Promise<void> {
  const { error } = await supabase.from("empresas").upsert({
    id: e.id,
    nome: e.nome ?? "",
    codigo: e.codigo ?? "",
    cnpj: e.cnpj ?? "",
    uf: e.uf || null,
    cidade: e.cidade || null,
    responsavel: e.responsavel || null,
    funcionarios_contemplados: Number(e.funcionariosContemplados) || 0,
    colaboradores: Number.isFinite(e.colaboradores) ? e.colaboradores : null,
    observacoes: e.observacoes ?? "",
    pessoa_contato: e.pessoaContato ?? "",
    data_contato: e.dataContato ?? "",
    sindicato_id: e.sindicatoId ?? null,
  });
  if (error) throw error;
}

export function subscribeEmpresas(onChange: () => void): () => void {
  const ch = supabase
    .channel("empresas-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "empresas" },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sindicatos" },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "empresa_sindicatos" },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(ch);
  };
}

/* ---------------- CRUD de vínculos empresa↔sindicato ---------------- */

export async function addVinculoSindicato(
  empresaId: string,
  sindicatoId: string,
  dados: { categoria?: string | null; funcionariosContemplados?: number; principal?: boolean } = {},
): Promise<void> {
  // Se este vínculo entra como principal, zera os outros primeiro.
  if (dados.principal) {
    const { error: e1 } = await supabase
      .from("empresa_sindicatos")
      .update({ principal: false })
      .eq("empresa_id", empresaId);
    if (e1) throw e1;
  }
  const { error } = await supabase.from("empresa_sindicatos").insert({
    empresa_id: empresaId,
    sindicato_id: sindicatoId,
    principal: !!dados.principal,
    categoria: dados.categoria ?? null,
    funcionarios_contemplados: Number(dados.funcionariosContemplados) || 0,
  });
  if (error) throw error;
}

export async function removeVinculoSindicato(vinculoId: string): Promise<void> {
  const { error } = await supabase.from("empresa_sindicatos").delete().eq("id", vinculoId);
  if (error) throw error;
}

export async function updateVinculoSindicato(
  vinculoId: string,
  dados: Partial<{ categoria: string | null; funcionariosContemplados: number; principal: boolean }>,
): Promise<void> {
  const patch: {
    categoria?: string | null;
    funcionarios_contemplados?: number;
    principal?: boolean;
  } = {};
  if (dados.categoria !== undefined) patch.categoria = dados.categoria;
  if (dados.funcionariosContemplados !== undefined) {
    patch.funcionarios_contemplados = Number(dados.funcionariosContemplados) || 0;
  }
  if (dados.principal !== undefined) patch.principal = dados.principal;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase
    .from("empresa_sindicatos")
    .update(patch)
    .eq("id", vinculoId);
  if (error) throw error;
}

/**
 * Marca `vinculoId` como principal e zera os demais vínculos da mesma empresa.
 * O índice único parcial idx_emp_sind_um_principal exige que a "zeragem"
 * aconteça antes do `set principal=true`.
 */
export async function setSindicatoPrincipal(
  empresaId: string,
  vinculoId: string,
): Promise<void> {
  const { error: e1 } = await supabase
    .from("empresa_sindicatos")
    .update({ principal: false })
    .eq("empresa_id", empresaId);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("empresa_sindicatos")
    .update({ principal: true })
    .eq("id", vinculoId);
  if (e2) throw e2;
}