import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  Download,
  FileText,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
  AlertTriangle,
  Clock,
  CheckCircle2,
  User,
  PhoneCall,
  CalendarClock,
  MapPin,
  Tag,
  BellRing,
  BadgeCheck,
  LayoutGrid,
  Rows3,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ListChecks,
} from "lucide-react";
import eliteLogo from "@/assets/elite-logo.png.asset.json";
import type { Sindicato } from "./sindicatos-storage";
import { fetchEsteira } from "./esteira-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { MESES } from "./types";
import type { DocTipo, HistoricoDocumento, Registro, StatusConvencao } from "./types";
import { chain, cmpCnpj, cmpCodigo, cmpDataBase, cmpString, nullsLast, type SortDir } from "./sort-helpers";
import {
  uploadDocumentoArquivo,
  getDocumentoSignedUrl,
  deleteDocumentoArquivo,
} from "./storage";
import {
  fetchEmpresasComoRegistros,
  subscribeEmpresas,
  upsertEmpresa,
  type Empresa,
  type EmpresasResult,
} from "./empresas-storage";
import { lazy, Suspense } from "react";
const DashboardView = lazy(() => import("./DashboardView"));
const SindicatosView = lazy(() =>
  import("./SindicatosView").then((m) => ({ default: m.SindicatosView })),
);
const EsteiraResumosView = lazy(() => import("./EsteiraResumosView"));
import { adminAction } from "@/lib/admin.functions";

const uid = () =>
  (crypto?.randomUUID?.() as string | undefined) ??
  Math.random().toString(36).slice(2) + Date.now().toString(36);

function nowIso() {
  return new Date().toISOString();
}

export const RESPONSAVEIS = [
  "Amelia Medeiros",
  "Ana Marilia",
  "Anna Flávia",
  "Anne Karenine",
  "Arianna Dantas",
  "Daniel Lopes",
  "Debora Silva",
  "Eyke Vitoriano",
  "Flavio Vieira",
  "Ingrid Vanessa",
  "Isa Lacava",
  "Isabelly Lima",
  "Jussara Silva",
  "Leide Santana",
  "Maristela Nunes",
  "Paula Xavier",
  "Priscila Vitor",
  "Renata Lopes",
  "Roseanne Teixeira",
  "Stephany Regis",
  "Valdomiro Filho",
  "Debora Gomes",
] as const;

const NO_RESP = "__none__";

function normText(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Parse strings like:
 *   "Segmento: X · Local: Y · Responsável: Z"
 * Tolerates missing fields, different separators (·, |, ;, newline, -) and accents.
 */
export function parseObservacoes(obs?: string | null): {
  segmento?: string;
  local?: string;
  responsavel?: string;
} {
  if (!obs || typeof obs !== "string") return {};
  const pick = (label: string) => {
    const re = new RegExp(
      `${label}\\s*[:\\-]\\s*([^·|;\\n\\r]+?)(?=\\s*(?:[·|;\\n\\r]|$))`,
      "i",
    );
    const m = obs.match(re);
    return m?.[1]?.trim() || undefined;
  };
  const segmento = pick("Segmento");
  const local = pick("Local");
  const respRaw = pick("Respons[aá]vel");
  let responsavel: string | undefined;
  if (respRaw) {
    const rn = normText(respRaw);
    responsavel =
      RESPONSAVEIS.find((n) => normText(n) === rn) ??
      RESPONSAVEIS.find((n) => rn.includes(normText(n))) ??
      RESPONSAVEIS.find((n) => normText(n).includes(rn));
  }
  return { segmento, local, responsavel };
}

/**
 * Fill only empty structured fields from the observacoes string.
 * Never overwrites values the user already set.
 */
function enrichRegistro(r: Registro): Registro {
  const p = parseObservacoes(r.observacoes);
  const has = (v?: string) => !!v && v.trim().length > 0;
  return {
    ...r,
    segmento: has(r.segmento) ? r.segmento : p.segmento ?? r.segmento,
    cidade: has(r.cidade) ? r.cidade : p.local ?? r.cidade,
    responsavel: has(r.responsavel) ? r.responsavel : p.responsavel ?? r.responsavel,
  };
}

// Cache do enrichRegistro por (id + ultimaAtualizacao + observacoes) para evitar
// reprocessar regex nos mesmos registros a cada atualização de lista.
const enrichCache = new Map<string, Registro>();
function enrichRegistroCached(r: Registro): Registro {
  const key = `${r.id}::${r.ultimaAtualizacao ?? ""}::${r.observacoes ?? ""}`;
  const cached = enrichCache.get(key);
  if (cached) return cached;
  const out = enrichRegistro(r);
  enrichCache.set(key, out);
  // Limita crescimento do cache
  if (enrichCache.size > 2000) {
    const first = enrichCache.keys().next().value;
    if (first) enrichCache.delete(first);
  }
  return out;
}

function emptyRegistro(): Registro {
  return {
    id: uid(),
    empresaNome: "",
    empresaCodigo: "",
    empresaCnpj: "",
    sindicatoNome: "",
    sindicatoCodigo: "",
    sindicatoCnpj: "",
    dataBase: "",
    vigenciaInicio: "",
    vigenciaFim: "",
    funcionariosContemplados: 0,
    abrangencia: "",
    observacoes: "",
    historicoDocumentos: [{ anoVigencia: new Date().getFullYear() }],
    ultimaAtualizacao: nowIso(),
  };
}

function formatCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function downloadBase64(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

type Status = "vigente" | "negociacao" | "pendente";

export function deriveStatus(r: Registro): Status {
  if (r.status === "vigente" || r.status === "negociacao" || r.status === "pendente") {
    return r.status;
  }
  const docs = r.historicoDocumentos ?? [];
  const hasFull = docs.some(
    (d) => d.resumoPublicado && d.integraPublicada,
  );
  if (hasFull) return "vigente";
  const hasPartial = docs.some(
    (d) => d.resumoPublicado || d.integraPublicada,
  );
  if (hasPartial) return "negociacao";
  return "pendente";
}

/* ---------------- Date helpers ---------------- */

export const MES_INDEX: Record<string, number> = {
  Janeiro: 0,
  Fevereiro: 1,
  Março: 2,
  Abril: 3,
  Maio: 4,
  Junho: 5,
  Julho: 6,
  Agosto: 7,
  Setembro: 8,
  Outubro: 9,
  Novembro: 10,
  Dezembro: 11,
};

function startOfLocalToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function diasAte(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - startOfLocalToday().getTime()) / 86400000);
}

export function diasDesde(dateStr?: string | null): number | null {
  const d = diasAte(dateStr);
  return d === null ? null : -d;
}

