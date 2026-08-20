import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  Download,
  ExternalLink,
  FileText,
  History,
  Lock,
  ListChecks,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  gerarResumoCct,
} from "@/lib/resumo-ia.functions";
import {
  getResumoDownloadUrl,
  uploadResumoOficial,
} from "@/lib/resumo-oficial.functions";
import {
  alterarResponsavelEsteira,
  alterarStatusEsteira,
  criarItemEsteira,
  reabrirResumoPublicado,
  removerItemEsteira,
} from "@/lib/esteira-admin.functions";
import { nomeArquivoResumo } from "@/lib/resumo-nome";
import { PortalBanner } from "./SindicatoEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fetchSindicatos,
  fetchEmpresasDoSindicato,
  type Sindicato,
  type EmpresaVinculada,
} from "./sindicatos-storage";
import {
  NEXT_STATES,
  STATUS_META,
  fetchEsteira,
  fetchHistorico,
  fetchVersoes,
  type EsteiraItem,
  type ResumoStatus,
} from "./esteira-storage";
import { RESPONSAVEIS } from "./CctHub";

const RESPONSAVEL_PADRAO = "Anne Karenine";

export const AVISO_EM_ANALISE =
  "Resumo em processo interno. Ficará disponível após revisão e publicação pela administração (Anne).";

/** Data-base/prazo em ISO (YYYY-MM-DD) ou DD/MM/AAAA. */
function parseData(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const v = valor.trim();
  let d: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) d = new Date(v.slice(0, 10) + "T00:00:00");
  else if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
    const [dd, mm, yyyy] = v.split("/");
    d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  }
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** Dias até o prazo mais relevante do item (prazo de oposição ou data-base). */
function diasUrgencia(item: EsteiraItem): number | null {
  const alvo = parseData(item.prazoOposicao) ?? parseData(item.dataBase);
  if (!alvo) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

function isAtrasado(item: EsteiraItem): boolean {
  if (item.status === "publicado") return false;
  const d = diasUrgencia(item);
  return d !== null && d < 0;
}

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatSupabaseError(e: unknown): string {
  if (e && typeof e === "object") {
    const err = e as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    };
    const parts: string[] = [];
    if (err.message) parts.push(err.message);
    if (err.code) parts.push(`(${err.code})`);
    if (err.details) parts.push(`— ${err.details}`);
    if (err.hint) parts.push(`[hint: ${err.hint}]`);
    if (parts.length) return parts.join(" ");
  }
  return e instanceof Error ? e.message : String(e);
}

