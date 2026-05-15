import type { Request, Response } from 'express';
import {
  listarPedidos,
  obterResumoDashboard,
  obterResumoFinanceiro,
  obterResumoFinanceiroGrade,
  obterResumoStatusPorTipoF,
  obterTabelaStatusPorTipoF,
  obterResumoObservacoes,
  obterResumoMotivos,
  obterFiltrosOpcoes,
  obterMapaMunicipios,
  registrarAjustePrevisao,
  registrarAjustesPrevisaoLote,
  buscarPedidoPorId,
  listarHistoricoAjustes,
  limparTodosAjustes,
  invalidatePedidosCache,
} from '../data/pedidosRepository.js';
import { setLastUpload } from '../config/statusApp.js';
import {
  sendWhatsAppText,
  formatarMensagemAlteracaoPrevisao,
  formatarMensagemAlteracaoPrevisaoLote,
} from '../services/evolutionApi.js';
import { ajustarPrevisaoSchema, ajustarPrevisaoLoteSchema, limparHistoricoSchema } from '../validators/pedidos.js';
import { listarPedidosQuerySchema } from '../validators/pedidos.js';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';

function normalizeRotaName(dm: string): string {
  return String(dm ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function isCarradaRota(dm: string): boolean {
  return normalizeRotaName(dm).startsWith('rota ');
}

/** Extrai dígitos do número do PD (ex.: "PD 47192" -> "47192") para casar com order_number no Sycro. */
function extractPdDigits(pd: string): string {
  const m = String(pd ?? '').trim().match(/\d+/);
  return m ? m[0] : '';
}

/** Variantes comuns de order_number no banco do card (Sycro). */
function sycroOrderNumberVariants(pd: string): string[] {
  const raw = String(pd ?? '').trim();
  if (!raw) return [];
  const digits = extractPdDigits(raw);
  if (!digits) return [raw];
  return [...new Set([raw, digits, `PD ${digits}`, `PD${digits}`, `pd ${digits}`, `pd${digits}`])].filter(Boolean);
}

/** Rotas parametrizadas pela SQL do Gerenciador — não replicam ajuste entre pedidos por carrada. */
const EXCLUDED_SQL_ROTA_CATEGORIES = new Set([
  'retirada na so aco',
  'retirada na so moveis',
  'entrega grande teresina',
  'inserir em romaneio',
  'requisicao',
]);

function isExcludedSqlRotaCategory(dm: string): boolean {
  return EXCLUDED_SQL_ROTA_CATEGORIES.has(normalizeRotaName(dm));
}

function rotaFromPedidoRow(row: Record<string, unknown>): string {
  return String(row['Observacoes'] ?? row['Observações'] ?? row['Rota'] ?? row['rota'] ?? '').trim();
}

/**
 * POST /api/pedidos/sincronizar - invalida cache e reconsulta ERP (atualiza lastSyncErp).
 * Retorna 503 com mensagem do ERP quando a conexão com o Nomus falha.
 */
export async function sincronizar(_req: Request, res: Response): Promise<void> {
  try {
    invalidatePedidosCache();
    const result = await listarPedidos({});
    if (result.erroConexao) {
      res.status(503).json({
        error: 'Falha ao conectar ao ERP (Nomus).',
        detalhe: result.erroConexao,
      });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('sincronizar', err);
    res.status(503).json({
      error: 'Erro ao sincronizar com o ERP.',
      detalhe: err instanceof Error ? err.message : undefined,
    });
  }
}

/**
 * GET /api/pedidos - lista pedidos com filtros e paginação (page, limit=500). Retorna todos os campos do banco (Nomus + ajustes SQLite).
 */
export async function getPedidos(req: Request, res: Response): Promise<void> {
  const parsed = listarPedidosQuerySchema.safeParse(req.query);
  const filtros = parsed.success ? parsed.data : {};
  const page = (filtros as { page?: number }).page ?? 1;
  const limit = (filtros as { limit?: number }).limit ?? 500;
  try {
    const result = await listarPedidos({ ...filtros, page, limit });
    res.json(result);
  } catch (err) {
    console.error('getPedidos', err);
    res.status(503).json({ error: 'Erro ao listar pedidos.' });
  }
}

/**
 * GET /api/pedidos/export - lista todos os pedidos (sem paginação) para exportação XLSX.
 */
export async function getPedidosExport(req: Request, res: Response): Promise<void> {
  const parsed = listarPedidosQuerySchema.safeParse(req.query);
  const filtros = parsed.success ? parsed.data : {};
  const { page: _p, limit: _l, ...filtrosSemPaginacao } = filtros as {
    page?: number;
    limit?: number;
    [k: string]: unknown;
  };
  try {
    const result = await listarPedidos(filtrosSemPaginacao);
    res.json(result);
  } catch (err) {
    console.error('getPedidosExport', err);
    res.status(503).json({ error: 'Erro ao exportar pedidos.' });
  }
}

/**
 * GET /api/pedidos/resumo - totais para o dashboard. Query opcional: observacoes (rota) para filtrar.
 */
export async function getResumo(req: Request, res: Response): Promise<void> {
  const observacoes = typeof req.query.observacoes === 'string' ? req.query.observacoes.trim() || undefined : undefined;
  try {
    const resumo = await obterResumoDashboard(observacoes ? { observacoes } : {});
    res.json(resumo);
  } catch (err) {
    console.error('getResumo', err);
    res.status(503).json({ error: 'Erro ao obter resumo.' });
  }
}

/**
 * GET /api/pedidos/resumo-financeiro - 4 indicadores: quantidade pedidos, saldo a faturar a prazo, valor adiantamento, saldo a faturar.
 * Aceita os mesmos query params de listar pedidos (heatmap filters).
 */
export async function getResumoFinanceiro(req: Request, res: Response): Promise<void> {
  const parsed = listarPedidosQuerySchema.safeParse(req.query);
  const filtros = parsed.success ? parsed.data : {};
  const { page: _pg, limit: _lm, ...filtrosResumo } = filtros as { page?: number; limit?: number; [k: string]: unknown };
  try {
    const resumo = await obterResumoFinanceiro(filtrosResumo as Parameters<typeof obterResumoFinanceiro>[0]);
    res.json(resumo);
  } catch (err) {
    console.error('getResumoFinanceiro', err);
    res.status(503).json({ error: 'Erro ao obter resumo financeiro.' });
  }
}

/**
 * GET /api/pedidos/resumo-financeiro-grade - grade Resumo Financeiro (Rota x Condição x datas + Total Geral).
 * Aceita os mesmos query params de listar pedidos; data_ini/data_fim definem o período das colunas (padrão: semana corrente seg–sex).
 */
export async function getResumoFinanceiroGrade(req: Request, res: Response): Promise<void> {
  const parsed = listarPedidosQuerySchema.safeParse(req.query);
  const filtros = parsed.success ? parsed.data : {};
  try {
    const grade = await obterResumoFinanceiroGrade(filtros as Parameters<typeof obterResumoFinanceiroGrade>[0]);
    res.json(grade);
  } catch (err) {
    console.error('getResumoFinanceiroGrade', err);
    res.status(503).json({ error: 'Erro ao obter grade do resumo financeiro.' });
  }
}

/**
 * GET /api/pedidos/resumo-status-tipof - % Em dia por TipoF (Retirada, Entrega Grande Teresina, Carradas) para os indicadores.
 * Aceita os mesmos query params de listar pedidos (heatmap filters).
 */
export async function getResumoStatusPorTipoF(req: Request, res: Response): Promise<void> {
  const parsed = listarPedidosQuerySchema.safeParse(req.query);
  const filtros = parsed.success ? parsed.data : {};
  const { page: _pg, limit: _lm, ...filtrosResumo } = filtros as { page?: number; limit?: number; [k: string]: unknown };
  try {
    const resumo = await obterResumoStatusPorTipoF(filtrosResumo as Parameters<typeof obterResumoStatusPorTipoF>[0]);
    res.json(resumo);
  } catch (err) {
    console.error('getResumoStatusPorTipoF', err);
    res.status(503).json({ error: 'Erro ao obter resumo Status por TipoF.' });
  }
}

/**
 * GET /api/pedidos/tabela-status-tipof - tabela por TipoF (tipoF, total, emDia, percentual) e totalGeral para diagnóstico.
 */
export async function getTabelaStatusPorTipoF(_req: Request, res: Response): Promise<void> {
  try {
    const data = await obterTabelaStatusPorTipoF();
    res.json(data);
  } catch (err) {
    console.error('getTabelaStatusPorTipoF', err);
    res.status(503).json({ error: 'Erro ao obter tabela Status por TipoF.' });
  }
}

/**
 * GET /api/pedidos/observacoes-resumo - quantidade por Observacoes.
 */
export async function getResumoObservacoes(req: Request, res: Response): Promise<void> {
  try {
    const resumo = await obterResumoObservacoes();
    res.json(resumo);
  } catch (err) {
    console.error('getResumoObservacoes', err);
    res.status(503).json({ error: 'Erro ao obter resumo de observações.' });
  }
}

/**
 * GET /api/pedidos/resumo-motivos - quantidade de alterações por motivo.
 */
export async function getResumoMotivos(req: Request, res: Response): Promise<void> {
  try {
    const resumo = await obterResumoMotivos();
    res.json(resumo);
  } catch (err) {
    console.error('getResumoMotivos', err);
    res.status(503).json({ error: 'Erro ao obter resumo de motivos.' });
  }
}

/**
 * GET /api/pedidos/filtros-opcoes - valores distintos para Rota, Categoria (tipoF), Status, Método.
 */
export async function getFiltrosOpcoes(_req: Request, res: Response): Promise<void> {
  try {
    const opcoes = await obterFiltrosOpcoes();
    res.json(opcoes);
  } catch (err) {
    console.error('getFiltrosOpcoes', err);
    res.status(503).json({ error: 'Erro ao obter opções de filtros.' });
  }
}

/**
 * GET /api/pedidos/mapa-municipios - agregação por município com coordenadas (para mapa do dashboard).
 * Aceita os mesmos query params de listar pedidos (heatmap filters).
 */
export async function getMapaMunicipios(req: Request, res: Response): Promise<void> {
  const parsed = listarPedidosQuerySchema.safeParse(req.query);
  const filtros = parsed.success ? parsed.data : {};
  const { page: _pg, limit: _lm, ...filtrosMapa } = filtros as { page?: number; limit?: number; [k: string]: unknown };
  try {
    const dados = await obterMapaMunicipios(filtrosMapa as Parameters<typeof obterMapaMunicipios>[0]);
    res.json(dados);
  } catch (err) {
    console.error('getMapaMunicipios', err);
    res.status(503).json({ error: 'Erro ao obter dados do mapa.' });
  }
}

/**
 * POST /api/pedidos/:id/ajustar-previsao - registra ajuste e retorna pedido atualizado.
 */
export async function ajustarPrevisao(req: Request, res: Response): Promise<void> {
  const idPedido = req.params.id;
  if (!idPedido) {
    res.status(400).json({ error: 'id do pedido é obrigatório.' });
    return;
  }

  const parsed = ajustarPrevisaoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
    return;
  }

  const { previsao_nova, motivo, observacao, replicate_carrada, rota } = parsed.data;
  const dataPrevisao = new Date(previsao_nova);
  if (Number.isNaN(dataPrevisao.getTime())) {
    res.status(400).json({ error: 'Data de previsão inválida.' });
    return;
  }
  // `rota` informada => grava como override apenas naquela rota. Vazio/null => ajuste base.
  // Combinada com `replicate_carrada=true`, replica nos demais PDs da rota e cada um vira override por rota.
  const rotaOverride = typeof rota === 'string' && rota.trim() !== '' ? rota.trim() : null;

  const usuario = req.user?.login ?? 'anon';
  try {
    const pedidoAtual = await buscarPedidoPorId(idPedido);
    let previsaoAntigaStr = '—';
    if (pedidoAtual) {
      previsaoAntigaStr = new Date(pedidoAtual.previsao_entrega_atualizada).toISOString().slice(0, 10);
      const novaStr = dataPrevisao.toISOString().slice(0, 10);
      if (previsaoAntigaStr === novaStr) {
        res.status(400).json({
          error: 'A data não foi alterada. Informe uma data diferente da previsão atual para salvar.',
        });
        return;
      }
    }

    if (replicate_carrada === true) {
      if (!pedidoAtual) {
        res.status(404).json({ error: 'Pedido não encontrado.' });
        return;
      }
      const rota = rotaFromPedidoRow(pedidoAtual as Record<string, unknown>);
      if (!isCarradaRota(rota) || isExcludedSqlRotaCategory(rota)) {
        res.status(400).json({ error: 'Replicação por carrada não se aplica a esta rota.' });
        return;
      }
      const { data: rows } = await listarPedidos({ observacoes: rota });
      const idsUnicos = [...new Set(rows.map((r) => String(r.id_pedido ?? '').trim()).filter(Boolean))];
      if (idsUnicos.length === 0) {
        res.status(400).json({ error: 'Nenhum item encontrado para esta rota no Gerenciador.' });
        return;
      }
      const ajustes = idsUnicos.map((id) => ({
        id_pedido: id,
        previsao_nova: dataPrevisao,
        motivo,
        observacao: observacao ?? null,
        // Se o ajuste for por rota (override), replica para os demais PDs da rota mantendo o mesmo escopo.
        rota: rotaOverride,
      }));
      const resultado = await registrarAjustesPrevisaoLote(ajustes, usuario);
      if (resultado.erros.length > 0) {
        res.status(503).json({
          error: resultado.erros[0]?.erro ?? 'Erro ao replicar ajustes na carrada.',
          detalhes: resultado.erros,
        });
        return;
      }
      invalidatePedidosCache();
      const pedido = await buscarPedidoPorId(idPedido);
      if (!pedido) {
        res.status(404).json({ error: 'Pedido não encontrado após ajuste.' });
        return;
      }
      try {
        const novaPrevisaoStr = dataPrevisao.toISOString().slice(0, 10);
        const pedidoRow = pedido as Record<string, unknown>;
        const getVal = (keys: string[]) => {
          for (const k of keys) {
            const v = pedidoRow[k];
            if (v != null && String(v).trim() !== '') return String(v).trim();
          }
          return '';
        };
        const dataEntregaRaw = pedidoRow['Data de entrega'] ?? pedidoRow['dataEntrega'] ?? pedidoRow['Data de Entrega'];
        const dataEntregaStr =
          dataEntregaRaw != null
            ? dataEntregaRaw instanceof Date
              ? dataEntregaRaw.toISOString().slice(0, 10)
              : String(dataEntregaRaw).slice(0, 10)
            : '';
        const msg = formatarMensagemAlteracaoPrevisao({
          pedido: getVal(['PD', 'pd']) || undefined,
          codigo: getVal(['Cod', 'Codigo', 'cod']) || undefined,
          cliente: (pedido.cliente || getVal(['Cliente', 'cliente']) || '').trim() || undefined,
          descricao: (pedido.produto || getVal(['Descricao do produto', 'descricao']) || '').trim() || undefined,
          data_entrega: dataEntregaStr || undefined,
          previsao_antiga: previsaoAntigaStr,
          previsao_nova: novaPrevisaoStr,
          motivo,
          observacao: observacao ?? null,
          usuario,
        });
        sendWhatsAppText(msg).catch(() => {});
      } catch (_) {
        // não falha o ajuste se o WhatsApp der erro
      }
      res.json(pedido);
      return;
    }

    await registrarAjustePrevisao(idPedido, dataPrevisao, motivo, usuario, observacao ?? undefined, rotaOverride);
    invalidatePedidosCache();
    const pedido = await buscarPedidoPorId(idPedido);
    if (!pedido) {
      res.status(404).json({ error: 'Pedido não encontrado após ajuste.' });
      return;
    }
    try {
      const novaPrevisaoStr = dataPrevisao.toISOString().slice(0, 10);
      const pedidoRow = pedido as Record<string, unknown>;
      const getVal = (keys: string[]) => {
        for (const k of keys) {
          const v = pedidoRow[k];
          if (v != null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
      };
      const dataEntregaRaw = pedidoRow['Data de entrega'] ?? pedidoRow['dataEntrega'] ?? pedidoRow['Data de Entrega'];
      const dataEntregaStr = dataEntregaRaw != null
        ? (dataEntregaRaw instanceof Date ? dataEntregaRaw.toISOString().slice(0, 10) : String(dataEntregaRaw).slice(0, 10))
        : '';
      const msg = formatarMensagemAlteracaoPrevisao({
        pedido: getVal(['PD', 'pd']) || undefined,
        codigo: getVal(['Cod', 'Codigo', 'cod']) || undefined,
        cliente: (pedido.cliente || getVal(['Cliente', 'cliente']) || '').trim() || undefined,
        descricao: (pedido.produto || getVal(['Descricao do produto', 'descricao']) || '').trim() || undefined,
        data_entrega: dataEntregaStr || undefined,
        previsao_antiga: previsaoAntigaStr,
        previsao_nova: novaPrevisaoStr,
        motivo,
        observacao: observacao ?? null,
        usuario,
      });
      sendWhatsAppText(msg).catch(() => {});
    } catch (_) {
      // não falha o ajuste se o WhatsApp der erro
    }
    res.json(pedido);
  } catch (err) {
    console.error('ajustarPrevisao', err);
    res.status(503).json({
      error: err instanceof Error ? err.message : 'Erro ao registrar ajuste.',
    });
  }
}

/**
 * POST /api/pedidos/ajustar-previsao-lote - registra vários ajustes em uma requisição (createMany, otimizado).
 */
export async function ajustarPrevisaoLote(req: Request, res: Response): Promise<void> {
  // Compatibilidade: aceitar tanto { ajustes: [...] } quanto um array direto [...],
  // para funcionar mesmo se o frontend estiver enviando apenas o array.
  const raw = req.body;
  const body = Array.isArray(raw) ? { ajustes: raw } : (raw ?? {});
  const parsed = ajustarPrevisaoLoteSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
    return;
  }

  const dataValida = (s: string | undefined) =>
    typeof s === 'string' && s.trim() !== '' && !Number.isNaN(new Date(s.trim()).getTime());
  const mesmaData = (a: string, b: string) =>
    dataValida(a) && dataValida(b) && new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

  // Regra: não pode importar com Nova previsão sem data (vazia ou inválida)
  const linhasPrevisaoAtualSemData = parsed.data.ajustes
    .map((a, i) => ({ ...a, indice: i + 1 }))
    .filter((a) => !dataValida(a.previsao_nova));
  // Regra 1: aceitar apenas se TODAS as linhas tiverem Nova previsão diferente da Previsão atual
  const linhasComDataIgual = parsed.data.ajustes
    .map((a, i) => ({ ...a, indice: i + 1 }))
    .filter(
      (a) =>
        dataValida(a.previsao_nova) &&
        dataValida(a.previsao_atual) &&
        mesmaData(a.previsao_nova!, a.previsao_atual!)
    );
  const linhasComIgualVerdadeiro = parsed.data.ajustes
    .map((a, i) => ({ ...a, indice: i + 1 }))
    .filter((a) => a.igual === true);
  // Regra 2: não aceitar importação com motivo vazio
  const linhasComMotivoVazio = parsed.data.ajustes
    .map((a, i) => ({ ...a, indice: i + 1 }))
    .filter((a) => !(typeof a.motivo === 'string' && a.motivo.trim().length > 0));
  // Regra: não permitir Nova previsão anterior a hoje (quando diferente da Previsão atual); igual a hoje é permitido
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataPrevisaoAntesDeHoje = (dataStr: string) => {
    const raw = dataStr.trim();
    const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw + 'T12:00:00') : new Date(raw);
    if (Number.isNaN(d.getTime())) return false;
    const diaPrevisao = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return diaPrevisao.getTime() < hoje.getTime();
  };
  const linhasPrevisaoAnteriorHoje = parsed.data.ajustes
    .map((a, i) => ({ ...a, indice: i + 1 }))
    .filter(
      (a) =>
        dataValida(a.previsao_nova) &&
        dataValida(a.previsao_atual) &&
        !mesmaData(a.previsao_nova!, a.previsao_atual!) &&
        dataPrevisaoAntesDeHoje(a.previsao_nova!.trim())
    );

  if (
    linhasPrevisaoAtualSemData.length > 0 ||
    linhasComDataIgual.length > 0 ||
    linhasComIgualVerdadeiro.length > 0 ||
    linhasComMotivoVazio.length > 0 ||
    linhasPrevisaoAnteriorHoje.length > 0
  ) {
    const partes: string[] = [];
    if (linhasPrevisaoAnteriorHoje.length > 0) {
      partes.push(
        'Não é permitido importar com Nova previsão anterior à data de hoje. O arquivo contém linhas em que a Nova previsão é diferente da Previsão atual e a data é anterior a hoje.'
      );
    }
    if (linhasPrevisaoAtualSemData.length > 0) {
      partes.push(
        'O arquivo contém linhas com Nova previsão sem data ou com data inválida. Todas as linhas devem ter Nova previsão preenchida com uma data válida.'
      );
    }
    if (linhasComIgualVerdadeiro.length > 0) {
      partes.push(
        'O arquivo contém linhas com Igual? = Verdadeiro. A importação só é permitida quando todas as linhas têm Nova previsão diferente da Previsão atual.'
      );
    } else if (linhasComDataIgual.length > 0) {
      partes.push(
        'O arquivo contém linhas em que Nova previsão é igual à Previsão atual. A importação só é permitida quando todas as linhas têm Nova previsão diferente da Previsão atual.'
      );
    }
    if (linhasComMotivoVazio.length > 0) {
      partes.push('O arquivo contém linhas com motivo vazio. Todas as linhas devem ter motivo preenchido.');
    }
    res.status(400).json({
      error: `Upload bloqueado. ${partes.join(' ')} Corrija o arquivo e faça o upload novamente.`,
      linhas_previsao_anterior_hoje: linhasPrevisaoAnteriorHoje.map((a) => a.indice),
      linhas_previsao_sem_data: linhasPrevisaoAtualSemData.map((a) => a.indice),
      linhas_igual: linhasComIgualVerdadeiro.map((a) => a.indice),
      linhas_data_igual: linhasComDataIgual.map((a) => a.indice),
      linhas_motivo_vazio: linhasComMotivoVazio.map((a) => a.indice),
    });
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
  const itensComPrevisaoValida = parsed.data.ajustes.filter((a) => dataValida(a.previsao_nova));
  const porCarrada = new Map<string, Set<string>>();
  for (const a of itensComPrevisaoValida) {
    const rota = (a.rota ?? '').trim();
    if (!rota || isRotaExcluida(rota)) continue;
    const dataStr = new Date(a.previsao_nova!).toISOString().slice(0, 10);
    const cur = porCarrada.get(rota);
    if (cur) cur.add(dataStr);
    else porCarrada.set(rota, new Set([dataStr]));
  }
  const carradasDivergentes = [...porCarrada.entries()].filter(([, datas]) => datas.size > 1);
  if (carradasDivergentes.length > 0) {
    const rotasListadas = carradasDivergentes.map(([rota]) => `"${rota}"`).join(', ');
    res.status(400).json({
      error: `Upload bloqueado. Na mesma carrada todos os itens devem ter a mesma data de nova previsão. Carradas com datas divergentes: ${rotasListadas}. Corrija o arquivo e faça o upload novamente.`,
      carradas_com_datas_divergentes: carradasDivergentes.map(([rota]) => rota),
    });
    return;
  }

  if (itensComPrevisaoValida.length === 0) {
    res.status(400).json({ error: 'Nenhum item com data de nova previsão válida para processar.' });
    return;
  }

  // Usuário da requisição atual (quem está importando)
  const usuario = req.user?.login ?? 'anon';
  const ajustes = itensComPrevisaoValida.map((a) => ({
    id_pedido: a.id_pedido,
    previsao_nova: new Date(a.previsao_nova!),
    motivo: a.motivo ?? '',
    observacao: a.observacao ?? null,
    // Quando o item vem da grade do Gerenciador (linhas selecionadas com rota específica),
    // o frontend marca `apply_rota=true` para gravar override apenas naquela rota.
    rota: a.apply_rota === true && typeof a.rota === 'string' && a.rota.trim() !== '' ? a.rota.trim() : null,
  }));
  const resultados = await registrarAjustesPrevisaoLote(ajustes, usuario);
  invalidatePedidosCache();
  setLastUpload();
  try {
    if (resultados.applied && resultados.applied.length > 0) {
      const msg = formatarMensagemAlteracaoPrevisaoLote({
        ajustes: resultados.applied,
        usuario,
      });
      sendWhatsAppText(msg).catch(() => {});
    }
  } catch (_) {
    // não falha o lote se o WhatsApp der erro
  }
  res.json(resultados);
}

const LIMPAR_HISTORICO_LOGINS = new Set(['master', 'marquesfilho']);

/**
 * POST /api/pedidos/limpar-historico - remove todos os registros de alteração (apenas master/marquesfilho, exige senha).
 */
export async function limparHistorico(req: Request, res: Response): Promise<void> {
  const userLogin = req.user?.login;
  if (!userLogin || !LIMPAR_HISTORICO_LOGINS.has(userLogin)) {
    res.status(403).json({ error: 'Apenas o usuário master pode limpar o histórico de alterações.' });
    return;
  }
  const parsed = limparHistoricoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Senha é obrigatória para confirmar a ação.', details: parsed.error.flatten() });
    return;
  }
  try {
    const usuario = await prisma.usuario.findUnique({ where: { login: userLogin } });
    if (!usuario) {
      res.status(503).json({ error: 'Usuário não encontrado.' });
      return;
    }
    const senhaOk = await bcrypt.compare(parsed.data.senha, usuario.senhaHash);
    if (!senhaOk) {
      res.status(401).json({ error: 'Senha incorreta. Operação cancelada.' });
      return;
    }
    const count = await limparTodosAjustes();
    invalidatePedidosCache();
    res.json({ deleted: count });
  } catch (err) {
    console.error('limparHistorico', err);
    res.status(503).json({ error: 'Erro ao limpar histórico.' });
  }
}

/**
 * POST /api/pedidos/check-sycro - retorna PDs (números de pedido) que estão no Sycro entre os id_pedidos informados.
 * Usado na importação para bloquear upload quando a planilha contém pedidos que devem ser alterados no Sycro.
 */
export async function checkIdPedidosEmSycro(req: Request, res: Response): Promise<void> {
  const ids = req.body?.id_pedidos;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.json({ pd_em_sycro: [] });
    return;
  }
  const idSet = new Set(ids.map((id: unknown) => String(id ?? '').trim()).filter(Boolean));
  if (idSet.size === 0) {
    res.json({ pd_em_sycro: [] });
    return;
  }
  try {
    const { data: pedidos } = await listarPedidos({});
    const pdDosPedidos = new Set<string>();
    for (const p of pedidos) {
      const idPedido = String((p as Record<string, unknown>).id_pedido ?? '').trim();
      if (!idSet.has(idPedido)) continue;
      const pd = (p as Record<string, unknown>).PD ?? (p as Record<string, unknown>).pd;
      const pdStr = pd != null ? String(pd).trim() : '';
      if (pdStr) pdDosPedidos.add(pdStr);
    }
    const sycroOrders = await prisma.sycroOrderOrder.findMany({
      select: { order_number: true },
    });
    const sycroSet = new Set(sycroOrders.map((o) => (o.order_number ?? '').trim()).filter(Boolean));
    const pd_em_sycro = [...pdDosPedidos].filter((pd) => sycroSet.has(pd));
    res.json({ pd_em_sycro });
  } catch (err) {
    console.error('checkIdPedidosEmSycro', err);
    res.status(503).json({ error: 'Erro ao verificar pedidos no Sycro.' });
  }
}

/**
 * GET /api/pedidos/:id/historico - histórico de ajustes unificado (SQLite + Sycro).
 */
export async function getHistorico(req: Request, res: Response): Promise<void> {
  let idPedido = req.params.id ?? '';
  try {
    idPedido = decodeURIComponent(idPedido);
  } catch (_) {}
  idPedido = idPedido.trim();
  if (!idPedido) {
    res.status(400).json({ error: 'id do pedido é obrigatório.' });
    return;
  }
  try {
    const historico = await listarHistoricoAjustes(idPedido);
    const itens: Array<{ id: number; id_pedido: string; previsao_nova: Date; motivo: string; observacao: string | null; usuario: string; data_ajuste: Date }> = historico.map((h) => ({
      id: h.id,
      id_pedido: h.id_pedido,
      previsao_nova: h.previsao_nova,
      motivo: h.motivo,
      observacao: h.observacao,
      usuario: h.usuario,
      data_ajuste: h.data_ajuste,
    }));

    try {
      const pedido = await buscarPedidoPorId(idPedido);
      const pd = pedido ? String((pedido as Record<string, unknown>).PD ?? (pedido as Record<string, unknown>).pd ?? '').trim() : '';
      if (pd) {
        const variants = sycroOrderNumberVariants(pd);
        const sycroOrder =
          variants.length > 0
            ? await prisma.sycroOrderOrder.findFirst({
                where: { OR: variants.map((v) => ({ order_number: v })) },
                select: { id: true },
              })
            : null;
        if (sycroOrder) {
          const sycroHistory = await prisma.sycroOrderHistory.findMany({
            where: { order_id: sycroOrder.id },
            orderBy: { created_at: 'desc' },
            include: { usuario: { select: { nome: true } } },
          });
          const seen = new Set<string>();
          for (const h of sycroHistory) {
            const user_name = h.user_name ?? h.usuario?.nome ?? null;
            const key = `${h.action_type}\0${user_name ?? ''}\0${h.created_at.getTime()}\0${h.previous_date ?? ''}\0${h.new_date ?? ''}\0${h.observation ?? ''}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const created = h.created_at;
            const previsaoNova = h.new_date ? new Date(h.new_date + 'T12:00:00') : new Date(0);
            itens.push({
              id: -h.id,
              id_pedido: idPedido,
              previsao_nova: previsaoNova,
              motivo: h.action_type === 'AJUSTE_PREVISAO' ? 'Ajuste de previsão' : h.action_type,
              observacao: h.observation,
              usuario: user_name ?? 'Sistema',
              data_ajuste: created,
            });
          }
          itens.sort((a, b) => b.data_ajuste.getTime() - a.data_ajuste.getTime());
        }
      }
    } catch (_) {
      // Se falhar ao buscar pedido ou histórico Sycro, segue só com o histórico da gestão (SQLite)
    }

    res.json(itens);
  } catch (err) {
    console.error('getHistorico', err);
    res.status(503).json({ error: 'Erro ao obter histórico.' });
  }
}
