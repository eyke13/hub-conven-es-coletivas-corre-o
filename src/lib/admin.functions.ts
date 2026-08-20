import { createServerFn } from "@tanstack/react-start";
import type { Registro } from "@/components/cct-hub/types";

type AdminAction =
  | { type: "verify" }
  | { type: "delete"; id: string }
  | { type: "reset" }
  | { type: "bulk_replace"; list: Registro[] }
  | { type: "delete_empresa"; id: string }
  | { type: "reset_empresas" };

interface AdminInput {
  code: string;
  action: AdminAction;
}

interface AdminResult {
  ok: boolean;
  error?: "invalid_code" | "invalid_action" | "server_error" | "forbidden";
  message?: string;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function registroToRow(r: Registro) {
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
    historico_documentos: r.historicoDocumentos ?? [],
    status: r.status ?? "pendente",
    ultimo_contacto: r.ultimoContacto ?? "",
    prazo_oposicao: r.prazoOposicao ?? "",
    data_contato: r.dataContato ?? "",
    pessoa_contato: r.pessoaContato ?? "",
  };
}

export const adminAction = createServerFn({ method: "POST" })
  .inputValidator((data: AdminInput) => data)
  .handler(async ({ data }): Promise<AdminResult> => {
    const expected = process.env.ADMIN_CODE;
    if (!expected) {
      return { ok: false, error: "server_error", message: "ADMIN_CODE não configurado" };
    }
    if (!data?.code || !timingSafeEqual(String(data.code), expected)) {
      return { ok: false, error: "invalid_code" };
    }

    const action = data.action;
    if (!action || typeof action.type !== "string") {
      return { ok: false, error: "invalid_action" };
    }

    if (action.type === "verify") {
      return { ok: true };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    try {
      if (action.type === "delete") {
        if (!action.id) return { ok: false, error: "invalid_action" };
        const { error } = await supabaseAdmin
          .from("convencoes")
          .delete()
          .eq("id", action.id);
        if (error) throw error;
        return { ok: true };
      }

      if (action.type === "reset") {
        const { error } = await supabaseAdmin
          .from("convencoes")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) throw error;
        return { ok: true };
      }

      if (action.type === "bulk_replace") {
        const list = Array.isArray(action.list) ? action.list : [];
        const { error: delErr } = await supabaseAdmin
          .from("convencoes")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (delErr) throw delErr;
        if (list.length > 0) {
          const { error } = await supabaseAdmin
            .from("convencoes")
            .insert(list.map(registroToRow));
          if (error) throw error;
        }
        return { ok: true };
      }

      if (action.type === "delete_empresa") {
        if (!action.id) return { ok: false, error: "invalid_action" };
        const { error } = await supabaseAdmin
          .from("empresas")
          .delete()
          .eq("id", action.id);
        if (error) throw error;
        return { ok: true };
      }

      if (action.type === "reset_empresas") {
        const { error } = await supabaseAdmin
          .from("empresas")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) throw error;
        return { ok: true };
      }

      return { ok: false, error: "invalid_action" };
    } catch (err) {
      console.error("admin-action falhou", err);
      const message = err instanceof Error ? err.message : "Erro inesperado";
      return { ok: false, error: "server_error", message };
    }
  });