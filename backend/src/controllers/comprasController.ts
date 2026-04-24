import type { Request, Response } from 'express';
import { resolve } from 'path';
import bcrypt from 'bcryptjs';
import {
  listarProdutosColeta,
  buscarRegistroColetaNomus,
  listarFornecedoresAtivos,
  listarCondicoesPagamentoNomus,
  listarFormasPagamentoNomus,
} from '../data/comprasRepository.js';
import { prisma } from '../config/prisma.js';
import { getNomusPool, isNomusEnabled } from '../config/nomusDb.js';
import { getPermissoesUsuario } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';

const MAX_FORNECEDORES_POR_COTACAO = 5;
/** Horas sem movimentação após as quais o usuário fica bloqueado para criar nova coleta até dar ciência. */
const HORAS_BLOQUEIO_COLETA = 72;

function dataUltimaMovimentacao(): Date {
  return new Date();
}

/** Lista de vínculos da finalização para a API (JSON gravado ou campos legados). */
function parseFinalizacaoVinculosApi(
  jsonStr: string | null | undefined,
  tipoLegacy: string | null | undefined,
  idLegacy: number | null | undefined
): { tipoRegistro: string; idRegistro: number }[] {
  if (typeof jsonStr === 'string' && jsonStr.trim()) {
    try {
      const p = JSON.parse(jsonStr) as unknown;
      if (Array.isArray(p)) {
        const out: { tipoRegistro: string; idRegistro: number }[] = [];
        for (const x of p) {
          if (!x || typeof x !== 'object') continue;
          const o = x as Record<string, unknown>;
          const tr = typeof o.tipoRegistro === 'string' ? o.tipoRegistro.trim().toUpperCase() : '';
          const idR =
            typeof o.idRegistro === 'number'
              ? o.idRegistro
              : typeof o.idRegistro === 'string'
                ? parseInt(o.idRegistro, 10)
                : NaN;
          if ((tr === 'PEDIDO' || tr === 'COTACAO') && Number.isFinite(idR) && idR > 0) {
            out.push({ tipoRegistro: tr, idRegistro: idR });
          }
        }
        if (out.length > 0) return out;
      }
    } catch {
      /* ignore */
    }
  }
  if (
    (tipoLegacy === 'PEDIDO' || tipoLegacy === 'COTACAO') &&
    idLegacy != null &&
    Number.isFinite(idLegacy) &&
    idLegacy > 0
  ) {
    return [{ tipoRegistro: tipoLegacy, idRegistro: idLegacy }];
  }
  return [];
}

/**
 * GET /api/compras/produtos-coleta
 * Lista produtos do Nomus para o pop-up de criação de coleta de preços.
 * Query: codigo, descricao, familia, fornecedor, coleta, diaSemana, apenasComSolicitacao (true|false)
 */
export async function getProdutosColeta(req: Request, res: Response): Promise<void> {
  const codigo = typeof req.query.codigo === 'string' ? req.query.codigo.trim() : undefined;
  const descricao = typeof req.query.descricao === 'string' ? req.query.descricao.trim() : undefined;
  const familia = typeof req.query.familia === 'string' ? req.query.familia.trim() : undefined;
  const fornecedor = typeof req.query.fornecedor === 'string' ? req.query.fornecedor.trim() : undefined;
  const coleta = typeof req.query.coleta === 'string' ? req.query.coleta.trim() : undefined;
  const diaSemana = typeof req.query.diaSemana === 'string' ? req.query.diaSemana.trim() : undefined;
  const apenasComSolicitacao = req.query.apenasComSolicitacao === 'true' || req.query.apenasComSolicitacao === '1';

  const result = await listarProdutosColeta({
    codigo: codigo || undefined,
    descricao: descricao || undefined,
    familia: familia || undefined,
    fornecedor: fornecedor || undefined,
    coleta: coleta || undefined,
    diaSemana: diaSemana || undefined,
    apenasComSolicitacao: apenasComSolicitacao || undefined,
  });

  if (result.erro) {
    res.status(503).json({ error: result.erro, data: [] });
    return;
  }
  res.json({ data: result.data });
}

/** Extrai código e descrição do produto do JSON "dados" do registro. */
function extrairCodigoDescricao(dadosStr: string): { codigo: string; descricao: string } {
  let codigo = '';
  let descricao = '';
  try {
    const parsed = JSON.parse(dadosStr || '{}');
    if (parsed !== null && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const keyCodigo = Object.keys(obj).find((k) => /codigo\s*do\s*produto/i.test(k.trim()));
      const keyDescricao = Object.keys(obj).find((k) => /descricao\s*do\s*produto/i.test(k.trim()));
      if (keyCodigo != null && obj[keyCodigo] != null) codigo = String(obj[keyCodigo]).trim();
      if (keyDescricao != null && obj[keyDescricao] != null) descricao = String(obj[keyDescricao]).trim();
    }
  } catch {
    // ignore
  }
  return { codigo, descricao };
}

/** Extrai Nome Coleta do JSON "dados" do registro (vindo do Nomus: Coalesce(nc.opcao, 'A DEFINIR')). */
function extrairNomeColeta(dadosStr: string): string {
  try {
    const parsed = JSON.parse(dadosStr || '{}');
    if (parsed !== null && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const key = Object.keys(obj).find((k) => /nome\s*coleta/i.test(k.trim()));
      if (key != null && obj[key] != null) return String(obj[key]).trim();
    }
  } catch {
    // ignore
  }
  return '';
}

/**
 * GET /api/compras/coletas/opcoes-filtro
 * Retorna listas distintas de códigos e descrições de produtos para os filtros (multi-select).
 */
