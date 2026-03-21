WITH CTE_PEDIDO_ABERTO AS
(
SELECT
	concat(coalesce(de.id,'0000000'),'-',pe.id,'-',pd.id) as idChave,
	ip.id AS 'ID_item_pedido',
	pd.id,
	pe.nome AS 'Codigo_pedido',
	pd.nome AS 'Codigo_produto',
	pe.dataEmissao AS 'DataEmissao',
(case when (ip.qtde >= ip.qtdeAtendida) then (ip.qtde - ip.qtdeAtendida) else 0 end)
AS 'Quantidade',
	ip.valorTotalComDesconto AS 'Valor total com desconto',
	CASE
		WHEN ip.status = 2 THEN 'Liberado'
		WHEN ip.status = 3 THEN 'Atendido parcialmente'
		WHEN ip.status = 4 THEN 'Atendido totalmente'
	END as 'StatusPedido',
	IFNULL((
	SELECT
		alo.opcao
	FROM
		atributopedidovalor apv
	JOIN atributolistaopcao alo
	WHERE
		alo.id = apv.idListaOpcao and
		apv.idPedido = pe.id and
		apv.idAtributo = 313
	limit 1
	),'Não definido') AS 'REQUISITADO',
	IFNULL((
	SELECT
		alo.opcao
	FROM
		atributopedidovalor apv
	JOIN atributolistaopcao alo
	WHERE
		alo.id = apv.idListaOpcao and
		apv.idPedido = pe.id and
		apv.idAtributo = 360
	limit 1
	),'Não definido') AS 'Retirada_loja_fabrica',
	IFNULL((
	SELECT
		alo.opcao
	FROM
		atributopedidovalor apv
	JOIN atributolistaopcao alo
	WHERE
		alo.id = apv.idListaOpcao and
		apv.idPedido = pe.id and
		apv.idAtributo = 591
	limit 1
	),'Não definido') AS 'MetodoEntrega',
	IFNULL(IFNULL(pec.nome,pec.nomeRazaoSocial),'---') AS 'Cliente',
	IFNULL(IFNULL(m.UF,pec.uf),'---') AS 'UF',
	m.nome AS 'Municipios',
	IF( m.nome IN ('Teresina','Altos','Alto Longá','Timon','Nazária','Demerval Lobão'), 'Grande THE' ,'---') AS 'Regiao',
	IFNULL(de.codigo,'---') AS 'Codigo romaneio',
	IFNULL(de.observacoes,'---') AS 'Rota',
	CASE
		WHEN de.observacoes LIKE '%Liber%' THEN 'Cargas Formadas'
		WHEN de.observacoes LIKE '%Constr%' THEN 'Cargas em Formação'
		ELSE '---'
	END AS 'OBS_Romaneio',
        ip.dataEntrega
FROM
	weberp_soaco.itempedido ip
INNER JOIN
	pedido pe on ip.idPedido = pe.id
left join
	pessoa pec on pe.idCliente = pec.id
LEFT JOIN
	municipio m on pec.idMunicipio = m.id
LEFT JOIN
	produto pd on ip.idProduto = pd.id
LEFT JOIN
	pessoa pev on pe.idVendedor = pev.id
LEFT JOIN
	pessoa per on pe.idRepresentante = per.id
LEFT JOIN
	tributacao t on t.idItemPedido = ip.id
LEFT JOIN
	itempedidoromaneio ipr on ipr.idItemPedido = ip.id
LEFT JOIN
	documentoestoque de on ipr.idRomaneio = de.id
left JOIN
(select
pe.id,
sum(ide.qtde) as qtde
from
	itemdocumentoestoque ide
left join documentoestoque de on ide.idDocumentoSaida  = de.id
left join itemdocumentoestoque_itempedidovenda ideipv on ide.id = ideipv.idItemDocumentoEstoque
left join itempedido ip on ip.id = ideipv.idItemPedidoVenda
left join pedido pe on pe.id = ip.idPedido
left join produto p on p.id = ip.idProduto
where de.dataEmissao >= '2023-01-01' and pe.id is not null
group by pe.id) qde on qde.id = pe.id
WHERE
	ip.status in (2, 3)
),
CTE_ESTOQUE_PA AS (
  SELECT
    cod AS nome,
    descricao,
    CASE
      WHEN SUM(saldoSetorFinalRaw) <= 0 THEN 0
      ELSE SUM(saldoSetorFinalRaw)
    END AS saldoSetorFinal
  FROM (
    SELECT
      sep.idProduto,
      p.nome AS cod,
      p.descricao,
      sep.saldoSetorFinal AS saldoSetorFinalRaw,
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
  ) ultimos_saldos_pa
  WHERE rn = 1
  GROUP BY idProduto, cod, descricao
),
CTE_LISTAMATERIAIS AS
((
Select
	ft.idprodutopai,
	ft.codigopai,
	ft.descricaopai,
	Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5, ft.idcomponente4),
  ft.idcomponente3), ft.idcomponente2), ft.idcomponente1) As idcomponente,
	Coalesce(Coalesce(Coalesce(Coalesce(ft.codigocomponente5,
  ft.codigocomponente4), ft.codigocomponente3), ft.codigocomponente2),
  ft.codigocomponente1) As codigocomponente,
	Coalesce(Coalesce(Coalesce(Coalesce(ft.descricaocomponente5,
  ft.descricaocomponente4), ft.descricaocomponente3), ft.descricaocomponente2),
  ft.descricaocomponente1) As componente,
	u.abreviatura As unidademedida,
	round((ft.qtd1 * ft.qtd2 * ft.qtd3 * ft.qtd4 * ft.qtd5), 5) As qtd,
	Coalesce(t.opcao, 'Material Secundário') As tipomaterial,
	ft.nome,
	ft.descricao
