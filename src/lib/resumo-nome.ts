/** Remove acentos e caracteres inválidos para nome de arquivo. */
export function sanitizeNomeArquivo(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Resumo CCT - {SINDICATO ate 40} - {CODIGO} - {ANO}.docx" */
export function nomeArquivoResumo(input: {
  sindicatoNome: string;
  codigo?: string | null;
  ano: number | string;
}): string {
  const nome = sanitizeNomeArquivo(input.sindicatoNome).slice(0, 40).trim();
  const codigo = sanitizeNomeArquivo(String(input.codigo ?? "")).trim();
  const partes = ["Resumo CCT", nome || "Sindicato"];
  if (codigo) partes.push(codigo);
  partes.push(String(input.ano));
  return `${partes.join(" - ")}.docx`;
}