export async function getOpcoesFiltroColetas(_req: Request, res: Response): Promise<void> {
  try {
    const registros = await prisma.coletaPrecosRegistro.findMany({
      select: { dados: true },
    });
    const codigosSet = new Set<string>();
    const descricoesSet = new Set<string>();
    for (const r of registros) {
      const dadosStr = typeof r.dados === 'string' ? r.dados : '';
      const { codigo, descricao } = extrairCodigoDescricao(dadosStr);
      if (codigo) codigosSet.add(codigo);
      if (descricao) descricoesSet.add(descricao);
    }
    const codigos = Array.from(codigosSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const descricoes = Array.from(descricoesSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    res.json({ codigos, descricoes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] getOpcoesFiltroColetas:', msg);
    res.status(503).json({ error: msg, codigos: [], descricoes: [] });
  }
}

/** Coletas do usuário com mais de 72h sem movimentação e sem ciência (bloqueiam criar nova coleta). */
async function getColetasBloqueantesInterno(login: string): Promise<{ id: number; status: string | null; dataCriacao: Date; dataUltimaMovimentacao: Date | null }[]> {
  const limite = new Date(Date.now() - HORAS_BLOQUEIO_COLETA * 60 * 60 * 1000);
  try {
    const candidatas = await prisma.coletaPrecos.findMany({
      where: {
        usuarioCriacao: login,
        status: { in: ['Em cotação', 'Em Aprovação'] },
        ciencias: { none: {} },
      },
      select: { id: true, status: true, createdAt: true, dataUltimaMovimentacao: true },
    });
    return candidatas
      .filter((c) => {
        const ref = c.dataUltimaMovimentacao ?? c.createdAt;
        return ref != null && ref < limite;
      })
      .map((c) => ({
        id: c.id,
        status: c.status,
        /** Prisma usa `createdAt`; o restante do controller expõe como dataCriacao. */
        dataCriacao: c.createdAt,
        dataUltimaMovimentacao: c.dataUltimaMovimentacao,
      }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/dataUltimaMovimentacao|coleta_precos_ciencia|ciencias|no such table|no such column/i.test(msg)) return [];
    throw err;
  }
}

/**
 * GET /api/compras/coletas-bloqueantes
 * Lista coletas do usuário atual que bloqueiam criar nova coleta (>72h sem movimentação, sem ciência).
 */
export async function getColetasBloqueantes(req: Request, res: Response): Promise<void> {
  const login = req.user?.login ?? '';
  if (!login) {
    res.json({ data: [] });
    return;
  }
  try {
    const bloqueantes = await getColetasBloqueantesInterno(login);
    res.json({
      data: bloqueantes.map((b) => ({
        id: b.id,
        status: b.status ?? 'Em cotação',
        dataCriacao: b.dataCriacao?.toISOString() ?? '',
        dataUltimaMovimentacao: b.dataUltimaMovimentacao?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] getColetasBloqueantes:', msg);
    res.status(200).json({ data: [] });
  }
}

/**
 * POST /api/compras/coletas/:id/ciencia
 * Body: { justificativa: string, senha: string }
 * Registra ciência para coleta com mais de 72h em aberto (justificativa + senha do usuário).
 */
export async function postCienciaColeta(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'ID da coleta inválido.' });
    return;
  }
  let body = req.body as { justificativa?: unknown; senha?: unknown };
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as { justificativa?: unknown; senha?: unknown };
    } catch {
      res.status(400).json({ error: 'Body JSON inválido.' });
      return;
    }
  }
  const justificativa = typeof body?.justificativa === 'string' ? body.justificativa.trim() : '';
  const senha = typeof body?.senha === 'string' ? body.senha.trim() : '';
  if (!justificativa) {
    res.status(400).json({ error: 'Justificativa é obrigatória.' });
    return;
  }
  if (!senha) {
    res.status(400).json({ error: 'Senha é obrigatória para confirmar a ciência.' });
    return;
  }
  const login = req.user?.login;
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  try {
    const usuario = await prisma.usuario.findUnique({ where: { login } });
    if (!usuario) {
      res.status(401).json({ error: 'Usuário não encontrado.' });
      return;
    }
    const senhaOk = await bcrypt.compare(senha, usuario.senhaHash);
    if (!senhaOk) {
      res.status(401).json({ error: 'Senha incorreta. Não foi possível registrar a ciência.' });
      return;
    }
    const coleta = await prisma.coletaPrecos.findUnique({
      where: { id },
      select: { id: true, usuarioCriacao: true, status: true, createdAt: true, dataUltimaMovimentacao: true },
    });
    if (!coleta) {
      res.status(404).json({ error: 'Coleta não encontrada.' });
      return;
    }
    if (coleta.usuarioCriacao !== login) {
      res.status(403).json({ error: 'Só o usuário que criou a coleta pode dar ciência.' });
      return;
    }
    const limite = new Date(Date.now() - HORAS_BLOQUEIO_COLETA * 60 * 60 * 1000);
    const ref = coleta.dataUltimaMovimentacao ?? coleta.createdAt;
    if (ref >= limite) {
      res.status(400).json({ error: 'Esta coleta não está há mais de 72h sem movimentação. A ciência é necessária apenas para coletas em aberto há mais de 72h.' });
      return;
    }
    const jaTem = await prisma.coletaPrecosCiencia.findFirst({ where: { coletaPrecosId: id } });
    if (jaTem) {
      res.status(400).json({ error: 'Esta coleta já possui ciência registrada.' });
      return;
    }
    await prisma.coletaPrecosCiencia.create({
      data: { coletaPrecosId: id, justificativa, usuario: login },
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] postCienciaColeta:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * GET /api/compras/coletas/debug
 * Diagnóstico: URL do banco, caminho resolvido e quantidade de linhas em coleta_precos (para conferir se o app está usando o arquivo certo).
 */
export async function getColetasPrecosDebug(_req: Request, res: Response): Promise<void> {
  try {
    const dbUrl = process.env.DB_URL ?? '';
    let resolvedPath = '';
    const m = dbUrl.match(/^file:(.+)$/);
    if (m) {
      const p = m[1].trim().replace(/^\.\//, '');
      resolvedPath = resolve(process.cwd(), p);
    } else {
      resolvedPath = dbUrl || '(não definido)';
    }
    const rows = await prisma.$queryRaw<[{ total: number | bigint }]>(
      'SELECT COUNT(*) as total FROM coleta_precos'
    );
    const raw = rows?.[0]?.total;
    const coletaPrecosCount = typeof raw === 'bigint' ? Number(raw) : (raw ?? 0);
    res.json({
      dbUrl: dbUrl || '(não definido)',
      resolvedPath,
      cwd: process.cwd(),
      coletaPrecosCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: msg, coletaPrecosCount: null });
  }
}

/**
 * GET /api/compras/coletas
 * Lista coletas de preços (id, data de criação, qtd itens e registros). Inclui codigosProduto e descricoesProduto para filtro.
 */
export async function getColetasPrecos(_req: Request, res: Response): Promise<void> {
  try {
    type ColetaRow = {
      id: number;
      createdAt: Date;
      usuarioCriacao: string | null;
      fornecedores: string | null;
      status: string | null;
      justificativaCancelamento: string | null;
      dataEnvioAprovacao: Date | null;
      dataFinalizacao: Date | null;
      observacoes: string | null;
      jaEnviadaAprovacao: boolean;
      _count: { itens: number; registros: number };
      registros: { dados: string }[];
      dataUltimaMovimentacao?: Date | null;
      ciencias?: { id: number }[];
    };
    let coletas: ColetaRow[];
    try {
      coletas = await prisma.coletaPrecos.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          dataUltimaMovimentacao: true,
          usuarioCriacao: true,
          fornecedores: true,
          status: true,
          justificativaCancelamento: true,
          dataEnvioAprovacao: true,
          dataCancelamento: true,
          dataFinalizacao: true,
          observacoes: true,
          jaEnviadaAprovacao: true,
          requerVinculoFinalizacao: true,
          finalizacaoTipoRegistro: true,
          finalizacaoIdRegistro: true,
          finalizacaoVinculosJson: true,
          _count: { select: { itens: true, registros: true } },
          registros: { select: { dados: true } },
          ciencias: { select: { id: true }, take: 1 },
        },
      }) as ColetaRow[];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/dataUltimaMovimentacao|coleta_precos_ciencia|ciencias|requerVinculoFinalizacao|finalizacaoTipoRegistro|finalizacaoIdRegistro|finalizacaoVinculosJson|no such table|no such column/i.test(msg)) {
        coletas = (await prisma.coletaPrecos.findMany({
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            createdAt: true,
            usuarioCriacao: true,
            fornecedores: true,
            status: true,
            justificativaCancelamento: true,
            dataEnvioAprovacao: true,
            dataCancelamento: true,
            dataFinalizacao: true,
            observacoes: true,
            jaEnviadaAprovacao: true,
            _count: { select: { itens: true, registros: true } },
            registros: { select: { dados: true } },
          },
        })) as ColetaRow[];
        coletas.forEach((c) => {
          (c as ColetaRow).dataUltimaMovimentacao = null;
          (c as ColetaRow).ciencias = [];
        });
      } else {
        throw err;
      }
    }
    const data = coletas.map((c) => {
      let fornecedores: { idPessoa: number; nome: string; [k: string]: unknown }[] = [];
      if (typeof c.fornecedores === 'string' && c.fornecedores.trim()) {
        try {
          const parsed = JSON.parse(c.fornecedores);
          if (Array.isArray(parsed)) {
            fornecedores = parsed.map((x: unknown) => {
              if (typeof x === 'string') return { idPessoa: 0, nome: x };
              if (x !== null && typeof x === 'object' && 'nome' in x) {
                const o = x as Record<string, unknown>;
                return {
                  idPessoa: typeof o.idPessoa === 'number' ? o.idPessoa : 0,
                  nome: String(o.nome ?? ''),
                  pedidoMinimo: o.pedidoMinimo,
                  condicaoPagamento: o.condicaoPagamento,
                  formaPagamento: o.formaPagamento,
                  valorFrete: o.valorFrete,
                  valorFreteTipo: o.valorFreteTipo,
                  ipi: o.ipi,
                  ipiTipo: o.ipiTipo,
                };
              }
              return { idPessoa: 0, nome: '' };
            }).filter((item: { nome: string }) => item.nome.length > 0);
          }
        } catch {
          fornecedores = [];
        }
      }
      const codigosProduto: string[] = [];
      const descricoesProduto: string[] = [];
      const nomesColetaSet = new Set<string>();
      const regs = Array.isArray((c as { registros?: { dados: string }[] }).registros) ? (c as { registros: { dados: string }[] }).registros : [];
      for (const reg of regs) {
        const { codigo, descricao } = extrairCodigoDescricao(reg.dados ?? '');
        if (codigo && !codigosProduto.includes(codigo)) codigosProduto.push(codigo);
        if (descricao && !descricoesProduto.includes(descricao)) descricoesProduto.push(descricao);
        const nomeColeta = extrairNomeColeta(reg.dados ?? '');
        if (nomeColeta) nomesColetaSet.add(nomeColeta);
      }
      const cWithCiencias = c as typeof c & { ciencias?: { id: number }[] };
      return {
        id: c.id,
        dataCriacao: c.createdAt.toISOString(),
        dataUltimaMovimentacao: c.dataUltimaMovimentacao?.toISOString() ?? null,
        temCiencia: (cWithCiencias.ciencias?.length ?? 0) > 0,
        qtdItens: c._count.itens,
        qtdRegistros: c._count.registros,
        usuarioCriacao: c.usuarioCriacao ?? null,
        fornecedores,
        status: c.status ?? 'Em cotação',
        justificativaCancelamento: c.justificativaCancelamento ?? null,
        dataEnvioAprovacao: c.dataEnvioAprovacao?.toISOString() ?? null,
        dataFinalizacao: c.dataFinalizacao?.toISOString() ?? null,
        observacoes: c.observacoes ?? null,
        jaEnviadaAprovacao: c.jaEnviadaAprovacao ?? false,
        requerVinculoFinalizacao: (c as { requerVinculoFinalizacao?: boolean }).requerVinculoFinalizacao ?? false,
        finalizacaoTipoRegistro: (c as { finalizacaoTipoRegistro?: string | null }).finalizacaoTipoRegistro ?? null,
        finalizacaoIdRegistro: (c as { finalizacaoIdRegistro?: number | null }).finalizacaoIdRegistro ?? null,
        finalizacaoVinculos: parseFinalizacaoVinculosApi(
          (c as { finalizacaoVinculosJson?: string | null }).finalizacaoVinculosJson,
          (c as { finalizacaoTipoRegistro?: string | null }).finalizacaoTipoRegistro ?? null,
          (c as { finalizacaoIdRegistro?: number | null }).finalizacaoIdRegistro ?? null
        ),
        codigosProduto,
        descricoesProduto,
        nomesColeta: Array.from(nomesColetaSet),
      };
    });
    res.setHeader('Content-Type', 'application/json');
    res.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] getColetasPrecos:', msg);
    res.status(503).json({ error: msg, data: [] });
  }
}

/**
 * DELETE /api/compras/coletas/:id
 * Exclui a coleta somente se ela nunca foi enviada para aprovação (jaEnviadaAprovacao === false).
 */
export async function deleteColetaPrecos(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'ID da coleta inválido.' });
    return;
  }
  try {
    const coleta = await prisma.coletaPrecos.findUnique({
      where: { id },
      select: { id: true, jaEnviadaAprovacao: true },
    });
    if (!coleta) {
      res.status(404).json({ error: 'Coleta não encontrada.' });
      return;
    }
    if (coleta.jaEnviadaAprovacao) {
      res.status(400).json({
        error: 'Não é possível excluir uma coleta que já foi enviada para aprovação. Mesmo reaberta para cotação, ela não pode mais ser excluída.',
      });
      return;
    }
    await prisma.coletaPrecos.delete({ where: { id } });
    res.setHeader('Content-Type', 'application/json');
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] deleteColetaPrecos:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * PATCH /api/compras/coletas/:id/observacoes
 * Atualiza o campo observacoes da coleta (texto longo; exibido no mapa de cotação).
 */
