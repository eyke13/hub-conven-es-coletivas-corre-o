import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalPositionAlign,
  VerticalPositionRelativeFrom,
  WidthType,
} from "docx";
import { LOGO_ELITE_PNG_BASE64 } from "@/lib/logo-elite.base64";
import { RODAPE_ELITE_PNG_BASE64 } from "@/lib/rodape-elite.base64";
import { assertAdmin } from "./admin-guard.server";

// ============================================================
// SYSTEM PROMPT — analista sênior DP; saída JSON estruturado.
// ============================================================
const SYSTEM_PROMPT = `Você é um Analista Sênior de Departamento Pessoal e Auditoria Trabalhista da Elite Consultores. Sua função é ler o texto completo de uma Convenção Coletiva de Trabalho (CCT) e extrair um resumo operacional 100% estruturado em JSON, pronto para parametrizar folha de pagamento.

REGRAS INVIOLÁVEIS
1. ZERO SUPOSIÇÕES: extraia APENAS o que estiver textualmente escrito na CCT.
2. Não use "[A CONFERIR]" para benefícios ausentes. Quando um item tradicional (Vale-Alimentação, PLR, seguro de vida, etc.) NÃO for citado, escreva no campo correspondente exatamente: "Não previsto nesta convenção. Manter políticas internas da empresa, se houver."
3. Só use "[A CONFERIR]" quando um dado VITAL de identificação (Registro MTE, CNPJ, presidente, data de assinatura) estiver realmente ilegível/ausente no documento.
4. NÃO escreva a cláusula dentro do texto de "regra". O campo "regra" contém APENAS a regra em si, sem "(CLÁUSULA X)" no fim. A referência da cláusula vai EXCLUSIVAMENTE no campo "clausula" (ex.: "Cl. 5ª", "Cl. 29ª §10"). Se a cláusula não estiver clara, deixe "clausula" vazio e registre em "clausulas_a_conferir".
5. LEIA O DOCUMENTO INTEIRO, especialmente o FINAL — é onde ficam as contribuições sindicais, prazos de oposição, multas e disposições finais. Não pule.
6. Datas em formato ISO (AAAA-MM-DD) quando possível; valores monetários como string ("R$ 1.234,56").
7. NUNCA invente prazos de oposição, percentuais de reajuste ou valores de piso.
8. FIDELIDADE SELETIVA (anti-recitação): reproduza com exatidão literal APENAS valores em R$, percentuais, datas, prazos, números de cláusula e nomes próprios (sindicatos, gestoras, plataformas, bancos). Para descrições longas de benefícios, coberturas, procedimentos e regras (ex.: plano de saúde/assistência, PLR, banco de horas), RESUMA em linguagem própria e concisa — capture o que o benefício é, valores/limites e condições essenciais, sem copiar parágrafos inteiros. NUNCA reproduza blocos longos verbatim; sintetize.

SAÍDA
Responda EXCLUSIVAMENTE com um objeto JSON válido (sem markdown, sem cercas \`\`\`json, sem texto antes/depois). Use exatamente o schema abaixo. Não use null: quando não houver dado, use string vazia "" ou array vazio [].

SCHEMA (chaves obrigatórias em maiúsculas):
{
  "titulo_categoria": "string — nome oficial da categoria profissional",
  "cidade_estado": "string — cidade/estado de abrangência principal",
  "periodo": "string — ex.: 2026/2027",
  "identificacao": {
    "vigencia_inicio": "AAAA-MM-DD",
    "vigencia_fim": "AAAA-MM-DD",
    "data_base": "string — ex.: 1º de maio",
    "data_assinatura": "AAAA-MM-DD",
    "registro_mte": "string",
    "abrangencia_territorial": ["municípios..."],
    "categoria_abrangida": "string",
    "sindicato_laboral": { "nome": "", "cnpj": "", "presidente": "" },
    "sindicato_patronal": { "nome": "", "cnpj": "", "presidente": "" }
  },
  "pisos": [ { "funcao": "", "valor": "R$ ...", "clausula": "" } ],
  "reajuste": [ { "descricao": "", "percentual": "", "data_aplicacao": "", "clausula": "" } ],
  "pagamentos": [ { "tema": "Data-limite do salário", "regra": "", "clausula": "" } ],
  "jornada": [ { "tema": "Horas Extras / Adicional Noturno / Compensação / Banco de Horas", "regra": "", "clausula": "" } ],
  "adicionais": [ { "tema": "Triênio / Quebra de caixa / Insalubridade / Periculosidade / etc.", "regra": "", "clausula": "" } ],
  "beneficios": [ { "beneficio": "Vale-Alimentação / Vale-Refeição / Seguro de Vida / Creche / Auxílio-Funeral / PLR / etc.", "regra": "", "clausula": "" } ],
  "decimo_terceiro": [ { "tema": "", "regra": "", "clausula": "" } ],
  "feriados_dias_especiais": [ { "situacao": "Trabalho em feriado / Dia da categoria", "regra": "", "clausula": "" } ],
  "rescisao_estabilidades": {
    "homologacao": [ { "tema": "", "regra": "", "clausula": "" } ],
    "aviso_previo": [ { "tema": "", "regra": "", "clausula": "" } ],
    "estabilidades": [ { "tipo": "Gestante / Pré-aposentado / Acidentado / etc.", "regra": "", "clausula": "" } ],
    "faltas_abonadas": [ { "situacao": "", "regra": "", "clausula": "" } ]
  },
  "contribuicoes": [
    {
      "nome": "Contribuição Assistencial Laboral / Confederativa / Patronal / Negocial / etc.",
      "beneficiario": "Sindicato Laboral / Patronal",
      "base_calculo": "",
      "percentual_ou_valor": "",
      "faixas": [ { "faixa": "ex.: Empresas até 10 empregados", "valor": "R$ 100,00" } ],
      "prazo_recolhimento": "",
      "prazo_oposicao": "string — descreva o prazo EXATO em dias e a forma (carta protocolada / e-mail / etc.)",
      "clausula": "",
      "dados_recolhimento": { "banco": "", "agencia": "", "conta": "", "codigo_barras": "" }
    }
  ],
  "multas": [ {
    "tema": "Descumprimento da CCT / etc.",
    "valor": "",
    "parcelas": [ { "descricao": "ex.: Multa de 10% do salário-base", "valor": "R$ ..." } ],
    "reincidencia": "string — regra em caso de reincidência (opcional)",
    "base_calculo": "",
    "beneficiario": "",
    "clausula": ""
  } ],
  "acao_operacional_retroativo": "string — instrução operacional ao analista sobre diferenças retroativas quando a CCT foi assinada em atraso; vazio se não aplicável",
  "clausulas_a_conferir": [ "lista curta de cláusulas onde faltou dado vital para o resumo" ]
}

REGRAS ESTRUTURAIS EXTRAS
- Seja conciso: cada campo textual deve trazer só a regra operacional. Não copie listas longas de atividades, municípios ou parágrafos inteiros.
- "titulo_categoria" deve ser um título operacional curto da categoria; se a categoria oficial vier com dezenas de segmentos, resuma com "e similares" em vez de copiar tudo.
- "abrangencia_territorial" deve listar municípios apenas quando a base for pequena. Para abrangência estadual ou lista muito extensa, use uma única entrada resumida (ex.: "Estado do RN (abrangência estadual)" ou "Múltiplos municípios do RN — ver CCT").
- Se a contribuição tiver VALOR VARIÁVEL por porte/categoria/faixa (ex.: "Empresas até 10 empregados R$ 100; de 11 a 50 R$ 200; acima R$ 500"), preencha o array "faixas[]" com uma linha por faixa e deixe "percentual_ou_valor" com "Ver faixas".
- Se houver VALOR ÚNICO, deixe "faixas" ausente (ou vazio) e preencha "percentual_ou_valor".
- Nas multas, NUNCA emita a penalidade como uma única frase acumulada. Decomponha em "parcelas[]" (uma por parcela/componente da penalidade — ex.: multa em favor do empregado + multa em favor do sindicato) e coloque a regra de reincidência em "reincidencia" (nunca dentro de parcelas).
- Se houver apenas UMA parcela, ainda assim use "parcelas[]" com um único elemento.
- Se a abrangência territorial cobrir todos (ou a maioria) dos municípios de um estado, "cidade_estado" deve indicar abrangência estadual (ex.: "Estado do RN (abrangência estadual)"). Use cidade específica apenas em CCTs de base municipal.
- Para qualquer campo sem informação no texto, use string vazia "" ou array vazio [] — NUNCA use null. Não omita chaves do schema; preencha com ""/[] quando não houver dado.`;

