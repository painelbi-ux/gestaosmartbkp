import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { podeConfigurarSuporte } from '../../utils/suportePermissoes';
import CarregandoInformacoesOverlay from '../../components/CarregandoInformacoesOverlay';
import {
  listSupportCatalog,
  listSupportFieldConfig,
  saveSupportCatalog,
  saveSupportFieldConfig,
  type SupportCatalogItem,
  type SupportFieldConfig,
} from '../../api/suporte';

const inputClass =
  'w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm';

const KIND_LABEL: Record<string, string> = {
  status: 'Status',
  prioridade: 'Prioridades',
  tipo: 'Tipos de chamado',
};

function catalogToPayload(items: SupportCatalogItem[]): Omit<SupportCatalogItem, 'id'>[] {
  return items.map(({ kind, code, label, active, sortOrder, blocksUserReply }) => ({
    kind,
    code,
    label,
    active,
    sortOrder,
    blocksUserReply: kind === 'status' ? blocksUserReply : false,
  }));
}

export default function SuporteConfigPage() {
  const { isMaster, hasPermission } = useAuth();
  const allowed = podeConfigurarSuporte(isMaster, hasPermission);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<SupportCatalogItem[]>([]);
  const [savingCatalog, setSavingCatalog] = useState(false);

  const [configDraft, setConfigDraft] = useState<SupportFieldConfig[]>([]);
  const [savingFields, setSavingFields] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setErr(null);
    try {
      const [cat, fields] = await Promise.all([listSupportCatalog(), listSupportFieldConfig()]);
      setCatalog(cat);
      setConfigDraft(fields);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const g: Record<string, SupportCatalogItem[]> = { status: [], prioridade: [], tipo: [] };
    for (const row of catalog) {
      if (g[row.kind]) g[row.kind].push(row);
    }
    for (const k of Object.keys(g)) {
      g[k].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    }
    return g;
  }, [catalog]);

  const handleSaveCatalog = async () => {
    setSavingCatalog(true);
    setOkMsg(null);
    setErr(null);
    try {
      await saveSupportCatalog(catalogToPayload(catalog));
      const fresh = await listSupportCatalog();
      setCatalog(fresh);
      setOkMsg('Catálogo salvo.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao salvar catálogo.');
    } finally {
      setSavingCatalog(false);
    }
  };

  const handleSaveFields = async () => {
    setSavingFields(true);
    setOkMsg(null);
    setErr(null);
    try {
      await saveSupportFieldConfig(configDraft);
      setOkMsg('Campos da abertura salvos.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao salvar campos.');
    } finally {
      setSavingFields(false);
    }
  };

  const updateCatalogRow = (id: number, patch: Partial<SupportCatalogItem>) => {
    setCatalog((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addCatalogRow = (kind: SupportCatalogItem['kind']) => {
    const nextOrder = Math.max(0, ...catalog.filter((c) => c.kind === kind).map((c) => c.sortOrder)) + 1;
    const tempId = -Date.now();
    setCatalog((prev) => [
      ...prev,
      {
        id: tempId,
        kind,
        code: '',
        label: '',
        active: true,
        sortOrder: nextOrder,
        blocksUserReply: false,
      },
    ]);
  };

  if (!allowed) {
    return (
      <div className="p-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">Você não tem permissão para configurar o suporte.</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-4 p-4 min-h-[200px]">
      <CarregandoInformacoesOverlay
        show={loading || savingCatalog || savingFields}
        mensagem={loading ? 'Carregando configurações...' : 'Salvando...'}
        mode="contained"
      />
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-primary-600 dark:text-primary-400">Suporte</p>
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Configurações de suporte</h1>
        <p className="text-sm text-slate-500 mt-1">
          Gerencie status, prioridades, tipos de chamado e campos extras na abertura. Itens inativos deixam de aparecer em novos
          chamados, mas chamados antigos mantêm o código gravado.
        </p>
      </div>
      {okMsg && <p className="text-sm text-emerald-700 dark:text-emerald-300">{okMsg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleSaveCatalog()}
          disabled={savingCatalog || loading}
          className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          Salvar catálogo (status, prioridades, tipos)
        </button>
        {allowed && (
          <button
            type="button"
            onClick={() => void handleSaveFields()}
            disabled={savingFields || loading}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 text-sm font-medium disabled:opacity-50"
          >
            Salvar campos da abertura
          </button>
        )}
      </div>

      {(['status', 'prioridade', 'tipo'] as const).map((kind) => (
        <div key={kind} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{KIND_LABEL[kind]}</h2>
            <button
              type="button"
              onClick={() => addCatalogRow(kind)}
              className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-100"
            >
              Adicionar
            </button>
          </div>
          <div className="space-y-2">
            {grouped[kind].length === 0 && <p className="text-xs text-slate-500">Nenhum item.</p>}
            {grouped[kind].map((row) => (
              <div
                key={`${row.id}-${row.code}`}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 p-2 rounded border border-slate-100 dark:border-slate-700"
              >
                <input
                  className={`${inputClass} md:col-span-2`}
                  placeholder="código (slug)"
                  value={row.code}
                  onChange={(e) => updateCatalogRow(row.id, { code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                  disabled={row.id > 0}
                  title={row.id > 0 ? 'Código fixo após salvar (identificador no banco)' : 'Defina antes de salvar'}
                />
                <input
                  className={`${inputClass} md:col-span-4`}
                  placeholder="Nome exibido"
                  value={row.label}
                  onChange={(e) => updateCatalogRow(row.id, { label: e.target.value })}
                />
                <input
                  className={`${inputClass} md:col-span-1`}
                  type="number"
                  placeholder="ordem"
                  value={row.sortOrder}
                  onChange={(e) => updateCatalogRow(row.id, { sortOrder: Number(e.target.value) || 0 })}
                />
                <label className="md:col-span-2 text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={row.active}
                    onChange={(e) => updateCatalogRow(row.id, { active: e.target.checked })}
                  />
                  Ativo
                </label>
                {kind === 'status' && (
                  <label className="md:col-span-3 text-sm flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={row.blocksUserReply}
                      onChange={(e) => updateCatalogRow(row.id, { blocksUserReply: e.target.checked })}
                    />
                    Usuário não responde neste status
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {allowed && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Campos extras na abertura</h2>
          <div className="space-y-2">
            {configDraft.map((f, idx) => (
              <div key={f.fieldKey || idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 p-2 rounded border border-slate-200 dark:border-slate-700">
                <input
                  className={inputClass}
                  value={f.fieldKey}
                  onChange={(e) =>
                    setConfigDraft((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, fieldKey: e.target.value } : x))
                    )
                  }
                />
                <input
                  className={inputClass}
                  value={f.label}
                  onChange={(e) =>
                    setConfigDraft((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x))
                    )
                  }
                />
                <select
                  className={inputClass}
                  value={f.fieldType}
                  onChange={(e) =>
                    setConfigDraft((prev) =>
                      prev.map((x, i) =>
                        i === idx ? { ...x, fieldType: e.target.value as SupportFieldConfig['fieldType'] } : x
                      )
                    )
                  }
                >
                  <option value="text">text</option>
                  <option value="textarea">textarea</option>
                  <option value="select">select</option>
                  <option value="number">number</option>
                  <option value="date">date</option>
                </select>
                <input
                  className={inputClass}
                  placeholder="opções ; separadas"
                  value={f.options.join('; ')}
                  onChange={(e) =>
                    setConfigDraft((prev) =>
                      prev.map((x, i) =>
                        i === idx
                          ? { ...x, options: e.target.value.split(';').map((v) => v.trim()).filter(Boolean) }
                          : x
                      )
                    )
                  }
                />
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) =>
                      setConfigDraft((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, required: e.target.checked } : x))
                      )
                    }
                  />
                  Obrigatório
                </label>
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={f.active}
                    onChange={(e) =>
                      setConfigDraft((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, active: e.target.checked } : x))
                      )
                    }
                  />
                  Ativo
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