export async function patchObservacoesColeta(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'ID da coleta inválido.' });
    return;
  }
  let body = req.body as { observacoes?: unknown };
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as { observacoes?: unknown };
    } catch {
      res.status(400).json({ error: 'Body JSON inválido.' });
      return;
    }
  }
  const observacoes = body?.observacoes === null || body?.observacoes === undefined
    ? null
    : String(body.observacoes).trim() || null;
  try {
    const coleta = await prisma.coletaPrecos.findUnique({ where: { id }, select: { id: true } });
    if (!coleta) {
      res.status(404).json({ error: 'Coleta não encontrada.' });
      return;
    }
    await prisma.coletaPrecos.update({
      where: { id },
      data: { observacoes, dataUltimaMovimentacao: dataUltimaMovimentacao() },
    });
    res.setHeader('Content-Type', 'application/json');
    res.json({ ok: true, observacoes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] patchObservacoesColeta:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * PATCH /api/compras/coletas/:id/enviar-aprovacao
 * Altera status para "Em Aprovação" e registra dataEnvioAprovacao. Só permite se status atual for "Em cotação".
 */
export async function patchEnviarAprovacao(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'ID da coleta inválido.' });
    return;
  }
  try {
    const coleta = await prisma.coletaPrecos.findUnique({ where: { id }, select: { status: true } });
    if (!coleta) {
      res.status(404).json({ error: 'Coleta não encontrada.' });
      return;
    }
    const statusAtual = coleta.status ?? 'Em cotação';
    if (statusAtual !== 'Em cotação') {
      res.status(400).json({ error: 'Só é possível enviar para aprovação quando o status é "Em cotação".' });
      return;
    }
    await prisma.coletaPrecos.update({
      where: { id },
      data: { status: 'Em Aprovação', dataEnvioAprovacao: new Date(), jaEnviadaAprovacao: true, dataUltimaMovimentacao: dataUltimaMovimentacao() },
    });
    res.json({ ok: true, status: 'Em Aprovação' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] patchEnviarAprovacao:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * PATCH /api/compras/coletas/:id/cancelar-cotacao
 * Body: { justificativa: string }
 * Altera status para "Rejeitada" e registra justificativa. Não permite mais modificações. Só permite se status atual for "Em Aprovação".
 */
export async function patchCancelarCotacao(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'ID da coleta inválido.' });
    return;
  }
  let body = req.body as { justificativa?: unknown };
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as { justificativa?: unknown };
    } catch {
      res.status(400).json({ error: 'Body JSON inválido.' });
      return;
    }
  }
  const justificativa = typeof body?.justificativa === 'string' ? body.justificativa.trim() : '';
  if (!justificativa) {
    res.status(400).json({ error: 'Justificativa é obrigatória para cancelar a cotação.' });
    return;
  }
  try {
    const coleta = await prisma.coletaPrecos.findUnique({ where: { id }, select: { status: true } });
    if (!coleta) {
      res.status(404).json({ error: 'Coleta não encontrada.' });
      return;
    }
    if ((coleta.status ?? '') !== 'Em Aprovação') {
      res.status(400).json({ error: 'Só é possível cancelar a cotação quando o status é "Em Aprovação".' });
      return;
    }
    await prisma.coletaPrecos.update({
      where: { id },
      data: {
        status: 'Rejeitada',
        justificativaCancelamento: justificativa,
        dataCancelamento: new Date(),
        dataUltimaMovimentacao: dataUltimaMovimentacao(),
      },
    });
    res.json({ ok: true, status: 'Rejeitada' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] patchCancelarCotacao:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * PATCH /api/compras/coletas/:id/reabrir
 * Body: { senha: string }
 * Volta status para "Em cotação" e zera dataEnvioAprovacao. Exige senha do usuário. Só permite se status atual for "Em Aprovação" ou "Enviado para Financeiro".
 */
export async function patchReabrirColeta(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'ID da coleta inválido.' });
    return;
  }
  let body = req.body as { senha?: unknown };
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as { senha?: unknown };
    } catch {
      res.status(400).json({ error: 'Body JSON inválido.' });
      return;
    }
  }
  const senha = typeof body?.senha === 'string' ? body.senha.trim() : '';
  if (!senha) {
    res.status(400).json({ error: 'Senha é obrigatória para reabrir a coleta.' });
    return;
  }
  const login = req.user?.login;
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  try {
    const usuario = await prisma.usuario.findUnique({ where: { login } });
    if (!usuario) {
      res.status(401).json({ error: 'Usuário não encontrado.' });
      return;
    }
    const senhaOk = await bcrypt.compare(senha, usuario.senhaHash);
    if (!senhaOk) {
      res.status(401).json({ error: 'Senha incorreta. Não foi possível reabrir a coleta.' });
      return;
    }
    const coleta = await prisma.coletaPrecos.findUnique({ where: { id }, select: { status: true } });
    if (!coleta) {
      res.status(404).json({ error: 'Coleta não encontrada.' });
      return;
    }
    const statusAtual = coleta.status ?? '';
    if (statusAtual !== 'Em Aprovação' && statusAtual !== 'Enviado para Financeiro') {
      res.status(400).json({ error: 'Só é possível reabrir quando o status é "Em Aprovação" ou "Enviado para Financeiro".' });
      return;
    }
    await prisma.coletaPrecos.update({
      where: { id },
      data: { status: 'Em cotação', dataEnvioAprovacao: null, dataUltimaMovimentacao: dataUltimaMovimentacao() },
    });
    res.json({ ok: true, status: 'Em cotação' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] patchReabrirColeta:', msg);
    res.status(503).json({ error: msg });
  }
}

/** Data mínima (YYYY-MM-DD) para filtro Nomus: hoje menos 180 dias (início do dia local do servidor). */
function dataMinimaEmissao180Dias(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 180);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const SQL_VINCULO_FINALIZACAO_PADRAO = `
SELECT * FROM (
SELECT
    pc.id,
    pc.nome,
    p.nome AS nomeFornecedor,
    pc.dataEmissao,
    'PEDIDO' AS tipoRegistro
FROM itempedidocompra ipc
LEFT JOIN pedidocompra pc ON pc.id = ipc.idPedidoCompra
LEFT JOIN pessoa p ON p.id = pc.idFornecedor
WHERE ipc.status IN (2,3,4)
GROUP BY pc.id, pc.nome, p.nome, pc.dataEmissao
UNION ALL
SELECT
    c.id,
    c.nome,
    p.nome AS nomeFornecedor,
    c.dataEmissao,
    'COTACAO' AS tipoRegistro
FROM cotacaocompra c
LEFT JOIN coletaprecoscotacao cc ON cc.idCotacaoCompra = c.id
LEFT JOIN pessoa p ON p.id = cc.idFornecedor
WHERE c.status IN (1,2,3,4)
) t
`.trim();

/** Lista ampliada (pedidos status 1–4 + cotações + janela 180 dias): só para fluxo “erro operacional” (permissão ampliado). */
const SQL_VINCULO_FINALIZACAO_AMPLIADO = `
SELECT * FROM (
SELECT
    pc.id,
    pc.nome,
    p.nome AS nomeFornecedor,
    pc.dataEmissao,
    'PEDIDO' AS tipoRegistro
FROM itempedidocompra ipc
LEFT JOIN pedidocompra pc ON pc.id = ipc.idPedidoCompra
LEFT JOIN pessoa p ON p.id = pc.idFornecedor
WHERE ipc.status IN (1,2,3,4) AND pc.dataEmissao >= ?
GROUP BY pc.id, pc.nome, p.nome, pc.dataEmissao
UNION ALL
SELECT
    c.id,
    c.nome,
    p.nome AS nomeFornecedor,
    c.dataEmissao,
    'COTACAO' AS tipoRegistro
FROM cotacaocompra c
LEFT JOIN coletaprecoscotacao cc ON cc.idCotacaoCompra = c.id
LEFT JOIN pessoa p ON p.id = cc.idFornecedor
WHERE c.status IN (1,2,3,4) AND c.dataEmissao >= ?
) t
`.trim();

type OpcaoVinculoRow = {
  id: number;
  nome: string;
  nomeFornecedor: string | null;
  dataEmissao: string | null;
  tipoRegistro: string;
};

function mapRowsToOpcoesVinculo(list: Record<string, unknown>[]): OpcaoVinculoRow[] {
  const seen = new Set<string>();
  const data: OpcaoVinculoRow[] = [];
  for (const r of list) {
    const idRaw = r.id ?? r.ID;
    const idNum = typeof idRaw === 'number' ? idRaw : Number(idRaw);
    if (!Number.isFinite(idNum) || idNum < 1) continue;
    const tipo = String(r.tipoRegistro ?? r.tiporegistro ?? '').trim();
    if (tipo !== 'PEDIDO' && tipo !== 'COTACAO') continue;
    const key = `${tipo}-${idNum}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const nome = r.nome != null ? String(r.nome) : '';
    const nomeFornecedor = r.nomeFornecedor != null ? String(r.nomeFornecedor) : null;
    let dataEmissao: string | null = null;
    const de = r.dataEmissao ?? r.dataemissao;
    if (de instanceof Date) {
      dataEmissao = de.toISOString().slice(0, 10);
    } else if (de != null) {
      dataEmissao = String(de).slice(0, 32);
    }
    data.push({ id: idNum, nome, nomeFornecedor, dataEmissao, tipoRegistro: tipo });
  }
  return data;
}

async function executarConsultaOpcoesVinculo(
  pool: NonNullable<ReturnType<typeof getNomusPool>>,
  sqlBase: string,
  baseParams: unknown[],
  q: string,
  limit: number
): Promise<OpcaoVinculoRow[]> {
  let sql = sqlBase;
  const params: unknown[] = [...baseParams];
  if (q) {
    const like = `%${q}%`;
    sql += ` WHERE (t.nome LIKE ? OR IFNULL(t.nomeFornecedor,'') LIKE ? OR CONCAT(IFNULL(t.nome,''), ' ', IFNULL(t.nomeFornecedor,'')) LIKE ?)`;
    params.push(like, like, like);
  }
  sql += ` ORDER BY t.dataEmissao DESC LIMIT ${limit}`;
  const [rows] = await pool.query(sql, params);
  const list = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
  return mapRowsToOpcoesVinculo(list);
}

/**
 * GET /api/compras/coletas/opcoes-vinculo-finalizacao?q=
 * Lista pedidos/cotações Nomus para vincular à finalização (SQL padrão para todos os usuários autorizados a compras).
 */
export async function getOpcoesVinculoFinalizacao(req: Request, res: Response): Promise<void> {
  if (!isNomusEnabled()) {
    res.status(503).json({ data: [], error: 'NOMUS_DB_URL não configurado' });
    return;
  }
  const pool = getNomusPool();
  if (!pool) {
    res.status(503).json({ data: [], error: 'Conexão Nomus indisponível' });
    return;
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  try {
    const data = await executarConsultaOpcoesVinculo(pool, SQL_VINCULO_FINALIZACAO_PADRAO, [], q, 200);
    res.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] getOpcoesVinculoFinalizacao:', msg);
    res.status(503).json({ data: [], error: msg });
  }
}

/**
 * GET /api/compras/coletas/opcoes-vinculo-erro-operacional?q=
 * Lista ampliada (status + 180 dias) para checklist no fluxo de erro operacional. Exige permissão ampliado.
 */
export async function getOpcoesVinculoErroOperacional(req: Request, res: Response): Promise<void> {
  if (!isNomusEnabled()) {
    res.status(503).json({ data: [], error: 'NOMUS_DB_URL não configurado' });
    return;
  }
  const pool = getNomusPool();
  if (!pool) {
    res.status(503).json({ data: [], error: 'Conexão Nomus indisponível' });
    return;
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  try {
    const dataMin = dataMinimaEmissao180Dias();
    const data = await executarConsultaOpcoesVinculo(pool, SQL_VINCULO_FINALIZACAO_AMPLIADO, [dataMin, dataMin], q, 500);
    res.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] getOpcoesVinculoErroOperacional:', msg);
    res.status(503).json({ data: [], error: msg });
  }
}

/**
 * GET /api/compras/dashboard/erros-vinculo-operacional
 * Série mensal de finalizações registradas como erro operacional (data do registro).
 * Query opcional: dataInicio, dataFim (YYYY-MM-DD). Sem parâmetros: últimos 12 meses.
 */
export async function getDashboardErrosVinculoOperacional(req: Request, res: Response): Promise<void> {
  const di = typeof req.query.dataInicio === 'string' ? req.query.dataInicio.trim() : '';
  const df = typeof req.query.dataFim === 'string' ? req.query.dataFim.trim() : '';
  try {
    let inicio: Date;
    let fim: Date;
    if (di && /^\d{4}-\d{2}-\d{2}$/.test(di)) {
      inicio = new Date(`${di}T00:00:00.000`);
    } else {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setMonth(d.getMonth() - 12);
      inicio = d;
    }
    if (df && /^\d{4}-\d{2}-\d{2}$/.test(df)) {
      fim = new Date(`${df}T23:59:59.999`);
    } else {
      fim = new Date();
      fim.setHours(23, 59, 59, 999);
    }
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || inicio > fim) {
      res.status(400).json({ error: 'Intervalo de datas inválido.' });
      return;
    }

    const rows = await prisma.coletaPrecosVinculoErroOperacional.findMany({
      where: { createdAt: { gte: inicio, lte: fim } },
      select: { createdAt: true },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      const d = r.createdAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const series = sorted.map(([key, count]) => ({
      key,
      label: new Date(`${key}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      count,
    }));
    res.json({ series });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] getDashboardErrosVinculoOperacional:', msg);
    res.status(503).json({ series: [], error: msg });
  }
}

