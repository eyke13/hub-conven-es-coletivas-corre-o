import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Info, Plus, Trash2, Users } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ABRANGENCIAS, MESES } from "./types";
import type { HistoricoDocumento } from "./types";
import {
  fetchEmpresasDoSindicato,
  updateSindicato,
  type EmpresaVinculada,
  type Sindicato,
} from "./sindicatos-storage";

function formatCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function PortalBanner({ codigo }: { codigo?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-brand/30 bg-brand-soft/20 px-3 py-2 text-xs text-brand-darker">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <span>
          Documentos publicados no Portal Elite. Busque pelo código{" "}
          <strong className="font-mono">
            {codigo?.trim() ? codigo : "(código não cadastrado)"}
          </strong>{" "}
          do sindicato.
        </span>
      </div>
      <a
        href="https://eliteconsultores.app/ControleConvencoes"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark"
      >
        <ExternalLink className="h-3.5 w-3.5" /> Abrir Portal
      </a>
    </div>
  );
}

/**
 * Hook central para salvar um sindicato a partir de qualquer tela.
 * Invalida todas as queryKeys de sindicato do projeto para que a edição
 * seja refletida imediatamente onde o sindicato aparece.
 */
export function useSalvarSindicato() {
  const queryClient = useQueryClient();

  return async (s: Sindicato): Promise<boolean> => {
    try {
      await updateSindicato(s);

      // Cache da lista principal (SindicatosView, EsteiraResumosView, CctHub).
      queryClient.setQueryData<Sindicato[]>(["sindicatos"], (prev) =>
        (prev ?? []).map((x) =>
          x.id === s.id ? { ...s, empresasCount: x.empresasCount } : x,
        ),
      );
      // Dashboard usa outra queryKey.
      queryClient.invalidateQueries({ queryKey: ["sindicatos-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["esteira"] });

      toast.success(
        `Sindicato atualizado — ${s.empresasCount} empresa(s) refletirão a alteração`,
      );
      return true;
    } catch (e) {
      console.error(e);
      toast.error("Falha ao salvar sindicato");
      return false;
    }
  };
}

export function SindicatoEditor({
  sindicato,
  onClose,
  onSave,
}: {
  sindicato: Sindicato | null;
  onClose: () => void;
  onSave: (s: Sindicato) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Sindicato | null>(null);
  const lastLoadedId = useRef<string | null>(null);

  if (sindicato && lastLoadedId.current !== sindicato.id) {
    lastLoadedId.current = sindicato.id;
    setDraft({
      ...sindicato,
      historicoDocumentos: [...sindicato.historicoDocumentos],
    });
  }
  if (!sindicato && lastLoadedId.current !== null) {
    lastLoadedId.current = null;
    setDraft(null);
  }

  const { data: empresas = [], isLoading: loadingEmpresas } = useQuery<EmpresaVinculada[]>({
    queryKey: ["sindicatos", "empresas", sindicato?.id],
    queryFn: () => fetchEmpresasDoSindicato(sindicato!.id),
    enabled: !!sindicato,
  });

  if (!draft) return null;

  const patch = (p: Partial<Sindicato>) => setDraft({ ...draft, ...p });

  const addAno = () => {
    const anos = draft.historicoDocumentos.map((d) => d.anoVigencia);
    const proximo = anos.length ? Math.max(...anos) + 1 : new Date().getFullYear();
    patch({
      historicoDocumentos: [...draft.historicoDocumentos, { anoVigencia: proximo }],
    });
  };

  const updateDoc = (idx: number, p: Partial<HistoricoDocumento>) => {
    patch({
      historicoDocumentos: draft.historicoDocumentos.map((d, i) =>
        i === idx ? { ...d, ...p } : d,
      ),
    });
  };

  const removeDoc = (idx: number) => {
    patch({
      historicoDocumentos: draft.historicoDocumentos.filter((_, i) => i !== idx),
    });
  };

  return (
    <Dialog open={!!sindicato} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar sindicato</DialogTitle>
          <DialogDescription>
            Os dados abaixo são compartilhados por todas as empresas ligadas a este sindicato.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>{empresas.length}</strong> empresa(s) seguem este sindicato.
            Alterações em data-base, vigência, documentos e status refletirão para todas.
          </div>
        </div>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase text-slate-500">Identificação</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Nome do sindicato</Label>
              <Input value={draft.nome} onChange={(e) => patch({ nome: e.target.value })} />
            </div>
            <div>
              <Label>Código</Label>
              <Input value={draft.codigo} onChange={(e) => patch({ codigo: e.target.value })} />
            </div>
            <div>
              <Label>CNPJ</Label>
              <Input
                value={draft.cnpj}
                onChange={(e) => patch({ cnpj: formatCnpj(e.target.value) })}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div>
              <Label>Segmento</Label>
              <Input
                value={draft.segmento ?? ""}
                onChange={(e) => patch({ segmento: e.target.value })}
                placeholder="Ex.: Comércio, Indústria, TI…"
              />
            </div>
            <div>
              <Label>Abrangência</Label>
              <Select
                value={draft.abrangencia || "__none__"}
                onValueChange={(v) => patch({ abrangencia: v === "__none__" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {ABRANGENCIAS.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="mt-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase text-slate-500">Vigência e Status</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Data-base</Label>
              <Select
                value={draft.dataBase || "__none__"}
                onValueChange={(v) => patch({ dataBase: v === "__none__" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Mês" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {MESES.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={draft.status || "pendente"} onValueChange={(v) => patch({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="negociacao">Em Negociação</SelectItem>
                  <SelectItem value="vigente">Vigente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vigência início</Label>
              <Input
                type="date"
                value={draft.vigenciaInicio}
                onChange={(e) => patch({ vigenciaInicio: e.target.value })}
              />
            </div>
            <div>
              <Label>Vigência fim</Label>
              <Input
                type="date"
                value={draft.vigenciaFim}
                onChange={(e) => patch({ vigenciaFim: e.target.value })}
              />
            </div>
            <div>
              <Label>Prazo de oposição</Label>
              <Input
                type="date"
                value={draft.prazoOposicao}
                onChange={(e) => patch({ prazoOposicao: e.target.value })}
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

        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase text-slate-500">
              Histórico de documentos anuais
            </h3>
            <Button type="button" size="sm" variant="outline" onClick={addAno}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar ano
            </Button>
          </div>

          <PortalBanner codigo={draft.codigo} />

          <div className="space-y-3">
            {draft.historicoDocumentos.length === 0 && (
              <div className="rounded border border-dashed p-3 text-center text-xs text-slate-500">
                Nenhum ano cadastrado.
              </div>
            )}
            {draft.historicoDocumentos.map((d, idx) => (
              <DocRow
                key={idx}
                doc={d}
                onAno={(anoVigencia) => updateDoc(idx, { anoVigencia })}
                onTogglePub={(tipo, value) =>
                  updateDoc(
                    idx,
                    tipo === "resumo"
                      ? { resumoPublicado: value }
                      : { integraPublicada: value },
                  )
                }
                onRemoveRow={() => removeDoc(idx)}
              />
            ))}
          </div>
        </section>

        <section className="mt-6 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
            <Users className="h-3.5 w-3.5" /> Empresas vinculadas ({empresas.length})
          </div>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Func.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingEmpresas && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-4 text-center text-xs text-slate-500">
                      Carregando…
                    </TableCell>
                  </TableRow>
                )}
                {!loadingEmpresas && empresas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-4 text-center text-xs text-slate-500">
                      Nenhuma empresa vinculada.
                    </TableCell>
                  </TableRow>
                )}
                {empresas.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.nome || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{e.codigo || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{e.cnpj || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {[e.cidade, e.uf].filter(Boolean).join(" / ") || "—"}
                    </TableCell>
                    <TableCell className="text-xs">{e.responsavel || "—"}</TableCell>
                    <TableCell className="text-right">{e.funcionariosContemplados || 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => onSave(draft)}
            className="bg-brand text-white hover:bg-brand-dark"
          >
            Salvar (aplica a {empresas.length} empresa{empresas.length === 1 ? "" : "s"})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocRow({
  doc,
  onAno,
  onTogglePub,
  onRemoveRow,
}: {
  doc: HistoricoDocumento;
  onAno: (ano: number) => void;
  onTogglePub: (tipo: "resumo" | "integra", value: boolean) => void;
  onRemoveRow: () => void;
}) {
  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-24">
          <Label className="text-xs">Ano</Label>
          <Input
            type="number"
            value={doc.anoVigencia}
            onChange={(e) => onAno(Number(e.target.value) || 0)}
          />
        </div>

        <PubToggle
          label="Resumo publicado"
          value={!!doc.resumoPublicado}
          onChange={(v) => onTogglePub("resumo", v)}
        />
        <PubToggle
          label="Convenção Homologada publicada"
          value={!!doc.integraPublicada}
          onChange={(v) => onTogglePub("integra", v)}
        />

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onRemoveRow}
          className="ml-auto text-red-600 hover:text-red-700"
          title="Remover ano"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function PubToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2 rounded border bg-white px-3 py-1.5">
        <Switch checked={value} onCheckedChange={onChange} />
        <span
          className={cn(
            "text-xs font-medium",
            value ? "text-emerald-700" : "text-slate-500",
          )}
        >
          {value ? "Sim" : "Não"}
        </span>
      </div>
    </div>
  );
}