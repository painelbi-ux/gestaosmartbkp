Select DISTINCT
	Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
  ft.idcomponente4), ft.idcomponente3), ft.idcomponente2),
  ft.idcomponente1) as idComponente,
	Coalesce(Coalesce(Coalesce(Coalesce(ft.codigocomponente5,
  ft.codigocomponente4), ft.codigocomponente3), ft.codigocomponente2),
  ft.codigocomponente1) As codigocomponente,
	Coalesce(Coalesce(Coalesce(Coalesce(ft.descricaocomponente5,
  ft.descricaocomponente4), ft.descricaocomponente3), ft.descricaocomponente2),
  ft.descricaocomponente1) As componente,
u.abreviatura As unidademedida,
coalesce(p.estoqueSeguranca,0) as estoqueSeguranca,
coalesce(col.opcao,'Sem Definição') as coleta,
coalesce(ic.opcao,'Sem Definição') as itemcritico,
coalesce(est.estoque,0) as estoque,
coalesce(cm.ConsumoMedio,0) as CM,
coalesce(pcal.saldoaReceber,0) as pcPendentesAL,
sco.quantidade,
dtnsc.dataNecessidadeFormatada as dataNecessidade,
pcm.saldoaReceber,
dtEntpc.dataEntregaFormatada as dataEntrega
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
		lm.nome LIKE '%.1' AND
		(lm.descricao LIKE 'Lista%Produ__o' OR lm.descricao LIKE 'Lista%Precifica__o' ) AND
		(lm.padrao = 1)	AND
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
    Left JOIN
    (SELECT
    pd.id AS idCodigoProduto,
    pd.nome AS codigoProduto,
    pd.descricao AS produto,
    tp.nome AS tipoProduto,
    um.abreviatura AS unidadeMedida,
    SUM(IFNULL((
        SELECT
            sep.saldoSetorFinal
        FROM
            saldoestoque_produto sep
        WHERE
            sep.id = (
                SELECT
                    MAX(sp.id)
                FROM
                    saldoestoque_produto sp
                WHERE
                    sp.idSetorEstoque = se.id
                    AND sp.idProduto = pd.id
            )
    ), 0)) AS estoque,
    pd.estoqueSeguranca AS estoqueSeguranca,
    CASE
        WHEN pd.ativo = 1 THEN "Sim"
        WHEN pd.ativo = 0 THEN "Não"
    END AS ativo,
    (
        SELECT
            ide.valorUnitario
        FROM
            weberp_soaco.itemdocumentoestoque ide
        WHERE
            ide.idDocumentoEntrada IS NOT NULL
            AND ide.idProduto = pd.id
        ORDER BY
            ide.id DESC
        LIMIT 1
    ) AS ultimoPreco,
    (
        SELECT
            MAX(ide.qtde)
        FROM
            weberp_soaco.itemdocumentoestoque ide
        WHERE
            ide.idDocumentoEntrada IS NOT NULL
            AND ide.idProduto = pd.id
        ORDER BY
            ide.id DESC
        LIMIT 1
    ) AS ultimaQtdeComprada
FROM
    weberp_soaco.produto pd
LEFT JOIN
    tipoproduto tp ON pd.idTipoProduto = tp.id
LEFT JOIN
    grupoproduto gp ON pd.idGrupoProduto = gp.id
LEFT JOIN
    produtoempresa pe ON pd.id = pe.idProduto
LEFT JOIN
    produtoempresa_setorestoque pese ON pese.idProdutoEmpresa = pe.id
LEFT JOIN
    setorestoque se ON pese.idSetorEstoque = se.id
LEFT JOIN
    unidademedida um ON pd.idUnidadeMedida = um.id
WHERE
    tp.nome IN ("Materia prima", "Embalagem", "Material de uso e consumo produção", "Material de uso e consumo manutenção", "Material de uso e consumo administrativo")
    AND pese.idSetorEstoque IN (2,19,20)
    AND pe.idEmpresa = 1
    AND pd.revisao = (
        SELECT
            max(prod.rv)
        FROM
            (
                SELECT
                    pd1.nome as cod_p,
                    CONVERT(pd1.revisao, DECIMAL) as rv
                FROM
                    weberp_soaco.produto pd1
            ) as prod
        WHERE
            prod.cod_p = pd.nome
    )
GROUP BY
    pd.id, pd.nome, pd.descricao, tp.nome, um.abreviatura, pd.estoqueSeguranca, pd.ativo
HAVING
    estoque >= 0
) est on est.idCodigoProduto =
(Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
  ft.idcomponente4), ft.idcomponente3), ft.idcomponente2),
  ft.idcomponente1))
  left JOIN
  produto p on p.id = (Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
  ft.idcomponente4), ft.idcomponente3), ft.idcomponente2),
  ft.idcomponente1))
  left JOIN
  (select
apv.idProduto,
alo.opcao
FROM
atributoprodutovalor apv
left join atributolistaopcao alo on alo.id = apv.idListaOpcao
where apv.idAtributo = 713) ic on ic.idProduto =
(Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
  ft.idcomponente4), ft.idcomponente3), ft.idcomponente2),
  ft.idcomponente1))
  left JOIN
  (
select
apv.idProduto,
alo.opcao
FROM
atributoprodutovalor apv
left join atributolistaopcao alo on alo.id = apv.idListaOpcao
where apv.idAtributo = 650) col on col.idProduto =
(Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
  ft.idcomponente4), ft.idcomponente3), ft.idcomponente2),
  ft.idcomponente1))