async function existeVinculoFinalizacaoNomus(
  pool: NonNullable<ReturnType<typeof getNomusPool>>,
  tipoRegistro: string,
  idRegistro: number
): Promise<boolean> {
  if (tipoRegistro === 'PEDIDO') {
    const [rows] = await pool.query('SELECT id FROM pedidocompra WHERE id = ? LIMIT 1', [idRegistro]);
    return Array.isArray(rows) && rows.length > 0;
  }
  if (tipoRegistro === 'COTACAO') {
    const [rows] = await pool.query('SELECT id FROM cotacaocompra WHERE id = ? LIMIT 1', [idRegistro]);
    return Array.isArray(rows) && rows.length > 0;
  }
  return false;
}

/**
 * PATCH /api/compras/coletas/:id/finalizar-cotacao
 * Altera status para "Finalizada". Só permite se status atual for "Em Aprovação".
 * Vínculo obrigatório: coletas novas (requerVinculoFinalizacao) ou qualquer coleta ainda em "Em cotação" / "Em Aprovação" (inclui as anteriores à migration).
 * Body: { vinculos: [...] } ou legado { tipoRegistro, idRegistro }.
 * Opcional (exige permissão `compras.vinculo_finalizacao.ampliado` e senha): { erroOperacional: true, senha } — grava auditoria de erro operacional.
 */
export async function patchFinalizarCotacao(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'ID da coleta inválido.' });
    return;
  }
  let bodyRaw = req.body as {
    tipoRegistro?: unknown;
    idRegistro?: unknown;
    vinculos?: unknown;
    erroOperacional?: unknown;
    senha?: unknown;
  };
  if (typeof bodyRaw === 'string') {
    try {
      bodyRaw = JSON.parse(bodyRaw) as {
        tipoRegistro?: unknown;
        idRegistro?: unknown;
        vinculos?: unknown;
        erroOperacional?: unknown;
        senha?: unknown;
      };
    } catch {
      bodyRaw = {};
    }
  }
  try {
    const coleta = await prisma.coletaPrecos.findUnique({
      where: { id },
      select: { status: true, requerVinculoFinalizacao: true },
    });
    if (!coleta) {
      res.status(404).json({ error: 'Coleta não encontrada.' });
      return;
    }
    if ((coleta.status ?? '') !== 'Em Aprovação') {
      res.status(400).json({ error: 'Só é possível finalizar quando o status é "Em Aprovação".' });
      return;
    }
    const registros = await prisma.coletaPrecosRegistro.findMany({
      where: { coletaPrecosId: id },
      select: { id: true, qtdeAprovada: true, idFornecedorVencedor: true },
    });
    const semQtde = registros.filter((r) => r.qtdeAprovada == null || Number(r.qtdeAprovada) <= 0);
    if (semQtde.length > 0) {
      res.status(400).json({
        error: 'Preencha as quantidades aprovadas pela diretoria em todos os itens da coleta antes de finalizar.',
      });
      return;
    }
    const semVencedor = registros.filter((r) => r.idFornecedorVencedor == null || Number(r.idFornecedorVencedor) <= 0);
    if (semVencedor.length > 0) {
      res.status(400).json({
        error: 'Indique o fornecedor vencedor em todos os itens da coleta antes de finalizar. Itens cancelados não precisam de vencedor.',
      });
      return;
    }

    const statusAtual = coleta.status ?? '';
    const requerVinculo =
      coleta.requerVinculoFinalizacao === true ||
      statusAtual === 'Em cotação' ||
      statusAtual === 'Em Aprovação';
    const listaVinculos: { tipoRegistro: string; idRegistro: number }[] = [];
    if (requerVinculo) {
      const rawArr = bodyRaw.vinculos;
      if (Array.isArray(rawArr) && rawArr.length > 0) {
        const seen = new Set<string>();
        for (const item of rawArr) {
          if (!item || typeof item !== 'object') continue;
          const o = item as Record<string, unknown>;
          const tr = typeof o.tipoRegistro === 'string' ? o.tipoRegistro.trim().toUpperCase() : '';
          const idR =
            typeof o.idRegistro === 'number'
              ? o.idRegistro
              : typeof o.idRegistro === 'string'
                ? parseInt(o.idRegistro, 10)
                : NaN;
          if (tr !== 'PEDIDO' && tr !== 'COTACAO') continue;
          if (!Number.isFinite(idR) || idR < 1) continue;
          const key = `${tr}-${idR}`;
          if (seen.has(key)) continue;
          seen.add(key);
          listaVinculos.push({ tipoRegistro: tr, idRegistro: idR });
        }
      } else {
        const tr = typeof bodyRaw.tipoRegistro === 'string' ? bodyRaw.tipoRegistro.trim().toUpperCase() : '';
        const idR =
          typeof bodyRaw.idRegistro === 'number'
            ? bodyRaw.idRegistro
            : typeof bodyRaw.idRegistro === 'string'
              ? parseInt(bodyRaw.idRegistro, 10)
              : NaN;
        if ((tr === 'PEDIDO' || tr === 'COTACAO') && Number.isFinite(idR) && idR >= 1) {
          listaVinculos.push({ tipoRegistro: tr, idRegistro: idR });
        }
      }
      if (listaVinculos.length === 0) {
        res.status(400).json({
          error: 'Selecione um ou mais pedidos de compra ou cotações de preços para finalizar esta coleta.',
        });
        return;
      }
      if (listaVinculos.length > 40) {
        res.status(400).json({ error: 'No máximo 40 vínculos por finalização.' });
        return;
      }
      if (!isNomusEnabled()) {
        res.status(503).json({ error: 'Nomus não configurado; não é possível validar o vínculo.' });
        return;
      }
      const pool = getNomusPool();
      if (!pool) {
        res.status(503).json({ error: 'Conexão Nomus indisponível.' });
        return;
      }
      for (const v of listaVinculos) {
        const ok = await existeVinculoFinalizacaoNomus(pool, v.tipoRegistro, v.idRegistro);
        if (!ok) {
          res.status(400).json({
            error: `Pedido de compra ou cotação não encontrado no Nomus (tipo ${v.tipoRegistro}, id ${v.idRegistro}).`,
          });
          return;
        }
      }
    }

    const flagErroOperacional =
      bodyRaw.erroOperacional === true ||
      bodyRaw.erroOperacional === 'true' ||
      bodyRaw.erroOperacional === 1;

    if (flagErroOperacional) {
      if (listaVinculos.length === 0) {
        res.status(400).json({
          error: 'Para registrar erro operacional é obrigatório vincular ao menos um pedido ou cotação.',
        });
        return;
      }
      const login = req.user?.login;
      if (!login) {
        res.status(401).json({ error: 'Não autorizado.' });
        return;
      }
      const perms = await getPermissoesUsuario(login);
      if (!perms.includes(PERMISSOES.COMPRAS_VINCULO_FINALIZACAO_AMPLIADO)) {
        res.status(403).json({
          error: 'Sem permissão para finalizar com registro de erro operacional.',
        });
        return;
      }
      const senha = typeof bodyRaw.senha === 'string' ? bodyRaw.senha.trim() : '';
      if (!senha) {
        res.status(400).json({ error: 'Informe sua senha para registrar o vínculo como erro operacional.' });
        return;
      }
      const usuario = await prisma.usuario.findUnique({ where: { login } });
      if (!usuario) {
        res.status(401).json({ error: 'Usuário não encontrado.' });
        return;
      }
      const senhaOk = await bcrypt.compare(senha, usuario.senhaHash);
      if (!senhaOk) {
        res.status(401).json({ error: 'Senha incorreta.' });
        return;
      }
    }

    const primeiro = listaVinculos[0];
    const dataUpdate = {
      status: 'Finalizada' as const,
      dataFinalizacao: new Date(),
      dataUltimaMovimentacao: dataUltimaMovimentacao(),
      ...(listaVinculos.length > 0 && primeiro
        ? {
            finalizacaoVinculosJson: JSON.stringify(listaVinculos),
            finalizacaoTipoRegistro: primeiro.tipoRegistro,
            finalizacaoIdRegistro: primeiro.idRegistro,
          }
        : {}),
    };

    const loginAud = req.user?.login ?? '';
    if (flagErroOperacional && listaVinculos.length > 0) {
      await prisma.$transaction([
        prisma.coletaPrecos.update({ where: { id }, data: dataUpdate }),
        prisma.coletaPrecosVinculoErroOperacional.create({
          data: {
            coletaPrecosId: id,
            usuario: loginAud,
            vinculosJson: JSON.stringify(listaVinculos),
          },
        }),
      ]);
    } else {
      await prisma.coletaPrecos.update({
        where: { id },
        data: dataUpdate,
      });
    }
    res.json({ ok: true, status: 'Finalizada' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] patchFinalizarCotacao:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * PATCH /api/compras/coletas/:id/registros/:registroId
 * Atualiza quantidade aprovada e/ou fornecedor vencedor do registro.
 * Body: { qtdeAprovada?: number, idFornecedorVencedor?: number }
 */
export async function patchRegistroQtdeAprovada(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  const registroId = parseInt(String(req.params.registroId), 10);
  if (!Number.isFinite(id) || id < 1 || !Number.isFinite(registroId) || registroId < 1) {
    res.status(400).json({ error: 'ID da coleta ou do registro inválido.' });
    return;
  }
  let body = req.body as { qtdeAprovada?: unknown; idFornecedorVencedor?: unknown };
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as { qtdeAprovada?: unknown; idFornecedorVencedor?: unknown };
    } catch {
      res.status(400).json({ error: 'Body JSON inválido.' });
      return;
    }
  }
  const qtde = body?.qtdeAprovada;
  const qtdeNum = typeof qtde === 'number' && Number.isFinite(qtde) ? qtde : (typeof qtde === 'string' ? parseFloat(qtde) : NaN);
  const enviouQtde = body != null && Object.prototype.hasOwnProperty.call(body, 'qtdeAprovada');
  if (enviouQtde && (Number.isNaN(qtdeNum) || qtdeNum < 0)) {
    res.status(400).json({ error: 'Informe uma quantidade aprovada válida (número >= 0).' });
    return;
  }
  const idVencedor = body?.idFornecedorVencedor;
  const idVencedorNum = typeof idVencedor === 'number' && Number.isFinite(idVencedor) ? idVencedor : (typeof idVencedor === 'string' ? parseInt(idVencedor, 10) : NaN);
  const vencedorVal = Number.isNaN(idVencedorNum) || idVencedorNum < 0 ? null : idVencedorNum;
  const enviouVencedor = body != null && Object.prototype.hasOwnProperty.call(body, 'idFornecedorVencedor');
  try {
    const registro = await prisma.coletaPrecosRegistro.findFirst({
      where: { id: registroId, coletaPrecosId: id },
    });
    if (!registro) {
      res.status(404).json({ error: 'Registro não encontrado nesta coleta.' });
      return;
    }
    const data: { qtdeAprovada?: number; idFornecedorVencedor?: number | null } = {};
    if (enviouQtde && !Number.isNaN(qtdeNum)) data.qtdeAprovada = qtdeNum;
    if (enviouVencedor) data.idFornecedorVencedor = vencedorVal;
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'Envie qtdeAprovada e/ou idFornecedorVencedor.' });
      return;
    }
    await prisma.coletaPrecosRegistro.update({
      where: { id: registroId },
      data,
    });
    await prisma.coletaPrecos.update({
      where: { id },
      data: { dataUltimaMovimentacao: dataUltimaMovimentacao() },
    });
    res.json({ ok: true, qtdeAprovada: data.qtdeAprovada, idFornecedorVencedor: data.idFornecedorVencedor });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] patchRegistroQtdeAprovada:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * PATCH /api/compras/coletas/:id/enviar-financeiro
 * Altera status para "Enviado para Financeiro". Só permite se status atual for "Em Aprovação".
 */
