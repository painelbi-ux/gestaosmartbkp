-- Itens de pedido de venda (Nomus) para detalhe do painel financeiro-comercial. Filtro por id interno do pedido (pd.id).
SELECT
  ip.id AS idItemPedido,
  IFNULL(p.nome, '') AS codigo,
  IFNULL(p.descricao, '') AS descricao,
  IFNULL(ip.qtde, 0) AS qtdePedida,
  IFNULL(ip.qtdeAtendida, 0) AS qtdeAtendida,
  (
    (ROUND((ip.valorTotalComDesconto * IFNULL(t.aliquotaIPI / 100, 0)), 2))
    + IFNULL(ip.valorTotalComDesconto, 0)
  ) AS valorTotalComIpi,
  ip.status AS statusIp,
  IFNULL(tpc.nome, '') AS tabelaPreco
FROM itempedido ip
INNER JOIN pedido pd ON pd.id = ip.idPedido
LEFT JOIN produto p ON p.id = ip.idProduto
LEFT JOIN tributacao t ON t.idItemPedido = ip.id
LEFT JOIN tabelapreco tpc ON tpc.id = ip.idTabelaPreco
WHERE pd.id = ?
  AND ip.status IN (1, 2, 3, 4, 5)
  AND pd.idEmpresa IN (1, 2)
ORDER BY ip.id;
