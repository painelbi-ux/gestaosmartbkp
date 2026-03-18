/**
 * Consultas Nomus: Devoluções diária/mensal e Faturamento diário/mensal.
 * Somente leitura.
 */

import { getNomusPool } from '../config/nomusDb.js';

const SQL_DEVOLUCOES_DIARIA = `
SELECT IfNull(Sum(ide.valorTotalComDesconto), 0) AS devolucao
FROM itemdocumentoestoque ide
LEFT JOIN tipomovimentacao tm ON ide.idTipoMovimentacao = tm.id
LEFT JOIN documentoestoque de ON ide.idDocumentoEntrada = de.id
LEFT JOIN nfe nfe ON nfe.idDocumentoEstoque = de.id
LEFT JOIN produto pd ON pd.id = ide.idProduto
LEFT JOIN grupoproduto gp ON pd.idGrupoProduto = gp.id
LEFT JOIN familiaproduto fp ON pd.idFamiliaProduto = fp.id
WHERE (ISNULL(nfe.status) = 1 OR nfe.status = 4)
  AND tm.id IN (52, 55)
  AND DATE(de.dataEmissao) = CURDATE()
`;

const SQL_DEVOLUCOES_MENSAL = `
SELECT IfNull(Sum(ide.valorTotalComDesconto), 0) AS devolucao
FROM itemdocumentoestoque ide
LEFT JOIN tipomovimentacao tm ON ide.idTipoMovimentacao = tm.id
LEFT JOIN documentoestoque de ON ide.idDocumentoEntrada = de.id
LEFT JOIN nfe nfe ON nfe.idDocumentoEstoque = de.id
LEFT JOIN produto pd ON pd.id = ide.idProduto
LEFT JOIN grupoproduto gp ON pd.idGrupoProduto = gp.id
LEFT JOIN familiaproduto fp ON pd.idFamiliaProduto = fp.id
WHERE (ISNULL(nfe.status) = 1 OR nfe.status = 4)
  AND tm.id IN (52, 55)
  AND YEAR(de.dataEmissao) = YEAR(CURDATE())
  AND MONTH(de.dataEmissao) = MONTH(CURDATE())
`;

const SQL_FATURAMENTO_DIARIO = `
SELECT
  DATE_FORMAT(de.dataEmissao, '%d/%m/%Y') AS dataEmissao,
  SUM(ide.valorTotal) AS valorTotal,
  SUM(ide.valorDesconto) AS totalDesconto,
  SUM(ide.valorTotalComDesconto) AS valorTotalComDesconto
FROM itemdocumentoestoque ide
LEFT JOIN tipomovimentacao tm ON ide.idTipoMovimentacao = tm.id
LEFT JOIN documentoestoque de ON ide.idDocumentoSaida = de.id
LEFT JOIN nfe nfe ON nfe.idDocumentoEstoque = de.id
LEFT JOIN produto pd ON pd.id = ide.idProduto
LEFT JOIN grupoproduto gp ON pd.idGrupoProduto = gp.id
LEFT JOIN familiaproduto fp ON pd.idFamiliaProduto = fp.id
WHERE (ISNULL(nfe.status) = 1 OR nfe.status IN (1, 3, 4))
  AND (tm.nome LIKE 'Vend%' OR (tm.id IN (91, 133, 156) AND tm.nome <> 'VENDA DE MERCADORIA  ADQUIRIDA CONS FINAL - FORA DO ESTADO'))
  AND tm.id NOT IN (150, 24)
  AND de.numeroDocumentoFiscal NOT IN ('128748', '127108', '132272')
  AND DATE(de.dataEmissao) = CURDATE()
GROUP BY DATE_FORMAT(de.dataEmissao, '%d/%m/%Y')
`;

const SQL_FATURAMENTO_MENSAL = `
SELECT SUM(ide.valorTotalComDesconto) AS valorTotalComDesconto
FROM itemdocumentoestoque ide
LEFT JOIN tipomovimentacao tm ON ide.idTipoMovimentacao = tm.id
LEFT JOIN documentoestoque de ON ide.idDocumentoSaida = de.id
LEFT JOIN nfe nfe ON nfe.idDocumentoEstoque = de.id
LEFT JOIN produto pd ON pd.id = ide.idProduto
LEFT JOIN grupoproduto gp ON pd.idGrupoProduto = gp.id
LEFT JOIN familiaproduto fp ON pd.idFamiliaProduto = fp.id
WHERE (ISNULL(nfe.status) = 1 OR nfe.status IN (1, 3, 4))
  AND tm.id <> 24
  AND tm.id <> 150
  AND (tm.nome LIKE 'Vend%' OR (tm.id IN (91, 133, 156) AND tm.nome <> 'VENDA DE MERCADORIA ADQUIRIDA CONS FINAL - FORA DO ESTADO'))
  AND YEAR(de.dataEmissao) = YEAR(CURDATE())
  AND MONTH(de.dataEmissao) = MONTH(CURDATE())
  AND de.numeroDocumentoFiscal NOT IN ('128748', '127108', '132272')
`;

export interface FaturamentoDiarioDados {
  devolucaoDiaria: number;
  faturamentoDiarioValorTotal: number;
  faturamentoDiarioTotalDesconto: number;
  faturamentoDiarioValorTotalComDesconto: number;
  faturamentoMensalValorTotalComDesconto: number;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function obterDadosFaturamentoDiario(): Promise<{
  dados: FaturamentoDiarioDados | null;
  erro?: string;
}> {
  const pool = getNomusPool();
  if (!pool) return { dados: null, erro: 'NOMUS_DB_URL não configurado' };

  try {
    const [devolDiaria] = (await pool.query(SQL_DEVOLUCOES_DIARIA)) as [Record<string, unknown>[], unknown];
    const [devolMensal] = (await pool.query(SQL_DEVOLUCOES_MENSAL)) as [Record<string, unknown>[], unknown];
    const [fatDiario] = (await pool.query(SQL_FATURAMENTO_DIARIO)) as [Record<string, unknown>[], unknown];
    const [fatMensal] = (await pool.query(SQL_FATURAMENTO_MENSAL)) as [Record<string, unknown>[], unknown];

    const devolucaoDiaria = toNum((Array.isArray(devolDiaria) ? devolDiaria[0] : null)?.devolucao);
    const fatRow = Array.isArray(fatDiario) ? fatDiario[0] : null;
    const valorTotal = toNum(fatRow?.valorTotal ?? fatRow?.['Valor Total']);
    const totalDesconto = toNum(fatRow?.totalDesconto ?? fatRow?.['Total de Desconto']);
    const valorTotalComDescontoDiario = toNum(fatRow?.valorTotalComDesconto ?? fatRow?.['Valor Total com Desconto']);
    const fatMensalRow = Array.isArray(fatMensal) ? fatMensal[0] : null;
    const faturamentoMensalValorTotalComDesconto = toNum(
      fatMensalRow?.valorTotalComDesconto ?? fatMensalRow?.['Valor Total com Desconto']
    );

    const dados: FaturamentoDiarioDados = {
      devolucaoDiaria,
      faturamentoDiarioValorTotal: valorTotal,
      faturamentoDiarioTotalDesconto: totalDesconto,
      faturamentoDiarioValorTotalComDesconto: valorTotalComDescontoDiario,
      faturamentoMensalValorTotalComDesconto,
    };
    return { dados };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[faturamentoDiarioRepository] obterDadosFaturamentoDiario:', msg);
    return { dados: null, erro: msg };
  }
}
