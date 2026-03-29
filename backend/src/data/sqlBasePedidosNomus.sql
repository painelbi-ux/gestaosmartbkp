select
pd.idEmpresa,
	concat(coalesce(de.id,'0000000'),'-',pd.id,'-',p.id) as idChave,
	ip.id as id_item_pedido,
	pd.id,
	CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN '2-Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN '1-Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN '5-Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão', 'Curralinhos')) AND aloreq.opcao = 'Não') THEN '3-Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then '4-Inserir em Romaneio'
    ELSE de.observacoes 
END
 as 'Observacoes',
	de.codigo as 'RM',
	tpd.nome as 'Tipo Pedido',
	pd.nome  as 'PD',
	pd.dataEmissao as 'Emissao',
	upper(pe.nome) as 'Cliente',
	p.nome as 'Cod',
	p.descricao as 'Descricao do produto',
	tp.nome as 'Tipo de produto do item de pedido de venda',
	ip.dataEntrega as 'Data de entrega',
	gp.nome as 'Grupo de produto',
	s1.opcao as 'Subgrupo1',
	s2.opcao as 'Subgrupo2',
	sp.opcao as 'Setor de Producao',
	if((ip.status = 1),'Aguardando liberacao',
	if((ip.status = 2),'Liberado',
	if((ip.status = 5),'Atendido com corte',
	if((ip.status = 3),'Atendido parcialmente',
	if((ip.status = 4),'Atendido totalmente',
	if((ip.status = 6),'Cancelado',
	if((ip.status = 7),'Devolvido parcialmente',
	if((ip.status = 8),'Devolvido totalmente','Sem status')))))))) as 'Stauts',
	me.opcao as 'Metodo de Entrega',
	aloreq.opcao as 'Requisicao de loja do grupo?',
case when
(CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN 'Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN 'Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN 'Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão')) AND aloreq.opcao = 'Não') THEN 'Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then 'Inserir em Romaneio'
    ELSE de.observacoes end) like '%Retirada%'
    OR
(CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN 'Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN 'Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN 'Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão')) AND aloreq.opcao = 'Não') THEN 'Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then 'Inserir em Romaneio'
    ELSE de.observacoes end) like '%Entrega%'
then 'PI' else
	ifnull(mc.uf, m.uf) end as 'UF',
case when
(CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN 'Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN 'Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN 'Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão')) AND aloreq.opcao = 'Não') THEN 'Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then 'Inserir em Romaneio'
    ELSE de.observacoes end) like '%Retirada%'
    OR
(CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN 'Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN 'Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN 'Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão')) AND aloreq.opcao = 'Não') THEN 'Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then 'Inserir em Romaneio'
    ELSE de.observacoes end) like '%Entrega%'
