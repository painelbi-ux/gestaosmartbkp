import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  podeAbrirChamadoSuporte,
  podeAlterarStatusChamadoSuporte,
  podeResponderChamadoSuporte,
  podeVerTodosChamadosSuporte,
} from '../../utils/suportePermissoes';
import {
  createSupportMessage,
  createSupportTicket,
  getSupportTicket,
  listSupportCatalog,
  listSupportFieldConfig,
  listSupportTickets,
  updateSupportStatus,
  type SupportAttachmentInput,
  type SupportCatalogItem,
  type SupportFieldConfig,
  type SupportTicketDetail,
  type SupportTicketListItem,
  type TicketPriority,
} from '../../api/suporte';

const inputClass =
  'w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm';

const STATUS_BADGE: Record<string, string> = {
  aberto: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200',
  em_analise: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
  aguardando_resposta_usuario: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  resolvido: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  fechado: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
};

const PRIORITY_BADGE: Record<string, string> = {
  baixa: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  media: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  alta: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
  critica: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200',
};

function toBrDate(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR');
}

function labelMap(items: SupportCatalogItem[], kind: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const it of items) {
    if (it.kind === kind) m.set(it.code, it.label);
  }
  return m;
}

async function fileToAttachment(file: File): Promise<SupportAttachmentInput> {
  const MAX_BYTES = 5 * 1024 * 1024;
  if (file.size > MAX_BYTES) throw new Error(`Arquivo ${file.name} excede 5MB.`);
  const allowed = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ]);
  if (!allowed.has(file.type)) throw new Error(`Tipo não permitido: ${file.name}`);
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error(`Falha ao ler arquivo ${file.name}.`));
    reader.readAsDataURL(file);
  });
  return {
    fileName: file.name,
    mimeType: file.type,
    contentBase64: base64,
    sizeBytes: file.size,
  };
}

