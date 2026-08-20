## Objetivo
Corrigir o erro `[JSON_INVALIDO] finish=length` — a IA está truncando a saída — e passar a aceitar upload de `.docx` além de `.pdf` no passo "Selecionar arquivo da íntegra", sem converter DOCX para PDF e sem persistir a íntegra.

Escopo: `src/lib/resumo-ia.functions.ts` (pipeline) e `src/components/cct-hub/EsteiraResumosView.tsx` (input file). Nenhuma mudança em layout do `.docx` gerado, esteira, ou lógica de negócio de empresas/sindicatos.

## Parte 1 — Corrigir truncamento no `callLovableAiJson`

Em `src/lib/resumo-ia.functions.ts` (função `callLovableAiJson`, ~linha 249):

1. **Elevar orçamento de saída**: `max_tokens` e `max_completion_tokens` → `16384` (hoje 8192).
2. **Desligar thinking budget do Gemini 2.5 Flash** (que consome do mesmo pool): adicionar no body da requisição um bloco `extra_body`/passthrough compatível com o gateway Lovable, incluindo `generationConfig: { thinkingConfig: { thinkingBudget: 0 } }`. Como o gateway usa formato OpenAI-compat, enviar também `reasoning: { effort: "none" }` como no-op defensivo e o campo `google` provider-specific na raiz do body para que o passthrough entregue ao Gemini. Se após teste o thinking continuar ativo, migrar essa chamada para o endpoint nativo do provider — mas primeiro tentar via gateway.
3. **JSON mode + schema**: acrescentar `response_format: { type: "json_object" }` e `temperature: 0.1`. Manter o `SYSTEM_PROMPT` (que já pede JSON puro) — não trocar por `responseSchema` formal para evitar reescrever o schema Zod duas vezes; o parser Zod já valida.
4. **Detectar finishReason antes de parsear**: se `finish_reason` for `"length"` ou `"MAX_TOKENS"`, lançar erro específico: `"A resposta da IA foi truncada (limite de tokens atingido). Aumente maxOutputTokens ou reduza o tamanho da íntegra."` — sem tentar `JSON.parse`.
5. **Manter limpeza de cerca** (`.replace(/```json|```/g, "").trim()`) antes do parse, como defesa.

`buildUserPrompt` já está com `MAX = 300_000` e corte no meio (linhas 105-114) — apenas confirmar.

## Parte 2 — Aceitar upload `.pdf` e `.docx`

### 2a. Frontend — `src/components/cct-hub/EsteiraResumosView.tsx`
- Linha 1043: trocar `accept="application/pdf,.pdf"` por `accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"`.
- Linha 972 (validação): aceitar também extensão `.docx` / mime docx.
- Renomear variáveis locais (`pdfFile`, `pdf_base64`, `pdf_nome`) para `arquivoFile`, `arquivo_base64`, `arquivo_nome` OU manter os nomes atuais e apenas alterar a mensagem de ajuda; **preferimos manter os nomes** para minimizar diff — o backend continuará recebendo em `pdf_base64`/`pdf_nome`, mas o conteúdo pode ser .docx (o nome carrega a extensão real, usada para detecção).
- Ajustar texto de ajuda: *"Selecione o PDF ou Word (.docx) da CCT — o arquivo é usado só para gerar o resumo e não fica salvo."*

### 2b. Backend — `src/lib/resumo-ia.functions.ts`
- No `handler` do `gerarResumoCct` (~linha 375, bloco `try`): detectar tipo pela extensão de `data.pdf_nome`:
  - `.pdf` → fluxo atual (`extractPdfText`).
  - `.docx` → nova função `extractDocxText(bytes)` usando `fflate` (`unzipSync` + `strFromU8`) sobre `word/document.xml`, seguindo o snippet do prompt. Se `fflate` não estiver instalado, adicionar via `bun add fflate`.
- O texto extraído entra no mesmo `callLovableAiJson(fullText)` — mesmo prompt/schema.
- Nada é persistido no storage; a íntegra segue apenas em memória.
- Validação `[TEXTO_VAZIO]` continua igual.

## Parte 3 — `cidade_estado` em abrangência estadual

No `SYSTEM_PROMPT` (linhas 26-100), acrescentar uma diretriz curta na seção "REGRAS ESTRUTURAIS EXTRAS": *"Se a abrangência territorial cobrir todos (ou a maioria) dos municípios de um estado, `cidade_estado` deve indicar abrangência estadual (ex.: 'Estado do RN (abrangência estadual)'). Use cidade específica apenas em CCTs de base municipal."*

## Arquivos alterados
- `src/lib/resumo-ia.functions.ts` — `callLovableAiJson` (tokens/thinking/json mode/finish check), novo `extractDocxText`, bifurcação por extensão no handler, ajuste no `SYSTEM_PROMPT`.
- `src/components/cct-hub/EsteiraResumosView.tsx` — `accept` do input, validação e texto de ajuda.
- `package.json` — dependência `fflate` (se ausente).

## Aceite
- Geração roda até o fim em CCTs longas sem `[JSON_INVALIDO] finish=length`; se truncar, erro é claro sobre tokens.
- Upload aceita `.pdf` e `.docx`; DOCX é processado via extração de texto server-side, sem conversão para PDF e sem storage.
- `cidade_estado` reflete abrangência estadual em CCTs estaduais.
- Layout do `.docx` gerado inalterado.