export async function patchEnviarFinanceiro(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'ID da coleta inválido.' });
    return;
  }
  try {
    const coleta = await prisma.coletaPrecos.findUnique({ where: { id }, select: { status: true } });
    if (!coleta) {
      res.status(404).json({ error: 'Coleta não encontrada.' });
      return;
    }
    if ((coleta.status ?? '') !== 'Em Aprovação') {
      res.status(400).json({ error: 'Só é possível enviar para financeiro quando o status é "Em Aprovação".' });
      return;
    }
    await prisma.coletaPrecos.update({
      where: { id },
      data: { status: 'Enviado para Financeiro', dataFinalizacao: new Date(), dataUltimaMovimentacao: dataUltimaMovimentacao() },
    });
    res.json({ ok: true, status: 'Enviado para Financeiro' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] patchEnviarFinanceiro:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * DELETE /api/compras/coletas/:id/itens/:idProduto
 * Remove um item (produto) da coleta. Permitido quando status é "Em cotação" ou "Em Aprovação". Body: { justificativa: string } obrigatório.
 */
export async function deleteColetaItem(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  const idProduto = parseInt(String(req.params.idProduto), 10);
  if (!Number.isFinite(id) || id < 1 || !Number.isFinite(idProduto) || idProduto < 1) {
    res.status(400).json({ error: 'ID da coleta ou idProduto inválido.' });
    return;
  }
  let body = req.body as { justificativa?: unknown };
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as { justificativa?: unknown };
    } catch {
      res.status(400).json({ error: 'Body JSON inválido.' });
      return;
    }
  }
  const justificativa = typeof body?.justificativa === 'string' ? body.justificativa.trim() : '';
  if (!justificativa) {
    res.status(400).json({ error: 'Justificativa é obrigatória para cancelar/excluir o item.' });
    return;
  }
  try {
    const coleta = await prisma.coletaPrecos.findUnique({ where: { id }, select: { status: true } });
    if (!coleta) {
      res.status(404).json({ error: 'Coleta não encontrada.' });
      return;
    }
    const statusAtual = coleta.status ?? 'Em cotação';
    if (statusAtual !== 'Em cotação' && statusAtual !== 'Em Aprovação') {
      res.status(400).json({ error: 'Só é possível excluir/cancelar itens quando o status é "Em cotação" ou "Em Aprovação".' });
      return;
    }
    console.info('[comprasController] deleteColetaItem: coletaId=%d idProduto=%d justificativa=%s', id, idProduto, justificativa);
    await prisma.coletaPrecosCotacao.deleteMany({ where: { coletaPrecosId: id, idProduto } });
    await prisma.coletaPrecosRegistro.deleteMany({ where: { coletaPrecosId: id, idProduto } });
    await prisma.coletaPrecosItem.deleteMany({ where: { coletaPrecosId: id, idProduto } });
    await prisma.coletaPrecos.update({
      where: { id },
      data: { dataUltimaMovimentacao: dataUltimaMovimentacao() },
    });
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] deleteColetaItem:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * DELETE /api/compras/coletas/:id/itens/todos
 * Remove todos os itens da coleta. Permitido apenas quando status é "Em Aprovação". Body: { justificativa: string } obrigatório.
 */
export async function deleteColetaTodosItens(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'ID da coleta inválido.' });
    return;
  }
  let body = req.body as { justificativa?: unknown };
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as { justificativa?: unknown };
    } catch {
      res.status(400).json({ error: 'Body JSON inválido.' });
      return;
    }
  }
  const justificativa = typeof body?.justificativa === 'string' ? body.justificativa.trim() : '';
  if (!justificativa) {
    res.status(400).json({ error: 'Justificativa é obrigatória para cancelar todos os itens.' });
    return;
  }
  try {
    const coleta = await prisma.coletaPrecos.findUnique({ where: { id }, select: { status: true } });
    if (!coleta) {
      res.status(404).json({ error: 'Coleta não encontrada.' });
      return;
    }
    if ((coleta.status ?? '') !== 'Em Aprovação') {
      res.status(400).json({ error: 'Só é possível cancelar todos os itens quando o status é "Em Aprovação".' });
      return;
    }
    console.info('[comprasController] deleteColetaTodosItens: coletaId=%d justificativa=%s', id, justificativa);
    await prisma.coletaPrecosCotacao.deleteMany({ where: { coletaPrecosId: id } });
    await prisma.coletaPrecosRegistro.deleteMany({ where: { coletaPrecosId: id } });
    await prisma.coletaPrecosItem.deleteMany({ where: { coletaPrecosId: id } });
    await prisma.coletaPrecos.update({
      where: { id },
      data: { dataUltimaMovimentacao: dataUltimaMovimentacao() },
    });
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] deleteColetaTodosItens:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * POST /api/compras/coletas/:id/itens
 * Body: { itens: { idProduto, codigoSolicitacao? }[] } ou { idProdutos: number[] } (retrocompat)
 * Adiciona itens à coleta (um registro por produto + solicitação). Permitido apenas quando status é "Em cotação".
 */
export async function postColetaItens(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'ID da coleta inválido.' });
    return;
  }
  let body = req.body as { itens?: unknown; idProdutos?: unknown };
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as { itens?: unknown; idProdutos?: unknown };
    } catch {
      res.status(400).json({ error: 'Body JSON inválido.' });
      return;
    }
  }
  const itens = normalizarItensColeta(body);
  if (itens.length === 0) {
    res.status(400).json({ error: 'Envie itens ou idProdutos com pelo menos um id válido.' });
    return;
  }
  try {
    const coleta = await prisma.coletaPrecos.findUnique({ where: { id }, select: { status: true } });
    if (!coleta) {
      res.status(404).json({ error: 'Coleta não encontrada.' });
      return;
    }
    if ((coleta.status ?? 'Em cotação') !== 'Em cotação') {
      res.status(400).json({ error: 'Só é possível adicionar itens quando o status é "Em cotação".' });
      return;
    }
    const existentes = await prisma.coletaPrecosItem.findMany({
      where: { coletaPrecosId: id },
      select: { idProduto: true, idSolicitacao: true },
    });
    const setExistentes = new Set(existentes.map((e) => `${e.idProduto}-${e.idSolicitacao ?? 'n'}`));
    const novos = itens.filter((i) => !setExistentes.has(`${i.idProduto}-${i.codigoSolicitacao ?? 'n'}`));
    if (novos.length > 0) {
      await prisma.coletaPrecosItem.createMany({
        data: novos.map(({ idProduto, codigoSolicitacao }) => ({
          coletaPrecosId: id,
          idProduto,
          idSolicitacao: codigoSolicitacao ?? undefined,
        })),
      });
      const itensNomus = novos.map((i) => ({ idProduto: i.idProduto, idSolicitacao: i.codigoSolicitacao ?? null }));
      try {
        const { rows: nomusRows } = await buscarRegistroColetaNomus(itensNomus);
        if (Array.isArray(nomusRows) && nomusRows.length > 0) {
          const keyIdProduto = (r: Record<string, unknown>) => {
            const k = Object.keys(r).find((key) => /^id\s*produto$/i.test(String(key).trim()));
            return k ? r[k] : r['Id Produto'] ?? r['id produto'] ?? r.idProduto;
          };
          const values = (nomusRows as Record<string, unknown>[]).map((r, idx) => {
            const plain = { ...r };
            const raw = keyIdProduto(plain);
            const idProduto = Number(raw ?? 0);
            const idSolicitacao = idx < novos.length ? (novos[idx].codigoSolicitacao ?? null) : null;
            return { coletaPrecosId: id, idProduto, idSolicitacao, dados: JSON.stringify(plain), qtdeAprovada: null, idFornecedorVencedor: null };
          }).filter((v) => v.idProduto > 0);
          if (values.length > 0) {
            const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
            const params = values.flatMap((v) => [v.coletaPrecosId, v.idProduto, v.idSolicitacao ?? null, v.dados, v.qtdeAprovada, v.idFornecedorVencedor]);
            await prisma.$executeRawUnsafe(
              `INSERT INTO coleta_precos_registro (coletaPrecosId, idProduto, idSolicitacao, dados, qtdeAprovada, idFornecedorVencedor) VALUES ${placeholders}`,
              ...params
            );
          }
        }
      } catch (nomusErr) {
        console.warn('[comprasController] postColetaItens Nomus/registro:', nomusErr);
      }
      await prisma.coletaPrecos.update({
        where: { id },
        data: { dataUltimaMovimentacao: dataUltimaMovimentacao() },
      });
    }
    res.status(201).json({ ok: true, adicionados: novos.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] postColetaItens:', msg);
    res.status(503).json({ error: msg });
  }
}