function SindicatoCombobox({
  sindicatos,
  value,
  onChange,
}: {
  sindicatos: Sindicato[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = sindicatos.find((s) => s.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-left">
            {selected
              ? `${selected.codigo || "—"} · ${selected.nome}`
              : "Selecione um sindicato…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            // itemValue = "<codigo>|<codigoDigits>|<nomeNorm>"
            const q = norm(search);
            const qDigits = search.replace(/\D/g, "");
            const [codigoRaw, codigoDigits, nomeNorm] = itemValue.split("|");
            if (nomeNorm?.includes(q)) return 1;
            if (codigoRaw?.toLowerCase().includes(q)) return 1;
            if (qDigits && codigoDigits?.includes(qDigits)) return 1;
            return 0;
          }}
        >
          <CommandInput placeholder="Buscar por código ou nome…" />
          <CommandList>
            <CommandEmpty>Nenhum sindicato encontrado.</CommandEmpty>
            <CommandGroup>
              {sindicatos.map((s) => {
                const codigoRaw = (s.codigo ?? "").toString();
                const codigoDigits = codigoRaw.replace(/\D/g, "");
                const nomeNorm = norm(s.nome ?? "");
                const itemValue = `${codigoRaw}|${codigoDigits}|${nomeNorm}`;
                return (
                  <CommandItem
                    key={s.id}
                    value={itemValue}
                    onSelect={() => {
                      onChange(s.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === s.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="font-mono text-xs text-slate-500 mr-2">
                      {codigoRaw || "—"}
                    </span>
                    <span className="truncate">{s.nome}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}


function StatusBadge({ status }: { status: ResumoStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

function diasAte(prazoIso: string | null | undefined): number | null {
  if (!prazoIso) return null;
  const d = new Date(prazoIso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoje.getTime()) / 86400000);
}

function UrgenciaPill({ item }: { item: EsteiraItem }) {
  const dias = diasAte(item.prazoOposicao);
  if (dias === null)
    return <span className="text-xs text-slate-400">—</span>;
  const atrasado = dias < 0 && item.status === "nao_iniciado";
  const label =
    dias < 0
      ? `${Math.abs(dias)} dia(s) atrasado`
      : dias === 0
        ? "Vence hoje"
        : `Faltam ${dias} dia(s)`;
  const tone =
    dias < 0
      ? "bg-red-100 text-red-700 border-red-200"
      : dias <= 7
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : dias <= 30
          ? "bg-blue-100 text-blue-700 border-blue-200"
          : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone,
        atrasado && "ring-1 ring-red-400",
      )}
    >
      {label}
    </span>
  );
}

function EmpresasPopover({
  sindicatoId,
  sindicatoNome,
  count,
}: {
  sindicatoId: string;
  sindicatoNome: string;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery<EmpresaVinculada[]>({
    queryKey: ["empresas-do-sindicato", sindicatoId],
    queryFn: () => fetchEmpresasDoSindicato(sindicatoId),
    enabled: open,
    staleTime: 60_000,
  });
  const empresas = data ?? [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand-soft/20 px-2 py-0.5 text-[11px] font-medium text-brand-darker transition hover:border-brand/60 hover:bg-brand-soft/40",
            count === 0 && "opacity-70",
          )}
          title="Ver empresas que seguem este sindicato"
        >
          <Building2 className="h-3 w-3" />
          {count}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-0">
        <div className="border-b bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Empresas que seguem
          </div>
          <div className="truncate text-sm font-medium text-slate-800">
            {sindicatoNome} — {count}
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {isLoading && (
            <div className="space-y-2 p-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          )}
          {!isLoading && empresas.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-500">
              Nenhuma empresa vinculada a este sindicato.
            </div>
          )}
          {!isLoading &&
            empresas.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(
                    new CustomEvent("cct:focus-empresa", {
                      detail: { id: e.id, cnpj: e.cnpj, nome: e.nome },
                    }),
                  );
                }}
                className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50"
              >
                <div className="truncate text-sm font-medium text-slate-800">
                  {e.nome || "(sem nome)"}
                </div>
                <div className="truncate font-mono text-[11px] text-slate-500">
                  {e.codigo || "—"} · {e.cnpj || "—"}
                </div>
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const STATUS_PRODUCAO: ResumoStatus[] = [
  "nao_iniciado",
  "em_andamento",
  "em_conferencia",
  "erro",
];

export default function EsteiraResumosView({
  isAdmin = false,
  getAdminCode = () => null,
}: {
  isAdmin?: boolean;
  getAdminCode?: () => string | null;
} = {}) {
  const qc = useQueryClient();
  // no-op anchor
  const { data: itens = [], isLoading, error } = useQuery({
    queryKey: ["esteira"],
    queryFn: fetchEsteira,
    staleTime: 30_000,
  });
  const { data: sindicatos = [] } = useQuery<Sindicato[]>({
    queryKey: ["sindicatos"],
    queryFn: fetchSindicatos,
    staleTime: 60_000,
  });

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<ResumoStatus | "__all__">("__all__");
  const [filtroResp, setFiltroResp] = useState<string>("__all__");
  const [filtroAno, setFiltroAno] = useState<string>("__all__");
  const [novoOpen, setNovoOpen] = useState(false);
  // Admin entra em "Em produção"; usuários externos entram em "Publicados".
  const [aba, setAba] = useState<"nao_publicados" | "publicados">(
    isAdmin ? "nao_publicados" : "publicados",
  );
  const [histAlvo, setHistAlvo] = useState<EsteiraItem | null>(null);
  const [painelAlvo, setPainelAlvo] = useState<EsteiraItem | null>(null);
  const [confirmarPublicacao, setConfirmarPublicacao] = useState<EsteiraItem | null>(null);
  const [respConfirmado, setRespConfirmado] = useState<Record<string, boolean>>({});
  const [reabrirAlvo, setReabrirAlvo] = useState<EsteiraItem | null>(null);
  const [motivoReabertura, setMotivoReabertura] = useState("");

  const srvStatus = useServerFn(alterarStatusEsteira);
  const srvResp = useServerFn(alterarResponsavelEsteira);
  const srvRemover = useServerFn(removerItemEsteira);
  const srvReabrir = useServerFn(reabrirResumoPublicado);

  function exigirCodigo(): string {
    const code = getAdminCode();
    if (!code) throw new Error("Ative o modo administrador para executar esta ação.");
    return code;
  }

  const counts = useMemo(() => {
    const c: Record<ResumoStatus, number> = {
      nao_iniciado: 0,
      em_andamento: 0,
      em_conferencia: 0,
      publicado: 0,
      erro: 0,
    };
    for (const it of itens) c[it.status] += 1;
    return c;
  }, [itens]);

  const anosDisponiveis = useMemo(
    () => Array.from(new Set(itens.map((i) => i.ano))).sort((a, b) => b - a),
    [itens],
  );
  const responsaveisDisponiveis = useMemo(
    () =>
      Array.from(
        new Set(itens.map((i) => i.responsavel).filter((v): v is string => !!v)),
      ).sort(),
    [itens],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (filtroStatus !== "__all__" && i.status !== filtroStatus) return false;
      if (filtroResp !== "__all__" && (i.responsavel ?? "") !== filtroResp) return false;
      if (filtroAno !== "__all__" && String(i.ano) !== filtroAno) return false;
      if (!q) return true;
      return (
        i.sindicatoNome.toLowerCase().includes(q) ||
        i.sindicatoCodigo.toLowerCase().includes(q) ||
        i.sindicatoCnpj.toLowerCase().includes(q)
      );
    });
  }, [itens, busca, filtroStatus, filtroResp, filtroAno]);

  // Ordenação padrão: urgência crescente (mais próximo do prazo primeiro), atrasados/pendentes no topo.
  const ordenados = useMemo(() => {
    const arr = filtrados.filter((i) =>
      aba === "publicados" ? i.status === "publicado" : i.status !== "publicado",
    );
    arr.sort((a, b) => {
      if (aba === "publicados") {
        return (b.publicado_em ?? "").localeCompare(a.publicado_em ?? "");
      }
      const da = diasUrgencia(a);
      const db = diasUrgencia(b);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
    return arr;
  }, [filtrados, aba]);

  const naoPublicadosCount = useMemo(
    () => itens.filter((i) => i.status !== "publicado").length,
    [itens],
  );
  const prontosNaoPublicados = useMemo(
    () =>
      itens.filter((i) => i.status !== "publicado" && (i.oficial_path || i.resumo_docx_path))
        .length,
    [itens],
  );

  const advanceMut = useMutation({
    mutationFn: async ({ item, para }: { item: EsteiraItem; para: ResumoStatus }) =>
      srvStatus({ data: { code: exigirCodigo(), resumo_id: item.id, para } }),
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["esteira"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao atualizar"),
  });

  const publicarMut = useMutation({
    mutationFn: async (item: EsteiraItem) =>
      srvStatus({
        data: {
          code: exigirCodigo(),
          resumo_id: item.id,
          para: "publicado",
          publicado_por: item.responsavel ?? RESPONSAVEL_PADRAO,
        },
      }),
    onSuccess: ({ empresasCount }) => {
      toast.success(
        `Publicado. Sindicato e ${empresasCount} empresa(s) marcados como resumo e convenção homologada publicados.`,
      );
      qc.invalidateQueries({ queryKey: ["esteira"] });
      qc.invalidateQueries({ queryKey: ["sindicatos"] });
      qc.invalidateQueries({ queryKey: ["empresas"] });
      qc.invalidateQueries({ queryKey: ["registros"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao publicar"),
  });

  const respMut = useMutation({
    mutationFn: async ({ id, responsavel }: { id: string; responsavel: string | null }) =>
      srvResp({ data: { code: exigirCodigo(), resumo_id: id, responsavel } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["esteira"] }),
    onError: (e: Error) => toast.error(e.message ?? "Falha ao atualizar responsável"),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) =>
      srvRemover({ data: { code: exigirCodigo(), resumo_id: id } }),
    onSuccess: () => {
      toast.success("Item removido");
      qc.invalidateQueries({ queryKey: ["esteira"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao remover"),
  });

  const reabrirMut = useMutation({
    mutationFn: async ({ item, motivo }: { item: EsteiraItem; motivo: string }) =>
      srvReabrir({
        data: {
          code: exigirCodigo(),
          resumo_id: item.id,
          motivo,
          usuario: item.responsavel ?? RESPONSAVEL_PADRAO,
        },
      }),
    onSuccess: () => {
      toast.success("Resumo reaberto para correção. Ficou indisponível aos usuários.");
      setReabrirAlvo(null);
      setMotivoReabertura("");
      qc.invalidateQueries({ queryKey: ["esteira"] });
      qc.invalidateQueries({ queryKey: ["sindicatos"] });
      qc.invalidateQueries({ queryKey: ["empresas"] });
      qc.invalidateQueries({ queryKey: ["registros"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao reabrir"),
  });

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Falha ao carregar a esteira.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho + ação */}
      <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-darker">
            <ListChecks className="h-5 w-5" /> Esteira de Resumos CCT
          </h2>
          <p className="text-xs text-slate-500">
            Cada linha representa o resumo de um sindicato para um ano vigente.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setNovoOpen(true)} className="bg-brand hover:bg-brand-dark">
            <Plus className="mr-1 h-4 w-4" /> Novo item da esteira
          </Button>
        )}
      </div>

      {/* Abas: não publicados x publicados */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={() => {
            setAba("nao_publicados");
            setFiltroStatus("__all__");
          }}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition",
            aba === "nao_publicados"
              ? "bg-brand text-white"
              : "text-slate-600 hover:bg-slate-100",
          )}
        >
          Em produção
          <Badge className="bg-white/20 text-inherit">{naoPublicadosCount}</Badge>
        </button>
        <button
          type="button"
          onClick={() => {
            setAba("publicados");
            setFiltroStatus("__all__");
          }}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition",
            aba === "publicados"
              ? "bg-brand text-white"
              : "text-slate-600 hover:bg-slate-100",
          )}
        >
          Publicados
          <Badge className="bg-white/20 text-inherit">{counts.publicado}</Badge>
        </button>
        {isAdmin && prontosNaoPublicados > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-800">
            {prontosNaoPublicados} resumo(s) prontos aguardando publicação no Portal
          </span>
        )}
      </div>

      {/* Cards de contagem — somente na aba Em produção */}
      {isAdmin && aba === "nao_publicados" && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {STATUS_PRODUCAO.map((st) => {
            const active = filtroStatus === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() =>
                  setFiltroStatus((prev) => (prev === st ? "__all__" : st))
                }
                className={cn(
                  "rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-brand/50",
                  active && "border-brand ring-1 ring-brand/40",
                )}
              >
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {STATUS_META[st].label}
                </div>
                <div className="mt-1 text-2xl font-semibold text-brand-darker">
                  {counts[st]}
                </div>
              </button>
            );
          })}
        </div>
      )}


      {/* Filtros */}
      <div className="grid gap-3 rounded-lg border bg-white p-3 shadow-sm md:grid-cols-4">
        <div className="relative md:col-span-2">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por sindicato, código ou CNPJ…"
            className="pl-8"
          />
        </div>
        {isAdmin ? (
        <Select value={filtroResp} onValueChange={setFiltroResp}>
          <SelectTrigger>
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os responsáveis</SelectItem>
            {responsaveisDisponiveis.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        ) : null}
        <Select value={filtroAno} onValueChange={setFiltroAno}>
          <SelectTrigger>
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os anos</SelectItem>
            {anosDisponiveis.map((a) => (
              <SelectItem key={a} value={String(a)}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <Table className="min-w-[1100px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Sindicato</TableHead>
              <TableHead className="text-center">Empresas</TableHead>
              <TableHead>Data-base</TableHead>
              {isAdmin && <TableHead>Responsável</TableHead>}
              <TableHead className="text-center">Ano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Urgência</TableHead>
              <TableHead className="w-40 text-right">{isAdmin ? "Ações" : ""}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 8 : 7} className="py-8 text-center text-sm text-slate-500">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && ordenados.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 8 : 7} className="py-8 text-center text-sm text-slate-500">
                  Nenhum item na esteira.
                </TableCell>
              </TableRow>
            )}
            {ordenados.map((it) => (
              <TableRow
                key={it.id}
                className={cn(
                  "hover:bg-slate-50",
                  isAtrasado(it) && "bg-red-50/70 hover:bg-red-50",
                )}
              >
                <TableCell className="max-w-[280px]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(
                        new CustomEvent("cct:edit-sindicato", {
                          detail: { id: it.sindicato_id, nome: it.sindicatoNome },
                        }),
                      );
                    }}
                    className="block w-full truncate text-left font-medium text-slate-800 hover:text-brand-darker hover:underline"
                    title={`Editar ${it.sindicatoNome}`}
                  >
                    {it.sindicatoNome}
                  </button>
                  <div className="truncate font-mono text-[11px] text-slate-500">
                    {it.sindicatoCodigo || "—"} · {it.sindicatoCnpj || "—"}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <EmpresasPopover
                    sindicatoId={it.sindicato_id}
                    sindicatoNome={it.sindicatoNome}
                    count={it.empresasCount}
                  />
                </TableCell>
                <TableCell className="text-sm">{it.dataBase || "—"}</TableCell>
                {isAdmin && (
                <TableCell>
                  {(() => {
                    const respAtual = it.responsavel ?? RESPONSAVEL_PADRAO;
                    const usandoPadrao =
                      !it.responsavel || it.responsavel === RESPONSAVEL_PADRAO;
                    const mostrarAviso = usandoPadrao && !respConfirmado[it.id];
                    return (
                      <div>
                        <Select
                          value={respAtual}
                          onValueChange={(v) => {
                            setRespConfirmado((s) => ({ ...s, [it.id]: true }));
                            respMut.mutate({ id: it.id, responsavel: v });
                          }}
                        >
                          <SelectTrigger className="h-8 w-40 text-xs">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {RESPONSAVEIS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {mostrarAviso && (
                          <p className="mt-1 max-w-[160px] text-[10px] leading-tight text-slate-500">
                            Se outra pessoa produziu este resumo, altere o responsável.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </TableCell>
                )}
                <TableCell className="text-center font-mono text-xs">{it.ano}</TableCell>
                <TableCell>
                  {isAdmin ? (
                    <StatusBadge status={it.status} />
                  ) : it.status === "publicado" ? (
                    <StatusBadge status="publicado" />
                  ) : (
                    <span
                      title={AVISO_EM_ANALISE}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                    >
                      <Lock className="h-3 w-3 shrink-0" />
                      Em processo interno
                    </span>
                  )}
                  {isAdmin && it.erro_msg && (
                    <div className="mt-1 max-w-[200px] truncate text-[10px] text-red-600">
                      {it.erro_msg}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <UrgenciaPill item={it} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {it.status === "publicado" && (
                      <a
                        href="https://eliteconsultores.app/ControleConvencoes"
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Publicado no Portal Elite. Busque pelo código ${
                          it.sindicatoCodigo?.trim() || "(código não cadastrado)"
                        } do sindicato.`}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-brand/40 bg-brand-soft/20 px-2 text-[11px] font-medium text-brand-darker hover:bg-brand-soft/40"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Portal
                      </a>
                    )}
                    {isAdmin && (
                    <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => setPainelAlvo(it)}
                      title="Abrir painel do resumo"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8">
                          Avançar
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Próximo status</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {(NEXT_STATES[it.status] ?? []).length === 0 && (
                          <DropdownMenuItem disabled>Nenhum</DropdownMenuItem>
                        )}
                        {(NEXT_STATES[it.status] ?? []).map((s) => {
                          const bloqueado =
                            s === "publicado" && (!isAdmin || !it.oficial_path);
                          return (
                            <DropdownMenuItem
                              key={s}
                              disabled={bloqueado}
                              title={
                                bloqueado
                                  ? !isAdmin
                                    ? "Somente a administração marca como publicado."
                                    : "Envie a versão oficial revisada antes de marcar como publicado."
                                  : undefined
                              }
                              onClick={() => {
                                if (bloqueado) return;
                                if (s === "publicado") {
                                  setConfirmarPublicacao(it);
                                } else {
                                  advanceMut.mutate({ item: it, para: s });
                                }
                              }}
                            >
                              → {STATUS_META[s].label}
                            </DropdownMenuItem>
                          );
                        })}
                        <DropdownMenuSeparator />
                        {it.status === "publicado" && (
                          <DropdownMenuItem
                            className="text-amber-700"
                            onClick={() => {
                              setMotivoReabertura("");
                              setReabrirAlvo(it);
                            }}
                          >
                            <History className="mr-2 h-3.5 w-3.5" /> Reabrir para correção
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setHistAlvo(it)}>
                          <History className="mr-2 h-3.5 w-3.5" /> Ver histórico
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remover este item da esteira? (${it.sindicatoNome} · ${it.ano})`,
                              )
                            ) {
                              delMut.mutate(it.id);
                            }
                          }}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </>
                    )}
                    {!isAdmin && it.status === "publicado" && null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <NovoItemDialog
        open={novoOpen}
        sindicatos={sindicatos}
        getAdminCode={getAdminCode}
        onClose={() => setNovoOpen(false)}
        onCreated={() => {
          setNovoOpen(false);
          qc.invalidateQueries({ queryKey: ["esteira"] });
        }}
      />

      <HistoricoDialog item={histAlvo} onClose={() => setHistAlvo(null)} />

      <PainelGeracaoDialog
        item={painelAlvo}
        isAdmin={isAdmin}
        getAdminCode={getAdminCode}
        onClose={() => setPainelAlvo(null)}
      />

      <Dialog
        open={!!confirmarPublicacao}
        onOpenChange={(o) => !o && setConfirmarPublicacao(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar publicação</DialogTitle>
            <DialogDescription>
              O resumo e a convenção homologada já foram publicados manualmente no
              Portal Elite (tipo de convenção, data e código preenchidos)?
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-slate-600">
            Ao confirmar, registramos a data e o responsável, e o item passa para a
            aba <strong>Publicados no portal</strong>.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarPublicacao(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={publicarMut.isPending}
              onClick={() => {
                const it = confirmarPublicacao;
                if (!it) return;
                publicarMut.mutate(it, {
                  onSettled: () => setConfirmarPublicacao(null),
                });
              }}
            >
              {publicarMut.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              Sim, publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reabrirAlvo} onOpenChange={(o) => !o && setReabrirAlvo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reabrir para correção</DialogTitle>
            <DialogDescription>
              Isto tornará o resumo indisponível para os usuários até nova publicação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Motivo da reabertura</Label>
            <Input
              value={motivoReabertura}
              onChange={(e) => setMotivoReabertura(e.target.value)}
              placeholder="Ex.: correção de valores da cláusula 7"
            />
            <p className="text-[11px] text-slate-500">
              O status volta para <strong>Em conferência</strong> e o motivo fica
              registrado no histórico.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReabrirAlvo(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              disabled={reabrirMut.isPending || motivoReabertura.trim().length < 3}
              onClick={() => {
                if (!reabrirAlvo) return;
                reabrirMut.mutate({ item: reabrirAlvo, motivo: motivoReabertura.trim() });
              }}
            >
              {reabrirMut.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NovoItemDialog({
  open,
  sindicatos,
  getAdminCode,
  onClose,
  onCreated,
}: {
  open: boolean;
  sindicatos: Sindicato[];
  getAdminCode: () => string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [sindId, setSindId] = useState<string>("");
  const [ano, setAno] = useState<number>(new Date().getFullYear());
  const [responsavel, setResponsavel] = useState<string>(RESPONSAVEL_PADRAO);
  const [saving, setSaving] = useState(false);
  const criarSrv = useServerFn(criarItemEsteira);

  const criar = async () => {
    if (!sindId) {
      toast.error("Selecione um sindicato");
      return;
    }
    if (!ano || ano < 1900 || ano > 2999) {
      toast.error("Informe um ano válido.");
      return;
    }
    setSaving(true);
    try {
      const code = getAdminCode();
      if (!code) throw new Error("Ative o modo administrador para criar itens.");
      await criarSrv({
        data: { code, sindicato_id: sindId, ano, responsavel },
      });
      toast.success("Item adicionado à esteira");
      setSindId("");
      setAno(new Date().getFullYear());
      setResponsavel(RESPONSAVEL_PADRAO);
      onCreated();
    } catch (e) {
      console.error("[NovoItemDialog] criar falhou:", e);
      const err = e as { code?: string; message?: string };
      const sindNome =
        sindicatos.find((s) => s.id === sindId)?.nome ?? "sindicato";
      if (
        err?.code === "DUPLICATE_ESTEIRA_ITEM" ||
        err?.code === "23505" ||
        (err?.message ?? "").includes("duplicate") ||
        (err?.message ?? "").includes("resumos_cct_sindicato_id_ano")
      ) {
        toast.error(
          `Já existe item da esteira para ${sindNome} · ${ano}.`,
        );
      } else {
        toast.error(`Falha ao criar: ${formatSupabaseError(e)}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo item da esteira</DialogTitle>
          <DialogDescription>
            Escolha o sindicato e o ano do ciclo a acompanhar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Sindicato</Label>
            <SindicatoCombobox
              sindicatos={sindicatos}
              value={sindId}
              onChange={setSindId}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Digite o código (ex.: "48") ou parte do nome.
            </p>
          </div>
          <div className="grid w-full grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <Label>Ano vigente</Label>
              <Input
                type="number"
                value={ano}
                onChange={(e) => setAno(Number(e.target.value) || ano)}
                className="w-full"
              />
            </div>
            <div className="min-w-0">
              <Label>Responsável</Label>
              <Select value={responsavel} onValueChange={setResponsavel}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {RESPONSAVEIS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={criar} disabled={saving} className="bg-brand hover:bg-brand-dark">
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoricoDialog({
  item,
  onClose,
}: {
  item: EsteiraItem | null;
  onClose: () => void;
}) {
  const { data: hist = [], isLoading } = useQuery({
    queryKey: ["esteira", "historico", item?.id],
    queryFn: () => fetchHistorico(item!.id),
    enabled: !!item,
  });
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Histórico de status</DialogTitle>
          <DialogDescription>
            {item?.sindicatoNome} · Ano {item?.ano}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {isLoading && <div className="text-sm text-slate-500">Carregando…</div>}
          {!isLoading && hist.length === 0 && (
            <div className="text-sm text-slate-500">Nenhuma transição registrada.</div>
          )}
          {hist.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
            >
              <div>
                <div className="flex items-center gap-2">
                  {h.status_de ? (
                    <StatusBadge status={h.status_de} />
                  ) : (
                    <span className="text-slate-400">criação</span>
                  )}
                  <span className="text-slate-400">→</span>
                  <StatusBadge status={h.status_para} />
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-500">
                {new Date(h.created_at).toLocaleString("pt-BR")}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PainelGeracaoDialog({
  item,
  isAdmin,
  getAdminCode,
  onClose,
}: {
  item: EsteiraItem | null;
  isAdmin: boolean;
  getAdminCode: () => string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const gerar = useServerFn(gerarResumoCct);
  const download = useServerFn(getResumoDownloadUrl);
  const enviarOficial = useServerFn(uploadResumoOficial);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const { data: versoes = [] } = useQuery({
    queryKey: ["esteira", "versoes", item?.id],
    queryFn: () => fetchVersoes(item!.id),
    enabled: !!item,
  });

  function readAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error ?? new Error("Falha ao ler arquivo"));
      fr.onload = () => {
        const result = fr.result;
        if (typeof result !== "string") return reject(new Error("Leitura inválida"));
        const idx = result.indexOf(",");
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      fr.readAsDataURL(file);
    });
  }

  function onSelectFile(f: File | null) {
    if (!f) return;
    const nome = f.name.toLowerCase();
    const okExt =
      nome.endsWith(".pdf") || nome.endsWith(".docx") || nome.endsWith(".doc");
    const okMime =
      f.type === "application/pdf" ||
      f.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      f.type === "application/msword";
    if (!okExt && !okMime) {
      toast.error("Envie um arquivo PDF ou Word (.docx / .doc).");
      return;
    }
    setPdfFile(f);
  }

  async function handleGerar() {
    if (!item) return;
    if (!pdfFile) {
      toast.error("Selecione o arquivo da Convenção Homologada antes de gerar.");
      return;
    }
    setGenerating(true);
    toast.info("Lendo arquivo e gerando resumo com IA — pode levar até 60s...");
    try {
      const pdf_base64 = await readAsBase64(pdfFile);
      await gerar({
        data: { resumo_id: item.id, pdf_base64, pdf_nome: pdfFile.name },
      });
      toast.success("Resumo gerado! Status → Em conferência.");
      setPdfFile(null);
      qc.invalidateQueries({ queryKey: ["esteira"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na geração");
      qc.invalidateQueries({ queryKey: ["esteira"] });
    } finally {
      setGenerating(false);
    }
  }

  const filename = item
    ? nomeArquivoResumo({
        sindicatoNome: item.sindicatoNome,
        codigo: item.sindicatoCodigo,
        ano: item.ano,
      })
    : "";

  async function baixar(tipo: "rascunho" | "oficial", path?: string) {
    if (!item) return;
    try {
      const { url } = await download({
        data: {
          resumo_id: item.id,
          tipo,
          filename,
          path,
          code: getAdminCode() ?? undefined,
        },
      });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar link");
    }
  }

  async function handleUploadOficial(f: File | null) {
    if (!item || !f) return;
    if (!f.name.toLowerCase().endsWith(".docx")) {
      toast.error("A versão oficial deve ser um arquivo .docx.");
      return;
    }
    const code = getAdminCode();
    if (!code) {
      toast.error("Ative o modo admin para enviar a versão oficial.");
      return;
    }
    setEnviando(true);
    try {
      const base64 = await readAsBase64(f);
      await enviarOficial({
        data: {
          code,
          resumo_id: item.id,
          nome: f.name,
          base64,
          criado_por: item.responsavel ?? RESPONSAVEL_PADRAO,
        },
      });
      toast.success("Versão oficial registrada.");
      qc.invalidateQueries({ queryKey: ["esteira"] });
      qc.invalidateQueries({ queryKey: ["esteira", "versoes", item.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar versão oficial");
    } finally {
      setEnviando(false);
    }
  }

  const hasDocx = !!item?.resumo_docx_path;
  const hasOficial = !!item?.oficial_path;
  const publicado = item?.status === "publicado";

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Painel do resumo</DialogTitle>
          <DialogDescription>
            {item?.sindicatoNome} · Ano {item?.ano}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {publicado && <PortalBanner codigo={item?.sindicatoCodigo} />}

          {!isAdmin && !publicado && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Status: {item ? STATUS_META[item.status].label : "—"}</strong>
                <br />
                {AVISO_EM_ANALISE}
              </span>
            </div>
          )}

          {isAdmin && (
            <>
              {/* Etapa 1: seleção do arquivo da CCT */}
              <div className="rounded-md border p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <FileText className="h-4 w-4 text-brand" /> 1. Selecionar arquivo da
                  Convenção Homologada
                </div>
                <p className="mb-3 text-xs text-slate-500">
                  PDF (com texto selecionável), Word (.docx / .doc) ou o arquivo do
                  Mediador/MTE — lido em memória e <strong>não armazenado</strong>.
                </p>
                <label className="block cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                    className="hidden"
                    onChange={(e) => {
                      onSelectFile(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                    disabled={generating}
                  />
                  <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-600 hover:bg-slate-100">
                    {pdfFile ? (
                      <>
                        <FileText className="mx-auto mb-1 h-5 w-5 text-emerald-600" />
                        <div className="truncate font-medium text-slate-800">
                          {pdfFile.name}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {(pdfFile.size / 1024).toFixed(0)} KB · clique para trocar
                        </p>
                      </>
                    ) : (
                      <>
                        <Upload className="mx-auto mb-1 h-5 w-5 text-brand" />
                        <div className="font-medium text-slate-800">
                          Clique para selecionar o arquivo
                        </div>
                        <p className="mt-1 text-xs">.pdf, .docx, .doc ou Mediador/MTE</p>
                      </>
                    )}
                  </div>
                </label>
              </div>

              {/* Etapa 2: geração IA */}
              <div className="rounded-md border p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Sparkles className="h-4 w-4 text-brand" /> 2. Gerar rascunho com IA
                </div>
                {item?.erro_msg && (
                  <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    Último erro: {item.erro_msg}
                  </div>
                )}
                <Button
                  onClick={handleGerar}
                  disabled={!pdfFile || generating || item?.processando}
                  className="bg-brand hover:bg-brand/90"
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {hasDocx ? "Regenerar rascunho" : "Gerar rascunho"}
                    </>
                  )}
                </Button>
              </div>

              {/* Etapa 3: rascunho */}
              {hasDocx && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <FileText className="h-4 w-4" /> 3. Rascunho .docx (uso interno)
                  </div>
                  <Button size="sm" variant="outline" onClick={() => baixar("rascunho")}>
                    <Download className="mr-1 h-3.5 w-3.5" /> Baixar rascunho
                  </Button>
                </div>
              )}

              {/* Etapa 4: versão oficial */}
              <div className="rounded-md border border-brand/30 bg-brand-soft/10 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-darker">
                  <Upload className="h-4 w-4" /> 4. Versão oficial revisada
                </div>
                <p className="mb-3 text-xs text-slate-600">
                  Edite o rascunho fora do Hub e envie o .docx final aqui. A publicação
                  no Portal Elite continua manual — o Hub apenas guarda a versão oficial
                  e controla o status.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept=".docx"
                      className="hidden"
                      disabled={enviando}
                      onChange={(e) => {
                        handleUploadOficial(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                    <span className="inline-flex cursor-pointer items-center rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark">
                      {enviando ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="mr-1 h-3.5 w-3.5" />
                      )}
                      Enviar versão oficial (.docx)
                    </span>
                  </label>
                  {hasOficial && (
                    <Button size="sm" variant="outline" onClick={() => baixar("oficial")}>
                      <Download className="mr-1 h-3.5 w-3.5" /> Baixar versão oficial
                    </Button>
                  )}
                </div>
                {hasOficial && (
                  <p className="mt-2 text-[11px] text-slate-600">
                    Última versão oficial: {item?.oficial_nome} ·{" "}
                    {item?.oficial_em
                      ? new Date(item.oficial_em).toLocaleString("pt-BR")
                      : "—"}
                  </p>
                )}
              </div>

              {/* Histórico de versões */}
              {versoes.length > 0 && (
                <div className="rounded-md border p-4">
                  <div className="mb-2 text-sm font-semibold text-slate-800">
                    Histórico de versões
                  </div>
                  <div className="space-y-1">
                    {versoes.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between rounded border px-2 py-1.5 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-800">
                            v{v.versao} · {v.nome || "(sem nome)"}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {v.origem === "oficial" ? "Versão oficial" : "Rascunho IA"} ·{" "}
                            {new Date(v.created_at).toLocaleString("pt-BR")}
                            {v.criado_por ? ` · ${v.criado_por}` : ""}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={() => baixar("oficial", v.path)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!isAdmin && publicado && (
            <div className="rounded-md border p-4 text-xs text-slate-600">
              O documento oficial está publicado no Portal Elite. Use o botão acima para
              abrir o portal e buscar pelo código do sindicato.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