export default function SuportePage() {
  const { isMaster, login, hasPermission, permissoes } = useAuth();
  const verTodos = podeVerTodosChamadosSuporte(isMaster, hasPermission);
  const alterarStatus = podeAlterarStatusChamadoSuporte(isMaster, hasPermission);
  const podeCriar = podeAbrirChamadoSuporte(isMaster, hasPermission, permissoes);
  const podeResponder = podeResponderChamadoSuporte(isMaster, hasPermission, permissoes);

  const [catalog, setCatalog] = useState<SupportCatalogItem[]>([]);
  const [tickets, setTickets] = useState<SupportTicketListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [errorList, setErrorList] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterUsuario, setFilterUsuario] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'prioridade'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [fieldConfigs, setFieldConfigs] = useState<SupportFieldConfig[]>([]);
  const [defaultPrioridade, setDefaultPrioridade] = useState<TicketPriority>('media');
  const [openForm, setOpenForm] = useState({
    tipo: '',
    titulo: '',
    descricao: '',
    categoria: '',
    prioridade: 'media' as TicketPriority,
    customFields: {} as Record<string, string>,
    attachments: [] as File[],
  });
  const [msgText, setMsgText] = useState('');
  const [msgFiles, setMsgFiles] = useState<File[]>([]);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const statusLabels = useMemo(() => labelMap(catalog, 'status'), [catalog]);
  const prioridadeLabels = useMemo(() => labelMap(catalog, 'prioridade'), [catalog]);
  const tipoLabels = useMemo(() => labelMap(catalog, 'tipo'), [catalog]);

  const activeStatusItems = useMemo(
    () => catalog.filter((c) => c.kind === 'status' && c.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [catalog]
  );
  const activePrioridadeItems = useMemo(
    () => catalog.filter((c) => c.kind === 'prioridade' && c.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [catalog]
  );
  const activeTipoItems = useMemo(
    () => catalog.filter((c) => c.kind === 'tipo' && c.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [catalog]
  );

  const loadCatalogAndFields = useCallback(async () => {
    const [cat, fields] = await Promise.all([listSupportCatalog(), listSupportFieldConfig()]);
    setCatalog(cat);
    setFieldConfigs(fields);
    const firstP = cat.find((c) => c.kind === 'prioridade' && c.active);
    if (firstP) {
      setDefaultPrioridade(firstP.code);
      setOpenForm((s) => ({ ...s, prioridade: firstP.code }));
    }
    const firstT = cat.find((c) => c.kind === 'tipo' && c.active);
    if (firstT) setOpenForm((s) => ({ ...s, tipo: firstT.code }));
  }, []);

  const activeConfigs = useMemo(() => fieldConfigs.filter((f) => f.active), [fieldConfigs]);

  const loadTickets = useCallback(async () => {
    setLoadingList(true);
    setErrorList(null);
    try {
      const data = await listSupportTickets({
        status: filterStatus || undefined,
        prioridade: filterPriority || undefined,
        tipo: filterTipo || undefined,
        usuario: verTodos ? filterUsuario || undefined : undefined,
        search: filterSearch || undefined,
        sortBy,
        sortDir,
      });
      setTickets(data);
    } catch (e) {
      setErrorList(e instanceof Error ? e.message : 'Falha ao carregar chamados.');
    } finally {
      setLoadingList(false);
    }
  }, [filterPriority, filterSearch, filterStatus, filterTipo, filterUsuario, verTodos, sortBy, sortDir]);

  const loadDetail = useCallback(async (id: number) => {
    setLoadingDetail(true);
    setDetailErr(null);
    try {
      const data = await getSupportTicket(id);
      setDetail(data);
    } catch (e) {
      setDetail(null);
      setDetailErr(e instanceof Error ? e.message : 'Falha ao carregar detalhe.');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalogAndFields();
  }, [loadCatalogAndFields]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (selectedId == null) return;
    void loadDetail(selectedId);
  }, [loadDetail, selectedId]);

  function statusBadge(code: string): string {
    return STATUS_BADGE[code] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
  }

  function priorityBadge(code: string): string {
    return PRIORITY_BADGE[code] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
  }

  function statusLabel(code: string): string {
    return statusLabels.get(code) ?? code;
  }

  function prioridadeLabel(code: string): string {
    return prioridadeLabels.get(code) ?? code;
  }

  const tiposFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of activeTipoItems) set.add(t.code);
    for (const t of tickets) set.add(t.tipo);
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [activeTipoItems, tickets]);

  const handleCreate = async () => {
    setCreateErr(null);
    if (!openForm.tipo.trim() || !openForm.titulo.trim() || !openForm.descricao.trim()) {
      setCreateErr('Tipo, título e descrição são obrigatórios.');
      return;
    }
    setSavingCreate(true);
    try {
      const attachments = await Promise.all(openForm.attachments.map(fileToAttachment));
      const created = await createSupportTicket({
        tipo: openForm.tipo.trim().toLowerCase(),
        titulo: openForm.titulo.trim(),
        descricao: openForm.descricao.trim(),
        categoria: openForm.categoria.trim() || undefined,
        prioridade: openForm.prioridade,
        customFields: openForm.customFields,
        attachments,
      });
      setOkMsg(`Chamado ${created.ticketNumber} aberto com sucesso.`);
      setShowCreate(false);
      const firstT = activeTipoItems[0]?.code ?? '';
      setOpenForm({
        tipo: firstT,
        titulo: '',
        descricao: '',
        categoria: '',
        prioridade: defaultPrioridade,
        customFields: {},
        attachments: [],
      });
      await loadTickets();
      setSelectedId(created.id);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Falha ao abrir chamado.');
    } finally {
      setSavingCreate(false);
    }
  };

  const handleSendMessage = async () => {
    if (!detail || !msgText.trim()) return;
    setSendingMsg(true);
    setDetailErr(null);
    try {
      const attachments = await Promise.all(msgFiles.map(fileToAttachment));
      await createSupportMessage(detail.id, { mensagem: msgText.trim(), attachments });
      setMsgText('');
      setMsgFiles([]);
      await loadDetail(detail.id);
      await loadTickets();
      setOkMsg('Mensagem enviada.');
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : 'Falha ao enviar mensagem.');
    } finally {
      setSendingMsg(false);
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (!detail) return;
    setSavingStatus(true);
    setDetailErr(null);
    try {
      await updateSupportStatus(detail.id, status);
      await loadDetail(detail.id);
      await loadTickets();
      setOkMsg('Status atualizado.');
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : 'Falha ao atualizar status.');
    } finally {
      setSavingStatus(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary-600 dark:text-primary-400">Suporte</p>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Chamados</h1>
        </div>
        {podeCriar && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            Abrir chamado
          </button>
        )}
      </div>
      {okMsg && <p className="text-sm text-emerald-700 dark:text-emerald-300">{okMsg}</p>}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-7 gap-2">
        <input
          className={inputClass}
          placeholder="Buscar por ID, título ou descrição"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
        />
        <select className={inputClass} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Status</option>
          {activeStatusItems.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
        <select className={inputClass} value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
          <option value="">Prioridade</option>
          {activePrioridadeItems.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label}
            </option>
          ))}
        </select>
        <select className={inputClass} value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
          <option value="">Tipo</option>
          {tiposFilterOptions.map((t) => (
            <option key={t} value={t}>
              {tipoLabels.get(t) ?? t}
            </option>
          ))}
        </select>
        {verTodos && (
          <input
            className={inputClass}
            placeholder="Usuário (login)"
            value={filterUsuario}
            onChange={(e) => setFilterUsuario(e.target.value)}
          />
        )}
        <select className={inputClass} value={sortBy} onChange={(e) => setSortBy(e.target.value as 'createdAt' | 'prioridade')}>
          <option value="createdAt">Ordenar por data</option>
          <option value="prioridade">Ordenar por prioridade</option>
        </select>
        <select className={inputClass} value={sortDir} onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}>
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 overflow-auto">
          {loadingList && <p className="text-sm text-slate-500">Carregando...</p>}
          {errorList && <p className="text-sm text-red-600">{errorList}</p>}
          {!loadingList && !errorList && tickets.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum chamado encontrado.</p>
          )}
          {!loadingList && tickets.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2">ID</th>
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Título</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Abertura</th>
                  <th className="py-2">Atualização</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    className={`border-t border-slate-100 dark:border-slate-700 cursor-pointer ${selectedId === t.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                    onClick={() => setSelectedId(t.id)}
                  >
                    <td className="py-2">{t.ticketNumber}</td>
                    <td className="py-2">{tipoLabels.get(t.tipo) ?? t.tipo}</td>
                    <td className="py-2">{t.titulo}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${statusBadge(t.status)}`}>
                        {statusLabel(t.status)}
                      </span>
                    </td>
                    <td className="py-2">{toBrDate(t.createdAt)}</td>
                    <td className="py-2">{toBrDate(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
          {selectedId == null && <p className="text-sm text-slate-500">Selecione um chamado para visualizar detalhes.</p>}
          {loadingDetail && <p className="text-sm text-slate-500">Carregando detalhes...</p>}
          {detailErr && <p className="text-sm text-red-600">{detailErr}</p>}
          {!loadingDetail && detail && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  {detail.ticketNumber} - {detail.titulo}
                </h2>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${statusBadge(detail.status)}`}>
                    {statusLabel(detail.status)}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${priorityBadge(detail.prioridade)}`}>
                    {prioridadeLabel(detail.prioridade)}
                  </span>
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <b>Usuário:</b> {detail.ownerNome ?? detail.ownerLogin}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <b>Tipo:</b> {tipoLabels.get(detail.tipo) ?? detail.tipo} | <b>Categoria:</b> {detail.categoria ?? '—'}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <b>Abertura:</b> {toBrDate(detail.createdAt)} | <b>Última atualização:</b> {toBrDate(detail.updatedAt)}
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{detail.descricao}</p>
              {detail.openingAttachments.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-500 uppercase">Anexos da abertura</p>
                  {detail.openingAttachments.map((a) => (
                    <a key={a.id} className="block text-sm text-primary-600 hover:underline" href={a.url} target="_blank" rel="noreferrer">
                      {a.originalName}
                    </a>
                  ))}
                </div>
              )}
              {alterarStatus && (
                <div className="flex flex-wrap items-center gap-2">
                  {activeStatusItems.map((s) => (
                    <button
                      key={s.code}
                      type="button"
                      disabled={savingStatus || detail.status === s.code}
                      onClick={() => void handleUpdateStatus(s.code)}
                      className="px-2 py-1 rounded border text-xs border-slate-300 dark:border-slate-600 disabled:opacity-50"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="max-h-64 overflow-auto rounded border border-slate-200 dark:border-slate-700 p-2 space-y-2">
                {detail.messages.length === 0 && <p className="text-sm text-slate-500">Sem mensagens ainda.</p>}
                {detail.messages.map((m) => (
                  <div key={m.id} className="rounded bg-slate-50 dark:bg-slate-700/40 p-2">
                    <p className="text-xs text-slate-500">
                      {m.authorType === 'master' ? 'master' : 'usuário'} · {m.authorNome ?? m.authorLogin} · {toBrDate(m.createdAt)}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{m.mensagem}</p>
                    {m.attachments.map((a) => (
                      <a key={a.id} className="block text-xs text-primary-600 hover:underline" href={a.url} target="_blank" rel="noreferrer">
                        {a.originalName}
                      </a>
                    ))}
                  </div>
                ))}
              </div>
              {podeResponder && (
                <>
                  <textarea
                    className={inputClass}
                    rows={3}
                    placeholder="Responder chamado..."
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                  />
                  <input type="file" multiple onChange={(e) => setMsgFiles(Array.from(e.target.files ?? []))} className="text-sm" />
                  <button
                    type="button"
                    disabled={sendingMsg || !msgText.trim()}
                    onClick={() => void handleSendMessage()}
                    className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm disabled:opacity-50"
                  >
                    {sendingMsg ? 'Enviando...' : verTodos ? 'Responder' : 'Enviar resposta'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showCreate && podeCriar && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div
            className="w-full max-w-3xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Abrir chamado</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
              <select
                className={inputClass}
                value={openForm.tipo}
                onChange={(e) => setOpenForm((s) => ({ ...s, tipo: e.target.value }))}
              >
                <option value="">Tipo</option>
                {activeTipoItems.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
              <select
                className={inputClass}
                value={openForm.prioridade}
                onChange={(e) => setOpenForm((s) => ({ ...s, prioridade: e.target.value }))}
              >
                {activePrioridadeItems.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              className={`${inputClass} mt-2`}
              placeholder="Título"
              value={openForm.titulo}
              onChange={(e) => setOpenForm((s) => ({ ...s, titulo: e.target.value }))}
            />
            <textarea
              className={`${inputClass} mt-2`}
              rows={5}
              placeholder="Descrição"
              value={openForm.descricao}
              onChange={(e) => setOpenForm((s) => ({ ...s, descricao: e.target.value }))}
            />
            <input
              className={`${inputClass} mt-2`}
              placeholder="Categoria"
              value={openForm.categoria}
              onChange={(e) => setOpenForm((s) => ({ ...s, categoria: e.target.value }))}
            />
            {activeConfigs.map((f) => (
              <div className="mt-2" key={f.fieldKey}>
                <label className="block text-xs text-slate-500 mb-1">
                  {f.label}
                  {f.required ? ' *' : ''}
                </label>
                {f.fieldType === 'select' ? (
                  <select
                    className={inputClass}
                    value={openForm.customFields[f.fieldKey] ?? ''}
                    onChange={(e) =>
                      setOpenForm((s) => ({
                        ...s,
                        customFields: { ...s.customFields, [f.fieldKey]: e.target.value },
                      }))
                    }
                  >
                    <option value="">Selecione</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={inputClass}
                    type={f.fieldType === 'number' ? 'number' : f.fieldType === 'date' ? 'date' : 'text'}
                    value={openForm.customFields[f.fieldKey] ?? ''}
                    onChange={(e) =>
                      setOpenForm((s) => ({
                        ...s,
                        customFields: { ...s.customFields, [f.fieldKey]: e.target.value },
                      }))
                    }
                  />
                )}
              </div>
            ))}
            <div className="mt-2">
              <label className="block text-xs text-slate-500 mb-1">Anexos</label>
              <input
                type="file"
                multiple
                onChange={(e) => setOpenForm((s) => ({ ...s, attachments: Array.from(e.target.files ?? []) }))}
                className="text-sm"
              />
            </div>
            {createErr && <p className="mt-2 text-sm text-red-600">{createErr}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 rounded border border-slate-300 text-sm">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={savingCreate}
                className="px-4 py-2 rounded bg-primary-600 text-white text-sm"
              >
                {savingCreate ? 'Abrindo...' : 'Abrir chamado'}
              </button>
            </div>
          </div>
        </div>
      )}
      <p className="text-xs text-slate-500">Usuário atual: {login ?? '—'}</p>
    </div>
  );
}