/** Item para criar coleta: idProduto e opcionalmente codigoSolicitacao (vínculo com solicitação de compra). */
type ItemColetaPayload = { idProduto: number; codigoSolicitacao?: number | null };

function normalizarItensColeta(body: { itens?: unknown; idProdutos?: unknown }): ItemColetaPayload[] {
  if (Array.isArray(body.itens) && body.itens.length > 0) {
    return body.itens
      .map((v) => {
        const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
        const idProduto = Number(o.idProduto ?? o.idproduto ?? 0);
        if (!Number.isFinite(idProduto) || idProduto < 1) return null;
        const codigoSolicitacao = o.codigoSolicitacao != null ? Number(o.codigoSolicitacao) : null;
        return { idProduto, codigoSolicitacao: Number.isFinite(codigoSolicitacao) && codigoSolicitacao! > 0 ? codigoSolicitacao! : null };
      })
      .filter((i): i is ItemColetaPayload => i !== null);
  }
  const raw = Array.isArray(body.idProdutos) ? body.idProdutos : [];
  return raw
    .map((v) => (typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' ? parseInt(String(v), 10) : NaN))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((idProduto) => ({ idProduto, codigoSolicitacao: null as number | null }));
}

/**
 * POST /api/compras/confirmar-coleta
 * Body: { itens: { idProduto, codigoSolicitacao? }[] } ou { idProdutos: number[] } (retrocompat)
 * Cria uma coleta de preços: um registro por item (produto + solicitação quando informada).
 */
export async function postConfirmarColeta(req: Request, res: Response): Promise<void> {
  /** SQLite: limite típico de ~999 variáveis por statement — fatiamos inserts. */
  const ITEM_BATCH = 80;
  const REG_BATCH = 80;

  try {
    let body: { itens?: unknown; idProdutos?: unknown } = {};
    const raw = req.body;
    if (typeof raw === 'string') {
      try {
        body = JSON.parse(raw) as { itens?: unknown; idProdutos?: unknown };
      } catch {
        if (!res.headersSent) res.status(400).json({ error: 'Body JSON inválido.' });
        return;
      }
    } else if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
      body = raw as { itens?: unknown; idProdutos?: unknown };
    }

    const itens = normalizarItensColeta(body);
    if (itens.length === 0) {
      if (!res.headersSent) {
        res.status(400).json({
          error: 'Envie itens (idProduto e opcionalmente codigoSolicitacao) ou idProdutos com pelo menos um id válido.',
        });
      }
      return;
    }

    const usuarioCriacao = req.user?.login ?? null;
    if (usuarioCriacao) {
      let bloqueantes: { id: number; status: string | null; dataCriacao: Date; dataUltimaMovimentacao: Date | null }[] = [];
      try {
        bloqueantes = await getColetasBloqueantesInterno(usuarioCriacao);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[comprasController] postConfirmarColeta getColetasBloqueantesInterno:', msg);
      }
      if (bloqueantes.length > 0) {
        if (!res.headersSent) {
          res.status(403).json({
            error:
              'Você não pode criar nova coleta enquanto houver coleta(s) com mais de 72 horas sem movimentação e sem ciência justificada. Vá em Coletas de Preços e clique em "Dar ciência" em cada coleta indicada.',
            bloqueante: true,
            coletas: bloqueantes.map((b) => ({
              id: b.id,
              status: b.status,
              dataCriacao: b.dataCriacao?.toISOString() ?? null,
              dataUltimaMovimentacao: b.dataUltimaMovimentacao?.toISOString() ?? null,
            })),
          });
        }
        return;
      }
    }

    const itensComSolicitacao = itens.filter((i) => i.codigoSolicitacao != null && Number(i.codigoSolicitacao) > 0);
    if (itensComSolicitacao.length > 0) {
      const pares = itensComSolicitacao.map((i) => ({ idProduto: i.idProduto, idSolicitacao: i.codigoSolicitacao! }));
      const itensEmColetasAtivas: { coletaPrecosId: number }[] = [];
      const CHUNK_OR = 80;
      for (let i = 0; i < pares.length; i += CHUNK_OR) {
        const chunk = pares.slice(i, i + CHUNK_OR);
        const rows = await prisma.coletaPrecosItem.findMany({
          where: {
            coletaPrecos: { status: { not: 'Rejeitada' } },
            OR: chunk.map((p) => ({ idProduto: p.idProduto, idSolicitacao: p.idSolicitacao })),
          },
          select: { coletaPrecosId: true },
        });
        itensEmColetasAtivas.push(...rows);
      }
      const idsColetasConflito = [...new Set(itensEmColetasAtivas.map((r) => r.coletaPrecosId))];
      if (idsColetasConflito.length > 0) {
        const coletasInfo = await prisma.coletaPrecos.findMany({
          where: { id: { in: idsColetasConflito } },
          select: { id: true, status: true },
        });
        const listaColetas = coletasInfo.map((c) => `#${c.id} (${c.status ?? 'Em cotação'})`).join(', ');
        if (!res.headersSent) {
          res.status(400).json({
            error:
              'Não é possível criar a coleta: um ou mais itens selecionados possuem solicitação já vinculada a uma coleta existente. Coletas canceladas (Rejeitada) não são consideradas.',
            coletasEmConflito: coletasInfo.map((c) => ({ id: c.id, status: c.status ?? 'Em cotação' })),
            messageDetail: `Coletas com vínculo: ${listaColetas}.`,
          });
        }
        return;
      }
    }

    const agora = dataUltimaMovimentacao();
    const coleta = await prisma.coletaPrecos.create({
      data: {
        usuarioCriacao,
        dataUltimaMovimentacao: agora,
        requerVinculoFinalizacao: true,
      },
    });

    for (let off = 0; off < itens.length; off += ITEM_BATCH) {
      const batch = itens.slice(off, off + ITEM_BATCH);
      await prisma.coletaPrecosItem.createMany({
        data: batch.map(({ idProduto, codigoSolicitacao }) => ({
          coletaPrecosId: coleta.id,
          idProduto,
          idSolicitacao:
            codigoSolicitacao != null && Number.isFinite(codigoSolicitacao) && codigoSolicitacao > 0 ? codigoSolicitacao : null,
        })),
      });
    }

    const itensNomus = itens.map((i) => ({ idProduto: i.idProduto, idSolicitacao: i.codigoSolicitacao ?? null }));
    let rows: Record<string, unknown>[] = [];
    try {
      const result = await buscarRegistroColetaNomus(itensNomus);
      rows = result.rows ?? [];
      if (result.erro) {
        console.warn('[comprasController] postConfirmarColeta Nomus:', result.erro);
      }
    } catch (nomusErr) {
      console.warn('[comprasController] postConfirmarColeta Nomus (exceção):', nomusErr);
    }

    if (rows.length > 0) {
      try {
        const keyIdProduto = (r: Record<string, unknown>) => {
          const k = Object.keys(r).find((key) => /^id\s*produto$/i.test(key.trim()));
          return k ? r[k] : r['Id Produto'] ?? r['id produto'] ?? r.idProduto;
        };
        const values = rows
          .map((r, idx) => {
            const row = typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : {};
            const plain = { ...row };
            const raw = keyIdProduto(plain);
            const idProduto = Number(raw ?? 0);
            const idSolicitacao = idx < itens.length ? (itens[idx].codigoSolicitacao ?? null) : null;
            return {
              coletaPrecosId: coleta.id,
              idProduto,
              idSolicitacao,
              dados: JSON.stringify(plain),
              qtdeAprovada: null as number | null,
              idFornecedorVencedor: null as number | null,
            };
          })
          .filter((v) => v.idProduto > 0);
        if (values.length === 0) {
          console.warn(
            '[comprasController] postConfirmarColeta: Nomus retornou',
            rows.length,
            'linhas mas nenhum idProduto válido extraído. Chaves da 1ª linha:',
            Object.keys(rows[0] || {}),
          );
        } else {
          for (let off = 0; off < values.length; off += REG_BATCH) {
            const slice = values.slice(off, off + REG_BATCH);
            const placeholders = slice.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
            const params = slice.flatMap((v) => [
              v.coletaPrecosId,
              v.idProduto,
              v.idSolicitacao ?? null,
              v.dados,
              v.qtdeAprovada,
              v.idFornecedorVencedor,
            ]);
            await prisma.$executeRawUnsafe(
              `INSERT INTO coleta_precos_registro (coletaPrecosId, idProduto, idSolicitacao, dados, qtdeAprovada, idFornecedorVencedor) VALUES ${placeholders}`,
              ...params,
            );
          }
        }
      } catch (insertErr) {
        console.warn('[comprasController] postConfirmarColeta INSERT registro:', insertErr);
      }
    }

    if (!res.headersSent) {
      res.status(201).json({ id: coleta.id, itens, registros: rows.length });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] postConfirmarColeta:', msg);
    if (!res.headersSent) {
      res.status(503).json({ error: msg });
    }
  }
}

/** Tipo do item de fornecedor da cotação (payload do PUT). */
interface FornecedorColetaPayload {
  idPessoa?: number;
  nome?: string;
  pedidoMinimo?: string;
  condicaoPagamento?: string;
  formaPagamento?: string;
  valorFrete?: string;
  valorFreteTipo?: string;
  ipi?: string;
  ipiTipo?: string;
}

/**
 * GET /api/compras/coletas/:id/precos
 * Retorna os registros de produtos da coleta (dados do SQL da coleta de preços).
 * Se não houver registros salvos, busca no Nomus pelos idProdutos da coleta.
 * Inclui "debug" na resposta para diagnóstico quando a grade não é montada.
 */
export async function getPrecosColeta(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'ID da coleta inválido.', data: [] });
    return;
  }
  const debug: { registrosSalvos: number; itensNaColeta: number; nomusConfigurado: boolean; nomusErro?: string } = {
    registrosSalvos: 0,
    itensNaColeta: 0,
    nomusConfigurado: !!process.env.NOMUS_DB_URL?.trim(),
  };
  try {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      'SELECT id, coletaPrecosId, idProduto, idSolicitacao, dados, qtdeAprovada, idFornecedorVencedor FROM coleta_precos_registro WHERE coletaPrecosId = ? ORDER BY id',
      id
    );

    let data: Record<string, unknown>[] = [];
    const rawRows = Array.isArray(rows) ? rows : [];
    debug.registrosSalvos = rawRows.length;

    const keyRegistro = (r: Record<string, unknown>) => {
      const pid = Number(r.idProduto ?? r.idproduto ?? 0);
      const sid = r.idSolicitacao != null ? Number(r.idSolicitacao) : null;
      return `${pid}-${sid ?? 'n'}`;
    };
    const setRegistrosExistentes = new Set(rawRows.map((r) => keyRegistro(r as Record<string, unknown>)));

    for (const r of rawRows) {
      const row = r as Record<string, unknown>;
      const dadosStr = String(row.dados ?? row.Dados ?? '');
      const registroId = Number(row.id ?? row.Id ?? 0);
      const qtdeAprovada = row.qtdeAprovada != null ? Number(row.qtdeAprovada) : (row.qtdeaprovada != null ? Number(row.qtdeaprovada) : null);
      const idFornecedorVencedor = row.idFornecedorVencedor != null ? Number(row.idFornecedorVencedor) : (row.idfornecedorvencedor != null ? Number(row.idfornecedorvencedor) : null);
      try {
        const parsed = JSON.parse(dadosStr || '{}');
        if (parsed !== null && typeof parsed === 'object') {
          const obj = parsed as Record<string, unknown>;
          obj['_registroId'] = registroId;
          obj['Qtde Aprovada'] = qtdeAprovada;
          obj['Id Fornecedor Vencedor'] = idFornecedorVencedor;
          data.push(obj);
        }
      } catch {
        const idProduto = Number(row.idProduto ?? row.idproduto ?? 0);
        data.push({ 'Id Produto': idProduto, dados: dadosStr.slice(0, 100), _registroId: registroId, 'Qtde Aprovada': qtdeAprovada, 'Id Fornecedor Vencedor': idFornecedorVencedor });
      }
    }

    const itensDb = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      'SELECT idProduto, idSolicitacao FROM coleta_precos_item WHERE coletaPrecosId = ? ORDER BY id',
      id
    );
    const todosItens = (Array.isArray(itensDb) ? itensDb : [])
      .map((i) => ({
        idProduto: Number(i.idProduto ?? i.idproduto ?? 0),
        idSolicitacao: i.idSolicitacao != null ? Number(i.idSolicitacao) : null,
      }))
      .filter((n) => n.idProduto > 0);
    debug.itensNaColeta = todosItens.length;

    const itensSemRegistro = todosItens.filter(
      (i) => !setRegistrosExistentes.has(`${i.idProduto}-${i.idSolicitacao ?? 'n'}`)
    );
    const NOMUS_FILL_TIMEOUT_MS = 15000;
    if (itensSemRegistro.length > 0) {
      let nomusRows: Record<string, unknown>[] = [];
      let erroNomus: string | undefined;
      try {
        const nomusPromise = buscarRegistroColetaNomus(itensSemRegistro);
        const timeoutPromise = new Promise<{ rows: Record<string, unknown>[]; erro?: string }>((_, rej) => {
          setTimeout(() => rej(new Error('Timeout ao buscar dados do ERP (Nomus)')), NOMUS_FILL_TIMEOUT_MS);
        });
        const result = await Promise.race([nomusPromise, timeoutPromise]);
        nomusRows = result.rows ?? [];
        erroNomus = result.erro;
      } catch (err) {
        erroNomus = err instanceof Error ? err.message : 'Erro ao buscar itens faltantes no ERP';
        console.warn('[comprasController] getPrecosColeta preencher itens sem registro:', erroNomus);
      }
      if (erroNomus) debug.nomusErro = erroNomus;
      if (nomusRows.length > 0) {
        const keyIdProduto = (r: Record<string, unknown>) => {
          const k = Object.keys(r).find((key) => /^id\s*produto$/i.test(key.trim()));
          return k ? r[k] : r['Id Produto'] ?? r['id produto'] ?? r.idProduto;
        };
        const values = (nomusRows as Record<string, unknown>[]).map((r, idx) => {
          const plain = { ...r };
          const idProduto = Number(keyIdProduto(plain) ?? 0);
          const idSolicitacao = idx < itensSemRegistro.length ? itensSemRegistro[idx].idSolicitacao : null;
          return { coletaPrecosId: id, idProduto, idSolicitacao, dados: JSON.stringify(plain), qtdeAprovada: null, idFornecedorVencedor: null };
        }).filter((v) => v.idProduto > 0);
        if (values.length > 0) {
          const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
          const params = values.flatMap((v) => [v.coletaPrecosId, v.idProduto, v.idSolicitacao ?? null, v.dados, v.qtdeAprovada, v.idFornecedorVencedor]);
          await prisma.$executeRawUnsafe(
            `INSERT INTO coleta_precos_registro (coletaPrecosId, idProduto, idSolicitacao, dados, qtdeAprovada, idFornecedorVencedor) VALUES ${placeholders}`,
            ...params
          );
          const rowsAfter = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
            'SELECT id, coletaPrecosId, idProduto, idSolicitacao, dados, qtdeAprovada, idFornecedorVencedor FROM coleta_precos_registro WHERE coletaPrecosId = ? ORDER BY id',
            id
          );
          data = [];
          for (const r of Array.isArray(rowsAfter) ? rowsAfter : []) {
            const row = r as Record<string, unknown>;
            const dadosStr = String(row.dados ?? row.Dados ?? '');
            const registroId = Number(row.id ?? row.Id ?? 0);
            const qtdeAprovadaVal = row.qtdeAprovada != null ? Number(row.qtdeAprovada) : (row.qtdeaprovada != null ? Number(row.qtdeaprovada) : null);
            const idFornecedorVencedorVal = row.idFornecedorVencedor != null ? Number(row.idFornecedorVencedor) : (row.idfornecedorvencedor != null ? Number(row.idfornecedorvencedor) : null);
            try {
              const parsed = JSON.parse(dadosStr || '{}');
              if (parsed !== null && typeof parsed === 'object') {
                const obj = parsed as Record<string, unknown>;
                obj['_registroId'] = registroId;
                obj['Qtde Aprovada'] = qtdeAprovadaVal;
                obj['Id Fornecedor Vencedor'] = idFornecedorVencedorVal;
                data.push(obj);
              }
            } catch {
              const idProduto = Number(row.idProduto ?? row.idproduto ?? 0);
              data.push({ 'Id Produto': idProduto, dados: dadosStr.slice(0, 100), _registroId: registroId, 'Qtde Aprovada': qtdeAprovadaVal, 'Id Fornecedor Vencedor': idFornecedorVencedorVal });
            }
          }
          debug.registrosSalvos = data.length;
        }
      }
    }

    let message: string | undefined;
    if (data.length === 0) {
      if (todosItens.length === 0) {
        message = 'Esta coleta não possui produtos cadastrados. Adicione produtos ao criar a coleta.';
      } else {
        let nomusRows: Record<string, unknown>[] = [];
        let erroNomus: string | undefined;
        try {
          const nomusPromise = buscarRegistroColetaNomus(todosItens);
          const timeoutPromise = new Promise<{ rows: Record<string, unknown>[]; erro?: string }>((_, rej) => {
            setTimeout(() => rej(new Error('Timeout ao buscar dados do ERP (Nomus)')), NOMUS_FILL_TIMEOUT_MS);
          });
          const result = await Promise.race([nomusPromise, timeoutPromise]);
          nomusRows = result.rows ?? [];
          erroNomus = result.erro;
        } catch (err) {
          erroNomus = err instanceof Error ? err.message : 'Erro ao buscar dados no ERP';
          console.warn('[comprasController] getPrecosColeta fallback Nomus:', erroNomus);
        }
        if (erroNomus) debug.nomusErro = erroNomus;
        if (nomusRows.length > 0) {
          data = nomusRows as Record<string, unknown>[];
          try {
            const keyIdProduto = (r: Record<string, unknown>) => {
              const k = Object.keys(r).find((key) => /^id\s*produto$/i.test(key.trim()));
              return k ? r[k] : r['Id Produto'] ?? r['id produto'] ?? r.idProduto;
            };
            const values = data.map((r, idx) => {
              const plain = { ...r };
              const raw = keyIdProduto(plain);
              const idProduto = Number(raw ?? 0);
              const idSolicitacao = idx < todosItens.length ? todosItens[idx].idSolicitacao : null;
              return { coletaPrecosId: id, idProduto, idSolicitacao, dados: JSON.stringify(plain), qtdeAprovada: null, idFornecedorVencedor: null };
            }).filter((v) => v.idProduto > 0);
            if (values.length > 0) {
              const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
              const params = values.flatMap((v) => [v.coletaPrecosId, v.idProduto, v.idSolicitacao ?? null, v.dados, v.qtdeAprovada, v.idFornecedorVencedor]);
              await prisma.$executeRawUnsafe(
                `INSERT INTO coleta_precos_registro (coletaPrecosId, idProduto, idSolicitacao, dados, qtdeAprovada, idFornecedorVencedor) VALUES ${placeholders}`,
                ...params
              );
              const rowsAfter = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
                'SELECT id, coletaPrecosId, idProduto, idSolicitacao, dados, qtdeAprovada, idFornecedorVencedor FROM coleta_precos_registro WHERE coletaPrecosId = ? ORDER BY id',
                id
              );
              data = [];
              for (const r of Array.isArray(rowsAfter) ? rowsAfter : []) {
                const row = r as Record<string, unknown>;
                const dadosStr = String(row.dados ?? row.Dados ?? '');
                const registroId = Number(row.id ?? row.Id ?? 0);
                const qtdeAprovadaVal = row.qtdeAprovada != null ? Number(row.qtdeAprovada) : (row.qtdeaprovada != null ? Number(row.qtdeaprovada) : null);
                const idFornecedorVencedorVal = row.idFornecedorVencedor != null ? Number(row.idFornecedorVencedor) : (row.idfornecedorvencedor != null ? Number(row.idfornecedorvencedor) : null);
                try {
                  const parsed = JSON.parse(dadosStr || '{}');
                  if (parsed !== null && typeof parsed === 'object') {
                    const obj = parsed as Record<string, unknown>;
                    obj['_registroId'] = registroId;
                    obj['Qtde Aprovada'] = qtdeAprovadaVal;
                    obj['Id Fornecedor Vencedor'] = idFornecedorVencedorVal;
                    data.push(obj);
                  }
                } catch {
                  const idProduto = Number(row.idProduto ?? row.idproduto ?? 0);
                  data.push({ 'Id Produto': idProduto, dados: dadosStr.slice(0, 100), _registroId: registroId, 'Qtde Aprovada': qtdeAprovadaVal, 'Id Fornecedor Vencedor': idFornecedorVencedorVal });
                }
              }
            }
          } catch (saveErr) {
            console.warn('[comprasController] getPrecosColeta persistir fallback Nomus:', saveErr);
          }
        } else {
          message = erroNomus
            ? 'Não foi possível carregar os preços do sistema externo (Nomus). Verifique a conexão.'
            : 'Nenhum dado de preço retornado para os produtos desta coleta.';
        }
        if (erroNomus) {
          console.warn('[comprasController] getPrecosColeta coletaId=', id, 'fallback Nomus:', erroNomus);
        }
      }
    }

    // Mapa idProduto -> ids das solicitações vinculadas (para exibir no Modal de Preços)
    const itensComSolicitacao = await prisma.coletaPrecosItem.findMany({
      where: { coletaPrecosId: id, idSolicitacao: { not: null } },
      select: { idProduto: true, idSolicitacao: true },
    });
    const solicitacoesPorProduto: Record<number, number[]> = {};
    for (const i of itensComSolicitacao) {
      const pid = i.idProduto;
      const sid = i.idSolicitacao;
      if (sid != null) {
        if (!solicitacoesPorProduto[pid]) solicitacoesPorProduto[pid] = [];
        solicitacoesPorProduto[pid].push(sid);
      }
    }

    console.log('[comprasController] getPrecosColeta coletaId=', id, 'registrosSalvos=', debug.registrosSalvos, 'itensNaColeta=', debug.itensNaColeta, 'nomusConfigurado=', debug.nomusConfigurado, 'data.length=', data.length, debug.nomusErro ? 'nomusErro=' + debug.nomusErro : '');
    res.json({ data, solicitacoesPorProduto, message, debug });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] getPrecosColeta:', msg);
    res.status(503).json({ error: msg, data: [], debug: { ...debug, nomusErro: msg } });
  }
}

