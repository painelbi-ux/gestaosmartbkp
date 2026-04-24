/**
 * SQL para registro da coleta de preços no Nomus.
 * Parâmetro: lista de idProduto. O caller acrescenta AND p.id IN (?, ?, ...) e passa os ids.
 */
export const SQL_REGISTRO_COLETA_BASE = `
Select
  p.id As 'Id Produto',
  p.nome As 'Codigo do Produto',
  Upper(p.descricao) As 'Descricao do Produto',
  umed.abreviatura As 'Unidade de Medida',
  tp.descricao As 'Tipo do Produto',
  gp.nome As 'Grupo do Produto',
  fp.id As 'IDFamiliaPrduto',
  fp.nome As 'Familia do Produto',
  If((p.ativo = 1), 'Sim', 'Não') As 'Produto ativo',
  coalesce(round(p.estoqueSeguranca, 2),0) As 'Estoque de Seguranca',
  round(p.estoqueMaximo, 2) As 'Estoque Maximo',
  coalesce(round(ssf.saldoSetorFinal, 2),0) As 'Saldo Estoque',
  IfNull(round((Select Sum(a3.quantidade) As quantidade_solicitada
  From solicitacaocompra a3
  Where (a3.idProduto = p.id) And (a3.status = 3) And (a3.lixeira Is Null)), 2),
  0) As 'Qtd Confirmada',
  sco.id As 'Id Solicitação',
  u.nome As 'Usuario',
  Coalesce(sco.quantidadesolicitada, 0) As 'Qtd Liberada',
  cast(sco.dataNecessidade as date) as 'Data Necessidade',
  Cast(sco.dataEmissao As date) As 'Data Solicitacao',
  IfNull(round((Select Sum(a4.qtde - IfNull(a4.qtdeAtendida, 0)) As
    quantidadecompra From itempedidocompra a4
  Where (a4.idProduto = p.id) And
    (a4.status = 2)), 2), 0) As 'PC_Aguardando Liberacao',
  IfNull(round((Select Sum(a4.qtde - IfNull(a4.qtdeAtendida, 0)) As
    quantidadecompra From itempedidocompra a4
  Where (a4.idProduto = p.id) And (a4.status In (3, 2, 4))), 2), 0) As 'PC',
  Cast(Str_To_Date(um.dataentrada, '%d/%m/%Y') As DATE) As 'Ultima Entrada',
  Cast(Str_To_Date(um.datapedidocompra, '%d/%m/%Y') As DATE) As
  'Data Ultimo Pedido',
  um.quantidade As 'Qtde Ult Compra',
  um.valorunitario As 'Custo Unitario Compra',
  um.idFornecedor As 'IDFornecedor',
  um.nomefornecedor As 'Ultimo Fornecedor',
  Coalesce(cm.ConsumoMedio, 0) As 'Consumo Medio',
  Coalesce(cm.divisao, 0) As 'Qtd Meses',
  sauc.saldoSetorInicial As 'Saldo em Estoque Antes UE',
  o.observacoes As 'Observacoes SC',
  Coalesce(emp.qtdempenhada, 0) As 'Qtde Empenhada',
  nc.opcao As 'Nome Coleta',
  ds.opcao As 'Dia da Semana',
  coalesce(agpag.quantidade,0) as 'Ag Pag'
From
  produto p
  Left Join
  unidademedida umed On p.idUnidadeMedida = umed.id
  Left Join
  tipoproduto tp On p.idTipoProduto = tp.id
  Left Join
  grupoproduto gp On p.idGrupoProduto = gp.id
  Left Join
  familiaproduto fp On p.idFamiliaProduto = fp.id
  Left Join
  (SELECT 
    ultimos_saldos.idProduto,
    ultimos_saldos.cod as Codigo,
    SUM(ultimos_saldos.saldoSetorFinal) as saldoSetorFinal 
FROM (
    SELECT 
        sep.id,
        sep.idProduto,
        p.nome as cod,
        sep.idSetorEstoque,
        sep.idEmpresa,
        sep.dataMovimentacao,
        CASE 
            WHEN sep.saldoSetorFinal <= 0 THEN 0 
            ELSE sep.saldoSetorFinal 
        END as saldoFinal,
        sep.qtdeEntrada,
        sep.qtdeSaida,
        case when 
        sep.saldoSetorFinal <= 0 then 0
        else sep.saldoSetorFinal end saldoSetorFinal,
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
    WHERE se.consideraComoSaldoDisponivel = 1 and se.id = 2
      AND p.ativo = 1 
      AND p.idTipoProduto IN (5, 6, 10, 13, 14, 16, 21, 22)
) AS ultimos_saldos
WHERE rn = 1
GROUP BY ultimos_saldos.idProduto, ultimos_saldos.cod
) ssf On p.id = ssf.idProduto
  Left Join
  (SELECT 
    b.idProduto,
    c.ids_item_documento_estoque,
    c.ids_item_pedido_compra,
    c.quantidade,
    c.idprod,
    (c.valorunitario +  COALESCE(c.valorunitario*(t.aliquotaIPI/100),0)) as valorunitario ,
    c.dataentrada,
    c.datapedidocompra,
    CAST(SUBSTRING_INDEX(c.idfornecedor, ',', 1) AS UNSIGNED) AS idfornecedor,
    c.nomefornecedor,
    CAST(SUBSTRING_INDEX(c.ids_item_documento_estoque, ',', -1) AS UNSIGNED)  AS idult,
    t.aliquotaIPI,
    COALESCE(c.valorunitario*(t.aliquotaIPI/100),0) as valorIPi
FROM (
    /* Última data (de emissão do pedido de compra) por produto */
    SELECT 
        b2.idProduto,
        DATE(MAX(de.dataEntrada)) AS dataMaxima
    FROM itemdocumentoestoque_itempedidocompra a2
    LEFT JOIN itemdocumentoestoque b2 ON a2.idItemDocumentoEstoque = b2.id
    LEFT JOIN itempedidocompra ipc2 ON ipc2.id = a2.idItemPedidoCompra
    LEFT JOIN pedidocompra pc2 ON pc2.id = ipc2.idPedidoCompra
    left join documentoestoque de on de.id = b2.idDocumentoEntrada
     where de.idTipoMovimentacao in (11,111,112,113,114,115,116,122)
    GROUP BY b2.idProduto
) AS b
LEFT JOIN (
    SELECT
	c.idProduto AS idprod,
	DATE(d.dataEmissao) AS data_pedido,
	f.dataEntrada as data_entrada,
	ROUND(SUM(a.qtde), 2) AS quantidade,
	ROUND(ANY_VALUE(e.valorUnitario), 2) AS valorunitario,
	DATE_FORMAT(MAX(f.dataEntrada), "%d/%m/%Y") AS dataentrada,
	DATE_FORMAT(d.dataEmissao, "%d/%m/%Y") AS datapedidocompra,
	GROUP_CONCAT(DISTINCT a.idItemDocumentoEstoque ORDER BY a.idItemDocumentoEstoque) AS ids_item_documento_estoque,
	GROUP_CONCAT(DISTINCT a.idItemPedidoCompra ORDER BY a.idItemPedidoCompra) AS ids_item_pedido_compra,
	GROUP_CONCAT(DISTINCT h.id ORDER BY h.id) AS idfornecedor,
	GROUP_CONCAT(DISTINCT h.nome ORDER BY h.nome SEPARATOR ' | ') AS nomefornecedor
FROM
	itemdocumentoestoque_itempedidocompra a
LEFT JOIN movimentacaoproducao b ON a.idItemDocumentoEstoque = b.id
LEFT JOIN itempedidocompra c ON a.idItemPedidoCompra = c.id
LEFT JOIN pedidocompra d ON c.idPedidoCompra = d.id
LEFT JOIN itemdocumentoestoque e ON a.idItemDocumentoEstoque = e.id
LEFT JOIN documentoestoque f ON e.idDocumentoEntrada = f.id
LEFT JOIN produto g ON c.idProduto = g.id
LEFT JOIN pessoa h ON f.idParceiro = h.id 
 where f.idTipoMovimentacao in (11,111,112,113,114,115,116,122)
GROUP BY c.idProduto, DATE(f.dataEntrada)
) AS c
    ON b.idProduto = c.idprod 
   AND b.dataMaxima = date(c.data_entrada)
   left join tributacao t on t.idItemDocumentoEstoque =  CAST(SUBSTRING_INDEX(c.ids_item_documento_estoque, ',', -1) AS UNSIGNED)) um
    On um.idProduto = p.id
  Left Join
  (Select a.idProduto As idProduto,
    c.nome As nome,
    CurDate() As hoje,
    AddDate(CurDate(), -180) As datareferencia,
    da.primeiraentrada,
    a.data,
    DateDiff(CurDate(), da.primeiraentrada) As totaldias,
    Case When DateDiff(CurDate(), a.data) > 180 Then 180
      Else DateDiff(CurDate(), a.data) End As maxdias,
    Case When DateDiff(CurDate(), da.primeiraentrada) > 180 Then 180 Else (Case
        When DateDiff(CurDate(), a.data) > 180 Then 180
        Else DateDiff(CurDate(), a.data) End) End As divisao,
    Sum(a.qtde) As qtd,
    round((Sum(a.qtde) / Case
      When DateDiff(CurDate(), da.primeiraentrada) > 180 Then 180 Else (Case
        When DateDiff(CurDate(), a.data) > 180 Then 180
        Else DateDiff(CurDate(), a.data) End) End) * 30, 0) As ConsumoMedio
  From movimentacaoproducao a
    Left Join tipomovimentacao b On a.idTipoMovimentacao = b.id
    Left Join produto c On a.idProduto = c.id
    Left Join (Select a.idProduto As idProduto,
      c.nome As nome,
      a.data As primeiraentrada
    From movimentacaoproducao a
      Left Join tipomovimentacao b On a.idTipoMovimentacao = b.id
      Left Join produto c On a.idProduto = c.id
    Where (a.idTipoMovimentacao In (50, 77, 18)) And
      (a.idSetorEstoqueSaida In (2, 19)) And (b.natureza In (2, 6))
    Group By a.idProduto, a.idSetorEstoqueSaida) da On da.idProduto = a.idProduto
  Where (a.data > (Select Date_Sub(d.datafinal, Interval DayOfMonth(d.datafinal)
      - 1 Day) From (Select CurDate(),
        Date_Add(CurDate(), Interval -6 Month) As datafinal) d)) And
    (a.idTipoMovimentacao In (50, 77, 18)) And (a.idSetorEstoqueSaida In (2,
    19)) And (b.natureza In (2, 6))
  Group By a.idProduto) cm On p.id = cm.idProduto
  Left Join
  (Select ud.idProduto,
    ud.nome,
    sauc.saldoSetorInicial
  From (Select sep.idProduto,
      p.nome,
      Max(sep.id) As maxid
    From saldoestoque_produto sep
      Left Join movimentacaoproducao mp On sep.idMovimentacao = mp.id
      Left Join produto p On p.id = sep.idProduto
    Where (sep.idSetorEstoque In (2, 19)) And (mp.idTipoMovimentacao In (11, 51,
      111, 112, 113, 114, 115, 116))
    Group By sep.idProduto) ud
    Left Join (Select sep.id,
      sep.idProduto,
      sep.dataMovimentacao,
      sep.saldoSetorInicial,
      sep.idMovimentacao
    From saldoestoque_produto sep
      Left Join movimentacaoproducao mp On sep.idMovimentacao = mp.id
    Where (sep.idSetorEstoque In (2, 19)) And (mp.idTipoMovimentacao In (11, 51,
      111, 112, 113, 114, 115, 116))
    Order By sep.idProduto) sauc On ud.maxid = sauc.id) sauc On p.id =
    sauc.idProduto
  Left Join
  (Select pq.idProdutoComponente As idprod,
    (Sum(Case
      When ((Coalesce(pq.qtdeNecessaria, 0) * Coalesce(pab.saldo, 0)) -
      (Coalesce(pq.qtdeNecessaria, 0) * Coalesce(ec.saldoestoque, 0))) <=
      0 Then 0
      Else ((Coalesce(pq.qtdeNecessaria, 0) * Coalesce(pab.saldo, 0)) -
      (Coalesce(pq.qtdeNecessaria, 0) * Coalesce(ec.saldoestoque, 0)))
    End) + Coalesce(pac.saldo, 0)) As qtdempenhada
  From (Select ft.idprodutopai,
      Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5, ft.idcomponente4),
      ft.idcomponente3), ft.idcomponente2), ft.idcomponente1) As
      idProdutoComponente,
      round((ft.qtd1 * ft.qtd2 * ft.qtd3 * ft.qtd4 * ft.qtd5), 5) As
      qtdeNecessaria
    From (Select
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
		(lm.descricao LIKE 'Lista%Produ__o' OR lm.descricao LIKE 'Lista%Precifica__o' or lm.descricao LIKE 'Lista%Parci%' ) AND
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
		And (Coalesce(lm4.discriminador, 'Original') = 'Original')
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
      Left Join produto pum
        On pum.id = Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
        ft.idcomponente4), ft.idcomponente3), ft.idcomponente2),
        ft.idcomponente1)
      Left Join unidademedida u On u.id = pum.idUnidadeMedida
      Left Join produto pp On pp.id = ft.idprodutopai
      Left Join unidademedida up On up.id = pp.idUnidadeMedida
      Left Join (Select apv.idProduto,
        alo.opcao
      From atributoprodutovalor apv
        Left Join atributolistaopcao alo On alo.id = apv.idListaOpcao
      Where apv.idAtributo = 540) t
        On (Coalesce(Coalesce(Coalesce(Coalesce(ft.idcomponente5,
        ft.idcomponente4), ft.idcomponente3), ft.idcomponente2),
        ft.idcomponente1)) = t.idProduto) pq
    Left Join (Select p.id,
      Sum(If((ip.status In (5, 4, 6)), 0, (If((ip.qtde >= ip.qtdeAtendida),
      (ip.qtde - ip.qtdeAtendida), 0) + IfNull((Select Sum(ide.qtde)
      From itemdocumentoestoque ide, itemdocumentoestoque_itempedidovenda ideipv
      Where (ide.idItemOrigemDevolucao = ideipv.idItemDocumentoEstoque) And
        (ideipv.idItemPedidoVenda = ip.id)), 0)))) As saldo
    From itempedido ip
    left join pedido pd on pd.id = ip.idPedido
      Left Join produto p On p.id = ip.idProduto
    Where ip.status In (2, 3) and pd.idTipoPedido <> 5
    Group By p.id) pab On pab.id = pq.idprodutopai
    Left Join (Select p.id,
      Sum(If((ip.status In (5, 4, 6)), 0, (If((ip.qtde >= ip.qtdeAtendida),
      (ip.qtde - ip.qtdeAtendida), 0) + IfNull((Select Sum(ide.qtde)
      From itemdocumentoestoque ide, itemdocumentoestoque_itempedidovenda ideipv
      Where (ide.idItemOrigemDevolucao = ideipv.idItemDocumentoEstoque) And
        (ideipv.idItemPedidoVenda = ip.id)), 0)))) As saldo
    From itempedido ip
      Left Join produto p On p.id = ip.idProduto
      left join pedido pd on pd.id = ip.idPedido
    Where ip.status In (2, 3) and pd.idTipoPedido <> 5
    Group By p.id) pac On pac.id = pq.idProdutoComponente
    Left Join (Select p.id,
      IfNull(If(ssf.saldoSetorFinal <= 0, 0, ssf.saldoSetorFinal),
      0) As saldoestoque
    From produto p
      Left Join (WITH ultimos_saldos AS (
    SELECT 
        sep.id,
        sep.idProduto,
        p.nome AS cod,
        p.descricao,
        case when p.ativo = 1 then 'Ativo' else 'Inativo' end as ativo,
        tp.nome as tipoProduto,
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
    LEFT JOIN produto p       ON p.id = sep.idProduto
    LEFT JOIN movimentacaoproducao mp ON mp.id = sep.idMovimentacao
    LEFT JOIN tipomovimentacao tm ON tm.id = mp.idTipoMovimentacao 
    left join tipoproduto tp on tp.id = p.idTipoProduto
    WHERE sep.idSetorEstoque in (5,24)
    and tp.id in (8,15) and p.ativo = 1
      AND se.idEmpresa = 1
)
SELECT
idProduto,
    cod AS nome,
    descricao,
    ativo,
    tipoProduto,
    case when SUM(saldoSetorFinalRaw) <= 0 then 0 else SUM(saldoSetorFinalRaw) end AS saldoSetorFinal
FROM ultimos_saldos
WHERE rn = 1
GROUP BY idProduto, cod) ssf On ssf.idProduto = p.id
      Left Join tipoproduto tp On tp.id = p.idTipoProduto
    Where (tp.id In (8, 15)) And (p.ativo = 1)) ec On ec.id = pq.idprodutopai
  Where (Case
      When ((Coalesce(pq.qtdeNecessaria, 0) * Coalesce(pab.saldo, 0)) -
      (Coalesce(pq.qtdeNecessaria, 0) * Coalesce(ec.saldoestoque, 0))) <=
      0 Then 0
      Else ((Coalesce(pq.qtdeNecessaria, 0) * Coalesce(pab.saldo, 0)) -
      (Coalesce(pq.qtdeNecessaria, 0) * Coalesce(ec.saldoestoque, 0))) End) > 0
  Group By pq.idProdutoComponente) emp On emp.idprod = p.id
  Left Join
  (Select apv.idProduto,
    apv.idAtributo,
    alo.opcao,
    apv.idListaOpcao
  From atributoprodutovalor apv
    Left Join atributolistaopcao alo On alo.id = apv.idListaOpcao
  Where apv.idAtributo = 650) nc On nc.idProduto = p.id
  Left Join
  (Select apv.idProduto,
    apv.idAtributo,
    alo.opcao,
    apv.idListaOpcao
  From atributoprodutovalor apv
    Left Join atributolistaopcao alo On alo.id = apv.idListaOpcao
  Where apv.idAtributo = 651) ds On ds.idProduto = p.id
  Left Join
  (Select 
a3.id,
a3.idUsuario,
a3.idProduto,
    (a3.quantidade) - Coalesce(Sum(scipc.qtdeAtendida), 0) As
    quantidadesolicitada,
    a3.dataEmissao,
    a3.dataNecessidade 
  From solicitacaocompra a3
    Left Join solicitacaocompraitempedidocompra scipc
      On a3.id = scipc.idSolicitacaoCompra
  Where (a3.status In (2, 6)) And (a3.lixeira Is Null)
  Group By a3.id ) sco On sco.idProduto = p.id
   Left Join
  (Select sc.id,
    sc.idProduto,
    Upper(sc.observacoes) As observacoes
  From solicitacaocompra sc
  Where (sc.status In (6, 2)) And (sc.lixeira Is Null)
  Group By sc.idProduto, sc.id
  Order By sc.idProduto
  ) o On o.id = sco.id
  Left Join
  (Select sc.id,
    sc.idProduto,
    sc.quantidade,
    p.nome,
    sc.dataEmissao,
    sc.status,
    If(sc.status = 1, 'Encerrada', If(sc.status = 2, 'Atendida parcialmente',
    If(sc.status = 3, 'Confirmada', If(sc.status = 4, 'Cancelada',
    If(sc.status = 5, 'Planejada', If(sc.status = 6, 'Liberada', 'Avaliar'))))))
    As statusnome
  From solicitacaocompra sc
    Left Join produto p On p.id = sc.idProduto
  Where (sc.dataEmissao = (Select Max(solicitacaocompra.dataEmissao)
    From solicitacaocompra
    Where (solicitacaocompra.idProduto = sc.idProduto) And
      (solicitacaocompra.status In (2, 6)))) And (sc.status In (2, 6))) dtsco
    On dtsco.id = sco.id
    left JOIN
    (select
icc.idProduto,
p.nome,
sum(icc.qtde) as quantidade
from itemcotacaocompra icc
left join cotacaocompra cc on cc.id = icc.idCotacaoCompra
left join produto p on p.id = icc.idProduto
where cc.status = 3
group by
icc.idProduto,
p.nome) agpag on agpag.idproduto = p.id
  left join usuario u on u.id = sco.idUsuario
Where
  (p.idTipoProduto In (5, 13, 14, 6, 10, 16, 21, 22))
`.trim();

