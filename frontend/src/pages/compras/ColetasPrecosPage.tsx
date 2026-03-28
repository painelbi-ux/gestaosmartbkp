import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOnSincronizado } from '../../hooks/useOnSincronizado';
import { useAuth } from '../../contexts/AuthContext';
import { PERMISSOES } from '../../config/permissoes';
import ModalCriarColetaPrecos from '../../components/compras/ModalCriarColetaPrecos';
import ModalFornecedoresColeta from '../../components/compras/ModalFornecedoresColeta';
import ModalPrecosColeta from '../../components/compras/ModalPrecosColeta';
import ConteudoMapaCotacao from '../../components/compras/ConteudoMapaCotacao';
import { MensagemSemRegistrosInline } from '../../components/MensagemSemRegistros';
import { listarColetasPrecos, obterOpcoesFiltroColetas, excluirColetaPrecos, listarColetasBloqueantes, registrarCienciaColeta, type ColetaPrecosListItem, type FornecedorColetaItem, type ColetaBloqueante } from '../../api/compras';
import MultiSelectWithSearch from '../../components/MultiSelectWithSearch';

function formatarData(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

const HORAS_BLOQUEIO_72 = 72;

/** Verifica se a coleta está bloqueando criar nova coleta (>72h sem movimentação, sem ciência, do usuário atual). */
function isColetaBloqueante(c: ColetaPrecosListItem, login: string | null): boolean {
  if (!login || (c.usuarioCriacao ?? '') !== login) return false;
  const status = c.status ?? 'Em cotação';
  if (status !== 'Em cotação' && status !== 'Em Aprovação') return false;
  if (c.temCiencia) return false;
  const ref = c.dataUltimaMovimentacao ?? c.dataCriacao;
  const refDate = new Date(ref).getTime();
  const limite = Date.now() - HORAS_BLOQUEIO_72 * 60 * 60 * 1000;
  return refDate < limite;
}

/** Retorna texto "há X min", "há 2 h 30 min", "há 3 dias" etc. */
function formatarTempoDecorrido(isoCriacao: string, agora: Date): string {
  try {
    const criacao = new Date(isoCriacao).getTime();
    const diffMs = Math.max(0, agora.getTime() - criacao);
    const diffS = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffS / 60);
    const diffH = Math.floor(diffMin / 60);
    const diffD = Math.floor(diffH / 24);
    if (diffD > 0) return `há ${diffD} ${diffD === 1 ? 'dia' : 'dias'}`;
    if (diffH > 0) {
      const min = diffMin % 60;
      if (min > 0) return `há ${diffH} h ${min} min`;
      return `há ${diffH} ${diffH === 1 ? 'hora' : 'horas'}`;
    }
    if (diffMin > 0) return `há ${diffMin} ${diffMin === 1 ? 'min' : 'min'}`;
    return `há ${diffS} s`;
  } catch {
    return '—';
  }
}

