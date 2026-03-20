import { getNomusPool, isNomusEnabled } from '../config/nomusDb.js';

export type ProgramacaoSetorialEstoqueRow = {
  cod: string;
  descricao: string;
  saldoSetorFinal: number;
};

const SQL_PROG_SETORIAL_ESTOQUE = `
WITH ultimos_saldos AS (
  SELECT 
    sep.id,
    sep.idProduto,
    p.nome AS cod,
    p.descricao,
    CASE WHEN p.ativo = 1 THEN 'Ativo' ELSE 'Inativo' END AS ativo,
    tp.nome AS tipoProduto,
    sep.idSetorEstoque,
    sep.idEmpresa,
    sep.dataMovimentacao,
    CASE 
      WHEN sep.saldoSetorInicial <= 0 THEN 0 
      ELSE sep.saldoSetorFinal 
    END AS saldoFinal,
    sep.qtdeEntrada,
    sep.qtdeSaida,
    sep.saldoSetorFinal AS saldoSetorFinalRaw,
    sep.idMovimentacao,
    tm.nome,
    ROW_NUMBER() OVER (
      PARTITION BY sep.idProduto, sep.idSetorEstoque
      ORDER BY sep.dataMovimentacao DESC, sep.id DESC
    ) AS rn
  FROM saldoestoque_produto sep
  LEFT JOIN setorestoque se ON se.id = sep.idSetorEstoque
  LEFT JOIN produto p ON p.id = sep.idProduto
  LEFT JOIN movimentacaoproducao mp ON mp.id = sep.idMovimentacao
  LEFT JOIN tipomovimentacao tm ON tm.id = mp.idTipoMovimentacao
  LEFT JOIN tipoproduto tp ON tp.id = p.idTipoProduto
  WHERE sep.idSetorEstoque IN (5, 24)
    AND tp.id IN (8, 15)
    AND p.ativo = 1
    AND se.idEmpresa = 1
)
SELECT 
  cod AS nome,
  descricao,
  CASE 
    WHEN SUM(saldoSetorFinalRaw) <= 0 THEN 0 
    ELSE SUM(saldoSetorFinalRaw)
  END AS saldoSetorFinal
FROM ultimos_saldos
WHERE rn = 1
GROUP BY idProduto, cod, descricao
;
`;

export async function getProgramacaoSetorialEstoqueSaldo(): Promise<{
  data: ProgramacaoSetorialEstoqueRow[];
  erro?: string;
}> {
  const pool = getNomusPool();
  if (!pool || !isNomusEnabled()) {
    return { data: [], erro: 'NOMUS_DB_URL não configurado' };
  }

  try {
    const [rows] = await pool.query<any[]>(SQL_PROG_SETORIAL_ESTOQUE);
    const data: ProgramacaoSetorialEstoqueRow[] = (Array.isArray(rows) ? rows : []).map((r) => ({
      cod: String(r.nome ?? r.cod ?? ''),
      descricao: String(r.descricao ?? ''),
      saldoSetorFinal: Number(r.saldoSetorFinal ?? 0) || 0,
    }));
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[getProgramacaoSetorialEstoqueSaldo] Falhou:', msg);
    return { data: [], erro: msg };
  }
}

