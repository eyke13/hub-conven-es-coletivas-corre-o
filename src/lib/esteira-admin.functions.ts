import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertAdmin } from "./admin-guard.server";

const STATUS = z.enum([
  "nao_iniciado",
  "em_andamento",
  "em_conferencia",
  "publicado",
  "erro",
]);
type Status = z.infer<typeof STATUS>;

/** Transições válidas no fluxo normal (reabrir publicado é ação separada). */
const NEXT: Record<Status, Status[]> = {
  nao_iniciado: ["em_andamento"],
  em_andamento: ["em_conferencia", "erro"],
  em_conferencia: ["publicado", "em_andamento"],
  publicado: [],
  erro: ["em_andamento"],
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const criarItemEsteira = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().min(1),
        sindicato_id: z.string().uuid(),
        ano: z.number().int().min(1900).max(2999),
        responsavel: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    assertAdmin(data.code);
    const db = await admin();
    const existing = await db
      .from("resumos_cct")
      .select("id")
      .eq("sindicato_id", data.sindicato_id)
      .eq("ano", data.ano)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) throw new Error("DUPLICATE_ESTEIRA_ITEM");

    const { data: row, error } = await db
      .from("resumos_cct")
      .insert({
        sindicato_id: data.sindicato_id,
        ano: data.ano,
        status: "nao_iniciado",
        responsavel: data.responsavel ?? "Anne Karenine",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const alterarStatusEsteira = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().min(1),
        resumo_id: z.string().uuid(),
        para: STATUS,
        publicado_por: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    assertAdmin(data.code);
    const db = await admin();
    const { data: row, error } = await db
      .from("resumos_cct")
      .select("id, status, sindicato_id, oficial_path")
      .eq("id", data.resumo_id)
      .single();
    if (error || !row) throw new Error("Item da esteira não encontrado.");

    const atual = row.status as Status;
    if (!NEXT[atual].includes(data.para)) {
      throw new Error("Transição de status inválida.");
    }
    if (data.para === "publicado" && !row.oficial_path) {
      throw new Error("Envie a versão oficial revisada antes de publicar.");
    }

    const patch: {
      status: Status;
      iniciado_em?: string;
      publicado_em?: string;
      publicado_por?: string | null;
      erro_msg?: string | null;
    } = { status: data.para };
    if (data.para === "em_andamento" && atual === "nao_iniciado") {
      patch.iniciado_em = new Date().toISOString();
    }
    if (data.para === "publicado") {
      patch.publicado_em = new Date().toISOString();
      patch.publicado_por = data.publicado_por ?? null;
    }
    if (data.para !== "erro") patch.erro_msg = null;

    const upd = await db.from("resumos_cct").update(patch).eq("id", row.id);
    if (upd.error) throw new Error(upd.error.message);

    let empresasCount = 0;
    if (data.para === "publicado") {
      const nowIso = new Date().toISOString();
      const flags = {
        resumo_publicado: true,
        integra_publicada: true,
        publicado_em: nowIso,
      };
      const [s, e, c] = await Promise.all([
        db.from("sindicatos").update(flags).eq("id", row.sindicato_id),
        db.from("empresas").update(flags).eq("sindicato_id", row.sindicato_id),
        db
          .from("empresas")
          .select("id", { count: "exact", head: true })
          .eq("sindicato_id", row.sindicato_id),
      ]);
      if (s.error) throw new Error(s.error.message);
      if (e.error) throw new Error(e.error.message);
      empresasCount = c.count ?? 0;
    }
    return { ok: true, empresasCount };
  });

/** Reabertura explícita de um resumo já publicado (volta para Em conferência). */
export const reabrirResumoPublicado = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().min(1),
        resumo_id: z.string().uuid(),
        motivo: z.string().min(3),
        usuario: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    assertAdmin(data.code);
    const db = await admin();
    const { data: row, error } = await db
      .from("resumos_cct")
      .select("id, status, sindicato_id")
      .eq("id", data.resumo_id)
      .single();
    if (error || !row) throw new Error("Item da esteira não encontrado.");
    if (row.status !== "publicado") {
      throw new Error("Somente resumos publicados podem ser reabertos.");
    }

    const upd = await db
      .from("resumos_cct")
      .update({
        status: "em_conferencia",
        publicado_em: null,
        publicado_por: null,
      })
      .eq("id", row.id);
    if (upd.error) throw new Error(upd.error.message);

    // registra o motivo no histórico (a transição em si é logada pelo trigger)
    await db.from("resumos_cct_historico").insert({
      resumo_id: row.id,
      status_de: "publicado",
      status_para: "em_conferencia",
      usuario_email: data.usuario ?? null,
      observacao: `Reabertura para correção: ${data.motivo}`,
    });

    const flags = {
      resumo_publicado: false,
      integra_publicada: false,
      publicado_em: null,
    };
    await Promise.all([
      db.from("sindicatos").update(flags).eq("id", row.sindicato_id),
      db.from("empresas").update(flags).eq("sindicato_id", row.sindicato_id),
    ]);

    return { ok: true };
  });

export const alterarResponsavelEsteira = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().min(1),
        resumo_id: z.string().uuid(),
        responsavel: z.string().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    assertAdmin(data.code);
    const db = await admin();
    const { error } = await db
      .from("resumos_cct")
      .update({ responsavel: data.responsavel })
      .eq("id", data.resumo_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removerItemEsteira = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ code: z.string().min(1), resumo_id: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    assertAdmin(data.code);
    const db = await admin();
    const { error } = await db.from("resumos_cct").delete().eq("id", data.resumo_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