left join
(select
		a.idProduto as idProduto,
		c.nome as nome,
		curdate() AS hoje,
		adddate(curdate(),-180) as datareferencia,
		da.primeiraentrada,
		a.data,
		datediff(curdate(), da.primeiraentrada) as totaldias,
		case
			when datediff(curdate(), a.data) > 180 then 180
			else datediff(curdate(), a.data)
		end as maxdias,
		case
			when datediff(curdate(), da.primeiraentrada) > 180 then 180
			else (case
				when datediff(curdate(), a.data) > 180 then 180
				else datediff(curdate(), a.data)
			end)
		end as divisao,
		sum(a.qtde) as qtd,
		round( (sum(a.qtde)/
case when datediff(curdate(), da.primeiraentrada) > 180 then 180 else (case when datediff(curdate(), a.data) > 180 then 180 else datediff(curdate(), a.data) end) end) * 30, 0) as ConsumoMedio
	from
		movimentacaoproducao a
	left join tipomovimentacao b on
		a.idtipomovimentacao = b.id
	left join produto c on
		a.idProduto = c.id
	left join
(
		select
			a.idProduto as idProduto,
			c.nome as nome,
			a.data as primeiraentrada
		from
			movimentacaoproducao a
		left join tipomovimentacao b on
			a.idtipomovimentacao = b.id
		left join produto c on
			a.idProduto = c.id
		where
			a.idTipoMovimentacao in (50, 77, 18)
				and a.idSetorEstoqueSaida IN (2, 19)
					and b.natureza in (2, 6)
				group by
					a.idProduto,
					a.idSetorEstoqueSaida) da on
		da.idProduto = a.idProduto
	where
		data >
(
		select
			date_Sub(d.datafinal, interval dayofmonth(d.datafinal)-1 DAY)
		from
			(
			select
				curdate(),
				date_add(curdate(), interval -6 month) as datafinal) d)
			and a.idTipoMovimentacao in (50, 77, 18)
				and a.idSetorEstoqueSaida IN (2, 19)
					and b.natureza in (2, 6)
				group by
					a.idProduto,
					a.idSetorEstoqueSaida) cm on cm.idProduto =
					(Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
  ft.idcomponente4), ft.idcomponente3), ft.idcomponente2),
  ft.idcomponente1))
    left JOIN
  (select
p.id,
sum((coalesce(i.qtde,0) - coalesce(i.qtdeAtendida,0))) as saldoaReceber
from itempedidocompra i
left join produto p on i.idProduto = p.id
left join pedidocompra pc on i.idPedidoCompra = pc.id
where i.status = 2
group by
p.id) pcal on pcal.id =
(Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
  ft.idcomponente4), ft.idcomponente3), ft.idcomponente2),
  ft.idcomponente1))
  left join
  (select
pem.idProduto,
p.descricao ,
idSetorEstoque,
se.nome
from
produtoempresa_setorestoque ps
left join produtoempresa pem on pem.id = ps.idProdutoEmpresa
left join setorestoque se on se.id = ps.idSetorEstoque
left join produto p on p.id = pem.idProduto
where ps.idSetorEstoque = 2 and p.ativo = 1
order by p.descricao asc) msec on msec.idProduto =
 (Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
  ft.idcomponente4), ft.idcomponente3), ft.idcomponente2),
  ft.idcomponente1))
  left join
  (SELECT
pd.id,
	pd.nome,
	sc.dataNecessidade,
	SUM(sc.quantidade) -
	ifnull(ate.qtdeAtendida,0) as quantidade
FROM
	solicitacaocompra sc
LEFT JOIN
	produto pd on sc.idProduto = pd.id
Left JOIN
(select
	idSolicitacaoCompra,
	sum(qtdeAtendida) as qtdeAtendida
	from solicitacaocompraitempedidocompra s
	group by
	idSolicitacaoCompra) ate on ate.idSolicitacaoCompra = sc.id
WHERE
	sc.status in (2,6)
GROUP BY
	sc.idProduto
) sco on sco.id =
 (Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
  ft.idcomponente4), ft.idcomponente3), ft.idcomponente2),
  ft.idcomponente1))
