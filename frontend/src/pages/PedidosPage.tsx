import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import FiltroPedidos, { type FiltrosPedidosState } from '../components/FiltroPedidos';
import TabelaPedidos, { SORT_LEVELS_DEFAULT } from '../components/TabelaPedidos';
import ModalClassificarPedidos from '../components/ModalClassificarPedidos';
import FiltroDatasPopover from '../components/FiltroDatasPopover';
import ModalAjustePrevisao, { type AjustePrevisaoSuccessMeta } from '../components/ModalAjustePrevisao';
import ModalReprogramacaoLote from '../components/ModalReprogramacaoLote';
import { useAuth } from '../contexts/AuthContext';
import { PERMISSOES } from '../config/permissoes';
import { listarPedidos, listarPedidosExport, ajustarPrevisao, ajustarPrevisaoLote, limparHistorico, checkPedidosEmSycro, type Pedido } from '../api/pedidos';
import { listarMotivosSugestao } from '../api/motivosSugestao';
import { downloadPedidosXlsx, downloadPedidosGradeXlsx, parsePedidosXlsxForImport, type LinhaImportacao } from '../utils/exportImportPedidos';
import ModalImportacao, { type ResultadoImportacao } from '../components/ModalImportacao';
import { loadFiltrosPedidos, saveFiltrosPedidos } from '../utils/persistFiltros';
import {
  analisarInconsistenciaQtdePendenteReal,
  resumoTooltipInconsistencia,
  type GrupoInconsistenciaQtdePendente,
} from '../utils/qtdePendenteInconsistencia';

const PAGE_SIZE = 100;
/** Limite para varrer todos os registros do filtro atual e detectar inconsistência (evita requisição gigante). */
const MAX_INCOHERENCE_PEDIDOS = 3000;

function buildListarPedidosQuery(
  pagina: number,
  pageLimit: number,
  f: FiltrosPedidosState,
  sortLevelsArg: { id: string; dir: 'asc' | 'desc' }[]
) {
  return {
    cliente: f.cliente || undefined,
    observacoes: f.observacoes || undefined,
    pd: f.pd || undefined,
    cod: f.cod || undefined,
    data_emissao_ini: f.data_emissao_ini || undefined,
    data_emissao_fim: f.data_emissao_fim || undefined,
    data_entrega_ini: f.data_entrega_ini || undefined,
    data_entrega_fim: f.data_entrega_fim || undefined,
    data_previsao_anterior_ini: f.data_previsao_anterior_ini || undefined,
    data_previsao_anterior_fim: f.data_previsao_anterior_fim || undefined,
    data_ini: f.data_previsao_ini || undefined,
    data_fim: f.data_previsao_fim || undefined,
    atrasados: f.atrasados || undefined,
    grupo_produto: f.grupo_produto || undefined,
    setor_producao: f.setor_producao || undefined,
    uf: f.uf || undefined,
    municipio_entrega: f.municipio_entrega || undefined,
    motivo: f.motivo || undefined,
    vendedor: f.vendedor || undefined,
    tipo_f: f.tipo_f || undefined,
    status: f.status || undefined,
    metodo: f.metodo || undefined,
    page: pagina,
    limit: pageLimit,
    sort_levels: Array.isArray(sortLevelsArg) && sortLevelsArg.length > 0 ? sortLevelsArg : undefined,
  };
}

const filtrosIniciais: FiltrosPedidosState = {
  cliente: '',
  observacoes: '',
  pd: '',
  cod: '',
  data_emissao_ini: '',
  data_emissao_fim: '',
  data_entrega_ini: '',
  data_entrega_fim: '',
  data_previsao_anterior_ini: '',
  data_previsao_anterior_fim: '',
  data_previsao_ini: '',
  data_previsao_fim: '',
  atrasados: false,
  grupo_produto: '',
  setor_producao: '',
  uf: '',
  municipio_entrega: '',
  motivo: '',
  vendedor: '',
  tipo_f: '',
  status: '',
  metodo: '',
};