// Agrupamento adaptativo e definições negativas são anexados via SYSTEM_PROMPT_EXTRA abaixo.
const SYSTEM_PROMPT_EXTRA = `

AGRUPAMENTO ADAPTATIVO (subseções criadas por você)
- Cada item de "pagamentos", "jornada", "adicionais", "beneficios", "feriados_dias_especiais", "rescisao_estabilidades.homologacao", "rescisao_estabilidades.aviso_previo", "rescisao_estabilidades.estabilidades" e "rescisao_estabilidades.faltas_abonadas" deve trazer também:
  - "subsecao": rótulo curto (2 a 4 palavras) que agrupa itens do mesmo assunto DENTRO da seção. Você mesmo escolhe os rótulos conforme os temas presentes NESTA convenção — não há lista pré-definida. Itens do mesmo assunto devem repetir EXATAMENTE o mesmo rótulo (mesma grafia). Ex. em "pagamentos": "Comprovante e prazo", "Descontos", "Comissionistas", "Outras verbas". Se um item não se agrupar com nenhum outro, use "Disposições gerais". Máximo 5 subseções por seção — agrupe o resto em "Disposições gerais".
  - "clausula_num": número da cláusula em algarismo arábico (ex.: "CLÁUSULA QUINTA" → 5; "CLÁUSULA VIGÉSIMA NONA §10" → 29). Use 0 se não houver.

DEFINIÇÕES NEGATIVAS (o que NÃO vai em cada caixa)
- "pagamentos": forma, prazo e comprovante de pagamento do salário; descontos; mora salarial. NÃO coloque aqui: benefícios (→ "beneficios"), adicionais (→ "adicionais"), regras de rescisão (→ "rescisao_estabilidades").
- "rescisao_estabilidades.aviso_previo": APENAS regras sobre o aviso prévio em si (prazo, dispensa, cumprimento, alterações durante o aviso). NÃO coloque aqui prazo de quitação das verbas rescisórias nem multa por atraso de rescisão → isso vai em "rescisao_estabilidades.homologacao".
- "rescisao_estabilidades.homologacao": prazo de quitação das verbas rescisórias, multa por atraso, local/assistência da homologação, documentos exigidos e despesas.
- Regra geral: cada cláusula aparece UMA única vez, na caixa mais específica.`;

// ============================================================
// Prompt do usuário — SEM truncamento agressivo no final.
// ============================================================
type PromptMode = "normal" | "compacto" | "ultracompacto";

function buildUserPrompt(texto: string, mode: PromptMode = "normal"): string {
  const MAX = mode === "normal" ? 300_000 : mode === "compacto" ? 220_000 : 140_000;
  const head = mode === "normal" ? 150_000 : mode === "compacto" ? 110_000 : 70_000;
  const tail = mode === "normal" ? 100_000 : mode === "compacto" ? 90_000 : 60_000;
  const trunc =
    texto.length > MAX
      ? texto.slice(0, head) +
        "\n\n[...trecho intermediário omitido para caber no contexto — leia início e FIM do documento...]\n\n" +
        texto.slice(-tail)
      : texto;
  const compactRule =
    mode === "normal"
      ? ""
      : `\n\nMODO ${mode.toUpperCase()}: a tentativa anterior excedeu o limite de saída. Gere JSON MENOR: limite cada descrição/regra a 1 frase objetiva; no máximo 8 itens por seção; não copie listas extensas; preserve integralmente apenas valores, datas, percentuais, prazos, cláusulas e nomes próprios essenciais.`;
  return `Extraia o resumo estruturado (JSON) desta CCT. LEIA ATÉ O FIM — as contribuições sindicais, prazos de oposição e disposições finais estão no final do documento. Preencha APENAS com o que estiver textualmente escrito abaixo.${compactRule}\n\n---\n${trunc}\n---`;
}

// ============================================================
// Zod schema TOLERANTE — validação nunca aborta a geração.
// ============================================================
// Aceita string | null | undefined | número/boolean → sempre vira string.
// .catch("") garante que este campo NUNCA derrube o parse do objeto inteiro.
const zStr = z
  .preprocess(
    (v) => (v === null || v === undefined ? "" : typeof v === "string" ? v : String(v)),
    z.string(),
  )
  .catch("");
const zItem = z
  .object({
    tema: zStr,
    regra: zStr,
    clausula: zStr,
    subsecao: zStr,
    clausula_num: z
      .preprocess(
        (v) => (v === null || v === undefined || v === "" ? 0 : Number(v)),
        z.number(),
      )
      .catch(0),
    situacao: zStr,
    beneficio: zStr,
    funcao: zStr,
    valor: zStr,
    percentual: zStr,
    descricao: zStr,
    data_aplicacao: zStr,
    tipo: zStr,
  })
  .partial();

const CctSchema = z
  .object({
    titulo_categoria: zStr,
    cidade_estado: zStr,
    periodo: zStr,
    identificacao: z
      .object({
        vigencia_inicio: zStr,
        vigencia_fim: zStr,
        data_base: zStr,
        data_assinatura: zStr,
        registro_mte: zStr,
        abrangencia_territorial: z.array(z.string().catch("")).optional().catch([]).default([]),
        categoria_abrangida: zStr,
        sindicato_laboral: z
          .object({ nome: zStr, cnpj: zStr, presidente: zStr })
          .partial()
          .optional()
          .catch({})
          .default({}),
        sindicato_patronal: z
          .object({ nome: zStr, cnpj: zStr, presidente: zStr })
          .partial()
          .optional()
          .catch({})
          .default({}),
      })
      .partial()
      .optional()
      .catch({})
      .default({}),
    pisos: z.array(zItem).optional().catch([]).default([]),
    reajuste: z.array(zItem).optional().catch([]).default([]),
    pagamentos: z.array(zItem).optional().catch([]).default([]),
    jornada: z.array(zItem).optional().catch([]).default([]),
    adicionais: z.array(zItem).optional().catch([]).default([]),
    beneficios: z.array(zItem).optional().catch([]).default([]),
    decimo_terceiro: z.array(zItem).optional().catch([]).default([]),
    feriados_dias_especiais: z.array(zItem).optional().catch([]).default([]),
    rescisao_estabilidades: z
      .object({
        homologacao: z.array(zItem).optional().catch([]).default([]),
        aviso_previo: z.array(zItem).optional().catch([]).default([]),
        estabilidades: z.array(zItem).optional().catch([]).default([]),
        faltas_abonadas: z.array(zItem).optional().catch([]).default([]),
      })
      .partial()
      .optional()
      .catch({})
      .default({}),
    contribuicoes: z
      .array(
        z
          .object({
            nome: zStr,
            beneficiario: zStr,
            base_calculo: zStr,
            percentual_ou_valor: zStr,
            prazo_recolhimento: zStr,
            prazo_oposicao: zStr,
            clausula: zStr,
            dados_recolhimento: z
              .object({
                banco: zStr,
                agencia: zStr,
                conta: zStr,
                codigo_barras: zStr,
              })
              .partial()
              .optional()
              .catch({})
              .default({}),
            faixas: z
              .array(
                z
                  .object({ faixa: zStr, valor: zStr })
                  .partial(),
              )
              .optional()
              .catch([])
              .default([]),
          })
          .partial(),
      )
      .optional()
      .catch([])
      .default([]),
    multas: z
      .array(
        z
          .object({
            tema: zStr,
            valor: zStr,
            base_calculo: zStr,
            beneficiario: zStr,
            clausula: zStr,
            reincidencia: zStr,
            parcelas: z
              .array(
                z
                  .object({ descricao: zStr, valor: zStr })
                  .partial(),
              )
              .optional()
              .catch([])
              .default([]),
          })
          .partial(),
      )
      .optional()
      .catch([])
      .default([]),
    acao_operacional_retroativo: zStr,
    clausulas_a_conferir: z.array(z.string().catch("")).optional().catch([]).default([]),
  })
  .partial();

