import { useState, useEffect } from 'react';
import { z } from 'zod';
import type { Pedido } from '../api/pedidos';
import { listarMotivosSugestao, type MotivoSugestao } from '../api/motivosSugestao';
import ModalGerenciarMotivos from './ModalGerenciarMotivos';
import { useAuth } from '../contexts/AuthContext';
import { PERMISSOES } from '../config/permissoes';

const ajusteSchema = z.object({
  previsao_nova: z.string().min(1, 'Informe a data'),
  motivo: z.string().min(1, 'Motivo é obrigatório').max(500),
  observacao: z.string().max(1000).optional(),
});

interface ModalAjustePrevisaoProps {
  pedido: Pedido | null;
  onClose: () => void;
  onSuccess: (atualizado: Pedido) => void;
  onError: (msg: string) => void;
}

export default function ModalAjustePrevisao({
  pedido,
  onClose,
  onSuccess,
  onError,
}: ModalAjustePrevisaoProps) {
  const [previsao_nova, setPrevisaoNova] = useState(() => {
    if (!pedido?.previsao_entrega_atualizada) return '';
    return String(pedido.previsao_entrega_atualizada).slice(0, 10);
  });
  const [motivo, setMotivo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ previsao_nova?: string; motivo?: string }>({});
  const [sugestoes, setSugestoes] = useState<MotivoSugestao[]>([]);
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);
  const [abrirGerenciar, setAbrirGerenciar] = useState(false);
  const { hasPermission } = useAuth();
  const podeGerenciarMotivos =
    hasPermission(PERMISSOES.PCP_MOTIVO_CRIAR) ||
    hasPermission(PERMISSOES.PCP_MOTIVO_EDITAR) ||
    hasPermission(PERMISSOES.PCP_MOTIVO_EXCLUIR) ||
    hasPermission(PERMISSOES.PCP_TOTAL);

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

  if (!pedido) return null;

  const pd = (pedido as Record<string, unknown>)['PD'] ?? pedido.id_pedido;
  const cod = (pedido as Record<string, unknown>)['Cod'] ?? pedido.produto ?? '—';

  const previsaoAtualStr = pedido?.previsao_entrega_atualizada
    ? String(pedido.previsao_entrega_atualizada).slice(0, 10)
    : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const previsaoNovaNorm = previsao_nova.trim().slice(0, 10);
    if (previsaoAtualStr && previsaoNovaNorm === previsaoAtualStr) {
      setErrors({ previsao_nova: 'A data não foi alterada.' });
      onError('A data não foi alterada. Informe uma data diferente da previsão atual para salvar.');
      return;
    }
    const parsed = ajusteSchema.safeParse({ previsao_nova, motivo, observacao });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.flatten().fieldErrors?.previsao_nova &&
        (fieldErrors.previsao_nova = parsed.error.flatten().fieldErrors.previsao_nova[0]);
      parsed.error.flatten().fieldErrors?.motivo &&
        (fieldErrors.motivo = parsed.error.flatten().fieldErrors.motivo[0]);
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { ajustarPrevisao } = await import('../api/pedidos');
      const atualizado = await ajustarPrevisao(pedido.id_pedido, {
        previsao_nova: parsed.data.previsao_nova,
        motivo: parsed.data.motivo,
        observacao: parsed.data.observacao || null,
      });
      onSuccess(atualizado);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao ajustar previsão.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Ajustar previsão de entrega</h3>
        <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1 mb-4">
          <p><span className="font-medium text-slate-700 dark:text-slate-300">Pedido</span> {String(pd)}</p>
          <p><span className="font-medium text-slate-700 dark:text-slate-300">Produto</span> {String(cod)}</p>
          <p><span className="font-medium text-slate-700 dark:text-slate-300">Cliente</span> {pedido.cliente}</p>
        </div>
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
          <div className="mb-4">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="Opcional"
              className="w-full rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 px-3 py-2 focus:ring-2 focus:ring-primary-600 focus:border-transparent resize-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
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
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium"
            >
              {loading ? 'Salvando...' : 'Salvar'}
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