export default function ColetasPrecosPage() {
  const { hasPermission, login } = useAuth();
  const podeEditarCompras = hasPermission(PERMISSOES.COMPRAS_EDITAR);
  const [searchParams] = useSearchParams();
  const statusFromUrl = searchParams.get('status') ?? '';
  const [modalAberto, setModalAberto] = useState(false);
  const [popupBloqueio, setPopupBloqueio] = useState<ColetaBloqueante[] | null>(null);
  const [coletaCiencia, setColetaCiencia] = useState<ColetaPrecosListItem | null>(null);
  const [cienciaJustificativa, setCienciaJustificativa] = useState('');
  const [cienciaSenha, setCienciaSenha] = useState('');
  const [cienciaEnviando, setCienciaEnviando] = useState(false);
  const [cienciaErro, setCienciaErro] = useState<string | null>(null);
  const [coletaFornecedores, setColetaFornecedores] = useState<ColetaPrecosListItem | null>(null);
  const [coletaPrecos, setColetaPrecos] = useState<ColetaPrecosListItem | null>(null);
  const [coletaMapaCotacao, setColetaMapaCotacao] = useState<ColetaPrecosListItem | null>(null);
  const [alertaPrecosSemFornecedor, setAlertaPrecosSemFornecedor] = useState<ColetaPrecosListItem | null>(null);
  const [coletaToExcluir, setColetaToExcluir] = useState<ColetaPrecosListItem | null>(null);
  const [excluindoColetaId, setExcluindoColetaId] = useState<number | null>(null);
  const [erroExcluirColeta, setErroExcluirColeta] = useState<string | null>(null);
  const [coletas, setColetas] = useState<ColetaPrecosListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState(statusFromUrl);
  const [filterNomeColeta, setFilterNomeColeta] = useState('');
  const [filterCriadoPor, setFilterCriadoPor] = useState('');
  const [filterDataInicio, setFilterDataInicio] = useState('');
  const [filterDataFim, setFilterDataFim] = useState('');
  const [filterCodigo, setFilterCodigo] = useState('');
  const [filterDescricao, setFilterDescricao] = useState('');
  const [opcoesFiltro, setOpcoesFiltro] = useState<{ codigos: string[]; descricoes: string[] }>({ codigos: [], descricoes: [] });
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    setFilterStatus(statusFromUrl);
  }, [statusFromUrl]);

  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const codigosSelecionados = filterCodigo.split(',').map((s) => s.trim()).filter(Boolean);
  const descricoesSelecionadas = filterDescricao.split(',').map((s) => s.trim()).filter(Boolean);

  const filteredColetas = coletas.filter((c) => {
    const statusColeta = c.status ?? 'Em cotação';
    if (filterStatus && statusColeta !== filterStatus) return false;
    if (filterNomeColeta.trim()) {
      const term = filterNomeColeta.trim().toLowerCase();
      const nomesColeta = c.nomesColeta ?? [];
      const matchNomeColeta = nomesColeta.some((n) => n.toLowerCase().includes(term));
      const display = `Coleta #${c.id} (${c.qtdItens} itens, ${c.qtdRegistros} registros)`;
      const matchDisplay = display.toLowerCase().includes(term) || String(c.id).includes(term);
      if (!matchNomeColeta && !matchDisplay) return false;
    }
    if (filterCriadoPor.trim()) {
      const criado = (c.usuarioCriacao ?? '').toLowerCase();
      if (!criado.includes(filterCriadoPor.trim().toLowerCase())) return false;
    }
    if (filterDataInicio || filterDataFim) {
      const data = new Date(c.dataCriacao).getTime();
      if (filterDataInicio && data < new Date(filterDataInicio + 'T00:00:00').getTime()) return false;
      if (filterDataFim && data > new Date(filterDataFim + 'T23:59:59').getTime()) return false;
    }
    if (codigosSelecionados.length > 0) {
      const codigosColeta = c.codigosProduto ?? [];
      if (!codigosSelecionados.some((cod) => codigosColeta.includes(cod))) return false;
    }
    if (descricoesSelecionadas.length > 0) {
      const descricoesColeta = c.descricoesProduto ?? [];
      if (!descricoesSelecionadas.some((desc) => descricoesColeta.includes(desc))) return false;
    }
    return true;
  });

  const carregarColetas = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await listarColetasPrecos();
      const lista = Array.isArray(res.data) ? res.data : [];
        setColetas(
        lista.map((c) => ({
          ...c,
          status: c.status ?? 'Em cotação',
          dataEnvioAprovacao: c.dataEnvioAprovacao ?? null,
          fornecedores: (Array.isArray(c.fornecedores) ? c.fornecedores : []).map((f): FornecedorColetaItem => {
            if (typeof f === 'object' && f !== null && 'idPessoa' in f && 'nome' in f)
              return f as FornecedorColetaItem;
            if (typeof f === 'string') return { idPessoa: 0, nome: f };
            return { idPessoa: 0, nome: '' };
          }).filter((f) => f.nome.length > 0),
        }))
      );
      if (res.error) setErro(res.error);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar coletas.');
      setColetas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarColetas();
  }, [carregarColetas]);

  useOnSincronizado(carregarColetas);

  useEffect(() => {
    obterOpcoesFiltroColetas()
      .then((r) => setOpcoesFiltro({ codigos: r.codigos ?? [], descricoes: r.descricoes ?? [] }))
      .catch(() => setOpcoesFiltro({ codigos: [], descricoes: [] }));
  }, []);

  const temAlgumFiltro =
    !!filterStatus ||
    filterNomeColeta.trim() !== '' ||
    filterCriadoPor.trim() !== '' ||
    filterDataInicio !== '' ||
    filterDataFim !== '' ||
    filterCodigo.trim() !== '' ||
    filterDescricao.trim() !== '';

  const limparTodosFiltros = () => {
    setFilterStatus('');
    setFilterNomeColeta('');
    setFilterCriadoPor('');
    setFilterDataInicio('');
    setFilterDataFim('');
    setFilterCodigo('');
    setFilterDescricao('');
  };

  const handleConfirmarColeta = (ids?: string[], opts?: { bloqueante?: boolean; coletas?: ColetaBloqueante[] }) => {
    if (opts?.bloqueante && opts.coletas?.length) {
      setPopupBloqueio(opts.coletas);
      setModalAberto(false);
      return;
    }
    setModalAberto(false);
    carregarColetas();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Coletas de Preços</h2>
        {podeEditarCompras && (
          <button
            type="button"
            onClick={async () => {
              const { data: bloqueantes } = await listarColetasBloqueantes();
              if (bloqueantes.length > 0) {
                setPopupBloqueio(bloqueantes);
                return;
              }
              setModalAberto(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nova coleta de preços
          </button>
        )}
      </div>

      {erro && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">
          {erro}
        </div>
      )}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-600 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm min-w-[140px]"
            >
              <option value="">Todos</option>
              <option value="Em cotação">Em cotação</option>
              <option value="Em Aprovação">Em Aprovação</option>
              <option value="Rejeitada">Rejeitada</option>
              <option value="Finalizada">Finalizada</option>
              <option value="Enviado para Financeiro">Enviado para Financeiro</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Nome da coleta</label>
            <input
              type="text"
              placeholder="Ex.: 123, RESFRIADO ou A DEFINIR"
              value={filterNomeColeta}
              onChange={(e) => setFilterNomeColeta(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm min-w-[140px]"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Criada por</label>
            <input
              type="text"
              placeholder="Usuário"
              value={filterCriadoPor}
              onChange={(e) => setFilterCriadoPor(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm min-w-[140px]"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Data de criação (de)</label>
            <input
              type="date"
              value={filterDataInicio}
              onChange={(e) => setFilterDataInicio(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Data de criação (até)</label>
            <input
              type="date"
              value={filterDataFim}
              onChange={(e) => setFilterDataFim(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <MultiSelectWithSearch
            label="Código do Produto"
            placeholder="Todos"
            options={opcoesFiltro.codigos}
            value={filterCodigo}
            onChange={(v) => setFilterCodigo(v.split(',').map((s) => s.trim()).filter(Boolean).join(', '))}
            labelClass="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            inputClass="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent"
            minWidth="180px"
            optionLabel="códigos"
          />
          <MultiSelectWithSearch
            label="Descrição do Produto"
            placeholder="Todas"
            options={opcoesFiltro.descricoes}
            value={filterDescricao}
            onChange={(v) => setFilterDescricao(v.split(',').map((s) => s.trim()).filter(Boolean).join(', '))}
            labelClass="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            inputClass="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent"
            minWidth="200px"
            optionLabel="descrições"
          />
          {temAlgumFiltro && (
            <button
              type="button"
              onClick={limparTodosFiltros}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-sm font-medium transition shrink-0"
              title="Limpar todos os filtros"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Limpar filtros
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="py-3 px-4 font-semibold">Identificador / Nome</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Criado por</th>
                <th className="py-3 px-4 font-semibold">Tempo</th>
                <th className="py-3 px-4 font-semibold">Data de criação</th>
                <th className="py-3 px-4 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-200">
              {loading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    Carregando...
                  </td>
                </tr>
              )}
              {!loading && coletas.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 px-4 text-center">
                    <MensagemSemRegistrosInline />
                  </td>
                </tr>
              )}
              {!loading && filteredColetas.length === 0 && coletas.length > 0 && (
                <tr>
                  <td colSpan={6} className="py-8 px-4 text-center">
                    <MensagemSemRegistrosInline />
                  </td>
                </tr>
              )}
              {!loading && filteredColetas.map((c) => {
                const statusColeta = c.status ?? 'Em cotação';
                const emAprovacao = statusColeta === 'Em Aprovação';
                const finalizada = statusColeta === 'Finalizada';
                const rejeitada = statusColeta === 'Rejeitada';
                const emCotacao = statusColeta === 'Em cotação';
                const podeAbrirMapaCotacao = emAprovacao || finalizada || rejeitada || emCotacao;
                const dataRefTempo = emAprovacao && c.dataEnvioAprovacao ? c.dataEnvioAprovacao : c.dataCriacao;
                return (
                <tr key={c.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="py-3 px-4">Coleta #{c.id} ({c.qtdItens} itens, {c.qtdRegistros} registros)</td>
                  <td className="py-3 px-4">
                    <span
                      title={statusColeta === 'Rejeitada' && (c.justificativaCancelamento ?? '').trim() ? (c.justificativaCancelamento ?? '').trim() : undefined}
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        emAprovacao
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
                          : statusColeta === 'Finalizada'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                            : statusColeta === 'Enviado para Financeiro'
                              ? 'bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-200'
                              : statusColeta === 'Rejeitada'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                      }`}
                    >
                      {statusColeta}
                    </span>
                  </td>
                  <td className="py-3 px-4">{c.usuarioCriacao ?? '—'}</td>
                  <td className="py-3 px-4 font-medium tabular-nums text-primary-600 dark:text-primary-400">
                    {emAprovacao ? `Em aprovação: ${formatarTempoDecorrido(dataRefTempo, agora)}` : formatarTempoDecorrido(dataRefTempo, agora)}
                  </td>
                  <td className="py-3 px-4">{formatarData(c.dataCriacao)}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap items-center gap-1">
                      {statusColeta !== 'Em Aprovação' && statusColeta !== 'Finalizada' && statusColeta !== 'Rejeitada' && (
                        <button
                          type="button"
                          onClick={() => setColetaFornecedores(c)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-xs font-medium transition"
                          title="Fornecedores da cotação"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                          Fornecedores
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const qtdFornecedores = (c.fornecedores ?? []).length;
                          if (qtdFornecedores >= 1) setColetaPrecos(c);
                          else setAlertaPrecosSemFornecedor(c);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-xs font-medium transition"
                        title={(c.fornecedores ?? []).length >= 1 ? 'Preços e produtos da coleta' : 'Cadastre pelo menos 1 fornecedor para abrir os preços'}
                      >
                        Preços
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (podeAbrirMapaCotacao) setColetaMapaCotacao(c); }}
                        disabled={!podeAbrirMapaCotacao}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Abrir mapa de cotação (impressão/PDF disponível quando a coleta não estiver mais em cotação)"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 6l6 4 8-4 6 4v12l-6-4-8 4-6-4z" />
                          <path d="M8 10v12" />
                          <path d="M16 6v12" />
                        </svg>
                        Mapa de Cotação
                      </button>
                      {podeEditarCompras && isColetaBloqueante(c, login) && (
                        <button
                          type="button"
                          onClick={() => { setColetaCiencia(c); setCienciaJustificativa(''); setCienciaSenha(''); setCienciaErro(null); }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-xs font-medium transition"
                          title="Coleta com mais de 72h sem movimentação. Dar ciência e justificar para poder criar nova coleta."
                        >
                          Dar ciência
                        </button>
                      )}
                      {podeEditarCompras && !c.jaEnviadaAprovacao && (
                        <button
                          type="button"
                          onClick={() => setColetaToExcluir(c)}
                          disabled={excluindoColetaId != null}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-slate-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-medium transition disabled:opacity-50"
                          title="Excluir esta coleta (somente se nunca foi enviada para aprovação)"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                          Excluir coleta
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalAberto && (
        <ModalCriarColetaPrecos
          onClose={() => setModalAberto(false)}
          onConfirmar={handleConfirmarColeta}
        />
      )}

      {popupBloqueio && popupBloqueio.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setPopupBloqueio(null)} role="dialog" aria-modal="true" aria-labelledby="modal-bloqueio-title">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl max-w-md w-full p-6 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <h2 id="modal-bloqueio-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Não é possível criar nova coleta</h2>
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-4">
              Você possui coleta(s) com mais de 72 horas sem nenhuma movimentação. Para criar uma nova coleta, é necessário dar ciência e justificar o motivo do período em aberto em cada uma delas.
            </p>
            <ul className="list-disc list-inside text-sm text-slate-700 dark:text-slate-300 mb-4 space-y-1">
              {popupBloqueio.map((b) => (
                <li key={b.id}>Coleta #{b.id} ({b.status})</li>
              ))}
            </ul>
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-4">
              Na tabela abaixo, clique em <strong>Dar ciência</strong> na coleta indicada, preencha a justificativa e sua senha no popup.
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={() => setPopupBloqueio(null)} className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium">Entendi</button>
            </div>
          </div>
        </div>
      )}

      {coletaCiencia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-labelledby="modal-ciencia-title">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl max-w-md w-full p-6 flex flex-col">
            <h2 id="modal-ciencia-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Dar ciência — Coleta #{coletaCiencia.id}</h2>
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-3">
              Esta coleta está há mais de 72 horas sem movimentação. Informe o motivo do período em aberto e sua senha para registrar a ciência.
            </p>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Justificativa</label>
            <textarea
              value={cienciaJustificativa}
              onChange={(e) => setCienciaJustificativa(e.target.value)}
              placeholder="Ex.: Aguardando retorno do fornecedor..."
              rows={3}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm mb-3"
            />
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Sua senha</label>
            <input
              type="password"
              value={cienciaSenha}
              onChange={(e) => { setCienciaSenha(e.target.value); setCienciaErro(null); }}
              placeholder="Senha para confirmar"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm mb-3"
            />
            {cienciaErro && <p className="text-red-600 dark:text-red-400 text-sm mb-3">{cienciaErro}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setColetaCiencia(null); setCienciaJustificativa(''); setCienciaSenha(''); setCienciaErro(null); }} disabled={cienciaEnviando} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">Cancelar</button>
              <button
                type="button"
                disabled={cienciaEnviando || !cienciaJustificativa.trim() || !cienciaSenha}
                onClick={async () => {
                  if (!coletaCiencia) return;
                  setCienciaErro(null);
                  setCienciaEnviando(true);
                  const res = await registrarCienciaColeta(coletaCiencia.id, cienciaJustificativa.trim(), cienciaSenha);
                  setCienciaEnviando(false);
                  if (res.ok) {
                    setColetaCiencia(null);
                    setCienciaJustificativa('');
                    setCienciaSenha('');
                    carregarColetas();
                  } else {
                    setCienciaErro(res.error ?? 'Erro ao registrar ciência.');
                  }
                }}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50"
              >
                {cienciaEnviando ? 'Enviando…' : 'Confirmar ciência'}
              </button>
            </div>
          </div>
        </div>
      )}

      {coletaFornecedores && (
        <ModalFornecedoresColeta
          coletaId={coletaFornecedores.id}
          coletaLabel={`Coleta #${coletaFornecedores.id}`}
          fornecedoresAtuais={coletaFornecedores.fornecedores ?? []}
          onClose={() => setColetaFornecedores(null)}
          onSalvo={(fornecedores) => {
            setColetas((prev) =>
              prev.map((c) => (c.id === coletaFornecedores.id ? { ...c, fornecedores } : c))
            );
            setColetaFornecedores(null);
          }}
        />
      )}

      {coletaToExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => { if (!excluindoColetaId) { setColetaToExcluir(null); setErroExcluirColeta(null); } }} role="dialog" aria-modal="true" aria-labelledby="modal-excluir-coleta-title">
          <div
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl max-w-sm w-full p-6 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-excluir-coleta-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Excluir coleta</h2>
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-4">
              Deseja excluir a <strong>Coleta #{coletaToExcluir.id}</strong>? Esta ação não pode ser desfeita. Itens, registros e cotações serão removidos.
            </p>
            {erroExcluirColeta && (
              <p className="text-red-600 dark:text-red-400 text-sm mb-3">{erroExcluirColeta}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setColetaToExcluir(null); setErroExcluirColeta(null); }}
                disabled={excluindoColetaId != null}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!coletaToExcluir) return;
                  setErroExcluirColeta(null);
                  setExcluindoColetaId(coletaToExcluir.id);
                  const res = await excluirColetaPrecos(coletaToExcluir.id);
                  setExcluindoColetaId(null);
                  if (res.ok) {
                    setColetaToExcluir(null);
                    carregarColetas();
                  } else {
                    setErroExcluirColeta(res.error ?? 'Não foi possível excluir a coleta.');
                  }
                }}
                disabled={excluindoColetaId != null}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50"
              >
                {excluindoColetaId === coletaToExcluir.id ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {alertaPrecosSemFornecedor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setAlertaPrecosSemFornecedor(null)} role="dialog" aria-modal="true">
          <div
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl max-w-sm w-full p-6 flex flex-col items-center text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 dark:text-amber-400">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <p className="text-slate-800 dark:text-slate-200 font-medium mb-1">Fornecedores obrigatórios</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Cadastre pelo menos 1 fornecedor na coleta para abrir os preços.
            </p>
            <button
              type="button"
              onClick={() => setAlertaPrecosSemFornecedor(null)}
              className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium"
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      {coletaPrecos && (
        <ModalPrecosColeta
          coletaId={coletaPrecos.id}
          coletaLabel={`Coleta #${coletaPrecos.id}`}
          fornecedores={coletaPrecos.fornecedores ?? []}
          dataCriacao={coletaPrecos.dataCriacao}
          usuarioCriacao={coletaPrecos.usuarioCriacao}
          status={coletaPrecos.status ?? 'Em cotação'}
          dataEnvioAprovacao={coletaPrecos.dataEnvioAprovacao ?? null}
          observacoes={coletaPrecos.observacoes ?? null}
          requerVinculoFinalizacao={
            coletaPrecos.requerVinculoFinalizacao === true ||
            coletaPrecos.status === 'Em cotação' ||
            coletaPrecos.status === 'Em Aprovação'
          }
          podeEditarCompras={podeEditarCompras}
          onClose={() => setColetaPrecos(null)}
          onItemExcluido={carregarColetas}
          onColetaAlterada={carregarColetas}
        />
      )}

      {coletaMapaCotacao && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setColetaMapaCotacao(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-mapa-cotacao-title"
        >
          <div
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl w-full max-w-[98vw] max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-primary-600 text-white shrink-0 rounded-t-xl">
              <h2 id="modal-mapa-cotacao-title" className="text-lg font-semibold text-white">
                Mapa de Cotação — Coleta #{coletaMapaCotacao.id}
              </h2>
              <button
                type="button"
                onClick={() => setColetaMapaCotacao(null)}
                className="rounded p-1.5 text-white hover:bg-white/20 transition"
                aria-label="Fechar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 min-w-0 overflow-hidden p-4 flex flex-col">
              <ConteudoMapaCotacao coleta={coletaMapaCotacao} onClose={() => setColetaMapaCotacao(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