then 'Teresina' else
	ifnull(m.nome, mc.nome) end as 'Municipio de entrega',
	fp.nome as 'Forma de Pagamento',
	cp.nome as 'Condicao de pagamento do pedido de venda',
	case when fp.nome like 'Cart%' then 0 else
	cast(replace(left(cp.regra, 2),',','') AS UNSIGNED) end as regra,
	ip.qtde as 'Qtde pedida',
	ip.qtdeAtendida as 'Qtde atendida',
	((ip.qtde - ip.qtdeAtendida)+coalesce(devol.qtdDevolvida,0)) as 'Pendente',
	ifnull(prm.qtdeVinculada,0) as 'Qtde Romaneada',
	(((round((ip.valorTotalComDesconto * ifnull(t.aliquotaIPI/100,0)),2))+ifnull(ip.valorTotalComDesconto,0))/ip.qtde) as 'Valor Unitario com desconto + IPI do item PD',
	(((round((ip.valorTotalComDesconto * ifnull(t.aliquotaIPI/100,0)),2))+ifnull(ip.valorTotalComDesconto,0))) as 'Valor Total com desconto + IPI do item PD',
	((((round((ip.valorTotalComDesconto * ifnull(t.aliquotaIPI/100,0)),2))+ifnull(ip.valorTotalComDesconto,0))/ip.qtde) * 
	((ip.qtde - ip.qtdeAtendida)+coalesce(devol.qtdDevolvida,0)))  as 'Valor Pendente',
	((((round((ip.valorTotalComDesconto * ifnull(t.aliquotaIPI/100,0)),2))+ifnull(ip.valorTotalComDesconto,0))/ip.qtde) * 
	 ifnull(prm.qtdeVinculada,0)) as 'Valor Romaneado',
	(sum(nfef.valorTotalComDesconto)+ifnull(t.valorIPI,0)) as 'Valor Faturado Entrega Futura + IPI do item do Pedido',
	emp.opcao as 'Venda por qual empresa?',
	vr.nome as 'Vendedor/Representante',
	adt.valorAdiantamento as 'Valor Adiantamento',
	COUNT(pd.nome) OVER (PARTITION BY pd.nome) AS 'Quantidade Pedidos',
	sum(((round((ip.valorTotalComDesconto * ifnull(t.aliquotaIPI/100,0)),2))+ifnull(ip.valorTotalComDesconto,0))) OVER (PARTITION BY pd.nome) AS 'Valor Pedido Total',
	(coalesce(((adt.valorAdiantamento/
	(sum(((round((ip.valorTotalComDesconto * ifnull(t.aliquotaIPI/100,0)),2))+ifnull(ip.valorTotalComDesconto,0))) OVER (PARTITION BY pd.nome))
	) * (((round((ip.valorTotalComDesconto * ifnull(t.aliquotaIPI/100,0)),2))+ifnull(ip.valorTotalComDesconto,0)))),0))
	as valorAdiantamentoRateio,
	case when 
	(case when fp.nome like 'Cart%' then 0 else
	cast(replace(left(cp.regra, 2),',','') AS UNSIGNED) end) <= 10
	then 'Sim' else 'Não' end as 'Entrada/A vista Ate 10d',
	case when 
	(de.codigo is null and 
	 (case when fp.nome like 'Cart%' then 0 else
	cast(replace(left(cp.regra, 2),',','') AS UNSIGNED) end) <= 10) then 
	((((round((ip.valorTotalComDesconto * ifnull(t.aliquotaIPI/100,0)),2))+ifnull(ip.valorTotalComDesconto,0))/ip.qtde) * 
	(ip.qtde - ip.qtdeAtendida))
	WHEN
	(case when fp.nome like 'Cart%' then 0 else
	cast(replace(left(cp.regra, 2),',','') AS UNSIGNED) end) <= 10 then 
	((((round((ip.valorTotalComDesconto * ifnull(t.aliquotaIPI/100,0)),2))+ifnull(ip.valorTotalComDesconto,0))/ip.qtde) * 
	 ifnull(prm.qtdeVinculada,0))
	  else 
	0 end as 'Valor a Vista Ate 10d',
	case 
    when de.codigo is null
         then ((ip.qtde - ip.qtdeAtendida)+coalesce(devol.qtdDevolvida,0))
    else ifnull(prm.qtdeVinculada,0) -- Qtde Romaneada
end as 'Qtde Pendente Real',
CASE when
    de.observacoes is null then
           (case 
    when de.codigo is null
         then ((ip.qtde - ip.qtdeAtendida)+coalesce(devol.qtdDevolvida,0))
    else ifnull(prm.qtdeVinculada,0)
end ) * (((round((ip.valorTotalComDesconto * ifnull(t.aliquotaIPI/100,0)),2))+ifnull(ip.valorTotalComDesconto,0))/ip.qtde)
else
((((round((ip.valorTotalComDesconto * ifnull(t.aliquotaIPI/100,0)),2))+ifnull(ip.valorTotalComDesconto,0))/ip.qtde) * 
	 ifnull(prm.qtdeVinculada,0))
END AS 'Saldo a Faturar Real',
CASE 
    WHEN (CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN '2-Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN '1-Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN '5-Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão', 'Curralinhos')) AND aloreq.opcao = 'Não') THEN '3-Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then '4-Inserir em Romaneio'
    ELSE de.observacoes 
END) LIKE '%Retirada%' THEN DATE(ip.dataEntrega)
    WHEN (CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN '2-Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN '1-Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN '5-Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão', 'Curralinhos')) AND aloreq.opcao = 'Não') THEN '3-Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then '4-Inserir em Romaneio'
    ELSE de.observacoes 
END) LIKE '%Requisi%'  THEN DATE(ip.dataEntrega)
    WHEN (CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN '2-Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN '1-Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN '5-Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão', 'Curralinhos')) AND aloreq.opcao = 'Não') THEN '3-Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then '4-Inserir em Romaneio'
    ELSE de.observacoes 