From
	(
	Select
		pq.idProduto As idprodutopai,
		pp.nome As codigopai,
		pp.descricao As descricaopai,
		pf1.id As idcomponente1,
		pf1.nome As codigocomponente1,
		pf1.descricao As descricaocomponente1,
		tp1.nome As tipoproduto1,
		lm.nome,
		lm.descricao,
		Coalesce(Cast(Replace(pq.qtdeNecessaria, ',', '.') As Decimal(10, 5)),
    1) As qtd1,
		pfl1.id As perfiladeira1,
		tm1.opcao As tipomaterial1,
		pf2.id As idcomponente2,
		pf2.nome As codigocomponente2,
		pf2.descricao As descricaocomponente2,
		tp2.nome As tipoproduto2,
		Coalesce(Cast(Replace(pq2.qtdeNecessaria, ',', '.') As Decimal(10, 5)),
    1) As qtd2,
		pf2.id As perfiladeira2,
		tm2.opcao As tipomaterial2,
		pf3.id As idcomponente3,
		pf3.nome As codigocomponente3,
		pf3.descricao As descricaocomponente3,
		tp3.nome As tipoproduto3,
		Coalesce(Cast(Replace(pq3.qtdeNecessaria, ',', '.') As Decimal(10, 5)),
    1) As qtd3,
		pf3.id As perfiladeira3,
		tm3.opcao As tipomaterial3,
		pf4.id As idcomponente4,
		pf4.nome As codigocomponente4,
		pf4.descricao As descricaocomponente4,
		tp4.nome As tipoproduto4,
		Coalesce(Cast(Replace(pq4.qtdeNecessaria, ',', '.') As Decimal(10, 5)),
    1) As qtd4,
		pf4.id As perfiladeira4,
		tm4.opcao As tipomaterial4,
		pf5.id As idcomponente5,
		pf5.nome As codigocomponente5,
		pf5.descricao As descricaocomponente5,
		tp5.nome As tipoproduto5,
		Coalesce(Cast(Replace(pq5.qtdeNecessaria, ',', '.') As Decimal(10, 5)),
    1) As qtd5,
		pf5.id As perfiladeira5,
		tm5.opcao As tipomaterial5
	From
		produtoqtde pq
	Left Join produto pp On
		pq.idProduto = pp.id
	Left Join listamateriais lm On
		lm.id = pq.idListaMateriais
	Left Join produto pf1 On
		pq.idProdutoComponente = pf1.id
	Left Join tipoproduto tp1 On
		tp1.id = pf1.idTipoProduto
	Left Join (
		Select
			Distinct p.id
		From
			roteiroproduto r
		Left Join produto p On
			p.id = r.idProduto
		Left Join operacaoroteiroproduto o On
			o.idRoteiroProduto = r.id
		Left Join recursohabilitadoroteiroproduto rhrp
        On
			rhrp.idOperacaoRoteiroProduto = o.id
		Left Join recurso re On
			re.id = rhrp.idRecurso
		Left Join tipoproduto tp On
			tp.id = p.idTipoProduto
		Where
			(r.ativo = 1)
				And (tp.nome = 'Produto em processo'
					Or
        tp.nome = 'Produto intermediário')
				And (p.ativo = 1)
					And
      (re.id In (1, 4, 46, 124, 123))) pfl1 On
		pfl1.id = pf1.id
	Left Join (
		Select
			apv.idProduto,
			alo.opcao
		From
			atributoprodutovalor apv
		Left Join atributolistaopcao alo On
			alo.id = apv.idListaOpcao
		Where
			apv.idAtributo = 540) tm1 On
		tm1.idProduto = pf1.id
	Left Join produtoqtde pq2 On
		pq.idProdutoComponente = pq2.idProduto
	Left Join listamateriais lm2 On
		lm2.id = pq2.idListaMateriais
	Left Join produto pf2 On
		pq2.idProdutoComponente = pf2.id
	Left Join tipoproduto tp2 On
		tp2.id = pf2.idTipoProduto
	Left Join (
		Select
			Distinct p.id
		From
			roteiroproduto r
		Left Join produto p On
			p.id = r.idProduto
		Left Join operacaoroteiroproduto o On
			o.idRoteiroProduto = r.id
		Left Join recursohabilitadoroteiroproduto rhrp
        On
			rhrp.idOperacaoRoteiroProduto = o.id
		Left Join recurso re On
			re.id = rhrp.idRecurso
		Left Join tipoproduto tp On
			tp.id = p.idTipoProduto
		Where
			(r.ativo = 1)
				And (tp.nome = 'Produto em processo'
					Or
        tp.nome = 'Produto intermediário')
				And (p.ativo = 1)
					And
      (re.id In (1, 4, 46, 124, 123))) pfl2 On
		pfl2.id = pf2.id
	Left Join (
		Select
			apv.idProduto,
			alo.opcao
		From
			atributoprodutovalor apv
		Left Join atributolistaopcao alo On
			alo.id = apv.idListaOpcao
		Where
			apv.idAtributo = 540) tm2 On
		tm2.idProduto = pf2.id
	Left Join produtoqtde pq3 On
		pq2.idProdutoComponente = pq3.idProduto
	Left Join listamateriais lm3 On
		lm3.id = pq3.idListaMateriais
	Left Join produto pf3 On
		pq3.idProdutoComponente = pf3.id
	Left Join tipoproduto tp3 On
		tp3.id = pf3.idTipoProduto
	Left Join (
		Select
			Distinct p.id
		From
			roteiroproduto r
		Left Join produto p On
			p.id = r.idProduto
		Left Join operacaoroteiroproduto o On
			o.idRoteiroProduto = r.id
		Left Join recursohabilitadoroteiroproduto rhrp
        On
			rhrp.idOperacaoRoteiroProduto = o.id
		Left Join recurso re On
			re.id = rhrp.idRecurso
		Left Join tipoproduto tp On
			tp.id = p.idTipoProduto
		Where
			(r.ativo = 1)
				And (tp.nome = 'Produto em processo'
					Or
        tp.nome = 'Produto intermediário')
				And (p.ativo = 1)
					And
      (re.id In (1, 4, 46, 124, 123))) pfl3 On
		pfl3.id = pf3.id
	Left Join (
		Select
			apv.idProduto,
			alo.opcao
		From
			atributoprodutovalor apv
		Left Join atributolistaopcao alo On
			alo.id = apv.idListaOpcao
		Where
			apv.idAtributo = 540) tm3 On
		tm3.idProduto = pf3.id
	Left Join produtoqtde pq4 On
		pq3.idProdutoComponente = pq4.idProduto
	Left Join listamateriais lm4 On
		lm4.id = pq4.idListaMateriais
	Left Join produto pf4 On
		pq4.idProdutoComponente = pf4.id
	Left Join tipoproduto tp4 On
		tp4.id = pf4.idTipoProduto
	Left Join (
		Select
			Distinct p.id
		From
			roteiroproduto r
		Left Join produto p On
			p.id = r.idProduto
		Left Join operacaoroteiroproduto o On
			o.idRoteiroProduto = r.id
		Left Join recursohabilitadoroteiroproduto rhrp
        On
			rhrp.idOperacaoRoteiroProduto = o.id
		Left Join recurso re On
			re.id = rhrp.idRecurso
		Left Join tipoproduto tp On
			tp.id = p.idTipoProduto
		Where
			(r.ativo = 1)
				And (tp.nome = 'Produto em processo'
					Or
        tp.nome = 'Produto intermediário')
				And (p.ativo = 1)
					And
      (re.id In (1, 4, 46, 124, 123))) pfl4 On
		pfl4.id = pf4.id
	Left Join (
		Select
			apv.idProduto,
			alo.opcao
		From
			atributoprodutovalor apv
		Left Join atributolistaopcao alo On
			alo.id = apv.idListaOpcao
		Where
			apv.idAtributo = 540) tm4 On
		tm4.idProduto = pf4.id
	Left Join produtoqtde pq5 On
		pq4.idProdutoComponente = pq5.idProduto
	Left Join listamateriais lm5 On
		lm5.id = pq5.idListaMateriais
	Left Join produto pf5 On
		pq5.idProdutoComponente = pf5.id
	Left Join tipoproduto tp5 On
		tp5.id = pf5.idTipoProduto
	Left Join (
		Select
			Distinct p.id
		From
			roteiroproduto r
		Left Join produto p On
			p.id = r.idProduto
		Left Join operacaoroteiroproduto o On
			o.idRoteiroProduto = r.id
		Left Join recursohabilitadoroteiroproduto rhrp
        On
			rhrp.idOperacaoRoteiroProduto = o.id
		Left Join recurso re On
			re.id = rhrp.idRecurso
		Left Join tipoproduto tp On
			tp.id = p.idTipoProduto
		Where
			(r.ativo = 1)
				And (tp.nome = 'Produto em processo'
					Or
        tp.nome = 'Produto intermediário')
				And (p.ativo = 1)
					And
      (re.id In (1, 4, 46, 124, 123))) pfl5 On
		pfl5.id = pf5.id
	Left Join (
		Select
			apv.idProduto,
			alo.opcao
		From
			atributoprodutovalor apv
		Left Join atributolistaopcao alo On
			alo.id = apv.idListaOpcao
		Where
			apv.idAtributo = 540) tm5 On
		tm5.idProduto = pf5.id
	Where
		(lm.descricao LIKE 'Lista%Prod%' OR lm.descricao LIKE 'Lista%Prec%') AND
		(lm.padrao = 1) AND
		(pp.idTipoProduto In (8, 15))
		And (Coalesce(lm.ativo, 1) = 1)
		And
    (Coalesce(lm.padrao, 1) = 1)
		And (Coalesce(lm.discriminador, 'Original') =
    'Original')
		And (Coalesce(lm2.ativo, 1) = 1)
		And (Coalesce(lm2.padrao, 1) =
    1)
		And (Coalesce(lm2.discriminador, 'Original') = 'Original')
		And
    (Coalesce(lm3.ativo, 1) = 1)
		And (Coalesce(lm3.padrao, 1) = 1)
		And
    (Coalesce(lm3.discriminador, 'Original') = 'Original')
		And
    (Coalesce(lm4.ativo, 1) = 1)
		And (Coalesce(lm4.padrao, 1) = 1)
		And
    (Coalesce(lm4.discriminador, 'Original') = 'Original')
		And
    (Coalesce(lm5.ativo, 1) = 1)
		And (Coalesce(lm5.padrao, 1) = 1)
		And
    (Coalesce(lm5.discriminador, 'Original') = 'Original')
		And (pp.ativo = 1)
		And ((Case
			When (tp1.nome Is Not Null
				Or tp1.nome Is Null) Then 1
			When ((pfl1.id Is Null
				And (tp1.nome = 'Produto em processo'
					Or
      tp1.nome = 'Produto intermediário'))
			And ((pf2.id Is Not Null)
				And
      (tp2.nome = 'Produto em processo'
					Or tp2.nome = 'Produto intermediário'))
			Or ((pf3.id Is Not Null)
				And (tp3.nome = 'Produto em processo'
					Or
      tp3.nome = 'Produto intermediário'))
			Or
      ((pf4.id Is Not Null)
				And (tp2.nome = 'Produto em processo'
					Or
      tp4.nome = 'Produto intermediário'))
			Or
      ((pf5.id Is Not Null)
				And (tp2.nome = 'Produto em processo'
					Or
      tp5.nome = 'Produto intermediário'))) Then 1
			Else 0
		End) = 1)) ft
