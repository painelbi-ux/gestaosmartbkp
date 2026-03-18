import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import {
  listarPedidoCompraDataEntrega,
  obterFiltrosOpcoesPedidoCompra,
  atualizarDataEntregaItemPedidoCompra,
  type FiltrosPedidoCompraDataEntrega,
} from '../data/pedidoCompraDataEntregaRepository.js';
import { listarTickets, obterTicketPorId } from '../data/ticketRepository.js';
import { obterDadosFaturamentoDiario } from '../data/faturamentoDiarioRepository.js';
import { sendWhatsAppTextTo } from '../services/evolutionApi.js';
import { montarMensagemFaturamentoDiario } from '../services/faturamentoDiarioMensagem.js';
/**
 * GET /api/integracao/pedido-compra-data-entrega
 * Lista itens de pedido de compra para alteração de data de entrega (grade sem colunas ID).
 * Query: data_emissao_ini, data_emissao_fim, data_entrega_ini, data_entrega_fim, pedido, fornecedor, codigo_produto, descricao_produto (multi: vírgula)
 */
export async function getPedidoCompraDataEntrega(req: Request, res: Response): Promise<void> {
  const data_emissao_ini = typeof req.query.data_emissao_ini === 'string' ? req.query.data_emissao_ini : undefined;
  const data_emissao_fim = typeof req.query.data_emissao_fim === 'string' ? req.query.data_emissao_fim : undefined;
  const data_entrega_ini = typeof req.query.data_entrega_ini === 'string' ? req.query.data_entrega_ini : undefined;
  const data_entrega_fim = typeof req.query.data_entrega_fim === 'string' ? req.query.data_entrega_fim : undefined;
  const pedido = typeof req.query.pedido === 'string' ? req.query.pedido : undefined;
  const fornecedor = typeof req.query.fornecedor === 'string' ? req.query.fornecedor : undefined;
  const codigo_produto = typeof req.query.codigo_produto === 'string' ? req.query.codigo_produto : undefined;
  const descricao_produto = typeof req.query.descricao_produto === 'string' ? req.query.descricao_produto : undefined;

  const filtros: FiltrosPedidoCompraDataEntrega = {
    data_emissao_ini: data_emissao_ini || undefined,
    data_emissao_fim: data_emissao_fim || undefined,
    data_entrega_ini: data_entrega_ini || undefined,
    data_entrega_fim: data_entrega_fim || undefined,
    pedido: pedido || undefined,
    fornecedor: fornecedor || undefined,
    codigo_produto: codigo_produto || undefined,
    descricao_produto: descricao_produto || undefined,
  };

  try {
    const result = await listarPedidoCompraDataEntrega(filtros);
    if (result.erro) {
      res.status(503).json({ error: result.erro, data: [] });
      return;
    }
    res.json({ data: result.data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[integracaoController] getPedidoCompraDataEntrega:', msg);
    res.status(503).json({ error: msg, data: [] });
  }
}

/**
 * GET /api/integracao/pedido-compra-data-entrega/filtros-opcoes
 * Retorna listas para multi-select: pedidos, fornecedores, codigosProduto.
 */
export async function getPedidoCompraDataEntregaFiltrosOpcoes(_req: Request, res: Response): Promise<void> {
  try {
    const opcoes = await obterFiltrosOpcoesPedidoCompra();
    if (opcoes.erro) {
      res.status(503).json({ error: opcoes.erro, pedidos: [], fornecedores: [], codigosProduto: [], descricoesProduto: [] });
      return;
    }
    res.json({
      pedidos: opcoes.pedidos,
      fornecedores: opcoes.fornecedores,
      codigosProduto: opcoes.codigosProduto,
      descricoesProduto: opcoes.descricoesProduto,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[integracaoController] getPedidoCompraDataEntregaFiltrosOpcoes:', msg);
    res.status(503).json({ error: msg, pedidos: [], fornecedores: [], codigosProduto: [], descricoesProduto: [] });
  }
}

/**
 * PATCH /api/integracao/pedido-compra-data-entrega/item/:idItemPedidoCompra
 * Body: { dataEntrega: "YYYY-MM-DD", dataEntregaAnterior?: string, motivo: string, observacao?: string }
 * Atualiza dataEntrega no Nomus e grava histórico no banco do projeto.
 */
export async function patchPedidoCompraDataEntregaItem(req: Request, res: Response): Promise<void> {
  const idParam = req.params.idItemPedidoCompra;
  const idItemPedidoCompra = idParam ? parseInt(idParam, 10) : NaN;
  if (!Number.isInteger(idItemPedidoCompra) || idItemPedidoCompra <= 0) {
    res.status(400).json({ error: 'idItemPedidoCompra inválido' });
    return;
  }

  const body = req.body as {
    dataEntrega?: string;
    dataEntregaAnterior?: string;
    motivo?: string;
    observacao?: string;
  };
  const dataEntrega = typeof body?.dataEntrega === 'string' ? body.dataEntrega.trim().slice(0, 10) : '';
  if (!dataEntrega || !/^\d{4}-\d{2}-\d{2}$/.test(dataEntrega)) {
    res.status(400).json({ error: 'dataEntrega é obrigatória (formato YYYY-MM-DD)' });
    return;
  }

  const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : '';
  if (!motivo) {
    res.status(400).json({ error: 'motivo é obrigatório' });
    return;
  }
  if (motivo.length > 500) {
    res.status(400).json({ error: 'motivo deve ter no máximo 500 caracteres' });
    return;
  }

  const dataEntregaAnterior = typeof body?.dataEntregaAnterior === 'string'
    ? body.dataEntregaAnterior.trim().slice(0, 10)
    : '';
  const observacao = typeof body?.observacao === 'string' ? body.observacao.trim() || null : null;
  const usuario = req.user?.login ?? 'anon';

  try {
    const result = await atualizarDataEntregaItemPedidoCompra(idItemPedidoCompra, dataEntrega);
    if (result.erro) {
      res.status(400).json({ error: result.erro });
      return;
    }

    const dataAnteriorRegistro = dataEntregaAnterior && /^\d{4}-\d{2}-\d{2}$/.test(dataEntregaAnterior)
      ? dataEntregaAnterior
      : dataEntrega;

    await prisma.pedidoCompraDataEntregaAlteracao.create({
      data: {
        idItemPedidoCompra,
        dataEntregaAnterior: dataAnteriorRegistro,
        dataEntregaNova: dataEntrega,
        motivo,
        observacao,
        usuario,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[integracaoController] patchPedidoCompraDataEntregaItem:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * GET /api/integracao/pedido-compra-data-entrega/item/:idItemPedidoCompra/historico
 * Lista histórico de alterações de data de entrega do item (banco do projeto).
 */
export async function getHistoricoAlteracaoDataEntregaItem(req: Request, res: Response): Promise<void> {
  const idParam = req.params.idItemPedidoCompra;
  const idItemPedidoCompra = idParam ? parseInt(idParam, 10) : NaN;
  if (!Number.isInteger(idItemPedidoCompra) || idItemPedidoCompra <= 0) {
    res.status(400).json({ error: 'idItemPedidoCompra inválido', data: [] });
    return;
  }
  try {
    const rows = await prisma.pedidoCompraDataEntregaAlteracao.findMany({
      where: { idItemPedidoCompra },
      orderBy: { dataAlteracao: 'desc' },
    });
    const data = rows.map((r) => ({
      id: r.id,
      dataEntregaAnterior: r.dataEntregaAnterior,
      dataEntregaNova: r.dataEntregaNova,
      motivo: r.motivo,
      observacao: r.observacao,
      usuario: r.usuario,
      dataAlteracao: r.dataAlteracao.toISOString(),
    }));
    res.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[integracaoController] getHistoricoAlteracaoDataEntregaItem:', msg);
    res.status(503).json({ error: msg, data: [] });
  }
}

/**
 * GET /api/integracao/tickets
 * Lista tickets (id, titulo) para o select (fonte Nomus).
 */
export async function getTickets(_req: Request, res: Response): Promise<void> {
  try {
    const result = await listarTickets();
    if (result.erro) {
      res.status(503).json({ error: result.erro, data: [] });
      return;
    }
    res.json({ data: result.data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[integracaoController] getTickets:', msg);
    res.status(503).json({ error: msg, data: [] });
  }
}

/**
 * GET /api/integracao/tickets/:id
 * Retorna detalhe do ticket: cliente, vendedor, municipio, UF (fonte Nomus).
 */
export async function getTicketById(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'ID do ticket inválido.' });
    return;
  }
  try {
    const result = await obterTicketPorId(id);
    if (result.erro) {
      res.status(503).json({ error: result.erro });
      return;
    }
    if (!result.data) {
      res.status(404).json({ error: 'Ticket não encontrado.' });
      return;
    }
    res.json(result.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[integracaoController] getTicketById:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * GET /api/integracao/faturamento-diario/mensagem
 * Retorna a mensagem montada (preview) sem enviar.
 */
export async function getMensagemFaturamentoDiario(_req: Request, res: Response): Promise<void> {
  try {
    const result = await obterDadosFaturamentoDiario();
    if (result.erro || !result.dados) {
      res.status(503).json({ error: result.erro ?? 'Erro ao consultar dados no Nomus.', mensagem: null });
      return;
    }
    const mensagem = montarMensagemFaturamentoDiario(result.dados);
    res.json({ mensagem, dados: result.dados });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[integracaoController] getMensagemFaturamentoDiario:', msg);
    res.status(503).json({ error: msg, mensagem: null });
  }
}

/**
 * POST /api/integracao/faturamento-diario/enviar
 * Body: { numero: string } — envia a mensagem de faturamento para o número informado (teste).
 */
export async function postEnviarFaturamentoDiario(req: Request, res: Response): Promise<void> {
  const numero = typeof req.body?.numero === 'string' ? req.body.numero.trim() : '';
  if (!numero) {
    res.status(400).json({ error: 'Campo "numero" é obrigatório.' });
    return;
  }
  try {
    const result = await obterDadosFaturamentoDiario();
    if (result.erro || !result.dados) {
      res.status(503).json({ error: result.erro ?? 'Erro ao consultar dados no Nomus.' });
      return;
    }
    const mensagem = montarMensagemFaturamentoDiario(result.dados);
    const numeroLimpo = numero.replace(/\D/g, '');
    const numeroComDdd = numeroLimpo.startsWith('55') ? numeroLimpo : '55' + numeroLimpo;
    const sendResult = await sendWhatsAppTextTo(numeroComDdd, mensagem);
    if (!sendResult.ok) {
      res.status(503).json({ error: sendResult.error ?? 'Erro ao enviar WhatsApp.' });
      return;
    }
    res.json({ ok: true, mensagem });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[integracaoController] postEnviarFaturamentoDiario:', msg);
    res.status(503).json({ error: msg });
  }
}
