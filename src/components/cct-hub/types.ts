export type DocTipo = "resumo" | "integra";

export interface HistoricoDocumento {
  anoVigencia: number;
  resumoNome?: string | null;
  resumoBase64?: string | null;
  resumoPath?: string | null;
  integraNome?: string | null;
  integraBase64?: string | null;
  integraPath?: string | null;
  resumoPublicado?: boolean;
  integraPublicada?: boolean;
}

export interface Registro {
  id: string;
  empresaNome: string;
  empresaCodigo: string;
  empresaCnpj: string;
  sindicatoNome: string;
  sindicatoCodigo: string;
  sindicatoCnpj: string;
  dataBase: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  funcionariosContemplados: number;
  abrangencia: string;
  observacoes: string;
  historicoDocumentos: HistoricoDocumento[];
  ultimaAtualizacao: string;
  segmento?: string;
  uf?: string;
  cidade?: string;
  mes?: string;
  ano?: number;
  colaboradores?: number;
  responsavel?: string;
  status?: StatusConvencao;
  ultimoContacto?: string;
  prazoOposicao?: string;
  dataContato?: string;
  pessoaContato?: string;
  resumoPublicado?: boolean;
  integraPublicada?: boolean;
  // Todos os sindicatos vinculados à empresa (N:N). O principal também
  // aparece nos campos legacy sindicatoNome/Codigo/Cnpj/status/... acima.
  sindicatos?: VinculoSindicato[];
}

export type StatusConvencao = "pendente" | "negociacao" | "vigente";

/**
 * Vínculo N:N entre uma empresa e um sindicato.
 * Cada vínculo pode ter categoria própria (ex.: "Comércio", "Motoristas")
 * e o número de funcionários contemplados por essa CCT específica.
 */
export interface VinculoSindicato {
  id: string;
  sindicatoId: string;
  sindicatoNome: string;
  sindicatoCodigo: string;
  sindicatoCnpj: string;
  principal: boolean;
  categoria: string | null;
  funcionariosContemplados: number;
  // Herdados do sindicato — usados no dashboard sem novo fetch.
  status: StatusConvencao | "";
  dataBase: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  abrangencia: string;
  segmento: string | null;
}

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export const ABRANGENCIAS = ["Municipal", "Regional", "Estadual", "Nacional"] as const;