/**
 * Consulta usada pelo gestor ao montar a grade (GET precos / Nomus): igual à BASE, mas sem o join
 * pesado de empenho (BOM/listas). `Qtde Empenhada` vem como 0 — troca latência por precisão nesse campo.
 * O SQL integral permanece em SQL_REGISTRO_COLETA_BASE / `_paste_nomus.sql`.
 */
function sqlRegistroColetaLeveFromBase(base: string): string {
  const withZero = base.replace(
    /  Coalesce\(emp\.qtdempenhada, 0\) As 'Qtde Empenhada',\r?\n/,
    "  0 As 'Qtde Empenhada',\n"
  );
  const startMarker = '\n  Left Join\n  (Select pq.idProdutoComponente As idprod,';
  const endMarker = '  Group By pq.idProdutoComponente) emp On emp.idprod = p.id\n';
  const i = withZero.indexOf(startMarker);
  const j = withZero.indexOf(endMarker);
  if (i === -1 || j === -1 || j < i) {
    throw new Error('[sqlRegistroColetaPrecos] Falha ao derivar SQL_REGISTRO_COLETA_LEVE (join emp).');
  }
  return withZero.slice(0, i) + '\n' + withZero.slice(j + endMarker.length);
}

export const SQL_REGISTRO_COLETA_LEVE = sqlRegistroColetaLeveFromBase(SQL_REGISTRO_COLETA_BASE);
