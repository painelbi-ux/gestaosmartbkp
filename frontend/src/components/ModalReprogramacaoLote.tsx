import { useState, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { listarMotivosSugestao, type MotivoSugestao } from '../api/motivosSugestao';
import { ajustarPrevisaoLote, type AjustePrevisaoLoteResultado } from '../api/pedidos';
import ModalGerenciarMotivos from './ModalGerenciarMotivos';
import { useAuth } from '../contexts/AuthContext';
import { isCarradaRota, isExcludedSqlRotaCategory } from '../utils/rotaCarrada';

const schema = z.object({
  previsao_nova: z.string().min(1, 'Informe a data'),
  motivo: z.string().min(1, 'Motivo é obrigatório').max(500),
});

/** Linha selecionada na grade: id_pedido + rota (Observacoes) para suporte a override por rota. */
export type LinhaReprogramacaoLote = { id_pedido: string; rota?: string };

interface ModalReprogramacaoLoteProps {
  linhas: LinhaReprogramacaoLote[];
  onClose: () => void;
  onSuccess: (resultado: AjustePrevisaoLoteResultado) => void;
  onError: (msg: string) => void;
}

export default function ModalReprogramacaoLote({
  linhas,
  onClose,
  onSuccess,
  onError,
}: ModalReprogramacaoLoteProps) {
  const [previsao_nova, setPrevisaoNova] = useState('');
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ previsao_nova?: string; motivo?: string }>({});
  const [sugestoes, setSugestoes] = useState<MotivoSugestao[]>([]);
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);
  const [abrirGerenciar, setAbrirGerenciar] = useState(false);
  const [aplicarPorRota, setAplicarPorRota] = useState(false);
  const { login, grupo } = useAuth();
  const podeGerenciarMotivos = login === 'master' || login === 'admin' || login === 'marquesfilho' || grupo === 'admin' || grupo === 'Administrador';

  // Quantidade de linhas com rota considerada "carrada elegível" — habilita o toggle de override por rota.
  const totalLinhasComRotaCarrada = useMemo(() => {
    return linhas.reduce((acc, l) => {
      const r = (l.rota ?? '').trim();
      return acc + (r && isCarradaRota(r) && !isExcludedSqlRotaCategory(r) ? 1 : 0);
    }, 0);
  }, [linhas]);

  const carregarSugestoes = () => {
    setLoadingSugestoes(true);
    listarMotivosSugestao()
      .then(setSugestoes)
      .catch(() => {})
      .finally(() => setLoadingSugestoes(false));
  };

  useEffect(() => {
    carregarSugestoes();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ previsao_nova, motivo });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      const flat = parsed.error.flatten().fieldErrors;
      if (flat?.previsao_nova?.[0]) fieldErrors.previsao_nova = flat.previsao_nova[0];
      if (flat?.motivo?.[0]) fieldErrors.motivo = flat.motivo[0];
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const ajustes = linhas
        .map((l) => {
          const idNorm = String(l.id_pedido ?? '').trim();
          const rotaNorm = (l.rota ?? '').trim();
          return {
            id_pedido: idNorm,
            previsao_nova: parsed.data!.previsao_nova.trim().slice(0, 10),
            motivo: parsed.data!.motivo.trim(),
            rota: rotaNorm || undefined,
            // Só grava override quando o toggle está ligado E a rota é elegível.
            apply_rota:
              aplicarPorRota && rotaNorm && isCarradaRota(rotaNorm) && !isExcludedSqlRotaCategory(rotaNorm)
                ? true
                : undefined,
          };
        })
        .filter((a) => a.id_pedido !== '');
      const resultado = await ajustarPrevisaoLote(ajustes);
      onSuccess(resultado);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao reprogramar em lote.');
    } finally {
      setLoading(false);
    }
  };

  if (linhas.length === 0) return null;

  const limiteLote = 1000;
  const excedeLimite = linhas.length > limiteLote;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Reprogramar em lote</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          {linhas.length} pedido(s) selecionado(s). Defina a mesma nova data e o mesmo motivo para todos.
        </p>
        {excedeLimite && (
          <p className="text-amber-600 dark:text-amber-400 text-sm mb-4">
            Máximo {limiteLote} pedidos por vez. Desmarque alguns na tabela (atualmente {linhas.length}).
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Nova data de previsão</label>
            <input
              type="date"
              value={previsao_nova}
              onChange={(e) => setPrevisaoNova(e.target.value)}
              className="w-full rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 px-3 py-2 focus:ring-2 focus:ring-primary-600 focus:border-transparent"
            />
            {errors.previsao_nova && (
              <p className="text-amber-400 text-xs mt-1">{errors.previsao_nova}</p>
            )}
          </div>
          <div className="mb-4">
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="block text-xs text-slate-400">Motivo</label>
              {podeGerenciarMotivos && (
                <button
                  type="button"
                  onClick={() => setAbrirGerenciar(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-600 transition-colors"
                  title="Gerenciar motivos"
                  aria-label="Gerenciar motivos"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
              )}
            </div>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 px-3 py-2 focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              required
            >
              <option value="">Selecione um motivo</option>
              {sugestoes.map((s) => (
                <option key={s.id} value={s.descricao}>
                  {s.descricao}
                </option>
              ))}
            </select>
            {errors.motivo && <p className="text-amber-400 text-xs mt-1">{errors.motivo}</p>}
            {loadingSugestoes && (
              <p className="text-slate-500 text-xs mt-1">Carregando motivos...</p>
            )}
          </div>

          {totalLinhasComRotaCarrada > 0 && (
            <label className="mb-4 flex items-start gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3 text-sm">
              <input
                type="checkbox"
                checked={aplicarPorRota}
                onChange={(e) => setAplicarPorRota(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-400 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-slate-700 dark:text-slate-200">
                <span className="block font-medium">Aplicar somente nas rotas selecionadas</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Quando um mesmo pedido aparecer em mais de uma carrada, a data muda apenas nas linhas selecionadas (override). Sem este filtro, a data vale para todas as rotas em que o pedido aparece.
                </span>
              </span>
            </label>
          )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-800 dark:text-slate-100 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || excedeLimite}
              className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium"
            >
              {loading ? 'Salvando...' : `Reprogramar ${linhas.length} pedido(s)`}
            </button>
          </div>
        </form>
      </div>

      {abrirGerenciar && podeGerenciarMotivos && (
        <ModalGerenciarMotivos
          onClose={() => setAbrirGerenciar(false)}
          onError={onError}
          onAtualizado={carregarSugestoes}
        />
      )}
    </div>
  );
}