/**
 * GET /api/compras/fornecedores
 * Lista fornecedores ativos (pessoa.fornecedor=1) para o popup de seleção.
 */
export async function getFornecedores(_req: Request, res: Response): Promise<void> {
  const result = await listarFornecedoresAtivos();
  if (result.erro) {
    res.status(503).json({ error: result.erro, data: [] });
    return;
  }
  res.json({ data: result.data });
}

/**
 * GET /api/compras/condicoes-pagamento — lista do Nomus (condicaopagamento ativo = 1).
 */
export async function getCondicoesPagamento(_req: Request, res: Response): Promise<void> {
  const result = await listarCondicoesPagamentoNomus();
  if (result.erro) {
    res.status(503).json({ error: result.erro, data: [] });
    return;
  }
  res.json({ data: result.data });
}

/**
 * GET /api/compras/formas-pagamento — lista do Nomus (formapagamento ativo = 1).
 */
export async function getFormasPagamento(_req: Request, res: Response): Promise<void> {
  const result = await listarFormasPagamentoNomus();
  if (result.erro) {
    res.status(503).json({ error: result.erro, data: [] });
    return;
  }
  res.json({ data: result.data });
}

/**
 * PUT /api/compras/coletas/:id/fornecedores
 * Body: { fornecedores: FornecedorColetaPayload[] } — até 5 itens com idPessoa, nome e campos opcionais.
 */
