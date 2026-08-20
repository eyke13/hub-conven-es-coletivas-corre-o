import { supabase } from "@/integrations/supabase/client";
import type { HistoricoDocumento } from "./types";

export interface Sindicato {
  id: string;
  nome: string;
  codigo: string;
  cnpj: string;
  abrangencia: string;
  dataBase: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  segmento: string | null;
  prazoOposicao: string;
  status: string;
  pessoaContato: string;
  ultimoContacto: string;
  dataContato: string;
  observacoes: string;
  historicoDocumentos: HistoricoDocumento[];
  updatedAt: string;
  empresasCount: number;
  resumoPublicado: boolean;
  integraPublicada: boolean;
  publicadoEm: string | null;
}

export interface EmpresaVinculada {
  id: string;
  nome: string;
  codigo: string;
  cnpj: string;
  uf: string | null;
  cidade: string | null;
  responsavel: string | null;
  funcionariosContemplados: number;
  colaboradores: number | null;
  sindicatoId: string | null;
  vinculoId: string;
  categoria: string | null;
  principal: boolean;
}

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
  pessoa_contato: string;
  ultimo_contacto: string;
  data_contato: string;
  observacoes: string;
  historico_documentos: HistoricoDocumento[] | null;
  updated_at: string;
  resumo_publicado?: boolean | null;
  integra_publicada?: boolean | null;
  publicado_em?: string | null;
};

function rowToSindicato(r: SindRow, empresasCount: number): Sindicato {
  return {
    id: r.id,
    nome: r.nome ?? "",
    codigo: r.codigo ?? "",
    cnpj: r.cnpj ?? "",
    abrangencia: r.abrangencia ?? "",
    dataBase: r.data_base ?? "",
    vigenciaInicio: r.vigencia_inicio ?? "",
    vigenciaFim: r.vigencia_fim ?? "",
    segmento: r.segmento,
    prazoOposicao: r.prazo_oposicao ?? "",
    status: r.status ?? "pendente",
    pessoaContato: r.pessoa_contato ?? "",
    ultimoContacto: r.ultimo_contacto ?? "",
    dataContato: r.data_contato ?? "",
    observacoes: r.observacoes ?? "",
    historicoDocumentos: Array.isArray(r.historico_documentos)
      ? r.historico_documentos
      : [],
    updatedAt: r.updated_at,
    empresasCount,
    resumoPublicado: !!r.resumo_publicado,
    integraPublicada: !!r.integra_publicada,
    publicadoEm: r.publicado_em ?? null,
  };
}

export async function fetchSindicatos(): Promise<Sindicato[]> {
  const [sindRes, empRes] = await Promise.all([
    supabase.from("sindicatos").select("*").order("nome", { ascending: true }),
    supabase.from("empresa_sindicatos").select("empresa_id,sindicato_id"),
  ]);
  if (sindRes.error) throw sindRes.error;
  if (empRes.error) throw empRes.error;

  const counts = new Map<string, number>();
  // Conta empresas distintas por sindicato (uma empresa com dois vínculos ao
  // mesmo sindicato contaria 1 — a UNIQUE(empresa_id, sindicato_id) já impede
  // isso, mas mantemos o Set por segurança).
  const seen = new Map<string, Set<string>>();
  for (const row of empRes.data ?? []) {
    const r = row as { empresa_id: string | null; sindicato_id: string | null };
    if (!r.sindicato_id || !r.empresa_id) continue;
    const set = seen.get(r.sindicato_id) ?? new Set<string>();
    set.add(r.empresa_id);
    seen.set(r.sindicato_id, set);
  }
  for (const [sid, set] of seen) counts.set(sid, set.size);

  return (sindRes.data ?? []).map((r) =>
    rowToSindicato(r as unknown as SindRow, counts.get(r.id) ?? 0),
  );
}

export async function fetchEmpresasDoSindicato(
  sindicatoId: string,
): Promise<EmpresaVinculada[]> {
  // Ler vínculos deste sindicato e trazer os dados da empresa em conjunto.
  const { data, error } = await supabase
    .from("empresa_sindicatos")
    .select(
      "id,principal,categoria,funcionarios_contemplados,sindicato_id," +
        "empresa:empresas(id,nome,codigo,cnpj,uf,cidade,responsavel,colaboradores)",
    )
    .eq("sindicato_id", sindicatoId);
  if (error) throw error;
  type Row = {
    id: string;
    principal: boolean | null;
    categoria: string | null;
    funcionarios_contemplados: number | null;
    sindicato_id: string;
    empresa: {
      id: string;
      nome: string | null;
      codigo: string | null;
      cnpj: string | null;
      uf: string | null;
      cidade: string | null;
      responsavel: string | null;
      colaboradores: number | null;
    } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const out: EmpresaVinculada[] = rows
    .filter((r) => !!r.empresa)
    .map((r) => ({
      id: r.empresa!.id,
      nome: r.empresa!.nome ?? "",
      codigo: r.empresa!.codigo ?? "",
      cnpj: r.empresa!.cnpj ?? "",
      uf: r.empresa!.uf ?? null,
      cidade: r.empresa!.cidade ?? null,
      responsavel: r.empresa!.responsavel ?? null,
      funcionariosContemplados: r.funcionarios_contemplados ?? 0,
      colaboradores: r.empresa!.colaboradores ?? null,
      sindicatoId: r.sindicato_id,
      vinculoId: r.id,
      categoria: r.categoria ?? null,
      principal: !!r.principal,
    }));
  out.sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));
  return out;
}

export async function updateSindicato(s: Sindicato): Promise<void> {
  const { error } = await supabase
    .from("sindicatos")
    .update({
      nome: s.nome,
      codigo: s.codigo,
      cnpj: s.cnpj,
      abrangencia: s.abrangencia,
      data_base: s.dataBase,
      vigencia_inicio: s.vigenciaInicio,
      vigencia_fim: s.vigenciaFim,
      segmento: s.segmento,
      prazo_oposicao: s.prazoOposicao,
      status: s.status,
      pessoa_contato: s.pessoaContato,
      ultimo_contacto: s.ultimoContacto,
      data_contato: s.dataContato,
      observacoes: s.observacoes,
      historico_documentos:
        s.historicoDocumentos as unknown as import("@/integrations/supabase/types").Json,
    })
    .eq("id", s.id);
  if (error) throw error;
}