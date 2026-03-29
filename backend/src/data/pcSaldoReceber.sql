-- Saldo a receber por produto (itens pedido de compra). Conexão já usa o banco Nomus (weberp_soaco).
-- Marcador /*PC_EXTRA_WHERE*/ substituído pelo controller (filtros AND ...).
SELECT
  pd.nome AS codigoProduto,
  GREATEST(
    COALESCE(MIN(CAST(i.dataEntrega AS DATE)), CURDATE()),
    CURDATE()
  ) AS dataEntrega,
  SUM(COALESCE(i.qtde, 0) - COALESCE(i.qtdeAtendida, 0)) AS saldoaReceber
FROM
  itempedidocompra i
INNER JOIN
  produto pd ON pd.id = i.idProduto
WHERE
  i.status IN (2, 3, 4)
  /*PC_EXTRA_WHERE*/
GROUP BY
  pd.id,
  pd.nome
HAVING
  COALESCE(SUM(COALESCE(i.qtde, 0) - COALESCE(i.qtdeAtendida, 0)), 0) > 0