Left Join
  produto pum On
	pum.id = Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
    ft.idcomponente4), ft.idcomponente3), ft.idcomponente2), ft.idcomponente1)
Left Join
  unidademedida u On
	u.id = pum.idUnidadeMedida
Left Join
  (
	Select
		apv.idProduto,
		alo.opcao
	From
		atributoprodutovalor apv
	Left Join atributolistaopcao alo On
		alo.id = apv.idListaOpcao
	Where
		apv.idAtributo = 540) t
    On
	(Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5, ft.idcomponente4),
    ft.idcomponente3), ft.idcomponente2), ft.idcomponente1)) = t.idProduto
WHERE
	SUBSTRING_INDEX(ft.nome, '.', 2) = ft.codigopai
)
UNION
(
Select
	ft.idprodutopai,
	ft.codigopai,
	ft.descricaopai,
	Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5, ft.idcomponente4),
  ft.idcomponente3), ft.idcomponente2), ft.idcomponente1) As idcomponente,
	Coalesce(Coalesce(Coalesce(Coalesce(ft.codigocomponente5,
  ft.codigocomponente4), ft.codigocomponente3), ft.codigocomponente2),
  ft.codigocomponente1) As codigocomponente,
	Coalesce(Coalesce(Coalesce(Coalesce(ft.descricaocomponente5,
  ft.descricaocomponente4), ft.descricaocomponente3), ft.descricaocomponente2),
  ft.descricaocomponente1) As componente,
	u.abreviatura As unidademedida,
	round((ft.qtd1 * ft.qtd2 * ft.qtd3 * ft.qtd4 * ft.qtd5), 5) As qtd,
	Coalesce(t.opcao, 'Material Secundário') As tipomaterial,
	ft.nome,
	ft.descricao