export default function PedidosPage() {
  const { hasPermission, login } = useAuth();
  const podeExportarXlsx = hasPermission(PERMISSOES.PCP_EXPORTAR_XLSX) || hasPermission(PERMISSOES.PCP_TOTAL) || hasPermission(PERMISSOES.PEDIDOS_EDITAR);
  const podeExportarGrade = hasPermission(PERMISSOES.PCP_EXPORTAR_GRADE) || hasPermission(PERMISSOES.PCP_TOTAL) || hasPermission(PERMISSOES.PEDIDOS_EDITAR);
  const podeImportarXlsx = hasPermission(PERMISSOES.PCP_IMPORTAR_XLSX) || hasPermission(PERMISSOES.PCP_TOTAL) || hasPermission(PERMISSOES.PEDIDOS_EDITAR);
  const podeAjustarPrevisao = hasPermission(PERMISSOES.PCP_AJUSTAR_PREVISAO) || hasPermission(PERMISSOES.PCP_TOTAL) || hasPermission(PERMISSOES.PEDIDOS_EDITAR);
  const isMaster = login === 'master';
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState<FiltrosPedidosState>(() => loadFiltrosPedidos(filtrosIniciais));
  const [modalPedido, setModalPedido] = useState<Pedido | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportGradeLoading, setExportGradeLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [limparLoading, setLimparLoading] = useState(false);
  const inputImportRef = useRef<HTMLInputElement>(null);
  const [modalImportOpen, setModalImportOpen] = useState(false);
  const [importProgresso, setImportProgresso] = useState(0);
  const [importStatus, setImportStatus] = useState<'importando' | 'sucesso' | 'erro'>('importando');
  const [importResultado, setImportResultado] = useState<ResultadoImportacao | null>(null);
  const [importMensagemErro, setImportMensagemErro] = useState<string | undefined>(undefined);
  const [modalLimparOpen, setModalLimparOpen] = useState(false);
  const [limparSenha, setLimparSenha] = useState('');
  const [limparErro, setLimparErro] = useState<string | null>(null);
  const [erroConexaoErp, setErroConexaoErp] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalLoteOpen, setModalLoteOpen] = useState(false);
  const [modalClassificarOpen, setModalClassificarOpen] = useState(false);
  const [sortLevelsPersonalizado, setSortLevelsPersonalizado] = useState<{ id: string; dir: 'asc' | 'desc' }[]>(() => [...SORT_LEVELS_DEFAULT]);
  const [mostrarFiltros, setMostrarFiltros] = useState(true);
  const incoherenceFullRowsRef = useRef<Pedido[] | null>(null);
  const [incoherenceHasIssue, setIncoherenceHasIssue] = useState(false);
  const [incoherenceScanBusy, setIncoherenceScanBusy] = useState(false);
  const [incoherenceGrupos, setIncoherenceGrupos] = useState<GrupoInconsistenciaQtdePendente[]>([]);
  const [incoherenceViewRows, setIncoherenceViewRows] = useState<Pedido[] | null>(null);
  const [incoherenceClickBusy, setIncoherenceClickBusy] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const incoherenceTooltip = useMemo(() => {
    let t = resumoTooltipInconsistencia(incoherenceGrupos);
    if (total > MAX_INCOHERENCE_PEDIDOS) {
      t += `\n\nAtenção: o filtro atual retorna mais de ${MAX_INCOHERENCE_PEDIDOS} registros; o farol analisa apenas os primeiros ${PAGE_SIZE} carregados nesta página. Para análise completa, restrinja o filtro (ex.: por PD).`;
    }
    return t;
  }, [incoherenceGrupos, total]);

  const handleIncoherenceIconClick = useCallback(async () => {
    if (incoherenceViewRows) {
      setIncoherenceViewRows(null);
      return;
    }
    let rows = incoherenceFullRowsRef.current;
    if (!rows || rows.length === 0) {
      if (total <= 0) return;
      setIncoherenceClickBusy(true);
      try {
        const lim = Math.min(total, MAX_INCOHERENCE_PEDIDOS);
        const r = await listarPedidos(buildListarPedidosQuery(1, lim, filtros, sortLevelsPersonalizado));
        rows = Array.isArray(r?.data) ? r.data : [];
      } catch {
        rows = [];
      } finally {
        setIncoherenceClickBusy(false);
      }
    }
    const { linhasAfetadas } = analisarInconsistenciaQtdePendenteReal(rows ?? []);
    if (linhasAfetadas.length > 0) {
      setIncoherenceViewRows(linhasAfetadas);
    }
  }, [incoherenceViewRows, total, filtros, sortLevelsPersonalizado]);

  const carregarPedidos = useCallback(
    async (pagina: number = 1, filtrosOverride?: FiltrosPedidosState, sortLevelsOverride?: { id: string; dir: 'asc' | 'desc' }[]) => {
      const f = filtrosOverride ?? filtros;
      const sortLevelsToUse = sortLevelsOverride ?? sortLevelsPersonalizado;
      setLoading(true);
      setIncoherenceViewRows(null);
      setIncoherenceScanBusy(true);
      try {
        const query = buildListarPedidosQuery(pagina, PAGE_SIZE, f, sortLevelsToUse);
        const result = await listarPedidos(query);
        const data = Array.isArray(result?.data) ? result.data : (Array.isArray(result) ? result : []);
        const totalCount = typeof result?.total === 'number' ? result.total : data.length;
        setPedidos(data);
        setTotal(totalCount);
        setPage(pagina);
        setErroConexaoErp(result?.erroConexao ?? null);

        let gruposScan: GrupoInconsistenciaQtdePendente[] = [];
        if (totalCount === 0) {
          incoherenceFullRowsRef.current = null;
          gruposScan = [];
        } else if (totalCount <= MAX_INCOHERENCE_PEDIDOS) {
          const fullResult = await listarPedidos(buildListarPedidosQuery(1, totalCount, f, sortLevelsToUse));
          const allRows = Array.isArray(fullResult?.data) ? fullResult.data : [];
          incoherenceFullRowsRef.current = allRows;
          gruposScan = analisarInconsistenciaQtdePendenteReal(allRows).grupos;
        } else {
          incoherenceFullRowsRef.current = null;
          gruposScan = analisarInconsistenciaQtdePendenteReal(data).grupos;
        }
        setIncoherenceGrupos(gruposScan);
        setIncoherenceHasIssue(gruposScan.length > 0);
      } catch {
        setPedidos([]);
        setTotal(0);
        setErroConexaoErp(null);
        incoherenceFullRowsRef.current = null;
        setIncoherenceGrupos([]);
        setIncoherenceHasIssue(false);
      } finally {
        setLoading(false);
        setIncoherenceScanBusy(false);
      }
    },
    [filtros, sortLevelsPersonalizado]
  );

  useEffect(() => {
    carregarPedidos(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => carregarPedidos(1);
    window.addEventListener('sincronizado', handler);
    return () => window.removeEventListener('sincronizado', handler);
  }, [carregarPedidos]);

  const handleSortLevelsChange = useCallback(
    (levels: { id: string; dir: 'asc' | 'desc' }[]) => {
      setSortLevelsPersonalizado(levels);
      carregarPedidos(1, undefined, levels);
    },
    [carregarPedidos]
  );

  useEffect(() => {
    saveFiltrosPedidos(filtros);
  }, [filtros]);

  const aplicarFiltros = () => {
    carregarPedidos(1);
  };

  const limparFiltros = () => {
    setFiltros(filtrosIniciais);
    saveFiltrosPedidos(filtrosIniciais);
    carregarPedidos(1, filtrosIniciais);
  };

  const mergePedidosAposAjuste = (prev: Pedido[], atualizado: Pedido, meta?: AjustePrevisaoSuccessMeta): Pedido[] => {
    const lista = meta?.atualizadosMesmaCarrada;
    if (lista && lista.length > 0) {
      const mapById = new Map(lista.map((p) => [String(p.id_pedido ?? '').trim(), p]));
      return prev.map((p) => {
        const id = String(p.id_pedido ?? '').trim();
        return mapById.get(id) ?? p;
      });
    }
    return prev.map((p) => (p.id_pedido === atualizado.id_pedido ? atualizado : p));
  };

  const handleAjusteSuccess = (atualizado: Pedido, meta?: AjustePrevisaoSuccessMeta) => {
    setPedidos((prev) => mergePedidosAposAjuste(prev, atualizado, meta));
    setIncoherenceViewRows((prev) => (prev && prev.length > 0 ? mergePedidosAposAjuste(prev, atualizado, meta) : prev));
    setToast(meta?.atualizadosMesmaCarrada?.length ? 'Previsão replicada na carrada e grade atualizada.' : 'Previsão atualizada com sucesso.');
    setTimeout(() => setToast(null), 3000);
  };

  const exportarXlsx = useCallback(async () => {
    setExportLoading(true);
    try {
      const [result, motivos] = await Promise.all([
        listarPedidosExport({
          cliente: filtros.cliente || undefined,
          observacoes: filtros.observacoes || undefined,
          pd: filtros.pd || undefined,
          cod: filtros.cod || undefined,
          data_emissao_ini: filtros.data_emissao_ini || undefined,
          data_emissao_fim: filtros.data_emissao_fim || undefined,
          data_entrega_ini: filtros.data_entrega_ini || undefined,
          data_entrega_fim: filtros.data_entrega_fim || undefined,
          data_previsao_anterior_ini: filtros.data_previsao_anterior_ini || undefined,
          data_previsao_anterior_fim: filtros.data_previsao_anterior_fim || undefined,
          data_ini: filtros.data_previsao_ini || undefined,
          data_fim: filtros.data_previsao_fim || undefined,
          atrasados: filtros.atrasados || undefined,
          grupo_produto: filtros.grupo_produto || undefined,
          setor_producao: filtros.setor_producao || undefined,
          uf: filtros.uf || undefined,
          municipio_entrega: filtros.municipio_entrega || undefined,
          motivo: filtros.motivo || undefined,
          vendedor: filtros.vendedor || undefined,
          tipo_f: filtros.tipo_f || undefined,
          status: filtros.status || undefined,
          metodo: filtros.metodo || undefined,
        }),
        listarMotivosSugestao().catch(() => []),
      ]);
      const data = Array.isArray(result?.data) ? result.data : [];
      const motivosDescricoes = Array.isArray(motivos) ? motivos.map((m) => m.descricao) : [];
      await downloadPedidosXlsx(data, `pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`, motivosDescricoes);
      setToast(`Exportados ${data.length} pedidos.`);
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast('Erro ao exportar.');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setExportLoading(false);
    }
  }, [filtros]);

  const exportarGrade = useCallback(async () => {
    setExportGradeLoading(true);
    try {
      const result = await listarPedidosExport({
        cliente: filtros.cliente || undefined,
        observacoes: filtros.observacoes || undefined,
        pd: filtros.pd || undefined,
        cod: filtros.cod || undefined,
        data_emissao_ini: filtros.data_emissao_ini || undefined,
        data_emissao_fim: filtros.data_emissao_fim || undefined,
        data_entrega_ini: filtros.data_entrega_ini || undefined,
        data_entrega_fim: filtros.data_entrega_fim || undefined,
        data_previsao_anterior_ini: filtros.data_previsao_anterior_ini || undefined,
        data_previsao_anterior_fim: filtros.data_previsao_anterior_fim || undefined,
        data_ini: filtros.data_previsao_ini || undefined,
        data_fim: filtros.data_previsao_fim || undefined,
        atrasados: filtros.atrasados || undefined,
        grupo_produto: filtros.grupo_produto || undefined,
        setor_producao: filtros.setor_producao || undefined,
        uf: filtros.uf || undefined,
        municipio_entrega: filtros.municipio_entrega || undefined,
        motivo: filtros.motivo || undefined,
        vendedor: filtros.vendedor || undefined,
        tipo_f: filtros.tipo_f || undefined,
        status: filtros.status || undefined,
        metodo: filtros.metodo || undefined,
      });
      const data = Array.isArray(result?.data) ? result.data : [];
      await downloadPedidosGradeXlsx(data, `pedidos_grade_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setToast(`Grade exportada: ${data.length} pedidos.`);
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast('Erro ao exportar grade.');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setExportGradeLoading(false);
    }
  }, [filtros]);

  const executarImportacao = useCallback(
    async (linhas: LinhaImportacao[]) => {
      const dataValida = (s: string) => {
        const t = (s ?? '').trim();
        if (!t) return false;
        const d = new Date(t);
        return !Number.isNaN(d.getTime());
      };
      const comPrevisao = linhas.filter((l) => dataValida(l.nova_previsao));
      const total = comPrevisao.length;
      let ok = 0;
      const errosLista: string[] = [];
      const TAMANHO_LOTE = 1000;
      setImportStatus('importando');
      setImportProgresso(0);
      setImportResultado(null);
      setImportMensagemErro(undefined);
      for (let inicio = 0; inicio < comPrevisao.length; inicio += TAMANHO_LOTE) {
        const lote = comPrevisao.slice(inicio, inicio + TAMANHO_LOTE);
        const ajustes = lote.map((linha) => ({
          id_pedido: linha.id_pedido,
          previsao_nova: linha.nova_previsao,
          motivo: linha.motivo,
          observacao: linha.observacao || undefined,
          previsao_atual: linha.previsao_atual || undefined,
          rota: linha.rota || undefined,
          igual: linha.igual,
        }));
        const resultado = await ajustarPrevisaoLote(ajustes);
        ok += resultado.ok;
        resultado.erros.forEach((e) => errosLista.push(`Pedido ${e.id_pedido}: ${e.erro}`));
        const processados = Math.min(inicio + TAMANHO_LOTE, total);
        setImportProgresso(total > 0 ? Math.round((processados / total) * 100) : 100);
      }
      setImportStatus(errosLista.length > 0 ? 'erro' : 'sucesso');
      setImportResultado({
        ok,
        erros: errosLista.length,
        errosLista: errosLista.length > 0 ? errosLista : undefined,
      });
      carregarPedidos(1);
    },
    [carregarPedidos]
  );

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      setImportLoading(true);
      setModalImportOpen(true);
      setImportStatus('importando');
      setImportProgresso(0);
      setImportResultado(null);
      setImportMensagemErro(undefined);
      try {
        const linhas = await parsePedidosXlsxForImport(file);
        const idPedidosUnicos = [...new Set(linhas.map((l) => l.id_pedido).filter(Boolean))];
        if (idPedidosUnicos.length > 0) {
          try {
            const { pd_em_sycro } = await checkPedidosEmSycro(idPedidosUnicos);
            if (pd_em_sycro.length > 0) {
              setImportStatus('erro');
              setImportMensagemErro(
                `Upload bloqueado. O arquivo contém pedidos que estão no Sycro (${pd_em_sycro.join(', ')}). Faça alterações nesses pedidos diretamente no Sycro e tente novamente.`
              );
              setImportResultado(null);
              setImportLoading(false);
              return;
            }
          } catch {
            // Se a verificação falhar (ex.: rede), permitir seguir; o backend pode validar depois se necessário
          }
        }
        const dataValida = (s: string) => {
          const t = s.trim();
          if (!t) return false;
          const d = new Date(t);
          return !Number.isNaN(d.getTime());
        };
        const mesmaData = (a: string, b: string) => dataValida(a) && dataValida(b) && new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
        const linhasComIndex = linhas.map((l, i) => ({ l, linha: i + 2 }));

        // Regra: não pode importar com Nova previsão sem data (vazia ou inválida)
        const linhasPrevisaoAtualSemData = linhasComIndex.filter(({ l }) => !dataValida(l.nova_previsao));
        // Regra 1: aceitar apenas se TODAS as linhas tiverem Nova previsão diferente da Previsão atual
        const linhasComIgualVerdadeiro = linhasComIndex.filter(({ l }) => l.igual === true);
        const linhasComDataIgual = linhasComIndex.filter(
          ({ l }) => dataValida(l.nova_previsao) && dataValida(l.previsao_atual) && mesmaData(l.nova_previsao, l.previsao_atual)
        );
        // Regra 2: não aceitar importação com motivo vazio
        const linhasComMotivoVazio = linhasComIndex.filter(({ l }) => !String(l.motivo ?? '').trim());

        if (
          linhasPrevisaoAtualSemData.length > 0 ||
          linhasComIgualVerdadeiro.length > 0 ||
          linhasComDataIgual.length > 0 ||
          linhasComMotivoVazio.length > 0
        ) {
          setImportStatus('erro');
          const partes: string[] = [];
          if (linhasPrevisaoAtualSemData.length > 0) {
            partes.push(
              `O arquivo contém linhas com Nova previsão sem data ou com data inválida (linhas: ${linhasPrevisaoAtualSemData.map((x) => x.linha).join(', ')}). Todas as linhas devem ter Nova previsão preenchida com uma data válida.`
            );
          }
          if (linhasComIgualVerdadeiro.length > 0) {
            partes.push(
              `O arquivo contém linhas com Igual? = Verdadeiro (linhas: ${linhasComIgualVerdadeiro.map((x) => x.linha).join(', ')}). A importação só é permitida quando todas as linhas têm Nova previsão diferente da Previsão atual.`
            );
          } else if (linhasComDataIgual.length > 0) {
            partes.push(
              `O arquivo contém linhas em que Nova previsão é igual à Previsão atual (linhas: ${linhasComDataIgual.map((x) => x.linha).join(', ')}). A importação só é permitida quando todas as linhas têm Nova previsão diferente da Previsão atual.`
            );
          }
          if (linhasComMotivoVazio.length > 0) {
            partes.push(
              `O arquivo contém linhas com motivo vazio (linhas: ${linhasComMotivoVazio.map((x) => x.linha).join(', ')}). Todas as linhas devem ter motivo preenchido.`
            );
          }
          setImportMensagemErro(`Upload bloqueado. ${partes.join(' ')} Corrija o arquivo e faça o upload novamente.`);
          setImportResultado(null);
          setImportLoading(false);
          return;
        }

        const isRotaExcluida = (rota: string) => {
          const r = (rota ?? '').toLowerCase();
          return (
            r.includes('grande teresina') ||
            r.includes('requisição') || r.includes('requisicao') ||
            r.includes('retirada') ||
            r.includes('inserir romaneio') || r.includes('inserir em romaneio')
          );
        };
        const porCarrada = new Map<string, Set<string>>();
        linhas.forEach((l, idx) => {
          if (!dataValida(l.nova_previsao)) return;
          const rota = (l.rota ?? '').trim();
          if (!rota || isRotaExcluida(rota)) return;
          const dataStr = new Date(l.nova_previsao).toISOString().slice(0, 10);
          const cur = porCarrada.get(rota);
          if (cur) cur.add(dataStr);
          else porCarrada.set(rota, new Set([dataStr]));
        });
        const carradasComDatasDivergentes = [...porCarrada.entries()].filter(([, datas]) => datas.size > 1);
        if (carradasComDatasDivergentes.length > 0) {
          setImportStatus('erro');
          const rotasListadas = carradasComDatasDivergentes.map(([rota]) => `"${rota}"`).join(', ');
          setImportMensagemErro(
            `Upload bloqueado. Na mesma carrada todos os itens devem ter a mesma data de nova previsão. Carradas com datas divergentes: ${rotasListadas}. Corrija o arquivo e faça o upload novamente.`
          );
          setImportResultado(null);
          setImportLoading(false);
          return;
        }

        // Bloqueio: Nova previsão diferente da Previsão atual e data anterior a hoje — não permitir importação (só inferior a hoje; igual a hoje é permitido)
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const dataPrevisaoAntesDeHoje = (dataStr: string) => {
          const raw = dataStr.trim();
          const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw + 'T12:00:00') : new Date(raw);
          if (Number.isNaN(d.getTime())) return false;
          const diaPrevisao = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          return diaPrevisao.getTime() < hoje.getTime();
        };
        const linhasPrevisaoAnteriorHoje = linhasComIndex.filter(
          ({ l }) =>
            dataValida(l.nova_previsao) &&
            !mesmaData(l.nova_previsao, l.previsao_atual) &&
            dataPrevisaoAntesDeHoje(l.nova_previsao)
        );
        if (linhasPrevisaoAnteriorHoje.length > 0) {
          setImportStatus('erro');
          setImportMensagemErro(
            `Upload bloqueado. O arquivo contém ${linhasPrevisaoAnteriorHoje.length} linha(s) em que a Nova previsão é diferente da Previsão atual e a data é anterior à data de hoje (linhas: ${linhasPrevisaoAnteriorHoje.map((x) => x.linha).join(', ')}). Não é permitido importar com Nova previsão menor que hoje. Corrija o arquivo e faça o upload novamente.`
          );
          setImportResultado(null);
          setImportLoading(false);
          return;
        }

        await executarImportacao(linhas);
      } catch (err) {
        setImportStatus('erro');
        const msg = err instanceof Error ? err.message : '';
        // Sempre que houver uma mensagem vinda do backend/util, exibimos ela diretamente
        // para ficar mais intuitivo (em vez de cair em um texto genérico).
        setImportMensagemErro(msg || 'Não foi possível ler o arquivo ou processar a importação. Verifique o formato e tente novamente.');
        setImportResultado(null);
      } finally {
        setImportLoading(false);
      }
    },
    [carregarPedidos, executarImportacao]
  );

  return (
    <div className="space-y-6 w-full min-w-0 flex flex-col" style={{ width: '100%', maxWidth: '100%' }}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Gestão de Pedidos</h2>
        <button
          type="button"
          onClick={() => setMostrarFiltros((v) => !v)}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
          title={mostrarFiltros ? 'Ocultar filtros' : 'Exibir filtros'}
          aria-label={mostrarFiltros ? 'Ocultar filtros' : 'Exibir filtros'}
        >
          {mostrarFiltros ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {mostrarFiltros && (
        <FiltroPedidos filtros={filtros} onChange={setFiltros} onAplicar={aplicarFiltros} onLimpar={limparFiltros} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {(podeExportarXlsx || podeExportarGrade || podeImportarXlsx || podeAjustarPrevisao) && (
          <>
            {podeExportarXlsx && (
              <button
                type="button"
                onClick={exportarXlsx}
                disabled={exportLoading}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-50"
              >
                {exportLoading ? 'Exportando...' : 'Exportar XLSX'}
              </button>
            )}
            {podeExportarGrade && (
              <button
                type="button"
                onClick={exportarGrade}
                disabled={exportGradeLoading}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-50"
              >
                {exportGradeLoading ? 'Exportando...' : 'Exportar Grade'}
              </button>
            )}
            {podeImportarXlsx && (
              <>
                <button
                  type="button"
                  onClick={() => inputImportRef.current?.click()}
                  disabled={importLoading}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-50"
                >
                  {importLoading ? 'Importando...' : 'Importar XLSX'}
                </button>
                <input
                  ref={inputImportRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleImportFile}
                />
              </>
            )}
          </>
        )}
        {isMaster && (
          <button
            type="button"
            onClick={() => {
              setLimparSenha('');
              setLimparErro(null);
              setModalLimparOpen(true);
            }}
            className="rounded-lg border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 px-4 py-2 text-sm font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50"
          >
            Limpar histórico de alterações
          </button>
        )}
        <FiltroDatasPopover
          filtros={filtros}
          onChange={(updates) => setFiltros((prev) => ({ ...prev, ...updates }))}
        />
        <button
          type="button"
          onClick={() => setModalClassificarOpen(true)}
          className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
        >
          Classificação personalizada
        </button>
        <button
          type="button"
          onClick={() => void handleIncoherenceIconClick()}
          title={incoherenceTooltip}
          disabled={loading || incoherenceScanBusy || incoherenceClickBusy}
          aria-label={
            incoherenceScanBusy || incoherenceClickBusy
              ? 'Verificando quantidades pendentes'
              : incoherenceHasIssue
                ? 'Inconsistência: soma das quantidades pendentes reais por rota maior que a pendente do item. Clique para filtrar as linhas.'
                : 'Coerência OK entre soma por rota e quantidade pendente do item.'
          }
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold leading-none text-white shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-900 ${
            incoherenceScanBusy || incoherenceClickBusy
              ? 'border-slate-400 bg-slate-400 focus-visible:ring-slate-400'
              : incoherenceHasIssue
                ? 'border-red-700 bg-red-600 hover:bg-red-500 focus-visible:ring-red-500'
                : 'border-emerald-700 bg-emerald-600 hover:bg-emerald-500 focus-visible:ring-emerald-500'
          }`}
        >
          i
        </button>
        {podeAjustarPrevisao && selectedIds.size > 0 && (
          <button
            type="button"
            onClick={() => setModalLoteOpen(true)}
            className="rounded-lg bg-primary-600 hover:bg-primary-700 px-4 py-2 text-sm font-medium text-white"
          >
            Reprogramar em lote ({selectedIds.size} selecionado(s))
          </button>
        )}
      </div>
      {!loading && total === 0 && erroConexaoErp && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">Nenhum dado exibido.</p>
          <p className="mt-1">Falha na conexão com o ERP (Nomus):</p>
          <p className="mt-0.5 font-mono text-xs bg-amber-100 dark:bg-amber-900/50 px-2 py-1.5 rounded break-all">{erroConexaoErp}</p>
          <p className="mt-2 text-xs">
            Verifique <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">NOMUS_DB_URL</code> no .env do backend, rede/firewall até o servidor MySQL e a página <Link to="/situacao-api" className="underline font-medium">Situação da API</Link>.
          </p>
        </div>
      )}
      <div data-main-content className="min-w-0 w-full flex-1 flex flex-col" style={{ width: '100%', minWidth: 0 }}>
        {incoherenceViewRows && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-600/60 dark:bg-amber-950/40 dark:text-amber-100">
            <p>
              Exibindo <strong>{incoherenceViewRows.length}</strong> linha(s) em que a soma de <strong>Qtde Pendente Real</strong> por
              pedido+código ultrapassa a coluna <strong>Pendente</strong> do item (faturamento parcial sem vínculo por rota no ERP).
            </p>
            <button
              type="button"
              onClick={() => setIncoherenceViewRows(null)}
              className="shrink-0 rounded-md border border-amber-700/40 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-slate-800 dark:text-amber-100 dark:hover:bg-slate-700"
            >
              Voltar à grade completa
            </button>
          </div>
        )}
        <TabelaPedidos
          pedidos={incoherenceViewRows ?? pedidos}
          loading={loading}
          onAjustar={podeAjustarPrevisao ? setModalPedido : undefined}
          selectedIds={podeAjustarPrevisao ? selectedIds : undefined}
          onSelectionChange={podeAjustarPrevisao ? setSelectedIds : undefined}
          sortLevels={sortLevelsPersonalizado}
          onSortLevelsChange={handleSortLevelsChange}
        />
      </div>
      {total > 0 && !incoherenceViewRows && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
          <span>
            Exibindo {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total} registros
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => carregarPedidos(page - 1)}
              disabled={page <= 1 || loading}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="text-slate-500 dark:text-slate-400">
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => carregarPedidos(page + 1)}
              disabled={page >= totalPages || loading}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {modalPedido && (
        <ModalAjustePrevisao
          pedido={modalPedido}
          onClose={() => setModalPedido(null)}
          onSuccess={handleAjusteSuccess}
          onError={(msg) => setToast(msg)}
        />
      )}

      {modalLoteOpen && (
        <ModalReprogramacaoLote
          ids={Array.from(selectedIds)}
          onClose={() => setModalLoteOpen(false)}
          onSuccess={(resultado) => {
            setSelectedIds(new Set());
            setModalLoteOpen(false);
            const msg =
              resultado.erros.length > 0
                ? `${resultado.ok} pedido(s) reprogramado(s). ${resultado.erros.length} erro(s): ${resultado.erros.map((e) => e.id_pedido).join(', ')}`
                : `${resultado.ok} pedido(s) reprogramado(s) com sucesso.`;
            setToast(msg);
            setTimeout(() => setToast(null), 5000);
            carregarPedidos(page);
          }}
          onError={(msg) => setToast(msg)}
        />
      )}

      <ModalClassificarPedidos
        open={modalClassificarOpen}
        onClose={() => setModalClassificarOpen(false)}
        initialLevels={sortLevelsPersonalizado}
        onApply={handleSortLevelsChange}
      />

      <ModalImportacao
        open={modalImportOpen}
        progresso={importProgresso}
        status={importStatus}
        resultado={importResultado}
        mensagemErro={importMensagemErro}
        onClose={() => setModalImportOpen(false)}
      />

      {modalLimparOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setModalLimparOpen(false)}>
          <div
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-xl max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">Limpar histórico de alterações</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Esta ação remove todos os registros de alteração. Digite sua senha para confirmar.
            </p>
            <input
              type="password"
              value={limparSenha}
              onChange={(e) => { setLimparSenha(e.target.value); setLimparErro(null); }}
              placeholder="Senha"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-800 dark:text-slate-200 placeholder-slate-500"
              autoFocus
            />
            {limparErro && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{limparErro}</p>}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setModalLimparOpen(false)}
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={limparLoading || !limparSenha.trim()}
                onClick={async () => {
                  setLimparErro(null);
                  setLimparLoading(true);
                  try {
                    const { deleted } = await limparHistorico(limparSenha.trim());
                    setModalLimparOpen(false);
                    setToast(`${deleted} registro(s) de alteração removido(s).`);
                    setTimeout(() => setToast(null), 4000);
                    carregarPedidos(1);
                  } catch (err) {
                    setLimparErro(err instanceof Error ? err.message : 'Erro ao limpar histórico.');
                  } finally {
                    setLimparLoading(false);
                  }
                }}
                className="flex-1 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
              >
                {limparLoading ? 'Limpando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-4 py-2 text-slate-800 dark:text-slate-100 shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
