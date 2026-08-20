import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  BadgeCheck,
  FileText,
  ShieldAlert,
  Building2,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Landmark,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { addMonths, format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MESES } from "./types";
import type { Registro } from "./types";
import {
  MES_INDEX,
  diasDesde,
  prazoOposicaoInfo,
} from "./CctHub";
import {
  fetchSindicatos,
  fetchEmpresasDoSindicato,
  type Sindicato,
  type EmpresaVinculada,
} from "./sindicatos-storage";

export default function DashboardView({
  registros,
  onGoList,
}: {
  registros: Registro[];
  onGoList: () => void;
}) {
  // onGoList mantido para compatibilidade de API do componente
  void onGoList;

  const { data: sindicatos = [], isLoading: loadingSind } = useQuery({
    queryKey: ["sindicatos-dashboard"],
    queryFn: fetchSindicatos,
  });

  // Sindicatos filtrados: só entram os que têm ao menos uma empresa (registro)
  // que passou nos filtros da sidebar. Vínculo: Registro.sindicatoCodigo ↔ Sindicato.codigo.
  const sindicatosFiltrados = useMemo(() => {
    const codigos = new Set(
      registros
        .map((r) => (r.sindicatoCodigo ?? "").trim())
        .filter(Boolean),
    );
    if (codigos.size === 0) return [];
    return sindicatos.filter((s) => codigos.has((s.codigo ?? "").trim()));
  }, [registros, sindicatos]);

  return (
    <div className="space-y-8">
      <PanoramaConvencoes sindicatos={sindicatosFiltrados} loading={loadingSind} />
      <PanoramaCobertura registros={registros} sindicatos={sindicatosFiltrados} />
    </div>
  );
}

/* ============================================================
   SEÇÃO A — Panorama de Convenções (grão: sindicato)
   ============================================================ */

function normalizeStatus(s: string | null | undefined): "vigente" | "negociacao" | "pendente" {
  if (s === "vigente" || s === "negociacao" || s === "pendente") return s;
  return "pendente";
}

function SectionHeader({
  title,
  hint,
  icon: Icon,
}: {
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-brand text-white">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        <p className="text-[11px] text-slate-500">{hint}</p>
      </div>
    </div>
  );
}

function PanoramaConvencoes({
  sindicatos,
  loading,
}: {
  sindicatos: Sindicato[];
  loading: boolean;
}) {
  const metrics = useMemo(() => {
    let vig = 0, neg = 0, pen = 0;
    for (const s of sindicatos) {
      const st = normalizeStatus(s.status);
      if (st === "vigente") vig++;
      else if (st === "negociacao") neg++;
      else pen++;
    }
    return { total: sindicatos.length, vigentes: vig, negociacao: neg, pendentes: pen };
  }, [sindicatos]);

  return (
    <section>
      <SectionHeader
        title="Panorama de Convenções"
        hint="Indicadores por sindicato/convenção"
        icon={Landmark}
      />
      <SindicatoMetricsRow metrics={metrics} sindicatos={sindicatos} />
      <div className="mt-3">
        <PublicacaoSindicatoCard sindicatos={sindicatos} />
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <RadarOposicaoSindicatos sindicatos={sindicatos} />
        <DistribuicaoMensalSindicatos sindicatos={sindicatos} />
        <VigenciaVencidaSindicatos sindicatos={sindicatos} />
        <ContatoAlertaSindicatos sindicatos={sindicatos} />
      </div>
      {loading && sindicatos.length === 0 && (
        <div className="mt-3 text-xs text-slate-400">Carregando sindicatos…</div>
      )}
    </section>
  );
}

function SindicatoMetricsRow({
  metrics,
  sindicatos,
}: {
  metrics: { total: number; vigentes: number; negociacao: number; pendentes: number };
  sindicatos: Sindicato[];
}) {
  const [modal, setModal] = useState<null | {
    key: "todos" | "vigente" | "negociacao" | "pendente";
    title: string;
  }>(null);

  const filtered = useMemo(() => {
    if (!modal) return [];
    if (modal.key === "todos") return sindicatos;
    return sindicatos.filter((s) => normalizeStatus(s.status) === modal.key);
  }, [modal, sindicatos]);

  const cards: Array<{
    label: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    wrap: string;
    key: "todos" | "vigente" | "negociacao" | "pendente";
    title: string;
  }> = [
    { key: "todos", label: "Convenções cadastradas", value: metrics.total, icon: Landmark, wrap: "bg-brand text-white", title: "Todas as convenções cadastradas" },
    { key: "vigente", label: "Convenções vigentes", value: metrics.vigentes, icon: CheckCircle2, wrap: "bg-emerald-600 text-white", title: "Convenções vigentes" },
    { key: "negociacao", label: "Convenções em negociação", value: metrics.negociacao, icon: Clock, wrap: "bg-amber-500 text-white", title: "Convenções em negociação" },
    { key: "pendente", label: "Convenções pendentes / expiradas", value: metrics.pendentes, icon: AlertTriangle, wrap: "bg-red-600 text-white", title: "Convenções pendentes / expiradas" },
  ];
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            role="button"
            onClick={() => setModal({ key: c.key, title: c.title })}
            className={cn(
              "flex items-center gap-3 rounded-lg p-4 shadow-sm text-left transition hover:brightness-110 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand cursor-pointer",
              c.wrap,
            )}
          >
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-white/20">
              <c.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-3xl font-bold leading-none">{c.value}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide">{c.label}</div>
            </div>
          </button>
        ))}
      </div>
      <SindicatoStatusDialog
        open={!!modal}
        title={modal?.title ?? ""}
        list={filtered}
        onClose={() => setModal(null)}
      />
    </>
  );
}

