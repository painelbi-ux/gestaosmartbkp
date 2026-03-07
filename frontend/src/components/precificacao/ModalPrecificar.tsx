import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getProdutosPrecificacao,
  iniciarPrecificacao,
  type ProdutoPrecificacao,
  type PrecificacaoIniciarResponse,
} from '../../api/engenharia';
import SingleSelectWithSearch, { type OptionItem } from '../SingleSelectWithSearch';

const labelClass = 'text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap block mb-0.5';
const inputClass =
  'rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-2 py-1 text-sm min-w-0 focus:ring-2 focus:ring-primary-500 focus:border-primary-500';
const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50 transition';
const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-sm font-medium disabled:opacity-50 transition';

const LIMIT = 50;

interface ModalPrecificarProps {
  onClose: () => void;
  /** Chamado ao concluir precificação com sucesso (para abrir resultado e atualizar grade). */
  onIniciado?: (data: PrecificacaoIniciarResponse) => void;
}

function toOption(p: ProdutoPrecificacao): OptionItem {
  return { id: p.id, nome: p.nome, descricao: p.descricao };
}

export default function ModalPrecificar({ onClose, onIniciado }: ModalPrecificarProps) {
  const [produtos, setProdutos] = useState<ProdutoPrecificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [selected, setSelected] = useState<OptionItem | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [sucesso, setSucesso] = useState<PrecificacaoIniciarResponse | null>(null);
  const initialLoadDone = useRef(false);

  // Após exibir a mensagem de sucesso, fecha e abre o resultado
  useEffect(() => {
    if (!sucesso) return;
    const t = setTimeout(() => {
      onIniciado?.(sucesso);
      onClose();
    }, 1800);
    return () => clearTimeout(t);
  }, [sucesso, onIniciado, onClose]);

  const carregar = useCallback(async (termo = '') => {
    const isFirstLoad = !initialLoadDone.current;
    if (isFirstLoad) setLoading(true);
    else setSearchLoading(true);
    setErro(null);
    try {
      const res = await getProdutosPrecificacao({ q: termo || undefined, limit: LIMIT });
      setProdutos(res.data ?? []);
      if (res.error) setErro(res.error);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar produtos.');
      setProdutos([]);
    } finally {
      if (isFirstLoad) initialLoadDone.current = true;
      setLoading(false);
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleSearchChange = useCallback(
    (term: string) => {
      if (term === '' && produtos.length > 0) return;
      carregar(term);
    },
    [carregar, produtos.length]
  );

  const options: OptionItem[] = useMemo(() => {
    const list = produtos.map(toOption);
    if (selected && !list.some((o) => o.id === selected.id)) {
      return [selected, ...list];
    }
    return list;
  }, [produtos, selected]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-precificar-title"
    >
      <div
        className="rounded-xl shadow-xl w-full max-w-md flex flex-col border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-precificar-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100 px-6 py-4 border-b border-slate-200 dark:border-slate-600">
          Precificar
        </h2>

        <div className="px-6 py-4 space-y-4 relative min-h-[120px]">
          {/* Overlay de carregamento ao clicar em Iniciar */}
          {iniciando && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-lg bg-slate-50 dark:bg-slate-800/90 px-6 py-8">
              <div
                className="h-12 w-12 rounded-full border-4 border-primary-200 dark:border-primary-800 border-t-primary-600 dark:border-t-primary-400 animate-spin"
                aria-hidden
              />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 animate-pulse">
                Iniciando precificação...
              </p>
            </div>
          )}
          {/* Mensagem de sucesso antes de fechar */}
          {sucesso && !iniciando && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-6 py-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="text-center text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                Precificação iniciada com sucesso!
              </p>
            </div>
          )}
          {loading && !iniciando && !sucesso && (
            <div className="flex items-center justify-center py-8 text-slate-500 dark:text-slate-400 text-sm">
              Carregando produtos...
            </div>
          )}
          {erro && !loading && !iniciando && !sucesso && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              {erro}
            </div>
          )}
          {!loading && !iniciando && !sucesso && (
            <SingleSelectWithSearch
              label="Selecione o produto:"
              placeholder="Selecione um produto..."
              options={options}
              value={selected}
              onChange={setSelected}
              labelClass={labelClass}
              inputClass={inputClass}
              minWidth="100%"
              onSearchChange={handleSearchChange}
              searchLoading={searchLoading}
              listMaxHeight="180px"
            />
          )}
        </div>

        {!iniciando && !sucesso && (
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 rounded-b-xl">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={!selected || iniciando}
            onClick={async () => {
              if (!selected) return;
              setErro(null);
              setIniciando(true);
              try {
                const { data, error } = await iniciarPrecificacao(selected.id);
                if (error) {
                  setErro(error);
                  return;
                }
                if (data) {
                  setSucesso(data);
                }
              } catch (e) {
                setErro(e instanceof Error ? e.message : 'Erro ao iniciar precificação.');
              } finally {
                setIniciando(false);
              }
            }}
            className={btnPrimary}
          >
            Iniciar
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
