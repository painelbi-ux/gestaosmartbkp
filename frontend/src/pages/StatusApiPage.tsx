import { useState, useEffect, useCallback } from 'react';
import { getStatus, sincronizar, formatarDataHora, type StatusResponse } from '../api/status';
import { useOnSincronizado } from '../hooks/useOnSincronizado';
import { useAuth } from '../contexts/AuthContext';
import { PERMISSOES } from '../config/permissoes';

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
        ok
          ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-green-500' : 'bg-amber-500'}`} />
      {label}
    </span>
  );
}

export default function StatusApiPage() {
  const { hasPermission } = useAuth();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const s = await getStatus();
      setStatus(s);
      setLastFetch(new Date());
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : 'Não foi possível conectar à API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useOnSincronizado(load);

  const handleSincronizar = async () => {
    setSyncError(null);
    setSyncing(true);
    try {
      await sincronizar();
      await load();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Erro ao sincronizar com o ERP.');
      await load();
    } finally {
      setSyncing(false);
    }
  };

  const apiOk = !error && status != null;
  const nomusOk = status?.nomusOk === true;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Situação da API</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-50"
          >
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
          {hasPermission(PERMISSOES.PEDIDOS_VER) && (
            <button
              type="button"
              onClick={handleSincronizar}
              disabled={syncing || !apiOk}
              className="rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
            >
              {syncing ? 'Sincronizando...' : 'Sincronizar com ERP'}
            </button>
          )}
        </div>
      </div>

      {lastFetch && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Última verificação: {lastFetch.toLocaleTimeString('pt-BR')}
        </p>
      )}

      {loading && !status && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center text-slate-500 dark:text-slate-400">
          Carregando situação da API...
        </div>
      )}

      {syncError && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 text-amber-800 dark:text-amber-200">
          <p className="font-medium">Falha ao sincronizar com o ERP</p>
          <p className="text-sm mt-1">{syncError}</p>
          <p className="text-xs mt-2 text-amber-600 dark:text-amber-300">
            Verifique NOMUS_DB_URL no .env do backend, rede e firewall até o servidor MySQL do Nomus.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 text-amber-800 dark:text-amber-200">
          <p className="font-medium">Falha ao conectar à API</p>
          <p className="text-sm mt-1">{error}</p>
          <p className="text-xs mt-2 text-amber-600 dark:text-amber-300">
            Verifique se o backend está rodando e se a URL da API está correta (VITE_API_URL no frontend).
          </p>
        </div>
      )}

      {status && (
        <div className="grid gap-4 sm:grid-cols-1">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">Conexões</h3>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-700 dark:text-slate-200">API (backend)</span>
                <StatusBadge ok={apiOk} label={apiOk ? 'Conectado' : 'Indisponível'} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-700 dark:text-slate-200">ERP (Nomus / MySQL)</span>
                <StatusBadge ok={nomusOk} label={nomusOk ? 'Conectado' : 'Indisponível'} />
                {!nomusOk && status.nomusError && (
                  <p className="text-sm text-amber-600 dark:text-amber-400 mt-1 w-full" title={status.nomusError}>
                    {status.nomusError.length > 60 ? `${status.nomusError.slice(0, 60)}…` : status.nomusError}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">Últimas atividades</h3>
            <dl className="space-y-2">
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Último upload</dt>
                <dd className="text-slate-800 dark:text-slate-200">{formatarDataHora(status.lastUpload)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Última sincronização com ERP</dt>
                <dd className="text-slate-800 dark:text-slate-200">{formatarDataHora(status.lastSyncErp)}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {status && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Use &quot;Atualizar&quot; para verificar novamente. Se o ERP (Nomus) estiver indisponível, confira a
          variável <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">NOMUS_DB_URL</code> no .env do
          backend e o console do servidor.
        </p>
      )}
    </div>
  );
}