export type CctJson = z.infer<typeof CctSchema>;

// ============================================================
// Lovable AI Gateway — resposta JSON obrigatória.
// ============================================================
async function callLovableAiJson(texto: string): Promise<CctJson> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada no servidor.");
  const promptModes: PromptMode[] = ["normal", "compacto", "ultracompacto"];

  const ABORT_REASONS = new Set([
    "error",
    "content_filter",
    "safety",
    "recitation",
    "RECITATION",
    "SAFETY",
  ]);
  const MAX_TENTATIVAS = 3;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let ultimoFinish = "";
  let ultimoDetalhe: string | null = null;
  let ultimoRaw = "";

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const promptMode = promptModes[tentativa - 1] ?? "ultracompacto";
    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + SYSTEM_PROMPT_EXTRA },
        { role: "user", content: buildUserPrompt(texto, promptMode) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 16384,
      max_completion_tokens: 16384,
      // Desliga o "thinking" do Gemini 2.5 Flash, que consome maxOutputTokens
      // do mesmo pool e provoca finish_reason=length com JSON truncado.
      reasoning: { effort: "none" },
      generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
      extra_body: { generationConfig: { thinkingConfig: { thinkingBudget: 0 } } },
    };
    let resp: Response;
    try {
      resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "raw-fetch",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error(`[resumo-ia] tentativa ${tentativa} — erro de rede:`, err);
      if (tentativa < MAX_TENTATIVAS) {
        await sleep(800 * tentativa);
        continue;
      }
      throw new Error(
        `Falha de rede ao contatar a IA: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!resp.ok) {
      const bodyText = await resp.text();
      if (resp.status === 429)
        throw new Error("Limite de requisições da IA atingido. Tente novamente em instantes.");
      if (resp.status === 402)
        throw new Error("Créditos de IA esgotados no workspace Lovable.");
      // 5xx transitório → retry; outros erros HTTP são terminais.
      if (resp.status >= 500 && tentativa < MAX_TENTATIVAS) {
        console.error(
          `[resumo-ia] tentativa ${tentativa} — HTTP ${resp.status}:`,
          bodyText.slice(0, 500),
        );
        await sleep(800 * tentativa);
        continue;
      }
      throw new Error(`Falha na IA [${resp.status}]: ${bodyText.slice(0, 300)}`);
    }

    const respJson = (await resp.json()) as {
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
        error?: unknown;
      }>;
      usage?: unknown;
      error?: unknown;
    };
    const raw = (respJson.choices?.[0]?.message?.content ?? "").trim();
    const finish = respJson.choices?.[0]?.finish_reason ?? "";
    const detalheErro =
      (respJson.error as { message?: string } | undefined)?.message ??
      (respJson.choices?.[0]?.error as { message?: string } | undefined)?.message ??
      null;
    ultimoFinish = finish;
    ultimoDetalhe = detalheErro;
    ultimoRaw = raw;

    // Sucesso: apenas finish=stop (ou null) prossegue para o parse.
    if (finish === "" || finish === "stop" || finish == null) {
      if (!raw) {
        throw new Error(`[IA_VAZIA] finish=${finish} resposta sem conteúdo textual.`);
      }
      const noFences = raw.replace(/```json|```/g, "").trim();
      const match = noFences.match(/\{[\s\S]*\}/);
      const candidate = match ? match[0] : noFences;
      let parsed: unknown;
      try {
        parsed = JSON.parse(candidate);
      } catch {
        throw new Error(`[JSON_INVALIDO] finish=${finish} raw=${raw.slice(0, 500)}`);
      }
      const result = CctSchema.safeParse(parsed);
      if (!result.success) {
        console.error(
          "[resumo-ia] Zod rejeitou o JSON da IA. Campos problemáticos:",
          JSON.stringify(result.error.issues, null, 2),
        );
        throw new Error(
          `[SCHEMA_FALHOU] O JSON da IA não passou na validação. Primeiro campo: ${
            result.error.issues[0]?.path?.join(".") ?? "?"
          } — ${result.error.issues[0]?.message ?? "?"}. Veja ia_json.debug.ia_raw.`,
        );
      }
      const validated = result.data;
      (validated as CctJson & { __debug?: unknown }).__debug = {
        ia_raw: raw.slice(0, 2000),
        ia_finish: finish,
        ia_tentativa: tentativa,
      };
      return validated;
    }

    // Truncamento por tokens: re-tenta com prompt progressivamente mais compacto.
    if (finish === "length" || finish === "MAX_TOKENS") {
      console.error(
        `[resumo-ia] tentativa ${tentativa} — resposta truncada (finish=${finish}, modo=${promptMode}).`,
      );
      console.error("[resumo-ia] usage:", JSON.stringify(respJson?.usage ?? null));
      console.error("[resumo-ia] parcial truncado:", raw.slice(0, 1000));
      if (tentativa < MAX_TENTATIVAS) {
        await sleep(800 * tentativa);
        continue;
      }
      throw new Error(
        "A resposta da IA foi truncada (limite de tokens atingido) mesmo após compactação automática. Tente enviar o documento em DOCX/texto menor ou uma CCT com menos anexos/tabelas.",
      );
    }

    // Aborto transitório (error/content_filter/safety/recitation): logar e re-tentar.
    if (ABORT_REASONS.has(finish)) {
      console.error(`[resumo-ia] tentativa ${tentativa} — finish_reason: ${finish}`);
      console.error(
        "[resumo-ia] resposta completa do gateway:",
        JSON.stringify(respJson, null, 2).slice(0, 4000),
      );
      console.error("[resumo-ia] usage:", JSON.stringify(respJson?.usage ?? null));
      console.error("[resumo-ia] error field:", JSON.stringify(detalheErro));
      if (tentativa < MAX_TENTATIVAS) {
        await sleep(800 * tentativa);
        continue;
      }
      break;
    }

    // finish_reason desconhecido: log + retry defensivo.
    console.error(
      `[resumo-ia] tentativa ${tentativa} — finish_reason desconhecido: ${finish}`,
      JSON.stringify(respJson, null, 2).slice(0, 2000),
    );
    if (tentativa < MAX_TENTATIVAS) {
      await sleep(800 * tentativa);
      continue;
    }
    break;
  }

  throw new Error(
    `A IA abortou a geração (finish=${ultimoFinish || "desconhecido"}) após ${MAX_TENTATIVAS} tentativas. Detalhe do provedor: ${ultimoDetalhe ?? "não informado"}.${ultimoRaw ? ` Parcial: ${ultimoRaw.slice(0, 300)}` : ""}`,
  );
}

// Concatena texto de todas as páginas manualmente (mergePages:false recupera
// texto que o merge automático perde em PDFs assinados/DocuSign).
async function extractPdfText(buf: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  const joined = pages
    .map((p) => (typeof p === "string" ? p : ""))
    .join("\n\n");
  // Normaliza espaços e quebras redundantes.
  return joined
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Extrai texto de um .docx (zip de XML) sem converter para PDF.
async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const arquivos = unzipSync(bytes);
  const doc = arquivos["word/document.xml"];
  if (!doc) throw new Error("DOCX inválido: word/document.xml não encontrado.");
  let xml = strFromU8(doc);
  xml = xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<[^>]+>/g, "");
  return xml
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type TipoArquivo = "pdf" | "docx" | "doc" | "rtf" | "html" | "desconhecido";

/** Detecta o formato REAL pelos primeiros bytes; a extensão é só desempate. */
function detectarTipoArquivo(bytes: Uint8Array, nome: string): TipoArquivo {
  const assinatura = Array.from(bytes.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (assinatura.startsWith("25504446")) return "pdf";
  if (assinatura.startsWith("504b0304")) return "docx";
  if (assinatura.startsWith("d0cf11e0a1b11ae1")) return "doc";
  if (assinatura.startsWith("7b5c727466")) return "rtf";

  // HTML disfarçado (Mediador/MTE): pode ter \n ou espaços antes de <html>.
  const inicio = Buffer.from(bytes.slice(0, 2048))
    .toString("latin1")
    .trimStart()
    .toLowerCase();
  if (
    inicio.startsWith("<html") ||
    inicio.startsWith("<!doctype html") ||
    inicio.startsWith("<?xml") ||
    inicio.includes("schemas-microsoft-com:office")
  ) {
    return "html";
  }

  const ext = (nome.split(".").pop() ?? "").toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "doc") return "doc";
  return "desconhecido";
}

/** Extrai texto de .doc (OLE2 / Word 97-2003). Preserva acentuação e tabelas (\t entre células). */
async function extractDocText(bytes: Uint8Array): Promise<string> {
  const { default: WordExtractor } = await import("word-extractor");
  const extractor = new WordExtractor();
  const doc = await extractor.extract(Buffer.from(bytes));
  const partes = [doc.getBody(), doc.getFootnotes?.(), doc.getEndnotes?.()]
    .filter(Boolean)
    .map((s) => String(s).trim())
    .filter(Boolean);
  return partes
    .join("\n\n")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extrai texto de HTML exportado pelo Mediador/MTE (geralmente salvo com extensão .doc).
 * Trata charset ISO-8859-1, entidades numéricas e nomeadas, e preserva tabelas.
 */
async function extractHtmlWordText(bytes: Uint8Array): Promise<string> {
  const { default: he } = await import("he");

  // 1) Respeita o charset declarado no <meta>. Mediador usa ISO-8859-1;
  //    decodificar como UTF-8 lança exceção em bytes 0x80+.
  const cabecalho = Buffer.from(bytes.slice(0, 2048)).toString("latin1");
  const m = cabecalho.match(/charset=["']?([\w-]+)/i);
  const enc = (m?.[1] ?? "utf-8").toLowerCase();
  const decoder: BufferEncoding =
    enc.includes("8859") || enc.includes("1252") ? "latin1" : "utf8";
  let html = Buffer.from(bytes).toString(decoder);

  html = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "");

  html = html
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  html = he.decode(html);

  return html
    .split("\n")
    .map((l) => l.replace(/[ \u00a0]{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isExtracaoVazia(j: CctJson): boolean {
  // Consideramos "vazio" apenas quando NENHUMA seção relevante trouxe conteúdo.
  // Se qualquer array de cláusulas veio populado (ou houve identificação/título),
  // seguimos com a geração — o analista revisa o que faltou na conferência.
  const temIdent = Boolean(
    j.identificacao?.vigencia_inicio ||
      j.identificacao?.vigencia_fim ||
      j.identificacao?.data_base ||
      j.identificacao?.registro_mte ||
      j.identificacao?.sindicato_laboral?.nome ||
      j.identificacao?.sindicato_patronal?.nome ||
      j.titulo_categoria ||
      j.periodo,
  );
  const arrays = [
    j.pisos,
    j.reajuste,
    j.pagamentos,
    j.jornada,
    j.adicionais,
    j.beneficios,
    j.decimo_terceiro,
    j.feriados_dias_especiais,
    j.contribuicoes,
    j.multas,
    j.rescisao_estabilidades?.homologacao,
    j.rescisao_estabilidades?.aviso_previo,
    j.rescisao_estabilidades?.estabilidades,
    j.rescisao_estabilidades?.faltas_abonadas,
  ];
  const temAlgumArray = arrays.some((a) => Array.isArray(a) && a.length > 0);
  return !temIdent && !temAlgumArray;
}

// ============================================================
// Server function principal — recebe PDF em base64, gera .docx.
// ============================================================
export const gerarResumoCct = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        resumo_id: z.string().uuid(),
        pdf_base64: z.string().min(100),
        pdf_nome: z.string().min(1),
        code: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    assertAdmin(data.code);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabase = supabaseAdmin;

    // 1. carregar row
    const { data: row, error: rowErr } = await supabase
      .from("resumos_cct")
      .select("*")
      .eq("id", data.resumo_id)
      .single();
    if (rowErr || !row) throw new Error("Item da esteira não encontrado.");
    if (row.processando)
      throw new Error("Já existe uma geração em andamento para este item.");

    // 2. lock
    const { error: lockErr } = await supabase
      .from("resumos_cct")
      .update({
        processando: true,
        status: "em_andamento",
        erro_msg: null,
        iniciado_em: row.iniciado_em ?? new Date().toISOString(),
      })
      .eq("id", row.id);
    if (lockErr) throw new Error("Falha ao travar item: " + lockErr.message);

    try {
      // 3. decodificar PDF em memória (sem storage)
      const buf = Uint8Array.from(atob(data.pdf_base64), (c) => c.charCodeAt(0));

      // 4. extrair texto (PDF, DOCX ou DOC — detectado pelos magic bytes)
      const tipo = detectarTipoArquivo(buf, data.pdf_nome ?? "");
      let fullText: string;
      switch (tipo) {
        case "pdf":
          fullText = await extractPdfText(buf);
          break;
        case "docx":
          fullText = await extractDocxText(buf);
          break;
        case "doc":
          fullText = await extractDocText(buf);
          break;
        case "html":
          fullText = await extractHtmlWordText(buf);
          break;
        case "rtf":
          throw new Error(
            "[FORMATO_NAO_SUPORTADO] Este arquivo é RTF (apenas renomeado como .doc). Abra no Word e use 'Salvar como' escolhendo .docx ou PDF.",
          );
        default:
          throw new Error(
            "[FORMATO_NAO_SUPORTADO] Não foi possível identificar o formato do arquivo. Envie um .pdf (com texto selecionável), .docx ou .doc.",
          );
      }
      const textoLen = fullText.length;
      const textoAmostra = fullText.slice(0, 500);
      if (!fullText || textoLen < 200) {
        throw new Error(
          `[TEXTO_VAZIO] Texto extraído vazio/insuficiente (len=${textoLen}, tipo=${tipo}). O arquivo pode estar vazio, ser escaneado ou não conter camada de texto.`,
        );
      }

      // 5. chamar IA — recebe JSON estruturado validado
      const cctJson = await callLovableAiJson(fullText);
      const debug = (cctJson as CctJson & { __debug?: unknown }).__debug;
      delete (cctJson as CctJson & { __debug?: unknown }).__debug;

      // 5b. se extração vier totalmente vazia nos campos-chave, é falha real —
      // não geramos docx com "—" por toda parte.
      if (isExtracaoVazia(cctJson)) {
        await supabase
          .from("resumos_cct")
          .update({
            ia_json: {
              debug: {
                texto_len: textoLen,
                texto_amostra: textoAmostra,
                ...(debug as object),
              },
              parcial: cctJson,
            } as unknown as never,
          })
          .eq("id", row.id);
        throw new Error(
          "[EXTRACAO_VAZIA] IA retornou JSON sem campos-chave (vigência, reajuste e pisos vazios). Veja ia_json.debug.",
        );
      }

      // 6. montar .docx real (docx-js) com timbre no header
      const docxBytes = await buildDocxFromJson(cctJson, {
        ano: row.ano,
        pdfNome: data.pdf_nome,
      });

      // 7. upload .docx
      const versao = row.versao ?? 1;
      const docxPath = `${row.sindicato_id}/${row.ano}/resumo-v${versao}-${Date.now()}.docx`;
      const up = await supabaseAdmin.storage
        .from("resumos-cct")
        .upload(docxPath, docxBytes, {
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: true,
        });
      if (up.error) throw new Error("Falha ao gravar .docx: " + up.error.message);

      // 8. atualizar row (ia_json guarda o JSON estruturado auditável)
      const { error: updErr } = await supabase
        .from("resumos_cct")
        .update({
          ia_json: {
            ...(cctJson as object),
            debug: {
              texto_len: textoLen,
              texto_amostra: textoAmostra,
              ...(debug as object),
            },
          } as unknown as never,
          resumo_docx_path: docxPath,
          status: "em_conferencia",
          processando: false,
          erro_msg: null,
        })
        .eq("id", row.id);
      if (updErr) throw new Error("Falha ao salvar resultado: " + updErr.message);

      return { ok: true, docxPath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Se o parser JSON quebrou, gravamos os 300 chars crus direto (sem truncar de novo).
      const erroMsg = msg.startsWith("[JSON_INVALIDO]")
        ? msg.slice(0, 400)
        : msg.slice(0, 500);
      await supabase
        .from("resumos_cct")
        .update({
          processando: false,
          status: "erro",
          erro_msg: erroMsg,
        })
        .eq("id", row.id);
      throw new Error(msg);
    }
  });

// ============================================================
// Signed URL — só .docx (o documento não é mais armazenado).
// ============================================================
export const getSignedDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        resumo_id: z.string().uuid(),
        tipo: z.literal("docx"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin: supabase } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: row, error } = await supabase
      .from("resumos_cct")
      .select("resumo_docx_path")
      .eq("id", data.resumo_id)
      .single();
    if (error || !row) throw new Error("Item não encontrado.");
    const path = row.resumo_docx_path;
    if (!path) throw new Error("Arquivo ainda não disponível.");
    const { data: signed, error: sErr } = await supabase.storage
      .from("resumos-cct")
      .createSignedUrl(path, 3600);
    if (sErr || !signed) throw new Error("Falha ao gerar URL: " + (sErr?.message ?? ""));
    return { url: signed.signedUrl };
  });

// ============================================================
// JSON → .docx (papel timbrado Elite, docx-js)
// ============================================================

const COR_BRAND = "003366";
const COR_TEXTO_INFO = COR_BRAND; // azul escuro do texto informativo — ponto único de ajuste
const COR_BORDA = "CBD5E0";
const COR_HEADER_BG = "F7FAFC";
const COR_INSTRUCAO_BG = "EBF8FF";

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: COR_BORDA };
const cellBorders = {
  top: cellBorder,
  bottom: cellBorder,
  left: cellBorder,
  right: cellBorder,
};

function txt(t: string, opts: { bold?: boolean; color?: string; size?: number } = {}) {
  return new TextRun({
    text: t,
    bold: opts.bold,
    color: opts.color ?? COR_TEXTO_INFO,
    size: opts.size ?? 20, // 10pt
    font: "Arial",
  });
}

function p(text: string, opts: { bold?: boolean; color?: string; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  return new Paragraph({
    alignment: opts.align,
    children: [txt(text, opts)],
    spacing: { after: 120 },
  });
}

function h2(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 140 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: COR_BRAND, space: 2 },
    },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        color: COR_BRAND,
        size: 26,
        font: "Arial",
      }),
    ],
  });
}

function bullet(text: string) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [txt(text)],
    spacing: { after: 60 },
  });
}

function headerCell(text: string, widthDxa: number) {
  return new TableCell({
    borders: cellBorders,
    width: { size: widthDxa, type: WidthType.DXA },
    shading: { fill: COR_BRAND, type: ShadingType.CLEAR, color: "auto" },
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: text.toUpperCase(),
            bold: true,
            color: "FFFFFF",
            size: 20,
            font: "Arial",
          }),
        ],
      }),
    ],
  });
}

function bodyCell(text: string, widthDxa: number, opts: { bold?: boolean; bg?: string } = {}) {
  return new TableCell({
    borders: cellBorders,
    width: { size: widthDxa, type: WidthType.DXA },
    shading: opts.bg
      ? { fill: opts.bg, type: ShadingType.CLEAR, color: "auto" }
      : undefined,
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [
      new Paragraph({
        children: [txt(text || "—", { bold: opts.bold, color: opts.bold ? COR_BRAND : undefined })],
      }),
    ],
  });
}

function bodyCellParagraphs(paragraphs: Paragraph[], widthDxa: number) {
  return new TableCell({
    borders: cellBorders,
    width: { size: widthDxa, type: WidthType.DXA },
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: paragraphs,
  });
}

function twoColTable(rows: Array<[string, string]>, headers: [string, string] = ["Tema", "Regra"]) {
  const widths = [3120, 6240] as const;
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [...widths],
    rows: [
      new TableRow({
        tableHeader: true,
        children: [headerCell(headers[0], widths[0]), headerCell(headers[1], widths[1])],
      }),
      ...rows.map(
        ([a, b]) =>
          new TableRow({
            children: [
              bodyCell(a, widths[0], { bold: true, bg: COR_HEADER_BG }),
              bodyCell(b, widths[1]),
            ],
          }),
      ),
    ],
  });
}

function threeColTable(
  rows: Array<[string, string, string]>,
  headers: [string, string, string],
) {
  const widths = [3120, 4160, 2080] as const;
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [...widths],
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell(headers[0], widths[0]),
          headerCell(headers[1], widths[1]),
          headerCell(headers[2], widths[2]),
        ],
      }),
      ...rows.map(
        ([a, b, c]) =>
          new TableRow({
            children: [
              bodyCell(a, widths[0], { bold: true, bg: COR_HEADER_BG }),
              bodyCell(b, widths[1]),
              bodyCell(c, widths[2]),
            ],
          }),
      ),
    ],
  });
}

function formatItem(regra: string, clausula?: string): string {
  const c = (clausula ?? "").trim();
  if (!regra) return c ? `— (${c})` : "—";
  return c ? `${regra} (${c})` : regra;
}

// Remove referências de cláusula que o modelo insistiu em colar no fim do texto,
// para evitar duplicação com a coluna própria de cláusula.
function limparClausulaEmbutida(regra: string): string {
  let out = (regra ?? "").trim();
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/\s*[\(\[]\s*(?:cl[áa]usula|cl\.)[^\)\]]*[\)\]]\s*$/gi, "")
      .trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

type ItemLike = {
  subsecao?: string;
  clausula_num?: number;
  tema?: string;
  situacao?: string;
  tipo?: string;
  beneficio?: string;
  funcao?: string;
  regra?: string;
  clausula?: string;
};

function agruparPorSubsecao<T extends ItemLike>(itens: T[]): Array<[string, T[]]> {
  const mapa = new Map<string, T[]>();
  for (const i of itens) {
    const chave = ((i.subsecao ?? "").trim()) || "Disposições gerais";
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave)!.push(i);
  }
  for (const [, lista] of mapa) {
    lista.sort((a, b) => (a.clausula_num ?? 0) - (b.clausula_num ?? 0));
  }
  const entradas = [...mapa.entries()];
  entradas.sort(([a], [b]) => {
    if (a === "Disposições gerais") return 1;
    if (b === "Disposições gerais") return -1;
    return 0;
  });
  return entradas;
}

function renderSecaoAgrupada(
  itens: ItemLike[],
  labelField: "tema" | "situacao" | "tipo" | "beneficio" | "funcao" = "tema",
): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  const grupos = agruparPorSubsecao(itens);
  const mostrarTitulos = grupos.length > 1;
  for (const [nomeGrupo, lista] of grupos) {
    if (mostrarTitulos) {
      out.push(
        new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [
            new TextRun({
              text: nomeGrupo,
              bold: true,
              color: COR_BRAND,
              size: 22,
              font: "Arial",
            }),
          ],
        }),
      );
    }
    out.push(
      threeColTable(
        lista.map((i) => [
          nonEmpty(
            (i[labelField] as string | undefined) ??
              i.tema ??
              i.situacao ??
              i.tipo ??
              i.beneficio ??
              i.funcao,
          ),
          limparClausulaEmbutida(i.regra ?? ""),
          nonEmpty(i.clausula),
        ]),
        ["Tema", "Regra", "Cláusula"],
      ),
    );
  }
  return out;
}

function nonEmpty(s: string | undefined | null): string {
  const v = (s ?? "").trim();
  return v || "—";
}

// Registro MTE: se ausente / "[A CONFERIR]", exibir texto institucional.
function mteDisplay(s: string | undefined | null): string {
  const v = (s ?? "").trim();
  if (!v || /\[A CONFERIR\]/i.test(v)) return "Não consta no documento";
  return v;
}

// Se o valor é vazio, "—" ou "[A CONFERIR]", devolve o fallback.
function apresentar(
  s: string | undefined | null,
  fallback = "Não previsto nesta convenção.",
): string {
  const v = (s ?? "").trim();
  if (!v || v === "—" || /\[A CONFERIR\]/i.test(v)) return fallback;
  return v;
}

// ============================================================
// Datas em pt-BR (estrito)
// ============================================================
const ISO_STRICT = /^\d{4}-\d{2}-\d{2}$/;
const ISO_GLOBAL = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

function fmtDataBR(v: string): string {
  const t = v.trim();
  if (!ISO_STRICT.test(t)) return v;
  const [y, m, d] = t.split("-");
  return `${d}/${m}/${y}`;
}

function replaceISOsInText(s: string): string {
  return s.replace(ISO_GLOBAL, "$3/$2/$1");
}

function normalizarDatasBR<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((v) => normalizarDatasBR(v)) as unknown as T;
  }
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = normalizarDatasBR(v);
    }
    return out as T;
  }
  if (typeof obj === "string") {
    const t = obj.trim();
    if (ISO_STRICT.test(t)) return fmtDataBR(obj) as unknown as T;
    if (ISO_GLOBAL.test(obj)) return replaceISOsInText(obj) as unknown as T;
    return obj;
  }
  return obj;
}

// ============================================================
// Parsers de fallback — faixas e parcelas de multas
// ============================================================
function parseFaixasFromText(
  s: string | undefined | null,
): Array<{ faixa: string; valor: string }> {
  const raw = (s ?? "").trim();
  if (!raw) return [];
  const partes = raw
    .split(/[;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: Array<{ faixa: string; valor: string }> = [];
  for (const p of partes) {
    // Captura o último R$ X,XX (ou percentual) e trata o resto como rótulo.
    const m = p.match(/^(.+?)[\s:—-]+((?:R\$\s*[\d.,]+|[\d.,]+\s*%))\s*$/i);
    if (m) out.push({ faixa: m[1].trim(), valor: m[2].trim() });
  }
  return out.length >= 2 ? out : [];
}

function parseParcelasFromText(
  s: string | undefined | null,
): { parcelas: Array<{ descricao: string; valor?: string }>; reincidencia: string } {
  const raw = (s ?? "").trim();
  if (!raw) return { parcelas: [], reincidencia: "" };
  // Extrai reincidência (se citada) e remove do texto restante.
  let rein = "";
  const reinMatch = raw.match(/reincid[eê]ncia\s*[:\-—]\s*(.+)$/i);
  let corpo = raw;
  if (reinMatch) {
    rein = reinMatch[1].trim();
    corpo = raw.slice(0, reinMatch.index).replace(/[.,;·\s]+$/, "");
  }
  const partes = corpo
    .split(/\s*\+\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    parcelas: partes.map((p) => ({ descricao: p })),
    reincidencia: rein,
  };
}

async function buildDocxFromJson(
  _d: CctJson,
  _meta: { ano: number; pdfNome: string },
): Promise<Uint8Array> {
  // Normaliza toda data ISO puramente pt-BR (só quando o valor casa ^YYYY-MM-DD$
  // ou quando um ISO aparece dentro de texto — sem reformatar frases inteiras).
  const d = normalizarDatasBR(_d);
  // Decodifica logo (PNG) para bytes.
  const logoBytes = Uint8Array.from(atob(LOGO_ELITE_PNG_BASE64), (c) =>
    c.charCodeAt(0),
  );
  const rodapeBytes = Uint8Array.from(atob(RODAPE_ELITE_PNG_BASE64), (c) =>
    c.charCodeAt(0),
  );

  const children: Array<Paragraph | Table> = [];

  // Título centralizado
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 60 },
      children: [
        new TextRun({
          text: "RESUMO DA CONVENÇÃO COLETIVA DE TRABALHO",
          bold: true,
          color: COR_BRAND,
          size: 32,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: `${nonEmpty(d.titulo_categoria)} — ${nonEmpty(d.cidade_estado)}`,
          bold: true,
          size: 24,
          font: "Arial",
          color: "4A5568",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: `Período: ${nonEmpty(d.periodo)}  |  Registro MTE: ${mteDisplay(d.identificacao?.registro_mte)}`,
          size: 20,
          font: "Arial",
          color: "718096",
        }),
      ],
    }),
  );

  // 1. Identificação
  const id = d.identificacao ?? {};
  const abr = (id.abrangencia_territorial ?? []).join(", ");
  const sl = id.sindicato_laboral ?? {};
  const sp = id.sindicato_patronal ?? {};
  const idRows: Array<[string, string]> = [
    ["Vigência", `${nonEmpty(id.vigencia_inicio)} a ${nonEmpty(id.vigencia_fim)}`],
    ["Data-base", nonEmpty(id.data_base)],
    ["Data de assinatura", nonEmpty(id.data_assinatura)],
    ["Registro no MTE", mteDisplay(id.registro_mte)],
    ["Categoria abrangida", nonEmpty(id.categoria_abrangida)],
    ["Abrangência territorial", abr || "—"],
    [
      "Sindicato laboral",
      `${nonEmpty(sl.nome)}${sl.cnpj ? ` — CNPJ ${sl.cnpj}` : ""}${sl.presidente ? ` — Presidente: ${sl.presidente}` : ""}`,
    ],
    [
      "Sindicato patronal",
      `${nonEmpty(sp.nome)}${sp.cnpj ? ` — CNPJ ${sp.cnpj}` : ""}${sp.presidente ? ` — Presidente: ${sp.presidente}` : ""}`,
    ],
  ];
  children.push(h2("1. Vigência, Data-base e Abrangência"), twoColTable(idRows, ["Campo", "Informação"]));

  // 2. Salários, Reajustes e Pagamentos
  const temSalarios =
    (d.pisos?.length ?? 0) > 0 ||
    (d.reajuste?.length ?? 0) > 0 ||
    (d.pagamentos?.length ?? 0) > 0;
  if (temSalarios) {
    children.push(h2("2. Salários, Reajustes e Pagamentos"));

    if ((d.pisos?.length ?? 0) > 0) {
      children.push(p("2.1 Pisos salariais", { bold: true, color: COR_BRAND, size: 24 }));
      children.push(
        threeColTable(
          (d.pisos ?? []).map((i) => [
            nonEmpty(i.funcao),
            nonEmpty(i.valor),
            nonEmpty(i.clausula),
          ]),
          ["Função / Cargo", "Piso (R$)", "Cláusula"],
        ),
      );
    }
    if ((d.reajuste?.length ?? 0) > 0) {
      children.push(p("2.2 Reajuste salarial", { bold: true, color: COR_BRAND, size: 24 }));
      children.push(
        threeColTable(
          (d.reajuste ?? []).map((r) => {
            const parts: string[] = [];
            if (r.descricao) parts.push(r.descricao);
            if (r.percentual) parts.push(`Percentual: ${r.percentual}`);
            if (r.data_aplicacao) parts.push(`Aplicação: ${r.data_aplicacao}`);
            return [
              nonEmpty(r.tema ?? r.descricao),
              limparClausulaEmbutida(parts.join(" — ")),
              nonEmpty(r.clausula),
            ] as [string, string, string];
          }),
          ["Tema", "Regra", "Cláusula"],
        ),
      );
    }
    if ((d.pagamentos?.length ?? 0) > 0) {
      children.push(p("2.3 Pagamentos", { bold: true, color: COR_BRAND, size: 24 }));
      children.push(...renderSecaoAgrupada(d.pagamentos ?? [], "tema"));
    }
  }

  // 3. Benefícios
  if ((d.beneficios?.length ?? 0) > 0) {
    children.push(h2("3. Benefícios e Auxílios"));
    children.push(...renderSecaoAgrupada(d.beneficios ?? [], "beneficio"));
  }

  // 4. Jornada
  if ((d.jornada?.length ?? 0) > 0) {
    children.push(h2("4. Jornada de Trabalho e Horas Extras"));
    children.push(...renderSecaoAgrupada(d.jornada ?? [], "tema"));
  }

  // 5. Outros adicionais
  if ((d.adicionais?.length ?? 0) > 0) {
    children.push(h2("5. Outros Adicionais"));
    children.push(...renderSecaoAgrupada(d.adicionais ?? [], "tema"));
  }

  // 5b. 13º / Feriados
  if ((d.decimo_terceiro?.length ?? 0) > 0) {
    children.push(h2("5.1 13º Salário"));
    children.push(
      threeColTable(
        (d.decimo_terceiro ?? []).map((i) => [
          nonEmpty(i.tema),
          limparClausulaEmbutida(i.regra ?? ""),
          nonEmpty(i.clausula),
        ]),
        ["Tema", "Regra", "Cláusula"],
      ),
    );
  }
  if ((d.feriados_dias_especiais?.length ?? 0) > 0) {
    children.push(h2("5.2 Feriados e Dias Especiais"));
    children.push(...renderSecaoAgrupada(d.feriados_dias_especiais ?? [], "situacao"));
  }

  // 6. Rescisão e Estabilidades
  const re = d.rescisao_estabilidades ?? {};
  const temRe =
    (re.homologacao?.length ?? 0) > 0 ||
    (re.aviso_previo?.length ?? 0) > 0 ||
    (re.estabilidades?.length ?? 0) > 0 ||
    (re.faltas_abonadas?.length ?? 0) > 0;
  if (temRe) {
    children.push(h2("6. Rescisão e Estabilidades"));
    if ((re.homologacao?.length ?? 0) > 0) {
      children.push(p("6.1 Homologação", { bold: true, color: COR_BRAND, size: 24 }));
      children.push(...renderSecaoAgrupada(re.homologacao ?? [], "tema"));
    }
    if ((re.aviso_previo?.length ?? 0) > 0) {
      children.push(p("6.2 Aviso Prévio", { bold: true, color: COR_BRAND, size: 24 }));
      children.push(...renderSecaoAgrupada(re.aviso_previo ?? [], "tema"));
    }
    if ((re.estabilidades?.length ?? 0) > 0) {
      children.push(p("6.3 Estabilidades provisórias", { bold: true, color: COR_BRAND, size: 24 }));
      children.push(...renderSecaoAgrupada(re.estabilidades ?? [], "tipo"));
    }
    if ((re.faltas_abonadas?.length ?? 0) > 0) {
      children.push(p("6.4 Faltas abonadas / Ausências justificadas", { bold: true, color: COR_BRAND, size: 24 }));
      children.push(...renderSecaoAgrupada(re.faltas_abonadas ?? [], "situacao"));
    }
  }

  // 7. Contribuições sindicais — cada contribuição é uma subseção com tabela CAMPO|INFORMAÇÃO.
  if ((d.contribuicoes?.length ?? 0) > 0) {
    children.push(h2("7. Relações Sindicais e Contribuições"));
    (d.contribuicoes ?? []).forEach((c, idx) => {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: `7.${idx + 1} ${nonEmpty(c.nome)}`,
              bold: true,
              color: COR_BRAND,
              size: 24,
              font: "Arial",
            }),
          ],
        }),
      );
      // Fonte de verdade: c.faixas se vier estruturado; senão, tenta parser regex.
      const faixasEstruturadas = (c.faixas ?? [])
        .map((f) => ({ faixa: (f.faixa ?? "").trim(), valor: (f.valor ?? "").trim() }))
        .filter((f) => f.faixa && f.valor);
      const faixas =
        faixasEstruturadas.length > 0
          ? faixasEstruturadas
          : parseFaixasFromText(c.percentual_ou_valor);
      const valorCell =
        faixas.length > 0 ? "Ver faixas abaixo" : apresentar(c.percentual_ou_valor);

      const rows: Array<[string, string]> = [
        ["Beneficiário", apresentar(c.beneficiario)],
        ["Base de cálculo", apresentar(c.base_calculo)],
        ["Percentual / Valor", valorCell],
        ["Prazo de recolhimento", apresentar(c.prazo_recolhimento)],
        ["Prazo / janela de oposição", apresentar(c.prazo_oposicao)],
        ["Cláusula", apresentar(c.clausula, "—")],
      ];
      children.push(twoColTable(rows, ["Campo", "Informação"]));

      if (faixas.length > 0) {
        children.push(
          twoColTable(
            faixas.map((f) => [f.faixa, f.valor] as [string, string]),
            ["Faixa", "Valor"],
          ),
        );
      }

      const dr = c.dados_recolhimento ?? {};
      const banco = (dr.banco ?? "").trim();
      const agencia = (dr.agencia ?? "").trim();
      const conta = (dr.conta ?? "").trim();
      const codigo = (dr.codigo_barras ?? "").trim();
      const drRows: Array<[string, string]> = [];
      if (banco) drRows.push(["Banco", banco]);
      if (agencia) drRows.push(["Agência", agencia]);
      if (conta) drRows.push(["Conta", conta]);
      if (codigo) drRows.push(["Código de barras / boleto", codigo]);
      // Se nada estruturado e há indicação de guia/boleto no texto (ex.: prazo_recolhimento),
      // omite bloco em vez de mostrar linhas vazias.
      if (drRows.length > 0) {
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 60 },
            children: [
              new TextRun({
                text: "Dados de recolhimento",
                bold: true,
                color: COR_BRAND,
                size: 20,
                font: "Arial",
              }),
            ],
          }),
          twoColTable(drRows, ["Campo", "Informação"]),
        );
      }
    });
  }

  // 8. Multas — tabela INFRAÇÃO | PENALIDADE, com parcelas em bullets e reincidência separada.
  if ((d.multas?.length ?? 0) > 0) {
    children.push(h2("8. Multas e Penalidades"));
    const widths = [3120, 6240] as const;
    const tableRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [headerCell("Infração", widths[0]), headerCell("Penalidade", widths[1])],
      }),
    ];
    for (const m of d.multas ?? []) {
      const infr = [nonEmpty(m.tema), m.clausula ? `(${m.clausula})` : ""]
        .filter(Boolean)
        .join(" ");

      // Fonte de verdade: m.parcelas se vier estruturado; senão, fallback no texto.
      const parcelasEstruturadas = (m.parcelas ?? [])
        .map((p) => ({
          descricao: (p.descricao ?? "").trim(),
          valor: (p.valor ?? "").trim(),
        }))
        .filter((p) => p.descricao || p.valor);
      let parcelas: Array<{ descricao: string; valor?: string }> = parcelasEstruturadas;
      let reincidencia = (m.reincidencia ?? "").trim();
      if (parcelas.length === 0) {
        const base = m.valor || "";
        const parsed = parseParcelasFromText(base);
        parcelas = parsed.parcelas;
        if (!reincidencia) reincidencia = parsed.reincidencia;
      }

      const rodape: string[] = [];
      if (m.base_calculo) rodape.push(`Base: ${m.base_calculo}`);
      if (m.beneficiario) rodape.push(`Em favor de: ${m.beneficiario}`);

      const paragraphs: Paragraph[] = [];
      if (parcelas.length >= 2) {
        for (const p of parcelas) {
          const linha = p.valor ? `${p.descricao} — ${p.valor}` : p.descricao;
          paragraphs.push(
            new Paragraph({
              numbering: { reference: "bullets", level: 0 },
              spacing: { after: 60 },
              children: [txt(linha)],
            }),
          );
        }
      } else if (parcelas.length === 1) {
        const p = parcelas[0];
        const linha = p.valor ? `${p.descricao} — ${p.valor}` : p.descricao;
        paragraphs.push(new Paragraph({ children: [txt(linha || "—")], spacing: { after: 60 } }));
      } else if (m.valor) {
        paragraphs.push(new Paragraph({ children: [txt(m.valor)], spacing: { after: 60 } }));
      } else {
        paragraphs.push(new Paragraph({ children: [txt("—")] }));
      }
      if (reincidencia) {
        paragraphs.push(
          new Paragraph({
            spacing: { before: 40, after: 60 },
            children: [
              txt("Reincidência: ", { bold: true, color: COR_BRAND }),
              txt(reincidencia),
            ],
          }),
        );
      }
      if (rodape.length > 0) {
        paragraphs.push(
          new Paragraph({
            spacing: { before: 40 },
            children: [txt(rodape.join(" · "), { color: "718096" })],
          }),
        );
      }

      tableRows.push(
        new TableRow({
          children: [
            bodyCell(infr, widths[0], { bold: true, bg: COR_HEADER_BG }),
            bodyCellParagraphs(paragraphs, widths[1]),
          ],
        }),
      );
    }
    children.push(
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [...widths],
        rows: tableRows,
      }),
    );
  }

  // 9. Ação operacional retroativa
  if ((d.acao_operacional_retroativo ?? "").trim().length > 0) {
    children.push(h2("9. Ação Operacional — Reajuste Retroativo"));
    children.push(
      new Paragraph({
        shading: { fill: COR_INSTRUCAO_BG, type: ShadingType.CLEAR, color: "auto" },
        border: {
          left: { style: BorderStyle.SINGLE, size: 24, color: "3182CE", space: 6 },
        },
        spacing: { before: 120, after: 120 },
        children: [
          new TextRun({
            text: "Instrução ao Analista: ",
            bold: true,
            color: COR_BRAND,
            size: 20,
            font: "Arial",
          }),
          txt(d.acao_operacional_retroativo ?? ""),
        ],
      }),
    );
  }

  // Cláusulas a conferir
  if ((d.clausulas_a_conferir?.length ?? 0) > 0) {
    children.push(h2("Cláusulas a conferir manualmente"));
    for (const c of d.clausulas_a_conferir ?? []) children.push(bullet(c));
  }

  // Texto final institucional — fiel ao modelo (aparece 1x, no fim do documento).
  const linhaFinal = (
    text: string,
    opts: { bold?: boolean; espacoAntes?: number } = {},
  ) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: opts.espacoAntes ?? 0, after: 0 },
      children: [
        new TextRun({
          text,
          size: 18,
          bold: opts.bold,
          font: "Arial",
          color: opts.bold ? COR_BRAND : "718096",
        }),
      ],
    });
  children.push(
    linhaFinal(
      "Este resumo é meramente informativo. Consulte o texto integral da CCT para todos os direitos e obrigações.",
      { espacoAntes: 400 },
    ),
  );
  children.push(
    linhaFinal("Qualquer dúvida estamos à disposição.", { espacoAntes: 200 }),
  );
  children.push(linhaFinal("Elite Consultores.", { bold: true }));

  // Header (logo em todas as páginas) — 3,05 × 2,5 cm, proporção preservada.
  const logoParagraph = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: "png",
        data: logoBytes,
        transformation: { width: 115, height: 94 },
        altText: {
          title: "Elite Consultores",
          description: "Logotipo institucional Elite Consultores",
          name: "logo-elite",
        },
      }),
    ],
  });

  // Faixa institucional inferior — largura total da página em pixels a 96 DPI
  // (8,5in × 96 = 816 px; altura pela proporção original 816 / 5.3055 ≈ 153.8 px).
  // docx-js interpreta transformation em px, não em pontos.
  const LARGURA_RODAPE_PX = 816;
  const ALTURA_RODAPE_PX = 153.8;
  const rodapeImagem = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    children: [
      new ImageRun({
        type: "png",
        data: rodapeBytes,
        transformation: { width: LARGURA_RODAPE_PX, height: ALTURA_RODAPE_PX },
        floating: {
          horizontalPosition: {
            relative: HorizontalPositionRelativeFrom.PAGE,
            align: HorizontalPositionAlign.CENTER,
          },
          verticalPosition: {
            relative: VerticalPositionRelativeFrom.PAGE,
            align: VerticalPositionAlign.BOTTOM,
          },
          behindDocument: true,
          allowOverlap: true,
        },
        altText: {
          title: "Elite Consultores",
          description: "Faixa institucional inferior do papel timbrado",
          name: "rodape-elite",
        },
      }),
    ],
  });

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 20 } } },
      paragraphStyles: [
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 26, bold: true, color: COR_BRAND, font: "Arial" },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 2000, right: 1200, bottom: 2000, left: 1200, header: 720, footer: 0 },
          },
        },
        headers: { default: new Header({ children: [logoParagraph] }) },
        footers: { default: new Footer({ children: [rodapeImagem] }) },
        children,
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}