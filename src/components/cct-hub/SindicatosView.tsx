import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  Copy,
  Download,
  FileText,
  Pencil,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  fetchEmpresasDoSindicato,
  fetchSindicatos,
  type EmpresaVinculada,
  type Sindicato,
} from "./sindicatos-storage";
import { getDocumentoSignedUrl } from "./storage";
import { PubChip } from "./CctHub";
import { PortalBanner, SindicatoEditor, useSalvarSindicato } from "./SindicatoEditor";
import {
  SortIcon,
  chain,
  cmpCnpj,
  cmpCodigo,
  cmpDataBase,
  cmpString,
  nullsLast,
  toggleSort,
  type SortState,
} from "./sort-helpers";

type SindSortKey = "nome" | "codigo" | "cnpj" | "dataBase";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  vigente: { label: "Vigente", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  negociacao: { label: "Em Negociação", className: "bg-amber-100 text-amber-800 border-amber-200" },
  pendente: { label: "Pendente", className: "bg-red-100 text-red-700 border-red-200" },
};

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_LABEL[status] ?? STATUS_LABEL.pendente;
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

export function SindicatosView({
  openEditId,
  onOpenEditIdHandled,
}: {
  openEditId?: string | null;
  onOpenEditIdHandled?: () => void;
} = {}) {
  const salvarSindicato = useSalvarSindicato();
  const { data: sindicatos = [], isLoading, error } = useQuery<Sindicato[]>({
    queryKey: ["sindicatos"],
    queryFn: fetchSindicatos,
    staleTime: 60_000,
  });

  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Sindicato | null>(null);
  const [vendoEmpresas, setVendoEmpresas] = useState<Sindicato | null>(null);
  const [vendoDocs, setVendoDocs] = useState<Sindicato | null>(null);
  const [sort, setSort] = useState<SortState<SindSortKey> | null>({ key: "nome", dir: "asc" });

  useEffect(() => {
    if (!openEditId) return;
    const alvo = sindicatos.find((s) => s.id === openEditId);
    if (alvo) {
      setEditando(alvo);
      onOpenEditIdHandled?.();
    }
  }, [openEditId, sindicatos, onOpenEditIdHandled]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = q
      ? sindicatos.filter((s) =>
          [s.nome, s.codigo, s.cnpj].some((v) => v?.toLowerCase().includes(q)),
        )
      : sindicatos;
    if (!sort) return base;
    const arr = [...base];
    const tieByNome = (a: Sindicato, b: Sindicato) => cmpString(a.nome, b.nome);
    arr.sort((a, b) => {
      let primary = 0;
      switch (sort.key) {
        case "nome":
          primary = nullsLast(a.nome, b.nome, sort.dir, cmpString);
          break;
        case "codigo":
          primary = nullsLast(a.codigo, b.codigo, sort.dir, cmpCodigo);
          break;
        case "cnpj":
          primary = nullsLast(a.cnpj, b.cnpj, sort.dir, cmpCnpj);
          break;
        case "dataBase":
          primary = nullsLast(a.dataBase, b.dataBase, sort.dir, cmpDataBase);
          break;
      }
      return sort.key === "nome" ? primary : chain(primary, () => tieByNome(a, b));
    });
    return arr;
  }, [sindicatos, busca, sort]);

  const HeadSort = ({ label, k, className }: { label: string; k: SindSortKey; className?: string }) => {
    const active = sort?.key === k;
    const Icon = SortIcon(!!active, sort?.dir ?? "asc");
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => setSort((prev) => toggleSort(prev, k))}
          className={cn(
            "inline-flex items-center gap-1 text-left hover:text-slate-900",
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

  const salvar = async (s: Sindicato) => {
    const ok = await salvarSindicato(s);
    if (ok) setEditando(null);
  };

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Falha ao carregar sindicatos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Sindicatos</h2>
          <p className="text-xs text-slate-500">
            Editar um sindicato reflete automaticamente em todas as empresas vinculadas.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, código ou CNPJ…"
            className="pl-8"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <HeadSort label="Sindicato" k="nome" />
              <HeadSort label="Código" k="codigo" />
              <HeadSort label="CNPJ" k="cnpj" />
              <HeadSort label="Data-base" k="dataBase" />
              <TableHead>Vigência</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Empresas</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-slate-500">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-slate-500">
                  Nenhum sindicato encontrado.
                </TableCell>
              </TableRow>
            )}
            {filtrados.map((s) => (
              <TableRow key={s.id} className="hover:bg-slate-50">
                <TableCell className="max-w-[300px]">
                  <button
                    type="button"
                    onClick={() => setEditando(s)}
                    className="block max-w-full truncate text-left font-medium text-slate-800 hover:text-brand hover:underline"
                    title="Editar sindicato"
                  >
                    {s.nome || "—"}
                  </button>
                  {s.segmento && (
                    <div className="truncate text-[11px] text-slate-500">{s.segmento}</div>
                  )}
                  {(s.resumoPublicado || s.integraPublicada) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.resumoPublicado && (
                        <button
                          type="button"
                          onClick={() => setVendoDocs(s)}
                          title="Ver documentos publicados"
                          className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 transition hover:bg-emerald-100"
                        >
                          Resumo publicado
                        </button>
                      )}
                      {s.integraPublicada && (
                        <button
                          type="button"
                          onClick={() => setVendoDocs(s)}
                          title="Ver documentos publicados"
                          className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 transition hover:bg-emerald-100"
                        >
                          Convenção Homologada publicada
                        </button>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="group font-mono text-xs">
                  <span>{s.codigo || "—"}</span>
                  {s.codigo && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(s.codigo);
                        toast.success("Código copiado");
                      }}
                      title="Copiar código"
                      className="ml-1 opacity-0 transition group-hover:opacity-100"
                    >
                      <Copy className="inline h-3 w-3 text-slate-400 hover:text-brand" />
                    </button>
                  )}
                </TableCell>
                <TableCell className="group font-mono text-xs">
                  <span>{s.cnpj || "—"}</span>
                  {s.cnpj && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(s.cnpj);
                        toast.success("CNPJ copiado");
                      }}
                      title="Copiar CNPJ"
                      className="ml-1 opacity-0 transition group-hover:opacity-100"
                    >
                      <Copy className="inline h-3 w-3 text-slate-400 hover:text-brand" />
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-sm">{s.dataBase || "—"}</TableCell>
                <TableCell className="text-xs">
                  {s.vigenciaInicio || "—"} <span className="text-slate-400">→</span>{" "}
                  {s.vigenciaFim || "—"}
                </TableCell>
                <TableCell><StatusPill status={s.status} /></TableCell>
                <TableCell className="text-center">
                  {s.empresasCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setVendoEmpresas(s)}
                      title={`Ver as ${s.empresasCount} empresa(s) que seguem este sindicato`}
                      className="rounded-full focus:outline-none focus:ring-2 focus:ring-brand"
                    >
                      <Badge
                        variant="outline"
                        className="cursor-pointer border-brand/30 bg-brand-soft/20 text-brand-darker transition hover:border-brand/60 hover:bg-brand-soft/40"
                      >
                        <Building2 className="mr-1 h-3 w-3" /> {s.empresasCount}
                      </Badge>
                    </button>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-slate-200 bg-slate-50 text-slate-400"
                    >
                      <Building2 className="mr-1 h-3 w-3" /> 0
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditando(s)}
                    className="text-brand hover:text-brand-dark"
                    title="Editar sindicato"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <SindicatoEditor
        sindicato={editando}
        onClose={() => setEditando(null)}
        onSave={salvar}
      />
      <EmpresasDoSindicatoDialog
        sindicato={vendoEmpresas}
        onClose={() => setVendoEmpresas(null)}
      />
      <DocumentosDoSindicatoDialog
        sindicato={vendoDocs}
        onClose={() => setVendoDocs(null)}
      />
    </div>
  );
}