END) LIKE '%Entrega%'  THEN DATE(ip.dataEntrega)
    WHEN (CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN '2-Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN '1-Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN '5-Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão', 'Curralinhos')) AND aloreq.opcao = 'Não') THEN '3-Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then '4-Inserir em Romaneio'
    ELSE de.observacoes 
END) LIKE '%ROTA%'     THEN DATE(DATE_ADD(pd.dataEmissao, INTERVAL 30 DAY))
    ELSE DATE(ip.dataEntrega)
END AS dataParametro,
CASE 
    WHEN (CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN '2-Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN '1-Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN '5-Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão', 'Curralinhos')) AND aloreq.opcao = 'Não') THEN '3-Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then '4-Inserir em Romaneio'
    ELSE de.observacoes 
END) LIKE '%Retirada%' THEN 'Retirada'
    WHEN (CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN '2-Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN '1-Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN '5-Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão', 'Curralinhos')) AND aloreq.opcao = 'Não') THEN '3-Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then '4-Inserir em Romaneio'
    ELSE de.observacoes 
END) LIKE '%Requisi%'  THEN 'Requisição'
    WHEN (CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN '2-Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN '1-Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN '5-Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão', 'Curralinhos')) AND aloreq.opcao = 'Não') THEN '3-Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then '4-Inserir em Romaneio'
    ELSE de.observacoes 
END) LIKE '%Entrega%'  THEN 'Entrega Grande Teresina'
    WHEN (CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN '2-Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN '1-Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN '5-Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão', 'Curralinhos')) AND aloreq.opcao = 'Não') THEN '3-Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then '4-Inserir em Romaneio'
    ELSE de.observacoes 
END) LIKE '%ROTA%'     THEN 'Carradas'
    ELSE 'Inserir em Romaneio'
END AS tipoF,
CASE 
    WHEN CURDATE() > 
        CASE 
            WHEN (CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN '2-Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN '1-Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN '5-Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão', 'Curralinhos')) AND aloreq.opcao = 'Não') THEN '3-Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then '4-Inserir em Romaneio'
    ELSE de.observacoes 
END) LIKE '%Retirada%' THEN DATE(ip.dataEntrega)
            WHEN (CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN '2-Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN '1-Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN '5-Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão', 'Curralinhos')) AND aloreq.opcao = 'Não') THEN '3-Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then '4-Inserir em Romaneio'
    ELSE de.observacoes 
END) LIKE '%Requisi%'  THEN DATE(ip.dataEntrega)
            WHEN (CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN '2-Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN '1-Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN '5-Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão', 'Curralinhos')) AND aloreq.opcao = 'Não') THEN '3-Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then '4-Inserir em Romaneio'
    ELSE de.observacoes 
