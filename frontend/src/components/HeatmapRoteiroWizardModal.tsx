import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MapaMunicipioItem } from '../api/pedidos';
import MultiSelectWithSearch from './MultiSelectWithSearch';
import {
  filtrarItensMapaRoteiro,
  indexarItensMapaRoteiro,
  labelMunicipio,
  municipiosDisponiveis,
  restringirSelecoes,
  rotasUnicas,
  ufsDisponiveis,
} from '../utils/heatmapRoteiroFiltrosMapa';

export type RoteiroWizardStep = 'escolha' | 'ctrl' | 'filtros';

const labelClass = 'block text-xs text-slate-500 dark:text-slate-400 mb-1';
const inputClass =
  'rounded border border-slate-300 bg-white text-slate-900 px-2.5 py-1.5 text-sm min-w-0 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200';

function setToPipe(s: ReadonlySet<string>): string {
  return [...s].join('|');
}

function pipeToSet(v: string): Set<string> {
  return new Set(v ? v.split('|').filter(Boolean) : []);
}

export default function HeatmapRoteiroWizardModal({
  step,
  itensMapa,
  maxCidades,
  onEscolherCtrl,
  onContinuarCtrl,
  onEscolherFiltros,
  onAplicarFiltros,
  onVoltar,
  onCancelar,
}: {
  step: RoteiroWizardStep;
  itensMapa: { item: MapaMunicipioItem; chave: string }[];
  maxCidades: number;
  onEscolherCtrl: () => void;
  onContinuarCtrl: () => void;
  onEscolherFiltros: () => void;
  onAplicarFiltros: (chaves: string[]) => void;
  onVoltar: () => void;
  onCancelar: () => void;
}) {
  const itens = useMemo(() => indexarItensMapaRoteiro(itensMapa), [itensMapa]);
  const todasRotas = useMemo(() => rotasUnicas(itens), [itens]);

  const [rotasSel, setRotasSel] = useState<Set<string>>(() => new Set());
  const [ufsSel, setUfsSel] = useState<Set<string>>(() => new Set());
  const [munSel, setMunSel] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (step !== 'filtros') return;
    const rotas = new Set(todasRotas);
    setRotasSel(rotas);
    const ufs = ufsDisponiveis(itens, rotas);
    const ufsSet = new Set(ufs);
    setUfsSel(ufsSet);
    const mun = municipiosDisponiveis(itens, rotas, ufsSet);
    setMunSel(new Set(mun.map((m) => m.chave)));
  }, [step, itens, todasRotas]);

  const ufsOpcoes = useMemo(() => ufsDisponiveis(itens, rotasSel), [itens, rotasSel]);
  const munItens = useMemo(
    () => municipiosDisponiveis(itens, rotasSel, ufsSel),
    [itens, rotasSel, ufsSel]
  );
  const munLabels = useMemo(() => {
    const m: Record<string, string> = {};
    for (const x of munItens) m[x.chave] = labelMunicipio(x);
    return m;
  }, [munItens]);

  const aplicarRestricaoRotas = useCallback(
    (nextRotas: Set<string>, prevUfs: Set<string>, prevMun: Set<string>) => {
      const { ufsSel: u, municipiosSel: m } = restringirSelecoes(prevUfs, prevMun, itens, nextRotas);
      const munDisp = municipiosDisponiveis(itens, nextRotas, u);
      if (m.size === 0 && munDisp.length > 0) {
        setUfsSel(u);
        setMunSel(new Set(munDisp.map((x) => x.chave)));
        return;
      }
      setUfsSel(u);
      setMunSel(m);
    },
    [itens]
  );

  const onRotasChange = useCallback(
    (v: string) => {
      const next = pipeToSet(v);
      setRotasSel(next);
      aplicarRestricaoRotas(next, ufsSel, munSel);
    },
    [aplicarRestricaoRotas, ufsSel, munSel]
  );

  const onUfsChange = useCallback(
    (v: string) => {
      const next = pipeToSet(v);
      setUfsSel(next);
      const munDisp = municipiosDisponiveis(itens, rotasSel, next);
      const munNext = new Set([...munSel].filter((k) => munDisp.some((m) => m.chave === k)));
      if (munNext.size === 0 && munDisp.length > 0) {
        munDisp.forEach((m) => munNext.add(m.chave));
      }
      setMunSel(munNext);
    },
    [itens, rotasSel, munSel]
  );

  const onMunChange = useCallback((v: string) => {
    setMunSel(pipeToSet(v));
  }, []);

  const preview = useMemo(
    () => filtrarItensMapaRoteiro(itens, rotasSel, ufsSel, munSel),
    [itens, rotasSel, ufsSel, munSel]
  );

  const handleAplicar = () => {
    const chaves = preview.map((p) => p.chave).slice(0, maxCidades);
    onAplicarFiltros(chaves);
  };

  const modalWide = step === 'filtros';

  return (
    <div
      className="fixed inset-0 z-[13000] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={onCancelar}
    >
      <div
        className={`flex max-h-[min(90vh,640px)] w-full flex-col rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-600 dark:bg-slate-800 ${
          modalWide ? 'max-w-4xl overflow-visible' : 'max-w-lg overflow-hidden'
        }`}
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-200 px-4 py-3 dark:border-slate-600">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Roteirização</h3>
          {step === 'escolha' && (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Nenhuma cidade foi selecionada com Ctrl+clique. Como deseja escolher as cidades da rota?
            </p>
          )}
          {step === 'ctrl' && (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Mantenha <strong>Ctrl</strong> pressionado e clique nas bolhas no mapa. Depois use{' '}
              <strong>Roteirizar</strong> novamente.
            </p>
          )}
          {step === 'filtros' && (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Clique em cada filtro para marcar opções. As listas se ajustam entre si. Ao aplicar, as cidades
              correspondentes serão selecionadas no mapa.
            </p>
          )}
        </div>

        <div
          className={`min-h-0 flex-1 px-4 py-3 ${modalWide ? 'overflow-visible' : 'overflow-y-auto'}`}
        >
          {step === 'escolha' && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onEscolherCtrl}
                className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-2.5 text-left text-sm font-medium text-primary-900 hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-100"
              >
                Seleção manual (Ctrl+clique)
                <span className="mt-0.5 block text-xs font-normal text-primary-800/80 dark:text-primary-200/80">
                  Escolher cada cidade no mapa, uma a uma.
                </span>
              </button>
              <button
                type="button"
                onClick={onEscolherFiltros}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100"
              >
                Filtros (Rota, UF e Município)
                <span className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400">
                  Pré-selecionar cidades por carrada, estado e município.
                </span>
              </button>
            </div>
          )}

          {step === 'filtros' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                <MultiSelectWithSearch
                  label="Rota / Carrada"
                  placeholder="Todas as rotas"
                  options={todasRotas}
                  value={setToPipe(rotasSel)}
                  onChange={onRotasChange}
                  labelClass={labelClass}
                  inputClass={inputClass}
                  minWidth="180px"
                  optionLabel="rotas"
                  dropdownZIndex={13010}
                />
                <MultiSelectWithSearch
                  label="UF"
                  placeholder="Todas as UFs"
                  options={ufsOpcoes}
                  value={setToPipe(ufsSel)}
                  onChange={onUfsChange}
                  labelClass={labelClass}
                  inputClass={inputClass}
                  minWidth="120px"
                  optionLabel="UFs"
                  dropdownZIndex={13010}
                />
                <MultiSelectWithSearch
                  label="Município"
                  placeholder="Todos os municípios"
                  options={munItens.map((m) => m.chave)}
                  value={setToPipe(munSel)}
                  onChange={onMunChange}
                  labelClass={labelClass}
                  inputClass={inputClass}
                  minWidth="200px"
                  optionLabel="municípios"
                  labelByValue={munLabels}
                  dropdownZIndex={13010}
                />
              </div>
              <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
                {preview.length} cidade{preview.length !== 1 ? 's' : ''} serão selecionada
                {preview.length !== 1 ? 's' : ''}
                {preview.length > maxCidades ? ` (máx. ${maxCidades} na rota)` : ''}
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-600">
          {step !== 'escolha' && (
            <button
              type="button"
              onClick={onVoltar}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-500 dark:text-slate-200"
            >
              Voltar
            </button>
          )}
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-500 dark:text-slate-200"
          >
            Cancelar
          </button>
          {step === 'ctrl' && (
            <button
              type="button"
              onClick={onContinuarCtrl}
              className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              Continuar no mapa
            </button>
          )}
          {step === 'filtros' && (
            <button
              type="button"
              disabled={preview.length === 0}
              onClick={handleAplicar}
              className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              Aplicar filtros
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