left JOIN
(SELECT
    sc.idProduto,
    pd.nome,
    DATE_FORMAT(MIN(sc.dataNecessidade), '%d/%m/%Y') AS dataNecessidade,
    (sc.quantidade) - IFNULL(ate.qtdeAtendida, 0) AS quantidade,
    CASE
        WHEN COUNT(sc.idProduto) > 1 THEN
            CONCAT(DATE_FORMAT(MIN(sc.dataNecessidade), '%d/%m/%Y'), '*')
        ELSE
            DATE_FORMAT(MIN(sc.dataNecessidade), '%d/%m/%Y')
    END AS dataNecessidadeFormatada
FROM
    weberp_soaco.solicitacaocompra sc
LEFT JOIN
    produto pd ON sc.idProduto = pd.id
LEFT JOIN
    (SELECT
        idSolicitacaoCompra,
        SUM(qtdeAtendida) AS qtdeAtendida
     FROM solicitacaocompraitempedidocompra s
     GROUP BY idSolicitacaoCompra) ate ON ate.idSolicitacaoCompra = sc.id
WHERE
    sc.status IN (2,6)
GROUP BY
    sc.idProduto, pd.nome
) dtnsc on dtnsc.idProduto = (Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
  ft.idcomponente4), ft.idcomponente3), ft.idcomponente2),
  ft.idcomponente1))
 left join
 (select
 pd.id,
pd.nome,
CASE
    WHEN CAST(i.dataEntrega AS DATE) < CURDATE() THEN CURDATE()
    ELSE CAST(i.dataEntrega AS DATE) end as dataEntrega,
sum((i.qtde - i.qtdeAtendida)) as saldoaReceber
from itempedidocompra i
left join produto pd on pd.id = i.idProduto
left join produto p on i.idProduto = p.id
left join pedidocompra pc on i.idPedidoCompra = pc.id
where i.status in (2, 3, 4)
group by
p.id
HAVING
 COALESCE(sum((i.qtde - i.qtdeAtendida)),0) > 0
) pcm on pcm.id =  (Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
  ft.idcomponente4), ft.idcomponente3), ft.idcomponente2),
  ft.idcomponente1))
left JOIN
(SELECT
    ipc.idProduto,
    pd.nome,
    DATE_FORMAT(
        GREATEST(
            COALESCE(MIN(CAST(ipc.dataEntrega AS DATE)), CURDATE()),
            CURDATE()
        ),
        '%d/%m/%Y'
    ) AS dataEntrega,
    CONCAT(
        DATE_FORMAT(
            GREATEST(
                COALESCE(MIN(CAST(ipc.dataEntrega AS DATE)), CURDATE()),
                CURDATE()
            ),
            '%d/%m/%Y'
        ),
        CASE WHEN COUNT(*) > 1 THEN '*' ELSE '' END,
        CASE WHEN MIN(CAST(ipc.dataEntrega AS DATE)) < CURDATE() THEN '***' ELSE '' END
    ) AS dataEntregaFormatada

FROM itempedidocompra ipc
LEFT JOIN produto pd ON ipc.idProduto = pd.id
WHERE ipc.status IN (3,4)
GROUP BY ipc.idProduto, pd.nome
) dtEntpc on dtEntpc.idProduto =
 (Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
  ft.idcomponente4), ft.idcomponente3), ft.idcomponente2),
  ft.idcomponente1))
  where msec.idSetorEstoque = 2
    order by
    Coalesce(Coalesce(Coalesce(Coalesce(ft.descricaocomponente5,
  ft.descricaocomponente4), ft.descricaocomponente3), ft.descricaocomponente2),
  ft.descricaocomponente1) asc