END) LIKE '%Entrega%'  THEN DATE(ip.dataEntrega)
            WHEN (CASE 
	WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN '2-Retirada na So Moveis'
    WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN '1-Retirada na So Aço'
    WHEN (de.observacoes IS NULL AND ifnull(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN '5-Requisicao'
    WHEN (de.observacoes IS NULL AND (ifnull(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão', 'Curralinhos')) AND aloreq.opcao = 'Não') THEN '3-Entrega em Grande Teresina'
    WHEN (de.observacoes IS NULL) then '4-Inserir em Romaneio'
    ELSE de.observacoes 
END) LIKE '%ROTA%'     THEN DATE(DATE_ADD(pd.dataEmissao, INTERVAL 30 DAY))
            ELSE DATE(ip.dataEntrega)
        END
    THEN 'Atrasado'
    ELSE 'Em dia'
END AS StatusPedido
	from itempedido ip
	left join produto p on p.id = ip.idProduto
	left join pedido pd on pd.id = ip.idPedido
	left join tipopedido tpd on tpd.id = pd.idTipoPedido
	left join pessoa pe on pe.id = pd.idCliente
	left join grupoproduto gp on gp.id = p.idGrupoProduto
	left join tipoproduto tp on tp.id = p.idTipoProduto
	left join tributacao t on t.idItemPedido = ip.id
	left join 
	(select
	apv.idProduto,
	alo.opcao
	from atributoprodutovalor apv
	left join atributolistaopcao alo on alo.id = apv.idListaOpcao
	where apv.idAtributo = 398) s1 on s1.idProduto = p.id
	left join 
	(select
	apv.idProduto,
	alo.opcao
	from atributoprodutovalor apv
	left join atributolistaopcao alo on alo.id = apv.idListaOpcao
	where apv.idAtributo = 399) s2 on s2.idProduto = p.id
	left join 
	(select
	apv.idProduto,
	alo.opcao
	from atributoprodutovalor apv
	left join atributolistaopcao alo on alo.id = apv.idListaOpcao
	where apv.idAtributo = 679) sp on sp.idProduto = p.id
	left join
	(select 
	pd.id,
	aloreq.opcao
	from
	pedido pd
	left join atributopedidovalor apvreq on apvreq.idPedido = pd.id
	left join atributolistaopcao aloreq on aloreq.id = apvreq.idListaOpcao 
	where apvreq.idAtributo = 313) aloreq on aloreq.id = pd.id
	left join
	(select 
	pd.id,
	aloret.opcao
	from
	pedido pd
	left join atributopedidovalor apvret on apvret.idPedido = pd.id
	left join atributolistaopcao aloret on aloret.id = apvret.idListaOpcao 
	where apvret.idAtributo = 360 ) aloret on aloret.id = pd.id
	left join
	(select 
	pd.id,
	aloent.opcao
	from
	pedido pd
	left join atributopedidovalor apvent on apvent.idPedido = pd.id
	left join atributolistaopcao aloent on aloent.id = apvent.idListaOpcao
	where apvent.idAtributo = 300) aloent on aloent.id = pd.id
	left join condicaopagamento cp on cp.id = pd.idCondicaoPagamento
	left join endereco ed on ed.id = pd.idEnderecoLocalEntrega
	left join municipio m on ed.idMunicipio = m.id
	left join municipio mc on mc.id = pe.idMunicipio
	left join itempedidoromaneio prm on prm.idItemPedido = ip.id
	left join documentoestoque de on de.id = prm.idRomaneio
	left join formapagamento fp on fp.id = pd.idFormaPagamento 
	left join
	(select
	ideipv.idItemDocumentoEstoque,
	ideipv.idItemPedidoVenda,
	ide.valorTotalComDesconto
	from itemdocumentoestoque_itempedidovenda ideipv
	left join itemdocumentoestoque ide on ide.id = ideipv.idItemDocumentoEstoque
	left join itempedido ip on ip.id = ideipv.idItemPedidoVenda
	left join documentoestoque de on de.id = ide.idDocumentoSaida
	where de.idTipoMovimentacao in (48,82)) nfef on nfef.idItemPedidoVenda = ip.id
	left join
	(select
	count(distinct pd.nome) as qtdpd,
	count(distinct de.observacoes) as qtdrotas,
	ifnull(mc.id, m.id) as id
	from itempedido ip
	left join produto p on p.id = ip.idProduto
	left join pedido pd on pd.id = ip.idPedido
	left join pessoa pe on pe.id = pd.idCliente
	left join grupoproduto gp on gp.id = p.idGrupoProduto
	left join tipoproduto tp on tp.id = p.idTipoProduto
	left join endereco ed on ed.id = pd.idEnderecoLocalEntrega
	left join municipio m on ed.idMunicipio = m.id
	left join municipio mc on mc.id = pe.idMunicipio
	left join condicaopagamento cp on cp.id = pd.idCondicaoPagamento
	left join itempedidoromaneio prm on prm.idItemPedido = ip.id
	left join documentoestoque de on de.id = prm.idRomaneio
	left join formapagamento fp on fp.id = pd.idFormaPagamento 
	where ip.status in (2,3) 
	group by ifnull(mc.id, m.id)) rot on rot.id = ifnull(mc.id, m.id)
	left join 
	(select 
	p.id,
	p.nome,
	sum(pg.valor) as valorAdiantamento
	from parcelapagamento pg
	left join pedido p on p.id = pg.idEntidadeOrigem
	where geraAdiantamento = 1
	and p.dataEmissao >= '2024-01-01'
	and discriminador = 'Pedido'
	group BY 
	p.id,
	p.nome) adt on adt.id = pd.id
	left join
	(select
	count(distinct pd.nome) as qtdsemrotas,
	ifnull(mc.id, m.id) as id
	from itempedido ip
	left join produto p on p.id = ip.idProduto
	left join pedido pd on pd.id = ip.idPedido
	left join pessoa pe on pe.id = pd.idCliente
	left join grupoproduto gp on gp.id = p.idGrupoProduto
	left join tipoproduto tp on tp.id = p.idTipoProduto
	left join endereco ed on ed.id = pd.idEnderecoLocalEntrega
	left join municipio m on ed.idMunicipio = m.id
	left join municipio mc on mc.id = pe.idMunicipio
	left join condicaopagamento cp on cp.id = pd.idCondicaoPagamento
	left join itempedidoromaneio prm on prm.idItemPedido = ip.id
	left join documentoestoque de on de.id = prm.idRomaneio
	left join formapagamento fp on fp.id = pd.idFormaPagamento 
	where ip.status in (2,3) and de.observacoes is null
	group by ifnull(mc.id, m.id)) srot on srot.id = ifnull(mc.id, m.id)
	left join 
	(select
	pe.id,
	ip.idProduto,
	sum(qtdeVinculada) as totalRomaneio
	from itempedidoromaneio ipr
	left join itempedido ip on ip.id = ipr.idItemPedido
	left join pedido pe on pe.id = ip.idPedido
	left join produto p on p.id = ip.idProduto
	group BY
	pe.id,
	ip.idProduto) tr on tr.id = pd.id and ip.idProduto = p.id
	left join
	(select 
	apv.idPedido,
	alo.opcao
	from atributopedidovalor apv 
	left join
	atributolistaopcao alo on alo.id = apv.idListaOpcao 
	where apv.idAtributo = 591
	) me on me.idPedido = pd.id
	left join 
	(select 
	apev.idPedido,
	alo.opcao
	from atributopedidovalor apev
	left join atributolistaopcao alo on alo.id = apev.idListaOpcao 
	where apev.idAtributo = 592) emp on emp.idPedido = pd.id
	left join pessoa vr on vr.id = coalesce(pd.idVendedor,pd.idRepresentante) 
	left join 
(select ide.id,
ide.idItemOrigemDevolucao,
ip.id as idPedidoVenda,
ip.idProduto,
coalesce(ide.qtde,0) as qtdDevolvida
from itemdocumentoestoque ide
left join itemdocumentoestoque_itempedidovenda ideipv on ideipv.idItemDocumentoEstoque = ide.idItemOrigemDevolucao 
left join itempedido ip on ip.id = ideipv.idItemPedidoVenda 
left join documentoestoque de on de.id = ide.idDocumentoEntrada
LEFT JOIN pedido p ON p.id = ip.idPedido
 Left Join nfe nfe On nfe.idDocumentoEstoque = de.id
    Left Join
  tipomovimentacao tm On ide.idTipoMovimentacao = tm.id
where
(tm.id In (52, 55))
and ide.idItemOrigemDevolucao is not null
and ip.status in (2,3)
) devol on devol.idPedidoVenda = ip.id
	WHERE ip.status IN (2,3)
  AND pd.idEmpresa IN (1,2)
  AND (
        pd.idEmpresa <> 2
        OR (
             pd.idEmpresa = 2
             AND (
               CASE 
                 WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN '2-Retirada na So Moveis'
                 WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN '1-Retirada na So Aço'
                 WHEN (de.observacoes IS NULL AND IFNULL(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN '5-Requisicao'
                 WHEN (de.observacoes IS NULL AND (IFNULL(m.nome, mc.nome) IN ('Timon','Teresina','Nazaria','Demerval Lobão','Curralinhos')) AND aloreq.opcao = 'Não') THEN '3-Entrega em Grande Teresina'
                 WHEN (de.observacoes IS NULL) THEN '4-Inserir em Romaneio'
                 ELSE de.observacoes
               END
             ) NOT IN (
               '2-Retirada na So Moveis',
               '1-Retirada na So Aço',
               '3-Entrega em Grande Teresina',
               '5-Requisicao'
             )
        )
      )
	group by
	pd.idEmpresa,
	de.observacoes,
	de.codigo,
	pe.id,
	pd.nome,
	pd.dataEmissao,
	upper(pe.nome),
	p.nome,
	p.descricao,
	tp.nome,
	ip.dataEntrega,
	gp.nome,
	ip.status,
	aloreq.opcao,
	aloret.opcao,
	aloent.opcao,
	pd.condicaopagamento,
	fp.nome,
	cp.nome