From
	(
	Select
		pq.idProduto As idprodutopai,
		pp.nome As codigopai,
		pp.descricao As descricaopai,
		pf1.id As idcomponente1,
		pf1.nome As codigocomponente1,
		pf1.descricao As descricaocomponente1,
		tp1.nome As tipoproduto1,
		lm.nome,
		lm.descricao,
		Coalesce(Cast(Replace(pq.qtdeNecessaria, ',', '.') As Decimal(10, 5)),
    1) As qtd1,
		pfl1.id As perfiladeira1,
		tm1.opcao As tipomaterial1,
		pf2.id As idcomponente2,
		pf2.nome As codigocomponente2,
		pf2.descricao As descricaocomponente2,
		tp2.nome As tipoproduto2,
		Coalesce(Cast(Replace(pq2.qtdeNecessaria, ',', '.') As Decimal(10, 5)),
    1) As qtd2,
		pf2.id As perfiladeira2,
		tm2.opcao As tipomaterial2,
		pf3.id As idcomponente3,
		pf3.nome As codigocomponente3,
		pf3.descricao As descricaocomponente3,
		tp3.nome As tipoproduto3,
		Coalesce(Cast(Replace(pq3.qtdeNecessaria, ',', '.') As Decimal(10, 5)),
    1) As qtd3,
		pf3.id As perfiladeira3,
		tm3.opcao As tipomaterial3,
		pf4.id As idcomponente4,
		pf4.nome As codigocomponente4,
		pf4.descricao As descricaocomponente4,
		tp4.nome As tipoproduto4,
		Coalesce(Cast(Replace(pq4.qtdeNecessaria, ',', '.') As Decimal(10, 5)),
    1) As qtd4,
		pf4.id As perfiladeira4,
		tm4.opcao As tipomaterial4,
		pf5.id As idcomponente5,
		pf5.nome As codigocomponente5,
		pf5.descricao As descricaocomponente5,
		tp5.nome As tipoproduto5,
		Coalesce(Cast(Replace(pq5.qtdeNecessaria, ',', '.') As Decimal(10, 5)),
    1) As qtd5,
		pf5.id As perfiladeira5,
		tm5.opcao As tipomaterial5
	From
		produtoqtde pq
	Left Join produto pp On
		pq.idProduto = pp.id
	Left Join listamateriais lm On
		lm.id = pq.idListaMateriais
	Left Join produto pf1 On
		pq.idProdutoComponente = pf1.id
	Left Join tipoproduto tp1 On
		tp1.id = pf1.idTipoProduto
	Left Join (
		Select
			Distinct p.id
		From
			roteiroproduto r
		Left Join produto p On
			p.id = r.idProduto
		Left Join operacaoroteiroproduto o On
			o.idRoteiroProduto = r.id
		Left Join recursohabilitadoroteiroproduto rhrp
        On
			rhrp.idOperacaoRoteiroProduto = o.id
		Left Join recurso re On
			re.id = rhrp.idRecurso
		Left Join tipoproduto tp On
			tp.id = p.idTipoProduto
		Where
			(r.ativo = 1)
				And (tp.nome = 'Produto em processo'
					Or
        tp.nome = 'Produto intermediário')
				And (p.ativo = 1)
					And
      (re.id In (1, 4, 46, 124, 123))) pfl1 On
		pfl1.id = pf1.id
	Left Join (
		Select
			apv.idProduto,
			alo.opcao
		From
			atributoprodutovalor apv
		Left Join atributolistaopcao alo On
			alo.id = apv.idListaOpcao
		Where
			apv.idAtributo = 540) tm1 On
		tm1.idProduto = pf1.id
	Left Join produtoqtde pq2 On
		pq.idProdutoComponente = pq2.idProduto
	Left Join listamateriais lm2 On
		lm2.id = pq2.idListaMateriais
	Left Join produto pf2 On
		pq2.idProdutoComponente = pf2.id
	Left Join tipoproduto tp2 On
		tp2.id = pf2.idTipoProduto
	Left Join (
		Select
			Distinct p.id
		From
			roteiroproduto r
		Left Join produto p On
			p.id = r.idProduto
		Left Join operacaoroteiroproduto o On
			o.idRoteiroProduto = r.id
		Left Join recursohabilitadoroteiroproduto rhrp
        On
			rhrp.idOperacaoRoteiroProduto = o.id
		Left Join recurso re On
			re.id = rhrp.idRecurso
		Left Join tipoproduto tp On
			tp.id = p.idTipoProduto
		Where
			(r.ativo = 1)
				And (tp.nome = 'Produto em processo'
					Or
        tp.nome = 'Produto intermediário')
				And (p.ativo = 1)
					And
      (re.id In (1, 4, 46, 124, 123))) pfl2 On
		pfl2.id = pf2.id
	Left Join (
		Select
			apv.idProduto,
			alo.opcao
		From
			atributoprodutovalor apv
		Left Join atributolistaopcao alo On
			alo.id = apv.idListaOpcao
		Where
			apv.idAtributo = 540) tm2 On
		tm2.idProduto = pf2.id
	Left Join produtoqtde pq3 On
		pq2.idProdutoComponente = pq3.idProduto
	Left Join listamateriais lm3 On
		lm3.id = pq3.idListaMateriais
	Left Join produto pf3 On
		pq3.idProdutoComponente = pf3.id
	Left Join tipoproduto tp3 On
		tp3.id = pf3.idTipoProduto
	Left Join (
		Select
			Distinct p.id
		From
			roteiroproduto r
		Left Join produto p On
			p.id = r.idProduto
		Left Join operacaoroteiroproduto o On
			o.idRoteiroProduto = r.id
		Left Join recursohabilitadoroteiroproduto rhrp
        On
			rhrp.idOperacaoRoteiroProduto = o.id
		Left Join recurso re On
			re.id = rhrp.idRecurso
		Left Join tipoproduto tp On
			tp.id = p.idTipoProduto
		Where
			(r.ativo = 1)
				And (tp.nome = 'Produto em processo'
					Or
        tp.nome = 'Produto intermediário')
				And (p.ativo = 1)
					And
      (re.id In (1, 4, 46, 124, 123))) pfl3 On
		pfl3.id = pf3.id
	Left Join (
		Select
			apv.idProduto,
			alo.opcao
		From
			atributoprodutovalor apv
		Left Join atributolistaopcao alo On
			alo.id = apv.idListaOpcao
		Where
			apv.idAtributo = 540) tm3 On
		tm3.idProduto = pf3.id
	Left Join produtoqtde pq4 On
		pq3.idProdutoComponente = pq4.idProduto
	Left Join listamateriais lm4 On
		lm4.id = pq4.idListaMateriais
	Left Join produto pf4 On
		pq4.idProdutoComponente = pf4.id
	Left Join tipoproduto tp4 On
		tp4.id = pf4.idTipoProduto
	Left Join (
		Select
			Distinct p.id
		From
			roteiroproduto r
		Left Join produto p On
			p.id = r.idProduto
		Left Join operacaoroteiroproduto o On
			o.idRoteiroProduto = r.id
		Left Join recursohabilitadoroteiroproduto rhrp
        On
			rhrp.idOperacaoRoteiroProduto = o.id
		Left Join recurso re On
			re.id = rhrp.idRecurso
		Left Join tipoproduto tp On
			tp.id = p.idTipoProduto
		Where
			(r.ativo = 1)
				And (tp.nome = 'Produto em processo'
					Or
        tp.nome = 'Produto intermediário')
				And (p.ativo = 1)
					And
      (re.id In (1, 4, 46, 124, 123))) pfl4 On
		pfl4.id = pf4.id
	Left Join (
		Select
			apv.idProduto,
			alo.opcao
		From
			atributoprodutovalor apv
		Left Join atributolistaopcao alo On
			alo.id = apv.idListaOpcao
		Where
			apv.idAtributo = 540) tm4 On
		tm4.idProduto = pf4.id
	Left Join produtoqtde pq5 On
		pq4.idProdutoComponente = pq5.idProduto
	Left Join listamateriais lm5 On
		lm5.id = pq5.idListaMateriais
	Left Join produto pf5 On
		pq5.idProdutoComponente = pf5.id
	Left Join tipoproduto tp5 On
		tp5.id = pf5.idTipoProduto
	Left Join (
		Select
			Distinct p.id
		From
			roteiroproduto r
		Left Join produto p On
			p.id = r.idProduto
		Left Join operacaoroteiroproduto o On
			o.idRoteiroProduto = r.id
		Left Join recursohabilitadoroteiroproduto rhrp
        On
			rhrp.idOperacaoRoteiroProduto = o.id
		Left Join recurso re On
			re.id = rhrp.idRecurso
		Left Join tipoproduto tp On
			tp.id = p.idTipoProduto
		Where
			(r.ativo = 1)
				And (tp.nome = 'Produto em processo'
					Or
        tp.nome = 'Produto intermediário')
				And (p.ativo = 1)
					And
      (re.id In (1, 4, 46, 124, 123))) pfl5 On
		pfl5.id = pf5.id
	Left Join (
		Select
			apv.idProduto,
			alo.opcao
		From
			atributoprodutovalor apv
		Left Join atributolistaopcao alo On
			alo.id = apv.idListaOpcao
		Where
			apv.idAtributo = 540) tm5 On
		tm5.idProduto = pf5.id
	Where
		(lm.descricao LIKE 'Lista%Prod%' OR lm.descricao LIKE 'Lista%Prec%') AND
		(lm.padrao = 1) AND
		(pp.idTipoProduto In (8, 15))
		And (Coalesce(lm.ativo, 1) = 1)
		And
    (Coalesce(lm.padrao, 1) = 1)
		And (Coalesce(lm.discriminador, 'Original') =
    'Original')
		And (Coalesce(lm2.ativo, 1) = 1)
		And (Coalesce(lm2.padrao, 1) =
    1)
		And (Coalesce(lm2.discriminador, 'Original') = 'Original')
		And
    (Coalesce(lm3.ativo, 1) = 1)
		And (Coalesce(lm3.padrao, 1) = 1)
		And
    (Coalesce(lm3.discriminador, 'Original') = 'Original')
		And
    (Coalesce(lm4.ativo, 1) = 1)
		And (Coalesce(lm4.padrao, 1) = 1)
		And
    (Coalesce(lm4.discriminador, 'Original') = 'Original')
		And
    (Coalesce(lm5.ativo, 1) = 1)
		And (Coalesce(lm5.padrao, 1) = 1)
		And
    (Coalesce(lm5.discriminador, 'Original') = 'Original')
		And (pp.ativo = 1)
		And ((Case
			When (tp1.nome Is Not Null
				Or tp1.nome Is Null) Then 1
			When ((pfl1.id Is Null
				And (tp1.nome = 'Produto em processo'
					Or
      tp1.nome = 'Produto intermediário'))
			And ((pf2.id Is Not Null)
				And
      (tp2.nome = 'Produto em processo'
					Or tp2.nome = 'Produto intermediário'))
			Or ((pf3.id Is Not Null)
				And (tp3.nome = 'Produto em processo'
					Or
      tp3.nome = 'Produto intermediário'))
			Or
      ((pf4.id Is Not Null)
				And (tp2.nome = 'Produto em processo'
					Or
      tp4.nome = 'Produto intermediário'))
			Or
      ((pf5.id Is Not Null)
				And (tp2.nome = 'Produto em processo'
					Or
      tp5.nome = 'Produto intermediário'))) Then 1
			Else 0
		End) = 1)) ft
