import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertAdmin } from "./admin-guard.server";

/**
 * Sobe a versão oficial (.docx revisado fora do Hub) mantendo histórico.
 * Somente admins (código de acesso).
 */
export const uploadResumoOficial = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().min(1),
        resumo_id: z.string().uuid(),
        nome: z.string().min(1),
        base64: z.string().min(1),
        criado_por: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    assertAdmin(data.code);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("resumos_cct")
      .select("id, sindicato_id, ano, versao")
      .eq("id", data.resumo_id)
      .single();
    if (error || !row) throw new Error("Item da esteira não encontrado.");

    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const proximaVersao = (row.versao ?? 1) + 1;
    const path = `${row.sindicato_id}/${row.ano}/oficial-v${proximaVersao}-${Date.now()}.docx`;

    const up = await supabaseAdmin.storage.from("resumos-cct").upload(path, bytes, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
    if (up.error) throw new Error("Falha ao gravar arquivo: " + up.error.message);

    const { error: updErr } = await supabaseAdmin
      .from("resumos_cct")
      .update({
        oficial_path: path,
        oficial_nome: data.nome,
        oficial_em: new Date().toISOString(),
        versao: proximaVersao,
      })
      .eq("id", row.id);
    if (updErr) throw new Error("Falha ao registrar versão: " + updErr.message);

    await supabaseAdmin.from("resumos_cct_versoes").insert({
      resumo_id: row.id,
      versao: proximaVersao,
      path,
      nome: data.nome,
      origem: "oficial",
      criado_por: data.criado_por ?? null,
    });

    return { ok: true, path, versao: proximaVersao };
  });

/** URL assinada com nome de download padronizado. */
export const getResumoDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        resumo_id: z.string().uuid(),
        tipo: z.enum(["rascunho", "oficial"]),
        filename: z.string().min(1),
        path: z.string().optional(),
        code: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("resumos_cct")
      .select("resumo_docx_path, oficial_path, status")
      .eq("id", data.resumo_id)
      .single();
    if (error || !row) throw new Error("Item não encontrado.");

    const path =
      data.path ??
      (data.tipo === "oficial" ? row.oficial_path : row.resumo_docx_path);
    if (!path) throw new Error("Arquivo ainda não disponível.");

    // O caminho precisa pertencer a este item da esteira (evita link direto forjado).
    let pertence = path === row.oficial_path || path === row.resumo_docx_path;
    if (!pertence) {
      const { data: ver } = await supabaseAdmin
        .from("resumos_cct_versoes")
        .select("id")
        .eq("resumo_id", data.resumo_id)
        .eq("path", path)
        .maybeSingle();
      pertence = !!ver;
    }
    if (!pertence) throw new Error("Arquivo não pertence a este item da esteira.");

    // Regra de acesso (validada no servidor, não só na interface):
    // não publicado -> somente admin; publicado -> apenas a versão oficial é liberada.
    if (row.status !== "publicado") {
      assertAdmin(data.code ?? "");
    } else if (path !== row.oficial_path) {
      assertAdmin(data.code ?? "");
    }

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("resumos-cct")
      .createSignedUrl(path, 3600, { download: data.filename });
    if (sErr || !signed) throw new Error("Falha ao gerar URL: " + (sErr?.message ?? ""));
    return { url: signed.signedUrl };
  });