export async function putColetaFornecedores(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'ID da coleta inválido.' });
    return;
  }
  let body = req.body as { fornecedores?: unknown };
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as { fornecedores?: unknown };
    } catch {
      res.status(400).json({ error: 'Body JSON inválido.' });
      return;
    }
  }
  const raw = Array.isArray(body?.fornecedores) ? body.fornecedores : [];
  const fornecedoresList: FornecedorColetaPayload[] = raw.slice(0, MAX_FORNECEDORES_POR_COTACAO).map((v) => {
    if (v !== null && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return {
        idPessoa: typeof o.idPessoa === 'number' ? o.idPessoa : undefined,
        nome: typeof o.nome === 'string' ? o.nome.trim() : undefined,
        pedidoMinimo: typeof o.pedidoMinimo === 'string' ? o.pedidoMinimo.trim() : undefined,
        condicaoPagamento: typeof o.condicaoPagamento === 'string' ? o.condicaoPagamento.trim() : undefined,
        formaPagamento: typeof o.formaPagamento === 'string' ? o.formaPagamento.trim() : undefined,
        valorFrete: typeof o.valorFrete === 'string' ? o.valorFrete.trim() : undefined,
        valorFreteTipo: o.valorFreteTipo === '%' || o.valorFreteTipo === 'R$' ? o.valorFreteTipo : undefined,
        ipi: typeof o.ipi === 'string' ? o.ipi.trim() : undefined,
        ipiTipo: o.ipiTipo === '%' || o.ipiTipo === 'R$' ? o.ipiTipo : undefined,
      };
    }
    return {};
  }).filter((item) => item.idPessoa != null && item.nome != null);
  if (fornecedoresList.length > MAX_FORNECEDORES_POR_COTACAO) {
    res.status(400).json({ error: `Máximo de ${MAX_FORNECEDORES_POR_COTACAO} fornecedores por cotação.` });
    return;
  }
  const fornecedoresJson = JSON.stringify(fornecedoresList);
  try {
    const coletaExists = await prisma.coletaPrecos.findUnique({ where: { id }, select: { id: true } });
    if (!coletaExists) {
      res.status(404).json({ error: 'Coleta não encontrada.' });
      return;
    }
    const agora = dataUltimaMovimentacao();
    await prisma.coletaPrecos.update({
      where: { id },
      data: { fornecedores: fornecedoresJson, dataUltimaMovimentacao: agora },
    });
    res.json({ ok: true, fornecedores: fornecedoresList });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] putColetaFornecedores:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * GET /api/compras/coletas/:id/precos-cotacao
 * Query opcional: idProduto=123 — se omitido, retorna toda a cotação da coleta (para o Mapa de Cotação).
 */
export async function getPrecosCotacao(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'ID da coleta inválido.', data: [] });
    return;
  }
  const idProdutoRaw = req.query.idProduto;
  const idProduto =
    typeof idProdutoRaw === 'string' && idProdutoRaw.trim() !== ''
      ? parseInt(idProdutoRaw, 10)
      : typeof idProdutoRaw === 'number' && Number.isFinite(idProdutoRaw)
        ? Math.floor(idProdutoRaw)
        : null;
  const filtroProduto = idProduto != null && idProduto >= 1 ? { idProduto } : {};
  try {
    const rows = await prisma.coletaPrecosCotacao.findMany({
      where: { coletaPrecosId: id, ...filtroProduto },
      select: {
        idProduto: true,
        idFornecedor: true,
        precoNF: true,
        percICMS: true,
        percPIS: true,
        percIPI: true,
        percCOFINS: true,
        precoTotal: true,
      },
    });
    res.json({ data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasController] getPrecosCotacao:', msg);
    res.status(503).json({ error: msg, data: [] });
  }
}

/**
 * POST /api/compras/coletas/:id/precos-cotacao
 * Body: { idProduto: number, precos: PrecoCotacaoItem[] }
 * Grava os preços cadastrados por produto/fornecedor (popup Cadastrar preços).
 */
export async function postPrecosCotacao(req: Request, res: Response): Promise<void> {
  try {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'ID da coleta inválido.' });
    return;
  }
  let body = (req.body ?? {}) as { idProduto?: unknown; precos?: unknown };
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as typeof body;
    } catch {
      res.status(400).json({ error: 'Body JSON inválido.' });
      return;
    }
  }
  const idProdutoRaw = typeof body?.idProduto === 'number' && Number.isFinite(body.idProduto)
    ? body.idProduto
    : typeof body?.idProduto === 'string'
      ? parseInt(String(body.idProduto), 10)
      : null;
  const idProduto = idProdutoRaw != null && Number.isFinite(idProdutoRaw) && idProdutoRaw >= 1 ? Math.floor(idProdutoRaw) : null;
  const rawPrecos = Array.isArray(body?.precos) ? body.precos : [];
  if (idProduto == null) {
    res.status(400).json({ error: 'Envie idProduto (número) e precos (array).' });
    return;
  }
  const precos = rawPrecos
    .map((p: unknown) => {
      if (p == null || typeof p !== 'object') return null;
      const o = p as Record<string, unknown>;
      const idFornecedorRaw = Number(o.idPessoa ?? o.idFornecedor ?? 0);
      if (!Number.isFinite(idFornecedorRaw) || idFornecedorRaw < 1) return null;
      const idFornecedor = Math.floor(idFornecedorRaw);
      const precoNF = Number(o.precoNF);
      const precoTotal = Number(o.precoTotal);
      if (!Number.isFinite(precoNF) || !Number.isFinite(precoTotal)) return null;
      const safe = (n: number) => (Number.isFinite(n) ? n : 0);
      return {
        idFornecedor,
        precoNF,
        percICMS: safe(Number(o.percICMS)),
        percPIS: safe(Number(o.percPIS)),
        percIPI: safe(Number(o.percIPI)),
        percCOFINS: safe(Number(o.percCOFINS)),
        precoTotal,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
  if (precos.length === 0) {
    res.status(400).json({ error: 'Envie ao menos um item em precos com idPessoa, precoNF e precoTotal.' });
    return;
  }
  try {
    const coleta = await prisma.coletaPrecos.findUnique({ where: { id }, select: { status: true } });
    if (!coleta) {
      res.status(404).json({ error: 'Coleta não encontrada.' });
      return;
    }
    const statusColeta = String(coleta.status ?? 'Em cotação').trim();
    if (statusColeta !== 'Em cotação') {
      res.status(400).json({ error: 'Só é possível cadastrar ou alterar preços quando o status é "Em cotação".' });
      return;
    }
    await prisma.coletaPrecosCotacao.deleteMany({
      where: { coletaPrecosId: id, idProduto },
    });
    await prisma.coletaPrecosCotacao.createMany({
      data: precos.map((p) => ({
        coletaPrecosId: id,
        idProduto,
        idFornecedor: p.idFornecedor,
        precoNF: p.precoNF,
        percICMS: p.percICMS,
        percPIS: p.percPIS,
        percIPI: p.percIPI,
        percCOFINS: p.percCOFINS,
        precoTotal: p.precoTotal,
      })),
    });
    await prisma.coletaPrecos.update({
      where: { id },
      data: { dataUltimaMovimentacao: dataUltimaMovimentacao() },
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[comprasController] postPrecosCotacao:', msg, stack ?? '');
    const mensagem = /table|não existe|does not exist/i.test(msg)
      ? 'Tabela de cotação não encontrada. Execute no backend: npx prisma migrate deploy'
      : msg;
    if (!res.headersSent) res.status(503).json({ error: mensagem });
  }
  } catch (outerErr) {
    const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
    const stack = outerErr instanceof Error ? outerErr.stack : undefined;
    console.error('[comprasController] postPrecosCotacao (outer):', msg, stack ?? '');
    if (!res.headersSent) res.status(503).json({ error: msg });
  }
}