/** Days until the next occurrence of a Data-base month (Janeiro..Dezembro). */
function diasAteProximaDataBase(mes?: string | null): number | null {
  if (!mes) return null;
  const idx = MES_INDEX[mes];
  if (idx === undefined) return null;
  const today = startOfLocalToday();
  let target = new Date(today.getFullYear(), idx, 1);
  if (target < today) target = new Date(today.getFullYear() + 1, idx, 1);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export function prazoOposicaoInfo(prazo?: string): {
  label: string;
  tone: "ok" | "warn" | "danger" | "none";
  diasRestantes: number | null;
} {
  if (!prazo) return { label: "—", tone: "none", diasRestantes: null };
  const d = new Date(prazo + "T00:00:00");
  if (Number.isNaN(d.getTime())) return { label: prazo, tone: "none", diasRestantes: null };
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diffMs = d.getTime() - hoje.getTime();
  const dias = Math.ceil(diffMs / 86400000);
  const fmt = d.toLocaleDateString("pt-BR");
  if (dias < 0) return { label: `${fmt} · vencido`, tone: "danger", diasRestantes: dias };
  if (dias <= 5) return { label: `${fmt} · ${dias === 0 ? "hoje" : `em ${dias}d`}`, tone: "danger", diasRestantes: dias };
  if (dias <= 15) return { label: `${fmt} · em ${dias}d`, tone: "warn", diasRestantes: dias };
  return { label: `${fmt} · em ${dias}d`, tone: "ok", diasRestantes: dias };
}

const STATUS_META: Record<Status, { label: string; className: string; dot: string }> = {
  vigente: {
    label: "Vigente",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  negociacao: {
    label: "Em Negociação",
    className: "bg-amber-100 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
  },
  pendente: {
    label: "Pendente",
    className: "bg-red-100 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
};

export function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        m.className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

type View = "dashboard" | "empresas" | "sindicatos" | "esteira" | "admin";

export function CctHub() {
  const queryClient = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(false);
  // Código de acesso guardado apenas em memória — expira ao fechar a aba.
  const adminCodeRef = useRef<string | null>(null);
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);
  const { data: empresasData, error: queryError } = useQuery<EmpresasResult>({
    queryKey: ["empresas"],
    queryFn: async () => {
      const res = await fetchEmpresasComoRegistros();
      return {
        registros: res.registros.map(enrichRegistroCached),
        sindicatoIdByEmpresa: res.sindicatoIdByEmpresa,
      };
    },
    staleTime: 5 * 60_000,
  });
  const registros = empresasData?.registros ?? [];
  // Cockpit de pendências: resumos prontos que ainda não foram publicados no Portal.
  const { data: esteiraItens = [] } = useQuery({
    queryKey: ["esteira"],
    queryFn: fetchEsteira,
    staleTime: 30_000,
  });
  const esteiraPendentes = esteiraItens.filter(
    (i) => i.status !== "publicado" && (i.oficial_path || i.resumo_docx_path),
  ).length;
  const sindicatoIdByEmpresa = empresasData?.sindicatoIdByEmpresa ?? {};
  useEffect(() => {
    if (queryError) {
      console.error(queryError);
      toast.error("Falha ao carregar dados");
    }
  }, [queryError]);
  const setRegistros = useCallback(
    (updater: Registro[] | ((prev: Registro[]) => Registro[])) => {
      queryClient.setQueryData<EmpresasResult>(["empresas"], (prev) => {
        const base = prev?.registros ?? [];
        const nova = typeof updater === "function"
          ? (updater as (p: Registro[]) => Registro[])(base)
          : updater;
        return {
          registros: nova,
          sindicatoIdByEmpresa: prev?.sindicatoIdByEmpresa ?? {},
        };
      });
    },
    [queryClient],
  );
  const setSindicatoIdByEmpresa = useCallback(
    (empresaId: string, sindicatoId: string | null) => {
      queryClient.setQueryData<EmpresasResult>(["empresas"], (prev) => {
        if (!prev) return prev;
        return {
          registros: prev.registros,
          sindicatoIdByEmpresa: { ...prev.sindicatoIdByEmpresa, [empresaId]: sindicatoId },
        };
      });
    },
    [queryClient],
  );
  const [view, setView] = useState<View>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setSidebarCollapsed(window.localStorage.getItem("cct-sidebar-collapsed") === "1");
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("cct-sidebar-collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);
  // Escuta clique em "Empresas" no popover da esteira: alterna aba e filtra pelo CNPJ.
  useEffect(() => {
    function onFocusEmpresa(ev: Event) {
      const detail = (ev as CustomEvent<{ id?: string; cnpj?: string; nome?: string }>)
        .detail;
      if (!detail) return;
      setView("empresas");
      const termo = detail.cnpj || detail.nome || "";
      if (termo) {
        setBusca(termo);
        setBuscaDebounced(termo);
      }
    }
    window.addEventListener("cct:focus-empresa", onFocusEmpresa as EventListener);
    return () =>
      window.removeEventListener("cct:focus-empresa", onFocusEmpresa as EventListener);
  }, []);
  const [filtroMes, setFiltroMes] = useState("__all__");
  const [filtroAno, setFiltroAno] = useState("__all__");
  const [filtroResponsavel, setFiltroResponsavel] = useState("__all__");

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Registro | null>(null);
  const [editandoSindicatoId, setEditandoSindicatoId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Registro | null>(null);
  const [sindicatoEditId, setSindicatoEditId] = useState<string | null>(null);
  const [novoSindicatoOpen, setNovoSindicatoOpen] = useState(false);
  const [importXlsxOpen, setImportXlsxOpen] = useState(false);

  // Estado do diálogo genérico de confirmação (substitui window.confirm).
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    tone?: "default" | "danger";
    onConfirm?: () => void | Promise<void>;
  }>({ open: false, title: "" });
  const pedirConfirmacao = useCallback(
    (opts: {
      title: string;
      description?: string;
      confirmLabel?: string;
      tone?: "default" | "danger";
      onConfirm: () => void | Promise<void>;
    }) => {
      setConfirmState({ open: true, ...opts });
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    // Refetch com debounce quando empresas ou sindicatos mudam.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeEmpresas(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (!alive) return;
        queryClient.invalidateQueries({ queryKey: ["empresas"] });
        queryClient.invalidateQueries({ queryKey: ["sindicatos"] });
      }, 400);
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [queryClient]);

  // Escuta pedido global para abrir o editor de sindicato (Dashboard, Empresas,
  // Esteira, diálogos de bucket, etc.). Detalhe pode vir com id, codigo, cnpj
  // ou nome — resolvemos pelo cache de ["sindicatos"] quando id não vier.
  useEffect(() => {
    const onEdit = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        id?: string;
        codigo?: string;
        cnpj?: string;
        nome?: string;
      }>).detail;
      if (!detail) return;
      let id = detail.id ?? null;
      if (!id) {
        const list = queryClient.getQueryData<Sindicato[]>(["sindicatos"]) ?? [];
        const codigoAlvo = detail.codigo?.trim();
        const cnpjAlvo = detail.cnpj?.replace(/\D/g, "");
        const nomeAlvo = detail.nome?.trim().toLowerCase();
        const match = list.find(
          (s) =>
            (!!codigoAlvo && s.codigo?.trim() === codigoAlvo) ||
            (!!cnpjAlvo && s.cnpj?.replace(/\D/g, "") === cnpjAlvo) ||
            (!!nomeAlvo && s.nome?.trim().toLowerCase() === nomeAlvo),
        );
        id = match?.id ?? null;
      }
      if (!id) {
        toast.error("Sindicato não encontrado. Abra a aba Sindicatos.");
        setView("sindicatos");
        return;
      }
      setView("sindicatos");
      setSindicatoEditId(id);
    };
    window.addEventListener("cct:edit-sindicato", onEdit as EventListener);
    return () => {
      window.removeEventListener("cct:edit-sindicato", onEdit as EventListener);
    };
  }, [queryClient]);

  const anosDisponiveis = useMemo(() => {
    const s = new Set<number>();
    registros.forEach((r) => r.historicoDocumentos.forEach((d) => s.add(d.anoVigencia)));
    return Array.from(s).sort((a, b) => b - a);
  }, [registros]);

  const responsaveisDisponiveis = useMemo(() => {
    const contagem = new Map<string, number>();
    let temVazio = false;
    for (const r of registros) {
      const v = (r.responsavel ?? "").trim();
      if (!v) {
        temVazio = true;
        continue;
      }
      contagem.set(v, (contagem.get(v) ?? 0) + 1);
    }
    // União: cadastro oficial + nomes realmente presentes nos dados,
    // para não esconder ninguém e expor divergências de grafia.
    const uniao = new Set<string>([...RESPONSAVEIS, ...contagem.keys()]);
    const lista = [...uniao]
      .map((nome) => ({ nome, qtd: contagem.get(nome) ?? 0 }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    // DIAGNÓSTICO — remover depois de conferido
    if (typeof window !== "undefined") {
      const orfaos = new Map<string, number>();
      let semResponsavel = 0;
      for (const r of registros) {
        const v = (r.responsavel ?? "").trim();
        if (!v) {
          semResponsavel += 1;
          continue;
        }
        if (!RESPONSAVEIS.some((n) => n === v)) {
          orfaos.set(v, (orfaos.get(v) ?? 0) + 1);
        }
      }
      // eslint-disable-next-line no-console
      console.table(
        [...orfaos.entries()].map(([nome, qtd]) => ({ nome, qtd })),
      );
      // eslint-disable-next-line no-console
      console.log("[CCT] Empresas sem responsável:", semResponsavel);
    }

    return { lista, temVazio };
  }, [registros]);

  const filtrados = useMemo(() => {
    const norm = (s: string) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const q = norm(buscaDebounced.trim());
    const qDigits = buscaDebounced.replace(/\D/g, "");
    return registros.filter((r) => {
      if (q) {
        const parts = [
          r.empresaNome,
          r.empresaCodigo,
          r.empresaCnpj,
          r.sindicatoNome,
          r.sindicatoCodigo,
          r.sindicatoCnpj,
          r.segmento,
          r.uf,
          r.cidade,
          r.responsavel,
        ]
          .filter(Boolean)
          .map((v) => String(v));
        const hay = norm(parts.join(" "));
        const digitsHay = parts.join(" ").replace(/\D/g, "");
        const matchText = hay.includes(q);
        const matchDigits = qDigits.length > 0 && digitsHay.includes(qDigits);
        if (!matchText && !matchDigits) return false;
      }
      if (filtroMes !== "__all__" && r.dataBase !== filtroMes) return false;
      if (filtroAno !== "__all__") {
        const ano = Number(filtroAno);
        if (!r.historicoDocumentos.some((d) => d.anoVigencia === ano)) return false;
      }
      if (filtroResponsavel !== "__all__") {
        const resp = (r.responsavel ?? "").trim();
        if (filtroResponsavel === "__none__") {
          if (resp) return false;
        } else if (resp !== filtroResponsavel) return false;
      }
      return true;
    });
  }, [registros, buscaDebounced, filtroMes, filtroAno, filtroResponsavel]);

  const abrirNovo = () => {
    setEditando(emptyRegistro());
    setModalAberto(true);
  };

  const abrirEdicao = useCallback((r: Registro) => {
    setEditando({ ...r });
    setEditandoSindicatoId(sindicatoIdByEmpresa[r.id] ?? null);
    setModalAberto(true);
  }, [sindicatoIdByEmpresa]);

  const salvarEmpresa = async (r: Registro, sindicatoId: string | null) => {
    const empresa: Empresa = {
      id: r.id,
      nome: r.empresaNome,
      codigo: r.empresaCodigo,
      cnpj: r.empresaCnpj,
      uf: r.uf ?? "",
      cidade: r.cidade ?? "",
      responsavel: r.responsavel ?? "",
      funcionariosContemplados: r.funcionariosContemplados,
      colaboradores: r.colaboradores ?? 0,
      observacoes: r.observacoes,
      pessoaContato: r.pessoaContato ?? "",
      dataContato: r.dataContato ?? "",
      sindicatoId,
      ultimaAtualizacao: nowIso(),
    };
    try {
      await upsertEmpresa(empresa);
      queryClient.invalidateQueries({ queryKey: ["empresas"] });
      queryClient.invalidateQueries({ queryKey: ["sindicatos"] });
      setSindicatoIdByEmpresa(empresa.id, sindicatoId);
      setModalAberto(false);
      setEditando(null);
      setEditandoSindicatoId(null);
      toast.success("Empresa salva");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao salvar");
    }
  };

  const removerRegistro = useCallback(async (id: string) => {
    pedirConfirmacao({
      title: "Remover esta empresa?",
      description: "Esta ação não pode ser desfeita.",
      confirmLabel: "Remover",
      tone: "danger",
      onConfirm: async () => {
        const code = adminCodeRef.current;
        if (!isAdmin || !code) {
          toast.error("Ação não permitida");
          return;
        }
        try {
          const res = await adminAction({ data: { code, action: { type: "delete_empresa", id } } });
          if (!res.ok) {
            toast.error(res.error === "invalid_code" ? "Código inválido" : "Ação não permitida");
            return;
          }
          setRegistros((prev) => prev.filter((r) => r.id !== id));
          toast.success("Empresa removida");
        } catch (e) {
          console.error(e);
          toast.error("Falha ao remover");
        }
      },
    });
  }, [isAdmin, setRegistros, pedirConfirmacao]);

  // Documentos agora vivem no sindicato — a remoção é feita na tela de Sindicatos.
  const removerDocumentoArquivo = (_id: string, _ano: number, _tipo: DocTipo) => {
    toast.info("Os documentos são gerenciados na tela de Sindicatos.");
  };

  const exportarBackup = () => {
    const blob = new Blob([JSON.stringify(registros, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cct-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup exportado");
  };

  const exportarExcel = async () => {
    const lista = filtrados;
    if (lista.length === 0) {
      toast.error("Nenhum registro para exportar");
      return;
    }
    const XLSX = await import("xlsx");
    const statusLabel: Record<ReturnType<typeof deriveStatus>, string> = {
      vigente: "Vigente",
      negociacao: "Em negociação",
      pendente: "Pendente",
    };
    const rows = lista.map((r) => ({
      "Código Empresa": r.empresaCodigo ?? "",
      Empresa: r.empresaNome ?? "",
      "CNPJ Empresa": r.empresaCnpj ?? "",
      Sindicato: r.sindicatoNome ?? "",
      "Código Sindicato": r.sindicatoCodigo ?? "",
      "CNPJ Sindicato": r.sindicatoCnpj ?? "",
      "Padrinho/Madrinha": r.responsavel ?? "",
      Segmento: r.segmento ?? "",
      UF: r.uf ?? "",
      Cidade: r.cidade ?? "",
      "Data-Base": r.dataBase ?? "",
      "Vigência Início": r.vigenciaInicio ?? "",
      "Vigência Fim": r.vigenciaFim ?? "",
      Abrangência: r.abrangencia ?? "",
      Funcionários: r.funcionariosContemplados ?? 0,
      Status: statusLabel[deriveStatus(r)],
      "Anos com Convenção Cadastrada": (r.historicoDocumentos ?? [])
        .map((d) => d.anoVigencia)
        .sort((a, b) => a - b)
        .join(", "),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const widths = Object.keys(rows[0]).map((k) => ({
      wch: Math.min(
        40,
        Math.max(k.length, ...rows.map((r) => String((r as Record<string, unknown>)[k] ?? "").length)) + 2,
      ),
    }));
    ws["!cols"] = widths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Convenções");
    XLSX.writeFile(wb, `cct-hub-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${rows.length} registros exportados`);
  };

  const importarBackup = (_file: File) => {
    toast.info("Importação de backup indisponível após a normalização das tabelas.");
  };

  const resetar = async () => {
    pedirConfirmacao({
      title: "Resetar toda a base?",
      description: "Isso apagará TODOS os registros. Esta ação não pode ser desfeita.",
      confirmLabel: "Resetar tudo",
      tone: "danger",
      onConfirm: async () => {
        const code = adminCodeRef.current;
        if (!isAdmin || !code) {
          toast.error("Ação não permitida");
          return;
        }
        try {
          const res = await adminAction({ data: { code, action: { type: "reset_empresas" } } });
          if (!res.ok) {
            toast.error(res.error === "invalid_code" ? "Código inválido" : "Ação não permitida");
            return;
          }
          setRegistros([]);
          toast.success("Base resetada");
        } catch (e) {
          console.error(e);
          toast.error("Falha ao resetar");
        }
      },
    });
  };

  const solicitarAdmin = useCallback((ligar: boolean) => {
    if (!ligar) {
      adminCodeRef.current = null;
      setIsAdmin(false);
      toast.success("Modo admin desativado");
      return;
    }
    setCodeDialogOpen(true);
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        view={view}
        onView={(v) => {
          setView(v);
          setSidebarOpen(false);
        }}
        busca={busca}
        onBusca={setBusca}
        mes={filtroMes}
        onMes={setFiltroMes}
        ano={filtroAno}
        onAno={setFiltroAno}
        anos={anosDisponiveis}
        responsavel={filtroResponsavel}
        onResponsavel={setFiltroResponsavel}
        responsaveis={responsaveisDisponiveis}
        isAdmin={isAdmin}
        esteiraPendentes={esteiraPendentes}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={
            view === "dashboard"
              ? "Dashboard"
              : view === "admin"
                ? "Configurações e Admin"
                : view === "sindicatos"
                  ? "Sindicatos"
                  : view === "esteira"
                    ? "Esteira de Resumos CCT"
                    : "Empresas"
          }
          total={registros.length}
          isAdmin={isAdmin}
          onToggleAdmin={solicitarAdmin}
          onNovo={abrirNovo}
          onExportExcel={exportarExcel}
          onNovoSindicato={() => setNovoSindicatoOpen(true)}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        <main className="w-full flex-1 p-4 md:p-6 lg:px-8 2xl:px-12">
          {view === "dashboard" && (
            <Suspense
              fallback={
                <div className="grid h-64 place-items-center text-sm text-slate-500">
                  Carregando painel…
                </div>
              }
            >
              <DashboardView
                registros={registros}
                onGoList={() => setView("empresas")}
              />
            </Suspense>
          )}

          {view === "empresas" && (
            <ListaConvencoes
              registros={filtrados}
              total={registros.length}
              isAdmin={isAdmin}
              onEdit={abrirEdicao}
              onDelete={removerRegistro}
              onDetail={setDetalhe}
              onRemoveArquivo={removerDocumentoArquivo}
              onNovo={abrirNovo}
            />
          )}

          {view === "sindicatos" && (
            <Suspense
              fallback={
                <div className="grid h-64 place-items-center text-sm text-slate-500">
                  Carregando sindicatos…
                </div>
              }
            >
              <SindicatosView
                openEditId={sindicatoEditId}
                onOpenEditIdHandled={() => setSindicatoEditId(null)}
              />
            </Suspense>
          )}

          {view === "esteira" && (
            <Suspense
              fallback={
                <div className="grid h-64 place-items-center text-sm text-slate-500">
                  Carregando esteira…
                </div>
              }
            >
              <EsteiraResumosView
                isAdmin={isAdmin}
                getAdminCode={() => adminCodeRef.current}
              />
            </Suspense>
          )}

          {view === "admin" && (
            <AdminPanel
              isAdmin={isAdmin}
              onToggleAdmin={solicitarAdmin}
              onExport={exportarBackup}
              onImport={importarBackup}
              onImportExcel={() => setImportXlsxOpen(true)}
              onReset={resetar}
              total={registros.length}
            />
          )}
        </main>
      </div>

      <RegistroForm
        open={modalAberto}
        registro={editando}
        sindicatoIdInicial={editandoSindicatoId}
        onClose={() => {
          setModalAberto(false);
          setEditando(null);
          setEditandoSindicatoId(null);
        }}
        onSave={salvarEmpresa}
        onEditarSindicato={(sid) => {
          setModalAberto(false);
          setEditando(null);
          setEditandoSindicatoId(null);
          setSindicatoEditId(sid);
          setView("sindicatos");
        }}
      />

      <DetalheDialog
        registro={detalhe}
        isAdmin={isAdmin}
        onClose={() => setDetalhe(null)}
        onRemoveArquivo={removerDocumentoArquivo}
      />

      <AdminCodeDialog
        open={codeDialogOpen}
        onClose={() => setCodeDialogOpen(false)}
        onSuccess={(code) => {
          adminCodeRef.current = code;
          setIsAdmin(true);
          setCodeDialogOpen(false);
          toast.success("Modo admin ativado");
        }}
      />

      <NovoSindicatoDialog
        open={novoSindicatoOpen}
        onClose={() => setNovoSindicatoOpen(false)}
        onCreated={() => {
          setNovoSindicatoOpen(false);
          setView("sindicatos");
        }}
      />

      <ImportarExcelDialog
        open={importXlsxOpen}
        onClose={() => setImportXlsxOpen(false)}
      />

      <AlertDialog
        open={confirmState.open}
        onOpenChange={(o) => {
          if (!o) setConfirmState((s) => ({ ...s, open: false }));
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState.title}</AlertDialogTitle>
            {confirmState.description ? (
              <AlertDialogDescription>{confirmState.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmState.tone === "danger"
                  ? "bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
                  : undefined
              }
              onClick={async () => {
                const fn = confirmState.onConfirm;
                setConfirmState((s) => ({ ...s, open: false }));
                if (fn) await fn();
              }}
            >
              {confirmState.confirmLabel ?? "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AdminCodeDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setCode("");
      setLoading(false);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    try {
      const res = await adminAction({ data: { code, action: { type: "verify" } } });
      if (res.ok) {
        onSuccess(code);
      } else if (res.error === "invalid_code") {
        toast.error("Código inválido");
      } else {
        toast.error("Ação não permitida");
      }
    } catch (err) {
      console.error(err);
      toast.error("Falha ao validar código");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Código de acesso</DialogTitle>
          <DialogDescription>
            Informe o código para liberar as ações de administrador.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="admin-code">Código</Label>
            <Input
              id="admin-code"
              type="password"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Validando…" : "Entrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Sidebar ---------------- */

function Sidebar({
  open,
  onClose,
  collapsed,
  onToggleCollapsed,
  view,
  onView,
  busca,
  onBusca,
  mes,
  onMes,
  ano,
  onAno,
  anos,
  responsavel,
  onResponsavel,
  responsaveis,
  isAdmin,
  esteiraPendentes = 0,
}: {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  view: View;
  onView: (v: View) => void;
  busca: string;
  onBusca: (v: string) => void;
  mes: string;
  onMes: (v: string) => void;
  ano: string;
  onAno: (v: string) => void;
  anos: number[];
  responsavel: string;
  onResponsavel: (v: string) => void;
  responsaveis: { lista: { nome: string; qtd: number }[]; temVazio: boolean };
  isAdmin: boolean;
  esteiraPendentes?: number;
}) {
  const items: {
    id: View;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
  }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "empresas", label: "Empresas", icon: Building2 },
    { id: "sindicatos", label: "Sindicatos", icon: Users },
    {
      id: "esteira",
      label: "Esteira de Resumos",
      icon: ListChecks,
      badge: isAdmin ? esteiraPendentes : 0,
    },
  ];

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar-dark text-sidebar-dark-foreground transition-[width,transform] md:sticky md:top-0 md:h-screen md:translate-x-0",
          collapsed ? "w-16" : "w-64",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className={cn(
            "flex flex-col gap-2 bg-brand-dark text-white",
            collapsed ? "items-center px-2 py-3" : "px-4 py-4",
          )}
        >
          <div className={cn("flex w-full items-center", collapsed ? "justify-center" : "gap-3")}>
            <img
              src={eliteLogo.url}
              alt="Elite Consultores"
              className={cn("rounded bg-white/10 object-contain p-1", collapsed ? "h-9 w-9" : "h-10 w-10")}
            />
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold leading-tight">Hub de CCT</div>
                <div className="truncate text-[11px] text-white/70">Elite Consultores</div>
              </div>
            )}
            {!collapsed && (
              <button
                className="ml-auto rounded p-1 hover:bg-white/10 md:hidden"
                onClick={onClose}
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              "hidden items-center gap-1 rounded-md border border-white/15 bg-white/5 text-[11px] text-white/80 hover:bg-white/10 md:inline-flex",
              collapsed ? "mt-1 h-7 w-9 justify-center p-0" : "mt-1 h-7 w-full justify-center",
            )}
            aria-label={collapsed ? "Expandir menu" : "Minimizar menu"}
            title={collapsed ? "Expandir menu" : "Minimizar menu"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : (<><ChevronLeft className="h-4 w-4" /> Minimizar</>)}
          </button>
        </div>

        <nav className={cn(collapsed ? "p-2" : "p-3")}>
          <ul className="space-y-1">
            {items.map((it) => {
              const active = view === it.id;
              return (
                <li key={it.id}>
                  <button
                    onClick={() => onView(it.id)}
                    title={collapsed ? it.label : undefined}
                    className={cn(
                      "flex w-full items-center rounded-md text-sm transition-colors",
                      collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2",
                      active
                        ? "bg-brand text-white"
                        : "hover:bg-sidebar-dark-hover hover:text-white",
                    )}
                  >
                    <it.icon className="h-4 w-4" />
                    {!collapsed && it.label}
                    {!!it.badge && it.badge > 0 && (
                      <span
                        title={`${it.badge} resumo(s) prontos aguardando publicação no Portal`}
                        className={cn(
                          "ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-brand-gold px-1.5 text-[10px] font-bold text-brand-darker",
                          collapsed && "ml-0 absolute -mt-5 ml-4",
                        )}
                      >
                        {it.badge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {!collapsed && <Separator className="bg-white/10" />}

        {!collapsed && (
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">
              Filtros
            </div>
            <Label className="text-xs text-white/70">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-white/40" />
              <Input
                value={busca}
                onChange={(e) => onBusca(e.target.value)}
                placeholder="Empresa, CNPJ, sindicato…"
                className="border-white/10 bg-white/5 pl-8 text-white placeholder:text-white/40"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-white/70">Data-base (mês)</Label>
            <Select value={mes} onValueChange={onMes}>
              <SelectTrigger className="border-white/10 bg-white/5 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os meses</SelectItem>
                {MESES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-white/70">Ano da convenção</Label>
            <Select value={ano} onValueChange={onAno}>
              <SelectTrigger className="border-white/10 bg-white/5 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os anos</SelectItem>
                {anos.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-white/70">Responsável</Label>
            <Select value={responsavel} onValueChange={onResponsavel}>
              <SelectTrigger className="border-white/10 bg-white/5 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os responsáveis</SelectItem>
                {responsaveis.lista.map(({ nome, qtd }) => (
                  <SelectItem key={nome} value={nome}>
                    {nome}
                    {qtd === 0 ? " (0)" : ` (${qtd})`}
                  </SelectItem>
                ))}
                {responsaveis.temVazio && (
                  <SelectItem value="__none__">Sem responsável</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          </div>
        )}

        <div className="mt-auto border-t border-white/10 p-2">
          <button
            onClick={() => onView("admin")}
            title={collapsed ? "Configurações" : undefined}
            className={cn(
              "flex w-full items-center rounded-md text-sm transition-colors",
              collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2",
              view === "admin"
                ? "bg-brand text-white"
                : "text-white/70 hover:bg-sidebar-dark-hover hover:text-white",
            )}
          >
            <Settings className="h-4 w-4" />
            {!collapsed && "Configurações"}
            {!collapsed && isAdmin && (
              <Badge className="ml-auto bg-brand-soft text-brand-darker">ON</Badge>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

/* ---------------- Topbar ---------------- */

function Topbar({
  title,
  total,
  isAdmin,
  onToggleAdmin,
  onNovo,
  onExportExcel,
  onNovoSindicato,
  onOpenSidebar,
}: {
  title: string;
  total: number;
  isAdmin: boolean;
  onToggleAdmin: (v: boolean) => void;
  onNovo: () => void;
  onExportExcel: () => void;
  onNovoSindicato: () => void;
  onOpenSidebar: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b bg-white shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 md:px-6">
        <button
          onClick={onOpenSidebar}
          className="rounded p-2 hover:bg-slate-100 md:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-slate-800">
            Hub de Convenções Coletivas · Elite Consultores
          </h1>
          <p className="text-xs text-slate-500">
            {title} · {total} {total === 1 ? "registro" : "registros"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="hidden cursor-pointer items-center gap-2 text-xs text-slate-600 md:flex">
            <ShieldCheck className="h-4 w-4 text-brand" />
            Admin
            <Switch checked={isAdmin} onCheckedChange={onToggleAdmin} />
          </label>
          {isAdmin && (
          <Button
            size="sm"
            onClick={onExportExcel}
            className="hidden bg-emerald-600 text-white hover:bg-emerald-700 md:inline-flex"
          >
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Exportar Excel
          </Button>
          )}
          {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="bg-brand text-white hover:bg-brand-dark">
                <Plus className="mr-1 h-4 w-4" /> Novo cadastro
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Adicionar</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onNovo}>
                <Building2 className="mr-2 h-4 w-4" /> Nova empresa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onNovoSindicato}>
                <Users className="mr-2 h-4 w-4" /> Novo sindicato
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}

/* ---------------- Dashboard ---------------- */

export function BucketListDialog({
  open,
  title,
  list,
  onClose,
}: {
  open: boolean;
  title: string;
  list: Registro[];
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((r) =>
      [r.empresaNome, r.empresaCodigo, r.empresaCnpj, r.sindicatoNome, r.responsavel]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [q, list]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{list.length} empresa(s) nesta janela</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar empresa, CNPJ, sindicato…"
            className="pl-8"
          />
        </div>
        <ul className="mt-3 divide-y rounded-md border bg-white">
          {filtered.length === 0 ? (
            <li className="p-4 text-center text-sm text-slate-500">Nenhuma empresa encontrada</li>
          ) : (
            filtered.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">{r.empresaNome || "—"}</div>
                  <div className="truncate text-xs text-slate-500">
                    {r.sindicatoNome ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.dispatchEvent(
                            new CustomEvent("cct:edit-sindicato", {
                              detail: {
                                codigo: r.sindicatoCodigo,
                                cnpj: r.sindicatoCnpj,
                                nome: r.sindicatoNome,
                              },
                            }),
                          );
                          onClose();
                        }}
                        className="font-medium text-brand-darker underline-offset-2 hover:underline"
                        title={`Editar ${r.sindicatoNome}`}
                      >
                        {r.sindicatoNome}
                      </button>
                    ) : (
                      "—"
                    )}{" "}
                    · Data-base {r.dataBase || "—"} · Vigência {r.vigenciaFim || "—"}
                  </div>
                </div>
                <StatusBadge status={deriveStatus(r)} />
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Lista ---------------- */

function ListaConvencoes({
  registros,
  total,
  isAdmin,
  onEdit,
  onDelete,
  onDetail,
  onRemoveArquivo,
  onNovo,
}: {
  registros: Registro[];
  total: number;
  isAdmin: boolean;
  onEdit: (r: Registro) => void;
  onDelete: (id: string) => void;
  onDetail: (r: Registro) => void;
  onRemoveArquivo: (id: string, ano: number, tipo: DocTipo) => void;
  onNovo: () => void;
}) {
  const [layout, setLayout] = useState<"cards" | "table">("cards");
  if (total === 0) {
    return (
      <div className="rounded-lg border bg-white p-10 text-center shadow-sm">
        <FileText className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 text-base font-semibold text-slate-700">
          Nenhuma empresa cadastrada
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Clique em "Nova empresa" para começar o cadastro.
        </p>
        <Button className="mt-4 bg-brand text-white hover:bg-brand-dark" onClick={onNovo}>
          <Plus className="mr-1 h-4 w-4" /> Nova empresa
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-500">
          {registros.length} registro(s) exibido(s) · {total} no total
        </div>
        <ToggleGroup
          type="single"
          value={layout}
          onValueChange={(v) => v && setLayout(v as "cards" | "table")}
          className="rounded-md border bg-white p-0.5"
        >
          <ToggleGroupItem value="cards" aria-label="Visualização em cards" className="gap-1.5 px-3 text-xs">
            <LayoutGrid className="h-4 w-4" /> Cards
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="Visualização em tabela" className="gap-1.5 px-3 text-xs">
            <Rows3 className="h-4 w-4" /> Tabela
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {registros.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          Nenhum registro corresponde aos filtros.
        </div>
      ) : layout === "table" ? (
        <ConventionsTable
          registros={registros}
          isAdmin={isAdmin}
          onEdit={onEdit}
          onDelete={onDelete}
          onDetail={onDetail}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {registros.map((r) => (
            <RegistroCard
              key={r.id}
              r={r}
              isAdmin={isAdmin}
              onEdit={() => onEdit(r)}
              onDelete={() => onDelete(r.id)}
              onDetail={() => onDetail(r)}
              onRemoveArquivo={onRemoveArquivo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Tabela ---------------- */

type SortKey =
  | "empresa"
  | "codigo"
  | "cnpj"
  | "dataBase"
  | "status"
  | "vigencia"
  | "responsavel"
  | "sindicato"
  | "contato";

function ConventionsTable({
  registros,
  isAdmin,
  onEdit,
  onDelete,
  onDetail,
}: {
  registros: Registro[];
  isAdmin: boolean;
  onEdit: (r: Registro) => void;
  onDelete: (id: string) => void;
  onDetail: (r: Registro) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>({
    key: "empresa",
    dir: "asc",
  });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const statusOrder: Record<Status, number> = { vigente: 0, negociacao: 1, pendente: 2 };

  const sorted = useMemo(() => {
    if (!sort) return registros;
    const arr = [...registros];
    const dir = sort.dir;
    const tieByEmpresa = (a: Registro, b: Registro) => cmpString(a.empresaNome, b.empresaNome);
    const cmp = (a: Registro, b: Registro): number => {
      let primary = 0;
      switch (sort.key) {
        case "empresa":
          primary = nullsLast(a.empresaNome, b.empresaNome, dir, cmpString);
          break;
        case "codigo":
          primary = nullsLast(a.empresaCodigo, b.empresaCodigo, dir, cmpCodigo);
          break;
        case "cnpj":
          primary = nullsLast(a.empresaCnpj, b.empresaCnpj, dir, cmpCnpj);
          break;
        case "dataBase":
          primary = nullsLast(a.dataBase, b.dataBase, dir, cmpDataBase);
          break;
        case "status": {
          const raw = statusOrder[deriveStatus(a)] - statusOrder[deriveStatus(b)];
          primary = dir === "asc" ? raw : -raw;
          break;
        }
        case "vigencia":
          primary = nullsLast(a.vigenciaFim, b.vigenciaFim, dir, (x, y) =>
            x.localeCompare(y),
          );
          break;
        case "responsavel":
          primary = nullsLast(a.responsavel, b.responsavel, dir, cmpString);
          break;
        case "sindicato":
          primary = nullsLast(a.sindicatoNome, b.sindicatoNome, dir, cmpString);
          break;
        case "contato":
          primary = nullsLast(a.dataContato, b.dataContato, dir, (x, y) =>
            x.localeCompare(y),
          );
          break;
      }
      return sort.key === "empresa" ? primary : chain(primary, () => tieByEmpresa(a, b));
    };
    arr.sort(cmp);
    return arr;
  }, [registros, sort]);

  const totalPaginas = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPaginas) setPage(1);
  }, [page, totalPaginas]);
  const paginaAtual = Math.min(page, totalPaginas);
  const inicio = (paginaAtual - 1) * PAGE_SIZE;
  const fim = Math.min(inicio + PAGE_SIZE, sorted.length);
  const pageItems = useMemo(() => sorted.slice(inicio, fim), [sorted, inicio, fim]);

  const toggleSort = (key: SortKey) => {
    setPage(1);
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  const SortableHead = ({ label, k }: { label: string; k: SortKey }) => {
    const active = sort?.key === k;
    const Icon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={cn(
            "flex items-center gap-1 text-xs font-semibold uppercase tracking-wide hover:text-slate-900",
            active ? "text-brand-darker" : "text-slate-600",
          )}
          title={`Ordenar por ${label}`}
        >
          {label}
          <Icon className={cn("h-3 w-3", active ? "opacity-100" : "opacity-40")} />
        </button>
      </TableHead>
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <Table className="min-w-[1200px] text-sm">
        <TableHeader className="bg-slate-50">
          <TableRow>
            <SortableHead label="Empresa" k="empresa" />
            <SortableHead label="Status" k="status" />
            <SortableHead label="Responsável" k="responsavel" />
            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Segmento / Local
            </TableHead>
            <SortableHead label="Sindicato" k="sindicato" />
            <SortableHead label="Vigência" k="vigencia" />
            <SortableHead label="Último contato" k="contato" />
            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Publicação
            </TableHead>
            <TableHead className="sticky right-0 bg-slate-50 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
              Ações
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageItems.map((r) => (
            <ConventionRow
              key={r.id}
              registro={r}
              isAdmin={isAdmin}
              onEdit={onEdit}
              onDelete={onDelete}
              onDetail={onDetail}
            />
          ))}
        </TableBody>
      </Table>
      {sorted.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50/60 px-3 py-2 text-xs text-slate-600">
          <span>
            {inicio + 1}–{fim} de {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={paginaAtual <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <span className="tabular-nums">
              Página {paginaAtual} de {totalPaginas}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={paginaAtual >= totalPaginas}
              onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const ConventionRow = memo(function ConventionRow({
  registro: r,
  isAdmin,
  onEdit,
  onDelete,
  onDetail,
}: {
  registro: Registro;
  isAdmin: boolean;
  onEdit: (r: Registro) => void;
  onDelete: (id: string) => void;
  onDetail: (r: Registro) => void;
}) {
  const hasResumo = r.historicoDocumentos.some((d) => d.resumoPublicado);
  const hasIntegra = r.historicoDocumentos.some((d) => d.integraPublicada);
  return (
    <TableRow className="align-top transition-colors hover:bg-slate-50/70">
      <TableCell className="min-w-[220px]">
        <button
          onClick={() => onDetail(r)}
          className="text-left font-semibold text-brand-darker hover:underline"
        >
          {r.empresaNome || "(sem nome)"}
        </button>
        <div className="mt-0.5 text-xs text-slate-500">
          Cód: {r.empresaCodigo || "—"} · {r.empresaCnpj || "sem CNPJ"}
        </div>
      </TableCell>
      <TableCell>
        <StatusBadge status={deriveStatus(r)} />
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand-soft/50 px-2 py-0.5 text-[11px] font-medium text-brand-darker">
          <User className="h-3 w-3" />
          {r.responsavel?.trim() ? r.responsavel : "Sem responsável"}
        </span>
      </TableCell>
      <TableCell className="min-w-[160px] text-xs text-slate-600">
        <div className="flex items-center gap-1 text-slate-700">
          <Tag className="h-3 w-3 text-indigo-500" />
          {r.segmento?.trim() || "—"}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-slate-500">
          <MapPin className="h-3 w-3 text-sky-500" />
          {r.cidade?.trim() || "—"}
        </div>
      </TableCell>
      <TableCell className="min-w-[180px]">
        <div className="font-medium text-slate-800">{r.sindicatoNome || "—"}</div>
        <div className="text-xs text-slate-500">Cód: {r.sindicatoCodigo || "—"}</div>
      </TableCell>
      <TableCell className="min-w-[170px] whitespace-nowrap text-xs">
        <div className="text-slate-700">
          {r.vigenciaInicio || "—"} <span className="text-slate-400">→</span>{" "}
          {r.vigenciaFim || "—"}
        </div>
        <div className="mt-0.5 text-slate-500">Data-base: {r.dataBase || "—"}</div>
      </TableCell>
      <TableCell className="min-w-[150px] text-xs">
        <ContatoInfo r={r} />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              hasResumo
                ? "border-sky-200 bg-sky-50 text-sky-700"
                : "border-slate-200 bg-slate-50 text-slate-400",
            )}
            title={hasResumo ? "Resumo publicado" : "Resumo não publicado"}
          >
            {hasResumo ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            Resumo
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              hasIntegra
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-slate-50 text-slate-400",
            )}
            title={hasIntegra ? "Convenção Homologada publicada" : "Convenção Homologada não publicada"}
          >
            {hasIntegra ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            Conv. Homologada
          </span>
        </div>
      </TableCell>
      <TableCell className="sticky right-0 bg-white text-right">
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" onClick={() => onEdit(r)} title="Editar">
            <Pencil className="h-4 w-4" />
          </Button>
          {isAdmin && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onDelete(r.id)}
              title="Excluir"
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
});

export function MetricsRow({
  metrics,
}: {
  metrics: { total: number; vigentes: number; negociacao: number; pendentes: number };
}) {
  const cards = [
    {
      label: "Empresas cadastradas",
      hint: "no filtro atual",
      value: metrics.total,
      icon: Building2,
      wrap: "bg-brand text-white",
      iconWrap: "bg-white/20 text-white",
      hintCls: "text-white/80",
    },
    {
      label: "Convenções vigentes",
      hint: "resumo + convenção homologada anexados",
      value: metrics.vigentes,
      icon: CheckCircle2,
      wrap: "bg-emerald-600 text-white",
      iconWrap: "bg-white/20 text-white",
      hintCls: "text-white/80",
    },
    {
      label: "Em negociação",
      hint: "andamento com o sindicato",
      value: metrics.negociacao,
      icon: Clock,
      wrap: "bg-amber-500 text-white",
      iconWrap: "bg-white/20 text-white",
      hintCls: "text-white/85",
    },
    {
      label: "Pendentes / expiradas",
      hint: "sem documentos vigentes",
      value: metrics.pendentes,
      icon: AlertTriangle,
      wrap: "bg-red-600 text-white",
      iconWrap: "bg-white/20 text-white",
      hintCls: "text-white/85",
    },
  ];
  return (
    <section aria-label="Painel de acompanhamento">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Painel de acompanhamento
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className={cn(
              "flex items-center gap-3 rounded-lg p-4 shadow-sm",
              c.wrap,
            )}
          >
            <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-md", c.iconWrap)}>
              <c.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-3xl font-bold leading-none">{c.value}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide">
                {c.label}
              </div>
              <div className={cn("text-[11px]", c.hintCls)}>{c.hint}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ContatoInfo({ r }: { r: Registro }) {
  const dias = diasDesde(r.dataContato);
  const data = r.dataContato ? new Date(r.dataContato + "T00:00:00").toLocaleDateString("pt-BR") : "";
  const tone =
    dias === null
      ? "text-slate-400"
      : dias > 180
        ? "text-red-600"
        : dias > 90
          ? "text-amber-600"
          : "text-slate-700";
  return (
    <div className={cn("inline-flex flex-col text-xs", tone)}>
      <span className="inline-flex items-center gap-1">
        <PhoneCall className="h-3.5 w-3.5" />
        {data || "Sem data"}
        {dias !== null && dias >= 0 && (
          <span className="text-[10px] text-slate-500">· há {dias}d</span>
        )}
      </span>
      {r.pessoaContato?.trim() && (
        <span className="pl-4 text-slate-500">com {r.pessoaContato}</span>
      )}
      {r.ultimoContacto?.trim() && (
        <span className="pl-4 text-slate-400">{r.ultimoContacto}</span>
      )}
    </div>
  );
}

function PublicacaoResumo({ r }: { r: Registro }) {
  const docs = r.historicoDocumentos ?? [];
  const resumo = docs.filter((d) => d.resumoPublicado).length;
  const integra = docs.filter((d) => d.integraPublicada).length;
  if (!resumo && !integra) {
    return <span className="text-xs text-slate-400">Nenhuma publicação</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      {resumo > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-700">
          <BadgeCheck className="h-3 w-3" /> Resumo · {resumo}
        </span>
      )}
      {integra > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700">
          <BadgeCheck className="h-3 w-3" /> Conv. Homologada · {integra}
        </span>
      )}
    </div>
  );
}

function RegistroCard({
  r,
  isAdmin,
  onEdit,
  onDelete,
  onDetail,
  onRemoveArquivo,
}: {
  r: Registro;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDetail: () => void;
  onRemoveArquivo: (id: string, ano: number, tipo: DocTipo) => void;
}) {
  const status = deriveStatus(r);
  const prazo = prazoOposicaoInfo(r.prazoOposicao);
  const prazoCls =
    prazo.tone === "danger"
      ? "border-red-300 bg-red-50 text-red-700 animate-pulse"
      : prazo.tone === "warn"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : prazo.tone === "ok"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-500";
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md">
      <header className="border-b bg-slate-50 px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <button
              onClick={onDetail}
              className="text-left text-base font-semibold text-brand-darker hover:underline"
            >
              {r.empresaNome || "(sem nome)"}
            </button>
            <div className="mt-0.5 text-xs text-slate-500">
              Código: {r.empresaCodigo || "—"} · CNPJ:{" "}
              {r.empresaCnpj || "CNPJ não informado"}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={status} />
              <span className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand-soft/50 px-2 py-0.5 text-[11px] font-medium text-brand-darker">
                <User className="h-3 w-3" />
                {r.responsavel?.trim() ? r.responsavel : "Sem responsável"}
              </span>
              {r.resumoPublicado && (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  Resumo publicado
                </span>
              )}
              {r.integraPublicada && (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  Convenção Homologada publicada
                </span>
              )}
              {r.segmento?.trim() && (
                <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                  <Tag className="h-3 w-3" />
                  {r.segmento}
                </span>
              )}
              {r.cidade?.trim() && (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                  <MapPin className="h-3 w-3" />
                  {r.cidade}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="icon" variant="ghost" onClick={onEdit} title="Editar">
              <Pencil className="h-4 w-4" />
            </Button>
            {isAdmin && (
              <Button
                size="icon"
                variant="ghost"
                onClick={onDelete}
                title="Excluir"
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Sindicato</div>
          <div className="font-medium text-slate-800">{r.sindicatoNome || "—"}</div>
          <div className="text-xs text-slate-500">
            Código: {r.sindicatoCodigo || "—"} · CNPJ:{" "}
            {r.sindicatoCnpj || "CNPJ não informado"}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Vigência</div>
          <div className="text-slate-700">
            {r.vigenciaInicio || "—"} <span className="text-slate-400">→</span>{" "}
            {r.vigenciaFim || "—"}
          </div>
          <div className="text-xs text-slate-500">
            Data-base: {r.dataBase || "—"} · {r.abrangencia || "—"}
          </div>
        </div>
        <div className="sm:col-span-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Funcionários contemplados
          </div>
          <div className="text-slate-700">{r.funcionariosContemplados || 0}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Último contato
          </div>
          <ContatoInfo r={r} />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Prazo de oposição
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
              prazoCls,
            )}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            {prazo.label}
          </span>
        </div>
      </div>

      <div className="border-t px-4 py-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Histórico de documentos
        </div>
        <div className="mb-2">
          <PublicacaoResumo r={r} />
        </div>
        <DocsBadges registro={r} isAdmin={isAdmin} onRemoveArquivo={onRemoveArquivo} />
      </div>
    </article>
  );
}

function DocsBadges({
  registro,
  isAdmin,
  onRemoveArquivo,
}: {
  registro: Registro;
  isAdmin: boolean;
  onRemoveArquivo: (id: string, ano: number, tipo: DocTipo) => void;
}) {
  const docs = [...registro.historicoDocumentos].sort((a, b) => b.anoVigencia - a.anoVigencia);
  if (docs.length === 0)
    return <span className="text-xs text-slate-400">Sem documentos cadastrados</span>;

  return (
    <div className="flex flex-col gap-2">
      {docs.map((d) => (
        <div
          key={d.anoVigencia}
          className="flex flex-wrap items-center gap-2 rounded-md border bg-slate-50 px-2 py-1.5 text-xs"
        >
          <Badge className="bg-brand-dark font-mono text-white">Ano {d.anoVigencia}</Badge>
          <PubChip label="Resumo" on={!!d.resumoPublicado} />
          <PubChip label="Convenção Homologada" on={!!d.integraPublicada} />
          <DocLink
            label="Resumo"
            path={d.resumoPath}
            base64={d.resumoBase64}
            filename={d.resumoNome}
            onRemove={
              isAdmin && (d.resumoBase64 || d.resumoPath)
                ? () => onRemoveArquivo(registro.id, d.anoVigencia, "resumo")
                : undefined
            }
            fallback={`resumo-${d.anoVigencia}.pdf`}
          />
          <DocLink
            label="Conv. Homologada"
            path={d.integraPath}
            base64={d.integraBase64}
            filename={d.integraNome}
            onRemove={
              isAdmin && (d.integraBase64 || d.integraPath)
                ? () => onRemoveArquivo(registro.id, d.anoVigencia, "integra")
                : undefined
            }
            fallback={`integra-${d.anoVigencia}.pdf`}
          />
        </div>
      ))}
    </div>
  );
}

export function PubChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        on
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-400",
      )}
      title={`${label} ${on ? "publicado(a)" : "não publicado(a)"}`}
    >
      {on ? <BadgeCheck className="h-3 w-3" /> : <BellRing className="h-3 w-3" />}
      {label}: {on ? "Sim" : "Não"}
    </span>
  );
}

function DocLink({
  label,
  path,
  base64,
  filename,
  onRemove,
  fallback,
}: {
  label: string;
  path?: string | null;
  base64?: string | null;
  filename?: string | null;
  onRemove?: () => void;
  fallback: string;
}) {
  if (!path && !base64) return <span className="text-slate-400">{label} —</span>;
  const abrir = async () => {
    try {
      if (path) {
        const url = await getDocumentoSignedUrl(path);
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      if (base64) downloadBase64(base64, filename || fallback);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao abrir documento");
    }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={abrir}
        className="inline-flex items-center gap-1 rounded bg-brand px-2 py-0.5 text-white hover:bg-brand-dark"
      >
        <FileText className="h-3 w-3" /> {label}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-red-500 hover:text-red-700"
          aria-label={`Remover ${label}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

/* ---------------- Detalhe ---------------- */

function DetalheDialog({
  registro,
  isAdmin,
  onClose,
  onRemoveArquivo,
}: {
  registro: Registro | null;
  isAdmin: boolean;
  onClose: () => void;
  onRemoveArquivo: (id: string, ano: number, tipo: DocTipo) => void;
}) {
  return (
    <Dialog open={!!registro} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        {registro && (
          <>
            <DialogHeader>
              <DialogTitle>{registro.empresaNome}</DialogTitle>
              <DialogDescription>
                Código: {registro.empresaCodigo || "—"} · CNPJ:{" "}
                {registro.empresaCnpj || "CNPJ não informado"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="rounded-md border bg-slate-50 p-3">
                <div className="text-[11px] uppercase text-slate-500">Sindicato</div>
                <div className="font-medium">{registro.sindicatoNome || "—"}</div>
                <div className="text-xs text-slate-500">
                  Código: {registro.sindicatoCodigo || "—"} · CNPJ:{" "}
                  {registro.sindicatoCnpj || "CNPJ não informado"}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Info label="Data-base" value={registro.dataBase} />
                <Info label="Abrangência" value={registro.abrangencia} />
                <Info label="Vigência início" value={registro.vigenciaInicio} />
                <Info label="Vigência fim" value={registro.vigenciaFim} />
                <Info
                  label="Funcionários contemplados"
                  value={String(registro.funcionariosContemplados || 0)}
                />
                <Info
                  label="Última atualização"
                  value={new Date(registro.ultimaAtualizacao).toLocaleString()}
                />
              </div>
              {registro.observacoes && (
                <div className="whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-slate-700">
                  {registro.observacoes}
                </div>
              )}
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase text-slate-500">
                  Documentos
                </div>
                <DocsBadges
                  registro={registro}
                  isAdmin={isAdmin}
                  onRemoveArquivo={onRemoveArquivo}
                />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-md border bg-white p-2">
      <div className="text-[10px] uppercase text-slate-400">{label}</div>
      <div className="text-slate-700">{value || "—"}</div>
    </div>
  );
}

/* ---------------- Admin panel ---------------- */

function AdminPanel({
  isAdmin,
  onToggleAdmin,
  onExport,
  onImport,
  onImportExcel,
  onReset,
  total,
}: {
  isAdmin: boolean;
  onToggleAdmin: (v: boolean) => void;
  onExport: () => void;
  onImport: (f: File) => void;
  onImportExcel: () => void;
  onReset: () => void;
  total: number;
}) {
  const inp = useRef<HTMLInputElement>(null);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-brand" />
          <div>
            <h2 className="text-base font-semibold text-slate-800">Modo Administrador</h2>
            <p className="text-xs text-slate-500">
              Habilita botões de exclusão em registros e documentos.
            </p>
          </div>
          <div className="ml-auto">
            <Switch checked={isAdmin} onCheckedChange={onToggleAdmin} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">Backup, exportação e importação</h2>
        <p className="mt-1 text-xs text-slate-500">
          {total} {total === 1 ? "registro" : "registros"} armazenados localmente.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onExport} className="bg-brand text-white hover:bg-brand-dark">
            <Download className="mr-1 h-4 w-4" /> Backup JSON
          </Button>
          <input
            ref={inp}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => inp.current?.click()}>
            <Upload className="mr-1 h-4 w-4" /> Restaurar JSON
          </Button>
          <Button
            variant="outline"
            onClick={onImportExcel}
            className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
          >
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Importar Excel
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50 p-5">
        <h2 className="text-base font-semibold text-red-700">Resetar base</h2>
        <p className="mt-1 text-xs text-red-600">
          Remove todos os registros do armazenamento local. Ação irreversível.
        </p>
        <Button
          variant="destructive"
          className="mt-3"
          onClick={onReset}
        >
          <RotateCcw className="mr-1 h-4 w-4" /> Resetar tudo
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Formulário ---------------- */

function RegistroForm({
  open,
  registro,
  sindicatoIdInicial,
  onClose,
  onSave,
  onEditarSindicato,
}: {
  open: boolean;
  registro: Registro | null;
  sindicatoIdInicial: string | null;
  onClose: () => void;
  onSave: (r: Registro, sindicatoId: string | null) => void | Promise<void>;
  onEditarSindicato: (sindicatoId: string) => void;
}) {
  const [draft, setDraft] = useState<Registro | null>(registro);
  const [sindicatoId, setSindicatoId] = useState<string | null>(sindicatoIdInicial);
  const [buscaSind, setBuscaSind] = useState("");

  useEffect(() => {
    setDraft(registro ? { ...registro } : registro);
    setSindicatoId(sindicatoIdInicial);
    setBuscaSind("");
  }, [registro, sindicatoIdInicial]);

  const { data: sindicatos = [] } = useQuery({
    queryKey: ["sindicatos"],
    queryFn: async () => {
      const { fetchSindicatos } = await import("./sindicatos-storage");
      return fetchSindicatos();
    },
    enabled: open,
    staleTime: 60_000,
  });

  const sindicatoSelecionado = useMemo(
    () => sindicatos.find((s) => s.id === sindicatoId) ?? null,
    [sindicatos, sindicatoId],
  );

  const sindicatosFiltrados = useMemo(() => {
    const q = buscaSind.trim().toLowerCase();
    if (!q) return sindicatos;
    return sindicatos.filter((s) =>
      [s.nome, s.codigo, s.cnpj].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [sindicatos, buscaSind]);

  if (!draft) return null;

  const patch = (p: Partial<Registro>) => setDraft({ ...draft, ...p });

  const submit = () => {
    if (!draft.empresaNome.trim()) {
      toast.error("Informe o nome da empresa");
      return;
    }
    onSave(draft, sindicatoId);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {registro && registro.empresaNome ? "Editar empresa" : "Nova empresa"}
          </DialogTitle>
          <DialogDescription>
            Preencha os dados da empresa e vincule-a a um sindicato existente.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase text-slate-500">Empresa</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Nome da empresa *</Label>
              <Input
                value={draft.empresaNome}
                onChange={(e) => patch({ empresaNome: e.target.value })}
              />
            </div>
            <div>
              <Label>Código da empresa</Label>
              <Input
                value={draft.empresaCodigo}
                onChange={(e) => patch({ empresaCodigo: e.target.value })}
              />
            </div>
            <div>
              <Label>CNPJ da empresa</Label>
              <Input
                value={draft.empresaCnpj}
                onChange={(e) => patch({ empresaCnpj: formatCnpj(e.target.value) })}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div>
              <Label>UF</Label>
              <Input
                value={draft.uf ?? ""}
                maxLength={2}
                onChange={(e) => patch({ uf: e.target.value.toUpperCase() })}
                placeholder="Ex.: SP"
              />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input
                value={draft.cidade ?? ""}
                onChange={(e) => patch({ cidade: e.target.value })}
              />
            </div>
            <div>
              <Label>Funcionários contemplados</Label>
              <Input
                type="number"
                min={0}
                value={draft.funcionariosContemplados}
                onChange={(e) =>
                  patch({ funcionariosContemplados: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <Label>Colaboradores</Label>
              <Input
                type="number"
                min={0}
                value={draft.colaboradores ?? 0}
                onChange={(e) => patch({ colaboradores: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Padrinho / Madrinha (responsável)</Label>
              <Select
                value={
                  draft.responsavel &&
                  RESPONSAVEIS.includes(draft.responsavel as (typeof RESPONSAVEIS)[number])
                    ? draft.responsavel
                    : NO_RESP
                }
                onValueChange={(v) => patch({ responsavel: v === NO_RESP ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_RESP}>Sem responsável</SelectItem>
                  {RESPONSAVEIS.map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pessoa de contato</Label>
              <Input
                value={draft.pessoaContato ?? ""}
                onChange={(e) => patch({ pessoaContato: e.target.value })}
                placeholder="Ex.: João (RH)"
              />
            </div>
            <div>
              <Label>Data do contato</Label>
              <Input
                type="date"
                value={draft.dataContato ?? ""}
                onChange={(e) => patch({ dataContato: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                value={draft.observacoes}
                onChange={(e) => patch({ observacoes: e.target.value })}
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase text-slate-500">Sindicato vinculado</h3>
          <div className="rounded-md border bg-slate-50 p-3">
            <Label>Selecione o sindicato</Label>
            <div className="relative mt-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={buscaSind}
                onChange={(e) => setBuscaSind(e.target.value)}
                placeholder="Buscar por nome, código ou CNPJ…"
                className="pl-8"
              />
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto rounded border bg-white">
              <button
                type="button"
                onClick={() => setSindicatoId(null)}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50",
                  sindicatoId === null && "bg-brand-soft/50",
                )}
              >
                <span className="text-slate-500">— Nenhum sindicato —</span>
              </button>
              {sindicatosFiltrados.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSindicatoId(s.id)}
                  className={cn(
                    "flex w-full items-start justify-between gap-2 border-t px-3 py-2 text-left text-sm hover:bg-slate-50",
                    sindicatoId === s.id && "bg-brand-soft/50",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">{s.nome || "(sem nome)"}</div>
                    <div className="truncate text-xs text-slate-500">
                      Cód: {s.codigo || "—"} · {s.cnpj || "sem CNPJ"}
                    </div>
                  </div>
                  <StatusBadge status={(s.status as Status) || "pendente"} />
                </button>
              ))}
              {sindicatosFiltrados.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-slate-500">
                  Nenhum sindicato encontrado.
                </div>
              )}
            </div>
            {sindicatoSelecionado ? (
              <div className="mt-3 rounded-md border bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs uppercase text-slate-400">Sindicato selecionado</div>
                    <div className="font-medium text-slate-800">{sindicatoSelecionado.nome}</div>
                    <div className="text-xs text-slate-500">
                      Cód: {sindicatoSelecionado.codigo || "—"} · CNPJ: {sindicatoSelecionado.cnpj || "—"}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onEditarSindicato(sindicatoSelecionado.id)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Editar sindicato
                  </Button>
                </div>
                <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                  Editar este sindicato afeta todas as empresas vinculadas.
                </div>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <Info label="Data-base" value={sindicatoSelecionado.dataBase} />
                  <Info label="Abrangência" value={sindicatoSelecionado.abrangencia} />
                  <Info label="Vigência início" value={sindicatoSelecionado.vigenciaInicio} />
                  <Info label="Vigência fim" value={sindicatoSelecionado.vigenciaFim} />
                  <Info label="Prazo de oposição" value={sindicatoSelecionado.prazoOposicao} />
                  <Info label="Status" value={STATUS_META[(sindicatoSelecionado.status as Status) || "pendente"]?.label ?? "—"} />
                </div>
                <div className="mt-3">
                  <div className="mb-1 text-[11px] uppercase text-slate-400">Documentos (somente-leitura)</div>
                  {sindicatoSelecionado.historicoDocumentos.length === 0 ? (
                    <div className="text-xs text-slate-400">Sem documentos cadastrados</div>
                  ) : (
                    <ul className="space-y-1 text-xs text-slate-600">
                      {[...sindicatoSelecionado.historicoDocumentos]
                        .sort((a, b) => b.anoVigencia - a.anoVigencia)
                        .map((d) => (
                          <li key={d.anoVigencia} className="flex items-center gap-2">
                            <Badge className="bg-brand-dark font-mono text-white">{d.anoVigencia}</Badge>
                            <span>{d.resumoPublicado ? "Resumo ✓" : "Resumo —"}</span>
                            <span>{d.integraPublicada ? "Conv. Homologada ✓" : "Conv. Homologada —"}</span>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-white p-3 text-center text-xs text-slate-500">
                Nenhum sindicato vinculado — os dados de convenção não serão exibidos para esta empresa.
              </div>
            )}
          </div>
        </section>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} className="bg-brand text-white hover:bg-brand-dark">
            Salvar empresa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Novo Sindicato ---------------- */

function NovoSindicatoDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [codigo, setCodigo] = useState("");
  const [abrangencia, setAbrangencia] = useState("");
  const [segmento, setSegmento] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setNome(""); setCnpj(""); setCodigo("");
      setAbrangencia(""); setSegmento(""); setSaving(false);
    }
  }, [open]);

  const salvar = async () => {
    if (!nome.trim()) {
      toast.error("Informe o nome do sindicato");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("sindicatos").insert({
        nome: nome.trim(),
        cnpj: cnpj.trim(),
        codigo: codigo.trim(),
        abrangencia: abrangencia.trim(),
        segmento: segmento.trim() || null,
        status: "pendente",
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["sindicatos"] });
      toast.success("Sindicato criado");
      onCreated();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao criar sindicato");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo sindicato</DialogTitle>
          <DialogDescription>
            Cadastro rápido. Ajustes detalhados podem ser feitos depois na aba Sindicatos.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="ns-nome">Nome *</Label>
            <Input id="ns-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ns-cnpj">CNPJ</Label>
              <Input id="ns-cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ns-cod">Código / Registro</Label>
              <Input id="ns-cod" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="ns-abr">Base territorial</Label>
            <Input id="ns-abr" value={abrangencia} onChange={(e) => setAbrangencia(e.target.value)} placeholder="Ex.: Rio Grande do Norte" />
          </div>
          <div>
            <Label htmlFor="ns-seg">Segmento</Label>
            <Input id="ns-seg" value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="Ex.: Supermercados" />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="bg-brand text-white hover:bg-brand-dark">
            {saving ? "Salvando…" : "Criar sindicato"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Importar via Excel ---------------- */

type LinhaEmpresaXlsx = {
  cnpj?: string; razao_social?: string; nome_fantasia?: string;
  codigo?: string; cidade?: string; uf?: string;
  funcionarios?: number; responsavel?: string; sindicato_cnpj?: string;
};
type LinhaSindicatoXlsx = {
  cnpj?: string; nome?: string; codigo?: string;
  abrangencia?: string; segmento?: string; email?: string;
};

function normalizaChave(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function mapearLinha<T extends Record<string, unknown>>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[normalizaChave(k)] = v;
  }
  return out as T;
}

function ImportarExcelDialog({
  open,
  onClose,
}: { open: boolean; onClose: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [processando, setProcessando] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setArquivo(null); setProcessando(false); setDragOver(false); }
  }, [open]);

  const baixarModelo = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const empresas = [{
      cnpj: "00.000.000/0001-00",
      razao_social: "EMPRESA EXEMPLO LTDA",
      nome_fantasia: "Exemplo",
      codigo: "0001",
      cidade: "NATAL",
      uf: "RN",
      funcionarios: 10,
      responsavel: "Amelia Medeiros",
      sindicato_cnpj: "01.975.975/0001-06",
    }];
    const sindicatos = [{
      cnpj: "01.975.975/0001-06",
      nome: "SINDICATO EXEMPLO",
      codigo: "",
      abrangencia: "Rio Grande do Norte",
      segmento: "Supermercados",
      email: "contato@sindicato.com",
    }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empresas), "Empresas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sindicatos), "Sindicatos");
    XLSX.writeFile(wb, "modelo_importacao_elite.xlsx");
  };

  const processar = async () => {
    if (!arquivo) return;
    setProcessando(true);
    let sindCount = 0, empCount = 0;
    try {
      const XLSX = await import("xlsx");
      const buf = await arquivo.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const nomes = wb.SheetNames.map((n) => n.toLowerCase());
      const sindSheetIdx = nomes.findIndex((n) => n.startsWith("sind"));
      const empSheetIdx = nomes.findIndex((n) => n.startsWith("emp"));

      const cnpjToId = new Map<string, string>();
      const { data: sindsExistentes } = await supabase
        .from("sindicatos").select("id, cnpj");
      for (const s of sindsExistentes ?? []) {
        if (s.cnpj) cnpjToId.set(s.cnpj.replace(/\D/g, ""), s.id);
      }

      // Sindicatos primeiro
      if (sindSheetIdx >= 0) {
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[sindSheetIdx]]);
        for (const row of raw) {
          const r = mapearLinha<LinhaSindicatoXlsx>(row);
          if (!r.nome && !r.cnpj) continue;
          const cnpjNorm = (r.cnpj ?? "").replace(/\D/g, "");
          const jaExiste = cnpjNorm ? cnpjToId.get(cnpjNorm) : undefined;
          if (jaExiste) {
            const { error } = await supabase.from("sindicatos").update({
              nome: r.nome ?? "",
              codigo: r.codigo ?? "",
              abrangencia: r.abrangencia ?? "",
              segmento: r.segmento ?? null,
            }).eq("id", jaExiste);
            if (error) throw error;
          } else {
            const { data, error } = await supabase.from("sindicatos").insert({
              nome: r.nome ?? "",
              cnpj: r.cnpj ?? "",
              codigo: r.codigo ?? "",
              abrangencia: r.abrangencia ?? "",
              segmento: r.segmento ?? null,
              status: "pendente",
            }).select("id").single();
            if (error) throw error;
            if (cnpjNorm && data?.id) cnpjToId.set(cnpjNorm, data.id);
          }
          sindCount++;
        }
      }

      // Empresas
      if (empSheetIdx >= 0) {
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[empSheetIdx]]);
        const { data: empsExistentes } = await supabase
          .from("empresas").select("id, codigo, cidade, cnpj");
        const chaveEmp = (codigo: string, cidade: string) => `${codigo}|${cidade.toUpperCase()}`;
        const empPorChave = new Map<string, string>();
        const empPorCnpj = new Map<string, string>();
        for (const e of empsExistentes ?? []) {
          if (e.codigo) empPorChave.set(chaveEmp(e.codigo, e.cidade ?? ""), e.id);
          if (e.cnpj) empPorCnpj.set(e.cnpj.replace(/\D/g, ""), e.id);
        }
        for (const row of raw) {
          const r = mapearLinha<LinhaEmpresaXlsx>(row);
          const nome = String(r.razao_social ?? r.nome_fantasia ?? "").trim();
          if (!nome && !r.cnpj) continue;
          const cnpjNormEmp = String(r.cnpj ?? "").replace(/\D/g, "");
          const cnpjNormSind = String(r.sindicato_cnpj ?? "").replace(/\D/g, "");
          const sindId = cnpjNormSind ? cnpjToId.get(cnpjNormSind) ?? null : null;
          const payload = {
            nome,
            codigo: String(r.codigo ?? ""),
            cnpj: String(r.cnpj ?? ""),
            uf: r.uf ? String(r.uf) : null,
            cidade: r.cidade ? String(r.cidade) : null,
            responsavel: r.responsavel ? String(r.responsavel) : null,
            funcionarios_contemplados: Number(r.funcionarios) || 0,
            sindicato_id: sindId,
          };
          const idPorCnpj = cnpjNormEmp ? empPorCnpj.get(cnpjNormEmp) : undefined;
          const idPorChave = payload.codigo && payload.cidade
            ? empPorChave.get(chaveEmp(payload.codigo, payload.cidade))
            : undefined;
          const idExistente = idPorCnpj ?? idPorChave;
          if (idExistente) {
            const { error } = await supabase.from("empresas").update(payload).eq("id", idExistente);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("empresas").insert(payload);
            if (error) throw error;
          }
          empCount++;
        }
      }

      toast.success(`Importação concluída! ${empCount} empresa(s) e ${sindCount} sindicato(s) adicionados/atualizados.`);
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? `Falha na importação: ${e.message}` : "Falha na importação");
    } finally {
      setProcessando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar via Excel</DialogTitle>
          <DialogDescription>
            Envie um arquivo <b>.xlsx</b> com as abas <b>Empresas</b> e/ou <b>Sindicatos</b>.
            Registros existentes (mesmo CNPJ, ou mesmo código e cidade) serão atualizados;
            os novos serão inseridos. Nenhum dado atual será apagado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Button variant="outline" onClick={baixarModelo} className="w-full">
            <Download className="mr-2 h-4 w-4" /> Baixar planilha modelo
          </Button>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setArquivo(f);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "cursor-pointer rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors",
              dragOver ? "border-brand bg-brand/5" : "border-slate-300 bg-slate-50 hover:border-brand/60",
            )}
          >
            <Upload className="mx-auto mb-2 h-6 w-6 text-slate-500" />
            {arquivo ? (
              <div className="text-slate-700">
                <b>{arquivo.name}</b>
                <div className="text-xs text-slate-500">{(arquivo.size / 1024).toFixed(1)} KB</div>
              </div>
            ) : (
              <>
                <div className="text-slate-700">Arraste o arquivo Excel aqui</div>
                <div className="text-xs text-slate-500">ou clique para escolher no computador</div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setArquivo(f);
                e.target.value = "";
              }}
            />
          </div>

          <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">
            <b>Como preencher:</b> aba <b>Empresas</b> com colunas <i>cnpj, razao_social, codigo, cidade, uf, funcionarios, responsavel, sindicato_cnpj</i>.
            Aba <b>Sindicatos</b> com <i>cnpj, nome, codigo, abrangencia, segmento, email</i>.
            O vínculo empresa ↔ sindicato usa o CNPJ do sindicato.
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose} disabled={processando}>Cancelar</Button>
          <Button
            onClick={processar}
            disabled={!arquivo || processando}
            className="bg-brand text-white hover:bg-brand-dark"
          >
            {processando ? "Processando…" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