Left Join
  produto pum On
	pum.id = Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
    ft.idcomponente4), ft.idcomponente3), ft.idcomponente2), ft.idcomponente1)
Left Join
  unidademedida u On
	u.id = pum.idUnidadeMedida
Left Join
  (
	Select
		apv.idProduto,
		alo.opcao
	From
		atributoprodutovalor apv
	Left Join atributolistaopcao alo On
		alo.id = apv.idListaOpcao
	Where
		apv.idAtributo = 540) t
    On
	(Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5, ft.idcomponente4),
    ft.idcomponente3), ft.idcomponente2), ft.idcomponente1)) = t.idProduto
))
SELECT
pe.`idChave`,
	pe.`Codigo_pedido`,
	pe.id,
	pe.`Codigo_produto`,
	pe.`DataEmissao`,
	pe.`Quantidade`,
	pe.`Valor total com desconto`,
	pe.`StatusPedido`,
	pe.`REQUISITADO`,
	pe.`MetodoEntrega`,
	pe.`Cliente`,
	pe.`UF`,
	pe.`Municipios`,
	pe.`Regiao`,
	pe.`Codigo romaneio`,
	pe.`Rota`,
	pe.`OBS_Romaneio`,
	pe.`Retirada_loja_fabrica`,
	 CASE
        WHEN pe.`REQUISITADO` = 'Sim' AND pe.`Regiao` = 'Grande THE' THEN 'Requisições de Loja'
        WHEN pe.`OBS_Romaneio` = 'Cargas Formadas' AND pe.`Regiao` = 'Grande THE' THEN 'Cargas Formadas'
        WHEN pe.`OBS_Romaneio` = 'Cargas Formadas' THEN 'Cargas Formadas'
        WHEN pe.`Retirada_loja_fabrica` = 'Sim' OR pe.`MetodoEntrega` IN ('Retirada na Só Aço', 'Retirada na Só Móveis') THEN 'Retirada Fabrica/loja'
        WHEN pe.`Regiao` = 'Grande THE' THEN 'Grande THE'
        WHEN pe.`OBS_Romaneio` = 'Cargas em Formação' THEN 'Cargas em Formação'
        ELSE 'Cargas em Formação'
    END AS Segmentacao_carradas,
    pe.dataEntrega,
    coalesce(lm.codigocomponente, 'SLM') AS codigoComponente,
    coalesce(lm.componente, 'Sem lista de materiais definida') as componente,
    lm.unidademedida,
    lm.qtd,
    (pe.`Quantidade` * lm.qtd) as qtdTotalComponente,
    COALESCE(pa.saldoSetorFinal, 0) as Estoque_PA
FROM
	CTE_PEDIDO_ABERTO pe
	LEFT JOIN CTE_LISTAMATERIAIS lm on lm.idprodutopai = pe.id
	LEFT JOIN CTE_ESTOQUE_PA pa on TRIM(pa.nome) = TRIM(pe.`Codigo_produto`)
