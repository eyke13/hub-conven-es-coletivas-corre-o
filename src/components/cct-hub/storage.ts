import type { HistoricoDocumento, Registro, StatusConvencao } from "./types";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

type ConvencaoInsert = TablesInsert<"convencoes"> & {
  status?: string;
  ultimo_contacto?: string;
  prazo_oposicao?: string;
  data_contato?: string;
  pessoa_contato?: string;
};

type Row = {
  id: string;
  empresa_nome: string;
  empresa_codigo: string;
  empresa_cnpj: string;
  sindicato_nome: string;
  sindicato_codigo: string;
  sindicato_cnpj: string;
  data_base: string;
  vigencia_inicio: string;
  vigencia_fim: string;
  funcionarios_contemplados: number;
  abrangencia: string;
  observacoes: string;
  segmento: string | null;
  uf: string | null;
  cidade: string | null;
  mes: string | null;
  ano: number | null;
  colaboradores: number | null;
  responsavel: string | null;
  historico_documentos: HistoricoDocumento[] | null;
  updated_at: string;
  status: string | null;
  ultimo_contacto: string | null;
  prazo_oposicao: string | null;
  data_contato: string | null;
  pessoa_contato: string | null;
};

function rowToRegistro(r: Row): Registro {
  return {
    id: r.id,
    empresaNome: r.empresa_nome ?? "",
    empresaCodigo: r.empresa_codigo ?? "",
    empresaCnpj: r.empresa_cnpj ?? "",
    sindicatoNome: r.sindicato_nome ?? "",
    sindicatoCodigo: r.sindicato_codigo ?? "",
    sindicatoCnpj: r.sindicato_cnpj ?? "",
    dataBase: r.data_base ?? "",
    vigenciaInicio: r.vigencia_inicio ?? "",
    vigenciaFim: r.vigencia_fim ?? "",
    funcionariosContemplados: r.funcionarios_contemplados ?? 0,
    abrangencia: r.abrangencia ?? "",
    observacoes: r.observacoes ?? "",
    segmento: r.segmento ?? undefined,
    uf: r.uf ?? undefined,
    cidade: r.cidade ?? undefined,
    mes: r.mes ?? undefined,
    ano: r.ano ?? undefined,
    colaboradores: r.colaboradores ?? undefined,
    responsavel: r.responsavel ?? undefined,
    historicoDocumentos: Array.isArray(r.historico_documentos) ? r.historico_documentos : [],
    ultimaAtualizacao: r.updated_at ?? new Date().toISOString(),
    status: (r.status as StatusConvencao) || undefined,
    ultimoContacto: r.ultimo_contacto ?? undefined,
    prazoOposicao: r.prazo_oposicao ?? undefined,
    dataContato: r.data_contato ?? undefined,
    pessoaContato: r.pessoa_contato ?? undefined,
  };
}

function registroToRow(r: Registro): ConvencaoInsert {
  return {
    id: r.id,
    empresa_nome: r.empresaNome ?? "",
    empresa_codigo: r.empresaCodigo ?? "",
    empresa_cnpj: r.empresaCnpj ?? "",
    sindicato_nome: r.sindicatoNome ?? "",
    sindicato_codigo: r.sindicatoCodigo ?? "",
    sindicato_cnpj: r.sindicatoCnpj ?? "",
    data_base: r.dataBase ?? "",
    vigencia_inicio: r.vigenciaInicio ?? "",
    vigencia_fim: r.vigenciaFim ?? "",
    funcionarios_contemplados: Number(r.funcionariosContemplados) || 0,
    abrangencia: r.abrangencia ?? "",
    observacoes: r.observacoes ?? "",
    segmento: r.segmento ?? null,
    uf: r.uf ?? null,
    cidade: r.cidade ?? null,
    mes: r.mes ?? null,
    ano: r.ano ?? null,
    colaboradores: r.colaboradores ?? null,
    responsavel: r.responsavel ?? null,
    historico_documentos: (r.historicoDocumentos ?? []) as unknown as ConvencaoInsert["historico_documentos"],
    status: r.status ?? "pendente",
    ultimo_contacto: r.ultimoContacto ?? "",
    prazo_oposicao: r.prazoOposicao ?? "",
    data_contato: r.dataContato ?? "",
    pessoa_contato: r.pessoaContato ?? "",
  };
}

export async function fetchRegistros(): Promise<Registro[]> {
  const { data, error } = await supabase
    .from("convencoes")
    .select("*")
    .order("empresa_nome", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(rowToRegistro);
}

export async function upsertRegistro(r: Registro): Promise<void> {
  const { error } = await supabase.from("convencoes").upsert(registroToRow(r));
  if (error) throw error;
}

export async function deleteRegistro(id: string): Promise<void> {
  const { error } = await supabase.from("convencoes").delete().eq("id", id);
  if (error) throw error;
}

export async function bulkReplaceRegistros(list: Registro[]): Promise<void> {
  const { error: delErr } = await supabase.from("convencoes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) throw delErr;
  if (list.length === 0) return;
  const { error } = await supabase.from("convencoes").insert(list.map(registroToRow));
  if (error) throw error;
}

export async function resetAllRegistros(): Promise<void> {
  const { error } = await supabase.from("convencoes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
}

export type RegistroChange =
  | { type: "INSERT"; registro: Registro }
  | { type: "UPDATE"; registro: Registro }
  | { type: "DELETE"; id: string };

export function subscribeRegistros(
  onChange: (change: RegistroChange) => void,
): () => void {
  const channel = supabase
    .channel("convencoes-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "convencoes" },
      (payload) => {
        try {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string } | null)?.id;
            if (id) onChange({ type: "DELETE", id });
            return;
          }
          const row = payload.new as Row | null;
          if (!row) return;
          const registro = rowToRegistro(row);
          onChange({
            type: payload.eventType === "INSERT" ? "INSERT" : "UPDATE",
            registro,
          });
        } catch (e) {
          console.error("Falha ao processar evento realtime", e);
        }
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const DOC_BUCKET = "documentos-cct";

export async function uploadDocumentoArquivo(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage
    .from(DOC_BUCKET)
    .upload(path, file, { contentType: file.type || "application/pdf", upsert: true });
  if (error) throw error;
}

export async function getDocumentoSignedUrl(path: string, expiresIn = 300): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) throw error ?? new Error("Falha ao gerar URL");
  return data.signedUrl;
}

export async function deleteDocumentoArquivo(path: string): Promise<void> {
  const { error } = await supabase.storage.from(DOC_BUCKET).remove([path]);
  if (error) throw error;
}