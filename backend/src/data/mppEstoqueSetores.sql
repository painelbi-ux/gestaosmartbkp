-- Saldo agregado por produto (código = pd.nome) nos setores 2, 19, 20 — materiais indicados.
-- Cruzamento MPP: codigoComponente = codigoProduto (pd.nome).
SELECT
    pd.nome AS codigoProduto,
    SUM(IFNULL((
        SELECT
            sep.saldoSetorFinal
        FROM
            weberp_soaco.saldoestoque_produto sep
        WHERE
            sep.id = (
                SELECT
                    MAX(sp.id)
                FROM
                    weberp_soaco.saldoestoque_produto sp
                WHERE
                    sp.idSetorEstoque = se.id
                    AND sp.idProduto = pd.id
            )
    ), 0)) AS estoque
FROM
    weberp_soaco.produto pd
LEFT JOIN
    weberp_soaco.tipoproduto tp ON pd.idTipoProduto = tp.id
LEFT JOIN
    weberp_soaco.grupoproduto gp ON pd.idGrupoProduto = gp.id
LEFT JOIN
    weberp_soaco.produtoempresa pe ON pd.id = pe.idProduto
LEFT JOIN
    weberp_soaco.produtoempresa_setorestoque pese ON pese.idProdutoEmpresa = pe.id
LEFT JOIN
    weberp_soaco.setorestoque se ON pese.idSetorEstoque = se.id
LEFT JOIN
    weberp_soaco.unidademedida um ON pd.idUnidadeMedida = um.id
WHERE
    tp.nome IN (
        'Materia prima',
        'Embalagem',
        'Material de uso e consumo produção',
        'Material de uso e consumo manutenção',
        'Material de uso e consumo administrativo'
    )
    AND pese.idSetorEstoque IN (2, 19, 20)
    AND pe.idEmpresa = 1
    AND pd.revisao = (
        SELECT
            MAX(prod.rv)
        FROM
            (
                SELECT
                    pd1.nome AS cod_p,
                    CONVERT(pd1.revisao, DECIMAL(18, 4)) AS rv
                FROM
                    weberp_soaco.produto pd1
            ) AS prod
        WHERE
            prod.cod_p = pd.nome
    )
GROUP BY
    pd.id,
    pd.nome,
    pd.descricao,
    tp.nome,
    um.abreviatura,
    pd.estoqueSeguranca,
    pd.ativo
HAVING
    estoque >= 0