function EmpresasDoSindicatoDialog({
  sindicato,
  onClose,
}: {
  sindicato: Sindicato | null;
  onClose: () => void;
}) {
  const { data: empresasRaw = [], isLoading } = useQuery<EmpresaVinculada[]>({
    queryKey: ["sindicatos", "empresas", sindicato?.id],
    queryFn: () => fetchEmpresasDoSindicato(sindicato!.id),
    enabled: !!sindicato,
  });

  const empresas = useMemo(
    () =>
      [...empresasRaw].sort((a, b) => {
        const diff = (b.funcionariosContemplados ?? 0) - (a.funcionariosContemplados ?? 0);
        return diff !== 0 ? diff : cmpString(a.nome, b.nome);
      }),
    [empresasRaw],
  );

  const totalFuncionarios = useMemo(
    () => empresas.reduce((acc, e) => acc + (e.funcionariosContemplados ?? 0), 0),
    [empresas],
  );

  return (
    <Dialog open={!!sindicato} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Empresas vinculadas</DialogTitle>
          <DialogDescription>
            {sindicato?.nome} · {empresas.length} empresa(s) · {totalFuncionarios} funcionário(s)
          </DialogDescription>
        </DialogHeader>

        <PortalBanner codigo={sindicato?.codigo} />

        <div className="mb-3 space-y-2">
          {(sindicato?.historicoDocumentos ?? []).length === 0 ? (
            <div className="rounded border border-dashed p-2 text-center text-xs text-slate-500">
              Nenhum ano cadastrado.
            </div>
          ) : (
            [...(sindicato?.historicoDocumentos ?? [])]
              .sort((a, b) => b.anoVigencia - a.anoVigencia)
              .map((d) => (
                <div
                  key={d.anoVigencia}
                  className="flex flex-wrap items-center gap-2 rounded-md border bg-slate-50 px-3 py-2"
                >
                  <span className="text-xs font-semibold text-slate-700">{d.anoVigencia}</span>
                  <PubChip label="Resumo" on={!!d.resumoPublicado} />
                  <PubChip label="Convenção Homologada" on={!!d.integraPublicada} />
                </div>
              ))
          )}
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-slate-500">Carregando…</div>
        ) : empresas.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            Nenhuma empresa vinculada a este sindicato.
          </div>
        ) : (
          <div className="space-y-2">
            {empresas.map((e) => (
              <div key={e.id} className="rounded-md border bg-white p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 font-semibold text-slate-800">{e.nome || "—"}</div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {e.principal && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                        Principal
                      </span>
                    )}
                    {e.categoria && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {e.categoria}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-0.5 font-mono text-xs text-slate-500">
                  {[e.codigo, e.cnpj].filter(Boolean).join(" · ") || "—"}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                  {(e.cidade || e.uf) && (
                    <span>{[e.cidade, e.uf].filter(Boolean).join("/")}</span>
                  )}
                  <span title="Funcionários contemplados neste vínculo (rateio)">
                    Funcionários no vínculo: {e.funcionariosContemplados ?? 0}
                  </span>
                  <span>Responsável: {e.responsavel || "—"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DocumentosDoSindicatoDialog({
  sindicato,
  onClose,
}: {
  sindicato: Sindicato | null;
  onClose: () => void;
}) {
  const docs = useMemo(
    () =>
      sindicato
        ? [...sindicato.historicoDocumentos].sort((a, b) => b.anoVigencia - a.anoVigencia)
        : [],
    [sindicato],
  );

  const abrir = async (path?: string | null) => {
    if (!path) return;
    try {
      const url = await getDocumentoSignedUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao abrir documento");
    }
  };

  return (
    <Dialog open={!!sindicato} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Documentos publicados</DialogTitle>
          <DialogDescription>
            {sindicato?.nome} · histórico ano a ano
          </DialogDescription>
        </DialogHeader>

        {docs.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            Nenhum documento cadastrado.
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div
                key={d.anoVigencia}
                className="flex flex-wrap items-center gap-2 rounded-md border bg-slate-50 px-3 py-2 text-xs"
              >
                <Badge className="bg-brand-dark font-mono text-white">Ano {d.anoVigencia}</Badge>
                <DocPubItem
                  label="Resumo"
                  publicado={!!d.resumoPublicado}
                  nome={d.resumoNome}
                  path={d.resumoPath}
                  onOpen={() => abrir(d.resumoPath)}
                />
                <DocPubItem
                  label="Convenção Homologada"
                  publicado={!!d.integraPublicada}
                  nome={d.integraNome}
                  path={d.integraPath}
                  onOpen={() => abrir(d.integraPath)}
                />
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DocPubItem({
  label,
  publicado,
  nome,
  path,
  onOpen,
}: {
  label: string;
  publicado: boolean;
  nome?: string | null;
  path?: string | null;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
          publicado
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-white text-slate-400",
        )}
      >
        {label}: {publicado ? "Sim" : "Não"}
      </span>
      {path ? (
        <button
          type="button"
          onClick={onOpen}
          title={nome || `Abrir ${label.toLowerCase()}`}
          className="inline-flex items-center gap-1 rounded bg-brand px-2 py-0.5 text-white hover:bg-brand-dark"
        >
          <Download className="h-3 w-3" />
          <FileText className="h-3 w-3" />
          <span className="max-w-[160px] truncate">{nome || label}</span>
        </button>
      ) : (
        <span className="text-slate-400">sem arquivo</span>
      )}
    </div>
  );
}