function ChartCard({
  title,
  hint,
  children,
  right,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-800">{title}</h3>
          {hint && <p className="truncate text-[11px] text-slate-500">{hint}</p>}
        </div>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function SindicatoBucketDialog({
  open,
  title,
  list,
  onClose,
}: {
  open: boolean;
  title: string;
  list: Sindicato[];
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((s) =>
      [s.nome, s.codigo, s.cnpj].filter(Boolean).some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [q, list]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{list.length} sindicato(s) nesta janela</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar sindicato, código, CNPJ…"
            className="pl-8"
          />
        </div>
        <ul className="mt-3 divide-y rounded-md border bg-white">
          {filtered.length === 0 ? (
            <li className="p-4 text-center text-sm text-slate-500">Nenhum sindicato encontrado</li>
          ) : (
            filtered.map((s) => (
              <li key={s.id} className="min-w-0 px-3 py-2 text-sm">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(
                      new CustomEvent("cct:edit-sindicato", { detail: { id: s.id } }),
                    );
                    onClose();
                  }}
                  className="block w-full min-w-0 truncate text-left font-medium text-slate-800 hover:text-brand-darker hover:underline"
                  title={`Editar ${s.nome || "sindicato"}`}
                >
                  {s.nome || "—"}
                </button>
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {s.empresasCount} {s.empresasCount === 1 ? "empresa afetada" : "empresas afetadas"} · {s.codigo || "sem código"}
                  {s.dataBase ? ` · Data-base ${s.dataBase}` : ""}
                  {s.vigenciaFim ? ` · Vigência ${s.vigenciaFim}` : ""}
                </div>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function EmpresaListDialog({
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
  const [page, setPage] = useState(1);
  const debounced = useDebounced(q, 300);

  useEffect(() => {
    if (!open) {
      setQ("");
      setPage(1);
    }
  }, [open]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  const filtered = useMemo(() => {
    const term = debounced.trim().toLowerCase();
    if (!term) return list;
    return list.filter((r) =>
      [r.empresaNome, r.empresaCodigo, r.empresaCnpj, r.sindicatoNome, r.responsavel]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [debounced, list]);

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{list.length} empresa(s)</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar empresa, CNPJ, sindicato, responsável…"
            className="pl-8"
          />
        </div>
        <div className="mt-2 flex-1 overflow-y-auto rounded-md border bg-white">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              Nenhuma empresa nesta seleção.
            </div>
          ) : (
            <div className="space-y-2 p-2">
              {pageItems.map((r) => (
                <div key={r.id} className="rounded-md border bg-white p-3 text-sm">
                  <div className="font-semibold text-slate-800">{r.empresaNome || "—"}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {[r.empresaCodigo, r.empresaCnpj].filter(Boolean).join(" · ") || "—"}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    Sindicato:{" "}
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
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>Funcionários: {r.funcionariosContemplados ?? 0}</span>
                    <span>Responsável: {r.responsavel || "—"}</span>
                    {r.status && <span>Status: {r.status}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {filtered.length > pageSize && (
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
            <span>
              Mostrando {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, filtered.length)} de {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span>
                Página {currentPage} de {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

function EmpresasVinculadasList({ sindicatoId }: { sindicatoId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["empresas-do-sindicato", sindicatoId],
    queryFn: () => fetchEmpresasDoSindicato(sindicatoId),
  });
  if (isLoading) return <div className="px-3 py-2 text-xs text-slate-500">Carregando empresas…</div>;
  if (error) return <div className="px-3 py-2 text-xs text-red-600">Erro ao carregar empresas.</div>;
  const empresas = data ?? [];
  if (empresas.length === 0)
    return <div className="px-3 py-2 text-xs text-slate-500">Nenhuma empresa vinculada.</div>;
  return (
    <ul className="divide-y rounded-md border bg-slate-50">
      {empresas.map((e: EmpresaVinculada) => (
        <li key={e.id} className="px-3 py-1.5 text-xs">
          <div className="font-medium text-slate-800">{e.nome || "—"}</div>
          <div className="text-[11px] text-slate-500">
            {[e.cidade, e.uf].filter(Boolean).join("/") || "—"}
            {e.responsavel ? ` · Resp.: ${e.responsavel}` : ""}
            {e.codigo ? ` · Cód. ${e.codigo}` : ""}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SindicatoStatusDialog({
  open,
  title,
  list,
  onClose,
}: {
  open: boolean;
  title: string;
  list: Sindicato[];
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const debounced = useDebounced(q, 300);

  useEffect(() => {
    if (!open) {
      setQ("");
      setPage(1);
      setExpanded(new Set());
    }
  }, [open]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  const filtered = useMemo(() => {
    const term = debounced.trim().toLowerCase();
    if (!term) return list;
    return list.filter((s) =>
      [s.nome, s.codigo, s.cnpj]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [debounced, list]);

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {list.length} {list.length === 1 ? "convenção" : "convenções"} nesta lista
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome do sindicato, código ou CNPJ…"
            className="pl-8"
          />
        </div>
        <div className="mt-2 flex-1 overflow-y-auto rounded-md border bg-white">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">Nenhum resultado</div>
          ) : (
            <ul className="divide-y">
              {pageItems.map((s) => {
                const isOpen = expanded.has(s.id);
                return (
                  <li key={s.id} className="px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-800">{s.nome || "—"}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                          <span>Cód. {s.codigo || "—"}</span>
                          {s.cnpj && <span>CNPJ {s.cnpj}</span>}
                          {s.dataBase && <span>Data-base {s.dataBase}</span>}
                          {(s.vigenciaInicio || s.vigenciaFim) && (
                            <span>
                              Vigência {s.vigenciaInicio || "—"} → {s.vigenciaFim || "—"}
                            </span>
                          )}
                          {s.prazoOposicao && <span>Prazo oposição {s.prazoOposicao}</span>}
                        </div>
                        <div className="mt-1 text-[11px] font-semibold text-brand">
                          {s.empresasCount} {s.empresasCount === 1 ? "empresa vinculada" : "empresas vinculadas"}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggle(s.id)}
                        className="h-7 shrink-0 px-2 text-xs"
                      >
                        {isOpen ? "Ocultar empresas" : "Ver empresas"}
                      </Button>
                    </div>
                    {isOpen && (
                      <div className="mt-2">
                        <EmpresasVinculadasList sindicatoId={s.id} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {filtered.length > pageSize && (
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
            <span>
              Mostrando {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, filtered.length)} de {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span>
                Página {currentPage} de {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RadarOposicaoSindicatos({ sindicatos }: { sindicatos: Sindicato[] }) {
  const [modal, setModal] = useState<{ label: string; list: Sindicato[] } | null>(null);
  const [month, setMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const { buckets, byDay } = useMemo(() => {
    const groups = [
      { key: "critico", label: "< 5 dias", short: "<5d", tone: "bg-orange-500 animate-blink-orange", bar: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", list: [] as Sindicato[] },
      { key: "atencao", label: "até 15 dias", short: "≤15d", tone: "bg-amber-500", bar: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", list: [] as Sindicato[] },
      { key: "aberto", label: "16-30 dias", short: "16-30d", tone: "bg-sky-500", bar: "bg-sky-500", text: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200", list: [] as Sindicato[] },
      { key: "fechado", label: "vencida", short: "vencida", tone: "bg-red-500", bar: "bg-red-500", text: "text-red-700", bg: "bg-red-50", border: "border-red-200", list: [] as Sindicato[] },
    ];
    const byDay = new Map<string, Sindicato[]>();
    for (const s of sindicatos) {
      const info = prazoOposicaoInfo(s.prazoOposicao);
      const dias = info.diasRestantes;
      if (dias === null) continue;
      if (dias < 0) groups[3].list.push(s);
      else if (dias <= 5) groups[0].list.push(s);
      else if (dias <= 15) groups[1].list.push(s);
      else if (dias <= 30) groups[2].list.push(s);
      const key = s.prazoOposicao;
      const entry = byDay.get(key);
      if (entry) entry.push(s);
      else byDay.set(key, [s]);
    }
    return { buckets: groups, byDay };
  }, [sindicatos]);

  const total = buckets.reduce((a, b) => a + b.list.length, 0);

  // Cor de maior urgência por dia para o calendário
  const dayModifiers = useMemo(() => {
    const mods: Record<"critico" | "atencao" | "aberto" | "fechado", Date[]> = {
      critico: [],
      atencao: [],
      aberto: [],
      fechado: [],
    };
    const priority: Record<string, number> = { critico: 0, atencao: 1, aberto: 2, fechado: 3 };
    for (const [key, list] of byDay) {
      let best: keyof typeof mods = "fechado";
      let bestP = 99;
      for (const s of list) {
        const d = prazoOposicaoInfo(s.prazoOposicao).diasRestantes;
        if (d === null) continue;
        const b: keyof typeof mods =
          d < 0 ? "fechado" : d <= 5 ? "critico" : d <= 15 ? "atencao" : "aberto";
        if (priority[b] < bestP) {
          bestP = priority[b];
          best = b;
        }
      }
      mods[best].push(new Date(key + "T00:00:00"));
    }
    return mods;
  }, [byDay]);

  const handleDayClick = (day: Date) => {
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const list = byDay.get(key);
    if (!list || list.length === 0) return;
    const label = day.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    setModal({ label: `Prazo em ${label}`, list });
  };

  return (
    <>
      <ChartCard
        title="Radar de prazo de oposição"
        hint="Buckets de urgência e calendário mensal dos prazos"
      >
        {total === 0 && byDay.size === 0 ? (
          <EmptyChart />
        ) : (
          <div className="grid items-stretch gap-0 md:grid-cols-[248px_1fr]">
            {/* Calendário */}
            <div className="flex flex-col items-center justify-center py-0.5 pr-4">
              {/* Cabeçalho custom */}
              <div className="flex w-full items-center justify-between px-1 pb-0.5">
                <button
                  type="button"
                  aria-label="Mês anterior"
                  onClick={() => setMonth((m) => subMonths(m, 1))}
                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-slate-100 text-slate-600"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-semibold text-slate-700 capitalize">
                  {format(month, "LLLL yyyy", { locale: ptBR }).replace(
                    /^./,
                    (c) => c.toUpperCase(),
                  )}
                </span>
                <button
                  type="button"
                  aria-label="Próximo mês"
                  onClick={() => setMonth((m) => addMonths(m, 1))}
                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-slate-100 text-slate-600"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <Calendar
                mode="single"
                month={month}
                onMonthChange={setMonth}
                onDayClick={handleDayClick}
                showOutsideDays
                locale={ptBR}
                hideNavigation
                modifiers={dayModifiers}
                modifiersClassNames={{
                  today: "ring-1 ring-brand ring-inset rounded-md text-slate-800 [&>span]:opacity-100",
                  critico: "!bg-orange-500 !text-white rounded-md hover:!bg-orange-600 ring-inset [&>span]:opacity-100 animate-blink-orange",
                  atencao: "!bg-amber-500 !text-white rounded-md hover:!bg-amber-600 ring-inset [&>span]:opacity-100",
                  aberto: "!bg-sky-500 !text-white rounded-md hover:!bg-sky-600 ring-inset [&>span]:opacity-100",
                  fechado: "!bg-red-500 !text-white rounded-md hover:!bg-red-600 ring-inset [&>span]:opacity-100",
                }}
                className="pointer-events-auto p-1 pt-0 [--cell-size:1.625rem] text-[11px]"
                classNames={{
                  nav: "hidden",
                  month_caption: "hidden",
                  caption_label: "hidden",
                  months: "flex flex-col gap-0",
                  month: "flex flex-col gap-0",
                  month_grid: "mt-0",
                  weekdays: "w-full mt-0",
                  weekday: "flex-1 text-[10px]",
                  week: "mt-0.5",
                }}
              />
            </div>

            {/* Buckets + legenda */}
            <div className="flex flex-col border-l pl-4">
              <div className="flex flex-1 flex-col gap-1">
                {buckets.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => b.list.length > 0 && setModal({ label: b.label, list: b.list })}
                    className={cn(
                      "flex flex-1 items-center gap-2 rounded-md border px-2 text-left text-[11px] transition-colors",
                      b.border,
                      b.bg,
                      b.list.length > 0 ? "hover:brightness-95" : "opacity-70",
                    )}
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", b.tone)} />
                    <span className={cn("flex-1 truncate font-medium", b.text)}>{b.label}</span>
                    <span className={cn("shrink-0 font-semibold tabular-nums", b.text)}>
                      {b.list.length}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t pt-2 text-[10px] text-slate-600">
                {buckets.map((b) => (
                  <span key={b.key} className="flex items-center gap-1">
                    <span className={cn("h-2 w-2 rounded-full", b.tone)} />
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </ChartCard>
      <SindicatoBucketDialog
        open={!!modal}
        title={modal ? `Oposição: ${modal.label}` : ""}
        list={modal?.list ?? []}
        onClose={() => setModal(null)}
      />
    </>
  );
}

function DistribuicaoMensalSindicatos({ sindicatos }: { sindicatos: Sindicato[] }) {
  const [modal, setModal] = useState<{ label: string; list: Sindicato[] } | null>(null);
  const data = useMemo(() => {
    const counts = MESES.map((m) => ({ mes: m.slice(0, 3), total: 0 }));
    for (const s of sindicatos) {
      const idx = s.dataBase ? MES_INDEX[s.dataBase] : undefined;
      if (idx !== undefined) counts[idx].total++;
    }
    return counts;
  }, [sindicatos]);
  const total = data.reduce((a, b) => a + b.total, 0);
  return (
    <>
      <ChartCard
        title="Distribuição mensal por data-base"
        hint={`${total} sindicato(s) com data-base definida`}
      >
        {total === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
              <XAxis dataKey="mes" fontSize={10} />
              <YAxis allowDecimals={false} fontSize={10} />
              <Tooltip />
              <Bar
                dataKey="total"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(payload: unknown) => {
                  const p = payload as { mes?: string; payload?: { mes?: string } } | undefined;
                  const mesAbbrev = p?.mes ?? p?.payload?.mes;
                  if (!mesAbbrev) return;
                  const idx = data.findIndex((d) => d.mes === mesAbbrev);
                  if (idx < 0) return;
                  const mesCompleto = MESES[idx];
                  const list = sindicatos.filter((s) => s.dataBase === mesCompleto);
                  if (list.length > 0) setModal({ label: `Data-base: ${mesCompleto}`, list });
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
      <SindicatoBucketDialog
        open={!!modal}
        title={modal ? modal.label : ""}
        list={modal?.list ?? []}
        onClose={() => setModal(null)}
      />
    </>
  );
}

type ItemTop5 = {
  id: string;
  nome: string;
  detalhe: string;
  dias: number | null;
  urgente?: boolean;
};

function fmtDataBRLocal(v: string | null | undefined): string {
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(v);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString("pt-BR");
  }
  return v;
}

function ListaTop5({
  titulo,
  itens,
  vazio,
  onSelecionar,
  extraHeader,
}: {
  titulo: string;
  itens: ItemTop5[];
  vazio: string;
  onSelecionar?: (id: string) => void;
  extraHeader?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {titulo}
        </div>
        {extraHeader}
      </div>
      {itens.length === 0 ? (
        <div className="rounded border border-dashed py-4 text-center text-xs text-slate-400">
          {vazio}
        </div>
      ) : (
        <ul className="space-y-1">
          {itens.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => onSelecionar?.(i.id)}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left transition hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-slate-700">{i.nome}</span>
                  <span className="block truncate text-[10px] text-slate-500">{i.detalhe}</span>
                </span>
                {i.dias !== null && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      i.urgente ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {i.dias}d
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VigenciaVencidaSindicatos({ sindicatos }: { sindicatos: Sindicato[] }) {
  const [months, setMonths] = useState("1");
  const [modal, setModal] = useState<{ label: string; list: Sindicato[] } | null>(null);
  const buckets = useMemo(() => {
    const b = { m1: [] as Sindicato[], m3: [] as Sindicato[], m6: [] as Sindicato[] };
    for (const s of sindicatos) {
      const d = diasDesde(s.vigenciaFim);
      if (d === null || d <= 0) continue;
      if (d > 30) b.m1.push(s);
      if (d > 90) b.m3.push(s);
      if (d > 180) b.m6.push(s);
    }
    return b;
  }, [sindicatos]);
  const data = [
    { label: "> 1 mês", value: buckets.m1.length },
    { label: "> 3 meses", value: buckets.m3.length },
    { label: "> 6 meses", value: buckets.m6.length },
  ];
  const active = months === "1" ? buckets.m1 : months === "3" ? buckets.m3 : buckets.m6;
  const top5Vencidas = useMemo<ItemTop5[]>(() => {
    return sindicatos
      .filter((s) => {
        const d = diasDesde(s.vigenciaFim);
        return d !== null && d > 0;
      })
      .sort((a, b) => (b.vigenciaFim || "").localeCompare(a.vigenciaFim || ""))
      .slice(0, 5)
      .map((s) => {
        const d = diasDesde(s.vigenciaFim);
        return {
          id: s.id,
          nome: s.nome || "—",
          detalhe: `Venceu em ${fmtDataBRLocal(s.vigenciaFim)}`,
          dias: d,
          urgente: (d ?? 0) > 90,
        };
      });
  }, [sindicatos]);
  return (
    <>
      <ChartCard
        title="Vigência ultrapassada"
        hint="Sindicatos cuja vigência-fim já passou (faixas acumulativas)"
        right={
          <div className="flex items-center gap-2">
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Acima de 1 mês</SelectItem>
                <SelectItem value="3">Acima de 3 meses</SelectItem>
                <SelectItem value="6">Acima de 6 meses</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setModal({
                  label: data.find((d) => d.label.includes(months))?.label ?? "",
                  list: active,
                })
              }
            >
              Ver lista
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="min-w-0">
            {data.every((d) => d.value === 0) ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={data} layout="vertical" margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <XAxis type="number" allowDecimals={false} fontSize={10} />
                  <YAxis type="category" dataKey="label" width={80} fontSize={10} />
                  <Tooltip />
                  <Bar dataKey="value" name="Valor" fill="#dc2626" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="min-w-0 md:border-l md:border-slate-100 md:pl-3">
            <ListaTop5
              titulo="Vencidas mais recentes"
              itens={top5Vencidas}
              vazio="Nenhuma vigência vencida."
              onSelecionar={(id) => {
                window.dispatchEvent(
                  new CustomEvent("cct:edit-sindicato", { detail: { id } }),
                );
              }}
            />
          </div>
        </div>
      </ChartCard>
      <SindicatoBucketDialog
        open={!!modal}
        title={modal?.label ?? ""}
        list={modal?.list ?? []}
        onClose={() => setModal(null)}
      />
    </>
  );
}

function ContatoAlertaSindicatos({ sindicatos }: { sindicatos: Sindicato[] }) {
  const [months, setMonths] = useState("3");
  const [modal, setModal] = useState<{ label: string; list: Sindicato[] } | null>(null);
  const [ordem, setOrdem] = useState<"recentes" | "atrasados">("recentes");
  const buckets = useMemo(() => {
    const b = { m3: [] as Sindicato[], m6: [] as Sindicato[], m12: [] as Sindicato[], sem: [] as Sindicato[] };
    for (const s of sindicatos) {
      const ref = s.dataContato || s.ultimoContacto;
      const d = diasDesde(ref);
      if (d === null) {
        b.sem.push(s);
        continue;
      }
      if (d > 90) b.m3.push(s);
      if (d > 180) b.m6.push(s);
      if (d > 365) b.m12.push(s);
    }
    return b;
  }, [sindicatos]);
  const data = [
    { label: "> 3 meses", value: buckets.m3.length },
    { label: "> 6 meses", value: buckets.m6.length },
    { label: "> 1 ano", value: buckets.m12.length },
    { label: "Sem registro", value: buckets.sem.length },
  ];
  const active =
    months === "3" ? buckets.m3 : months === "6" ? buckets.m6 : months === "12" ? buckets.m12 : buckets.sem;
  const top5Contatos = useMemo<ItemTop5[]>(() => {
    if (ordem === "recentes") {
      return sindicatos
        .map((s) => ({ s, ref: s.dataContato || s.ultimoContacto }))
        .filter(({ ref }) => !!ref && diasDesde(ref) !== null)
        .sort((a, b) => (b.ref || "").localeCompare(a.ref || ""))
        .slice(0, 5)
        .map(({ s, ref }) => {
          const d = diasDesde(ref);
          return {
            id: s.id,
            nome: s.nome || "—",
            detalhe: [s.pessoaContato, fmtDataBRLocal(ref)].filter(Boolean).join(" · "),
            dias: d,
            urgente: false,
          };
        });
    }
    // "atrasados": Sem registro no topo, depois maior tempo sem contato primeiro.
    const semRegistro: ItemTop5[] = sindicatos
      .filter((s) => {
        const ref = s.dataContato || s.ultimoContacto;
        return !ref || diasDesde(ref) === null;
      })
      .map((s) => ({
        id: s.id,
        nome: s.nome || "—",
        detalhe: "Sem registro de contato",
        dias: null,
        urgente: true,
      }));
    const comData: ItemTop5[] = sindicatos
      .map((s) => ({ s, ref: s.dataContato || s.ultimoContacto }))
      .filter(({ ref }) => !!ref && diasDesde(ref) !== null)
      .sort((a, b) => (diasDesde(b.ref) ?? 0) - (diasDesde(a.ref) ?? 0))
      .map(({ s, ref }) => {
        const d = diasDesde(ref);
        return {
          id: s.id,
          nome: s.nome || "—",
          detalhe: [s.pessoaContato, fmtDataBRLocal(ref)].filter(Boolean).join(" · "),
          dias: d,
          urgente: (d ?? 0) > 180,
        };
      });
    return [...semRegistro, ...comData].slice(0, 5);
  }, [sindicatos, ordem]);
  return (
    <>
      <ChartCard
        title="Alerta de contato com sindicato"
        hint="Sindicatos sem atualização recente do jurídico (faixas acumulativas)"
        right={
          <div className="flex items-center gap-2">
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">&gt; 3 meses</SelectItem>
                <SelectItem value="6">&gt; 6 meses</SelectItem>
                <SelectItem value="12">&gt; 1 ano</SelectItem>
                <SelectItem value="sem">Sem registro</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setModal({
                  label:
                    months === "sem"
                      ? "sem registro de contato"
                      : `> ${months === "12" ? "1 ano" : months + " meses"}`,
                  list: active,
                })
              }
            >
              Ver lista
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="min-w-0">
            {data.every((d) => d.value === 0) ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={data} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                  <XAxis dataKey="label" fontSize={10} />
                  <YAxis allowDecimals={false} fontSize={10} />
                  <Tooltip />
                  <Bar dataKey="value" name="Valor" radius={[4, 4, 0, 0]}>
                    {data.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.label === "Sem registro" ? "#dc2626" : d.label === "> 1 ano" ? "#f59e0b" : "#6366f1"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="min-w-0 md:border-l md:border-slate-100 md:pl-3">
            <ListaTop5
              titulo={ordem === "recentes" ? "Últimos contatos realizados" : "Mais atrasados"}
              itens={top5Contatos}
              vazio="Nenhum contato registrado."
              onSelecionar={(id) => {
                window.dispatchEvent(
                  new CustomEvent("cct:edit-sindicato", { detail: { id } }),
                );
              }}
              extraHeader={
                <div className="flex items-center gap-2 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setOrdem("recentes")}
                    className={cn(
                      "transition",
                      ordem === "recentes"
                        ? "font-semibold text-brand"
                        : "text-slate-400 hover:text-slate-600",
                    )}
                  >
                    Recentes
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => setOrdem("atrasados")}
                    className={cn(
                      "transition",
                      ordem === "atrasados"
                        ? "font-semibold text-brand"
                        : "text-slate-400 hover:text-slate-600",
                    )}
                  >
                    Mais atrasados
                  </button>
                </div>
              }
            />
          </div>
        </div>
      </ChartCard>
      <SindicatoBucketDialog
        open={!!modal}
        title={modal ? `Contato: ${modal.label}` : ""}
        list={modal?.list ?? []}
        onClose={() => setModal(null)}
      />
    </>
  );
}

/* ============================================================
   SEÇÃO B — Dashboard de Gestão (Empresas) (grão: empresa / funcionário)
   ============================================================ */

type CobStatus = "vigente" | "negociacao" | "pendente" | "sem";

function coberturaStatus(r: Registro, sindicatos: Sindicato[]): CobStatus {
  // status vem do sindicato via join em empresas-storage. Sem sindicato → sem convenção.
  if (!r.sindicatoNome && !r.status) return "sem";
  if (r.status === "vigente" || r.status === "negociacao" || r.status === "pendente") {
    return r.status;
  }
  // fallback improvável — tenta consultar sindicato correspondente
  const s = sindicatos.find(
    (x) => x.nome === r.sindicatoNome && x.cnpj === r.sindicatoCnpj,
  );
  if (s) return normalizeStatus(s.status);
  return "sem";
}

/**
 * Regra de bucket para empresa com múltiplos vínculos:
 *   - "sem" quando não há vínculo algum
 *   - "pendente" se ≥1 vínculo está pendente OU com vigência vencida
 *   - "negociacao" se ≥1 vínculo em negociação e nenhum pendente/vencido
 *   - "vigente" quando todos os vínculos estão vigentes
 * Uma mesma empresa pode aparecer em mais de um bucket porque contribui
 * com funcionários por vínculo — mas na contagem de empresa aparece uma vez.
 */
function bucketEmpresa(r: Registro, sindicatos: Sindicato[]): CobStatus {
  const vinc = r.sindicatos ?? [];
  if (vinc.length === 0) return coberturaStatus(r, sindicatos);
  let temPen = false;
  let temNeg = false;
  let temVig = false;
  for (const v of vinc) {
    const st = v.status || "pendente";
    const dias = diasDesde(v.vigenciaFim);
    const vencido = dias !== null && dias > 0;
    if (st === "pendente" || vencido) temPen = true;
    else if (st === "negociacao") temNeg = true;
    else if (st === "vigente") temVig = true;
  }
  if (temPen) return "pendente";
  if (temNeg) return "negociacao";
  if (temVig) return "vigente";
  return "sem";
}

function PanoramaCobertura({
  registros,
  sindicatos,
}: {
  registros: Registro[];
  sindicatos: Sindicato[];
}) {
  const [modal, setModal] = useState<{ title: string; list: Registro[] } | null>(null);

  const { stats, listas } = useMemo(() => {
    let vig = 0, neg = 0, pen = 0, sem = 0;
    let funVig = 0, funNeg = 0, funPen = 0, funSem = 0;
    const vigList: Registro[] = [];
    const negList: Registro[] = [];
    const penList: Registro[] = [];
    const semList: Registro[] = [];
    const riscoList: Registro[] = [];
    for (const r of registros) {
      const vinc = r.sindicatos ?? [];
      const bucket = bucketEmpresa(r, sindicatos);
      // Contagem de empresas por bucket (compound). Uma empresa cai em
      // exatamente UM bucket, então os cards continuam sendo empresas únicas
      // — mas a soma dos 4 cards pode não bater com o total (esperado).
      if (bucket === "vigente") { vig++; vigList.push(r); }
      else if (bucket === "negociacao") { neg++; negList.push(r); }
      else if (bucket === "pendente") { pen++; penList.push(r); }
      else { sem++; semList.push(r); }

      // Funcionários por status usam o RATEIO por vínculo (antidup).
      // Fallback: empresa sem vínculo cadastrado usa total da empresa no
      // bucket "sem" (mantém compatibilidade com dados legados).
      if (vinc.length === 0) {
        const f = Number(r.funcionariosContemplados) || 0;
        funSem += f;
      } else {
        for (const v of vinc) {
          const f = Number(v.funcionariosContemplados) || 0;
          const st = v.status || "pendente";
          const dias = diasDesde(v.vigenciaFim);
          const vencido = dias !== null && dias > 0;
          if (st === "pendente" || vencido) funPen += f;
          else if (st === "negociacao") funNeg += f;
          else if (st === "vigente") funVig += f;
          else funPen += f;
        }
      }

      // Risco: pelo menos um vínculo pendente/vencido com funcionários.
      const emRisco = vinc.some((v) => {
        const f = Number(v.funcionariosContemplados) || 0;
        if (f <= 0) return false;
        const dias = diasDesde(v.vigenciaFim);
        return v.status === "pendente" || (dias !== null && dias > 0);
      });
      if (emRisco) riscoList.push(r);
    }
    // Total de funcionários em risco = soma do rateio dos vínculos em risco.
    let risco = 0;
    for (const r of registros) {
      for (const v of r.sindicatos ?? []) {
        const f = Number(v.funcionariosContemplados) || 0;
        const dias = diasDesde(v.vigenciaFim);
        if (f > 0 && (v.status === "pendente" || (dias !== null && dias > 0))) {
          risco += f;
        }
      }
    }
    riscoList.sort((a, b) => (b.funcionariosContemplados ?? 0) - (a.funcionariosContemplados ?? 0));
    const stats = {
      total: registros.length,
      vig, neg, pen, sem,
      funVig, funNeg, funPen, funSem,
      risco,
    };
    const listas = {
      total: [...registros],
      vig: vigList,
      neg: negList,
      pen: penList,
      sem: semList,
      risco: riscoList,
    };
    return { stats, listas };
  }, [registros, sindicatos]);

  const barData = [
    { label: "Vigente", value: stats.funVig, fill: "#059669", list: listas.vig, title: "Empresas com convenção vigente" },
    { label: "Em negociação", value: stats.funNeg, fill: "#f59e0b", list: listas.neg, title: "Empresas em negociação" },
    { label: "Pendente", value: stats.funPen, fill: "#dc2626", list: listas.pen, title: "Empresas com convenção pendente" },
    { label: "Sem convenção", value: stats.funSem, fill: "#64748b", list: listas.sem, title: "Empresas sem convenção" },
  ];

  const cards: Array<{
    label: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    wrap: string;
    sub?: string;
    list: Registro[];
    title: string;
  }> = [
    { label: "Empresas cadastradas", value: stats.total, icon: Building2, wrap: "bg-brand text-white", list: listas.total, title: "Empresas cadastradas" },
    { label: "Empresas com convenção vigente", value: stats.vig, icon: CheckCircle2, wrap: "bg-emerald-600 text-white", list: listas.vig, title: "Empresas com convenção vigente" },
    { label: "Empresas em negociação", value: stats.neg, icon: Clock, wrap: "bg-amber-500 text-white", list: listas.neg, title: "Empresas em negociação" },
    { label: "Empresas com convenção pendente", value: stats.pen, icon: AlertTriangle, wrap: "bg-red-600 text-white", list: listas.pen, title: "Empresas com convenção pendente" },
    { label: "Funcionários sob convenção pendente/vencida", value: stats.risco, icon: ShieldAlert, wrap: "bg-red-50 border-2 border-red-600 text-red-700", sub: "Principal indicador de risco do DP", list: listas.risco, title: "Empresas com funcionários sob convenção pendente/vencida" },
  ];

  return (
    <section>
      <SectionHeader
        title="Dashboard de Gestão (Empresas)"
        hint="Indicadores por empresa e funcionário (herda o status do sindicato)"
        icon={Users}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            disabled={c.value === 0}
            onClick={() => c.value > 0 && setModal({ title: c.title, list: c.list })}
            className={cn(
              "flex items-center gap-3 rounded-lg p-4 shadow-sm text-left transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand",
              c.wrap,
              c.value > 0 ? "cursor-pointer hover:brightness-110 hover:shadow-md" : "opacity-60 cursor-not-allowed",
            )}
          >
            <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-md", c.wrap.includes("bg-red-50") ? "bg-red-600 text-white" : "bg-white/20")}>
              <c.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-3xl font-bold leading-none">{c.value}</div>
              <div className={cn("mt-1 text-xs font-semibold uppercase tracking-wide", c.wrap.includes("bg-red-50") && "text-red-700")}>{c.label}</div>
              {c.sub && <div className="text-[10px] text-red-600/80">{c.sub}</div>}
            </div>
          </button>
        ))}
      </div>

      {stats.sem > 0 && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <strong>{stats.sem}</strong> empresa(s) sem sindicato vinculado
          ({stats.funSem} funcionário(s)).
        </div>
      )}

      <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-800">
        <strong>Como lemos empresas com múltiplos sindicatos:</strong>{" "}
        Vigente = todos os vínculos vigentes. Pendente = pelo menos um vínculo
        pendente ou vencido. Em negociação = pelo menos um em negociação e
        nenhum pendente. Funcionários vêm do rateio por vínculo, então não são
        contados em duplicidade.
      </div>

      <div className="mt-3">
        <ChartCard
          title="Funcionários contemplados por status da convenção"
          hint="Soma agrupada pelo status do sindicato vinculado"
        >
          {barData.every((d) => d.value === 0) ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                <XAxis dataKey="label" fontSize={10} />
                <YAxis allowDecimals={false} fontSize={10} />
                <Tooltip />
                <Bar
                  dataKey="value"
                  name="Valor"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(payload: unknown) => {
                    const p = payload as { label?: string; payload?: { label?: string } } | undefined;
                    const lbl = p?.label ?? p?.payload?.label;
                    const item = barData.find((d) => d.label === lbl);
                    if (item && item.list.length > 0) {
                      setModal({ title: item.title, list: item.list });
                    }
                  }}
                >
                  {barData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="mt-3">
        <PublicacaoEmpresaCard registros={registros} />
      </div>
      <EmpresaListDialog
        open={!!modal}
        title={modal?.title ?? ""}
        list={modal?.list ?? []}
        onClose={() => setModal(null)}
      />
    </section>
  );
}

/* ============================================================
   Auxiliares
   ============================================================ */

// Legacy helpers removidos: RadarOposicaoChart/DistribuicaoMensalChart/etc. sobre registros.

function EmptyChart() {
  return (
    <div className="grid h-[220px] place-items-center text-xs text-slate-400">
      Sem dados suficientes para o gráfico
    </div>
  );
}

function PublicacaoSindicatoCard({
  sindicatos,
}: {
  sindicatos: Sindicato[];
}) {
  const [modal, setModal] = useState<{ title: string; list: Sindicato[] } | null>(null);
  const { resumoList, integraList, ambosList } = useMemo(() => {
    const resumoList: Sindicato[] = [];
    const integraList: Sindicato[] = [];
    const ambosList: Sindicato[] = [];
    for (const s of sindicatos) {
      const hasResumo = s.historicoDocumentos.some((d) => d.resumoPublicado);
      const hasIntegra = s.historicoDocumentos.some((d) => d.integraPublicada);
      if (hasResumo) resumoList.push(s);
      if (hasIntegra) integraList.push(s);
      if (hasResumo && hasIntegra) ambosList.push(s);
    }
    return { resumoList, integraList, ambosList };
  }, [sindicatos]);
  const stats: Array<{
    label: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    ring: string;
    list: Sindicato[];
  }> = [
    { label: "Convenções com Resumo publicado", value: resumoList.length, icon: FileText, ring: "text-sky-600 bg-sky-50 border-sky-200", list: resumoList },
    { label: "Convenção Homologada Publicada", value: integraList.length, icon: FileText, ring: "text-indigo-600 bg-indigo-50 border-indigo-200", list: integraList },
    { label: "Ambos publicados", value: ambosList.length, icon: BadgeCheck, ring: "text-emerald-600 bg-emerald-50 border-emerald-200", list: ambosList },
  ];
  return (
    <section>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Publicação no Portal na Palma da Mão
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {stats.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={s.value === 0}
            onClick={() => s.value > 0 && setModal({ title: s.label, list: s.list })}
            className={cn(
              "flex items-center gap-3 rounded-lg border bg-white p-4 shadow-sm text-left transition focus:outline-none focus:ring-2 focus:ring-brand",
              s.value > 0 ? "cursor-pointer hover:brightness-110 hover:shadow-md" : "opacity-60 cursor-not-allowed",
            )}
          >
            <div className={cn("grid h-11 w-11 place-items-center rounded-md border", s.ring)}>
              <s.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-3xl font-bold leading-none text-slate-800">{s.value}</div>
              <div className="mt-1 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{s.label}</div>
            </div>
          </button>
        ))}
      </div>
      <SindicatoBucketDialog
        open={!!modal}
        title={modal?.title ?? ""}
        list={modal?.list ?? []}
        onClose={() => setModal(null)}
      />
    </section>
  );
}

function PublicacaoEmpresaCard({
  registros,
}: {
  registros: Registro[];
}) {
  const [modal, setModal] = useState<{ title: string; list: Registro[] } | null>(null);
  const { resumoList, integraList, ambosList } = useMemo(() => {
    const resumoList: Registro[] = [];
    const integraList: Registro[] = [];
    const ambosList: Registro[] = [];
    for (const reg of registros) {
      const hasResumo = reg.historicoDocumentos.some((d) => d.resumoPublicado);
      const hasIntegra = reg.historicoDocumentos.some((d) => d.integraPublicada);
      if (hasResumo) resumoList.push(reg);
      if (hasIntegra) integraList.push(reg);
      if (hasResumo && hasIntegra) ambosList.push(reg);
    }
    return { resumoList, integraList, ambosList };
  }, [registros]);
  const stats: Array<{
    label: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    ring: string;
    list: Registro[];
  }> = [
    { label: "Empresas com Resumo publicado", value: resumoList.length, icon: FileText, ring: "text-sky-600 bg-sky-50 border-sky-200", list: resumoList },
    { label: "Convenção Homologada Publicada", value: integraList.length, icon: FileText, ring: "text-indigo-600 bg-indigo-50 border-indigo-200", list: integraList },
    { label: "Ambos publicados", value: ambosList.length, icon: BadgeCheck, ring: "text-emerald-600 bg-emerald-50 border-emerald-200", list: ambosList },
  ];
  return (
    <section>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Publicação no Portal na Palma da Mão
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {stats.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={s.value === 0}
            onClick={() => s.value > 0 && setModal({ title: s.label, list: s.list })}
            className={cn(
              "flex items-center gap-3 rounded-lg border bg-white p-4 shadow-sm text-left transition focus:outline-none focus:ring-2 focus:ring-brand",
              s.value > 0 ? "cursor-pointer hover:brightness-110 hover:shadow-md" : "opacity-60 cursor-not-allowed",
            )}
          >
            <div className={cn("grid h-11 w-11 place-items-center rounded-md border", s.ring)}>
              <s.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-3xl font-bold leading-none text-slate-800">{s.value}</div>
              <div className="mt-1 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{s.label}</div>
            </div>
          </button>
        ))}
      </div>
      <EmpresaListDialog
        open={!!modal}
        title={modal?.title ?? ""}
        list={modal?.list ?? []}
        onClose={() => setModal(null)}
      />
    </section>
  );
}