import type { Request, Response } from 'express';
import { getNomusPool, isNomusEnabled } from '../config/nomusDb.js';
import { prisma } from '../config/prisma.js';

const SQL_BASE = `
SELECT
  produto.id,
  produto.nome,
  produto.descricao,
  produto.idNcm,
  n.codigo AS codigoNcm
FROM
  produto
  LEFT JOIN tipoproduto ON tipoproduto.id = produto.idTipoProduto
  LEFT JOIN ncm n ON n.id = produto.idNcm
WHERE
  (produto.ativo = 1)
  AND (
    tipoproduto.nome = 'Produto acabado'
    OR tipoproduto.nome = 'Produto intermediário'
    OR tipoproduto.nome = 'Produto em processo'
  )
`.trim();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// SQL lista de materiais para precificação (parâmetro: id do produto). Use ? no lugar de :idproduto.
const SQL_PRECIFICACAO_LISTA_MATERIAIS = `
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
  round((ft.qtd1 * ft.qtd2 * ft.qtd3 * ft.qtd4 * ft.qtd5), 5) As qtd
From
(Select pq.idProduto As idprodutopai,
    pp.nome As codigopai,
    pp.descricao As descricaopai,
    pf1.id As idcomponente1,
    pf1.nome As codigocomponente1,
    pf1.descricao As descricaocomponente1,
    tp1.nome As tipoproduto1,
    Coalesce(Cast(Replace(pq.qtdeNecessaria, ',', '.') As Decimal(10,5)),
    1) As qtd1,
    pfl1.id As perfiladeira1,
    tm1.opcao As tipomaterial1,
    pf2.id As idcomponente2,
    pf2.nome As codigocomponente2,
    pf2.descricao As descricaocomponente2,
    tp2.nome As tipoproduto2,
    Coalesce(Cast(Replace(pq2.qtdeNecessaria, ',', '.') As Decimal(10,5)),
    1) As qtd2,
    pf2.id As perfiladeira2,
    tm2.opcao As tipomaterial2,
    pf3.id As idcomponente3,
    pf3.nome As codigocomponente3,
    pf3.descricao As descricaocomponente3,
    tp3.nome As tipoproduto3,
    Coalesce(Cast(Replace(pq3.qtdeNecessaria, ',', '.') As Decimal(10,5)),
    1) As qtd3,
    pf3.id As perfiladeira3,
    tm3.opcao As tipomaterial3,
    pf4.id As idcomponente4,
    pf4.nome As codigocomponente4,
    pf4.descricao As descricaocomponente4,
    tp4.nome As tipoproduto4,
    Coalesce(Cast(Replace(pq4.qtdeNecessaria, ',', '.') As Decimal(10,5)),
    1) As qtd4,
    pf4.id As perfiladeira4,
    tm4.opcao As tipomaterial4,
    pf5.id As idcomponente5,
    pf5.nome As codigocomponente5,
    pf5.descricao As descricaocomponente5,
    tp5.nome As tipoproduto5,
    Coalesce(Cast(Replace(pq5.qtdeNecessaria, ',', '.') As Decimal(10,5)),
    1) As qtd5,
    pf5.id As perfiladeira5,
    tm5.opcao As tipomaterial5
  From produtoqtde pq
    Left Join produto pp On pq.idProduto = pp.id
    Left Join listamateriais lm On lm.id = pq.idListaMateriais
    Left Join produto pf1 On pq.idProdutoComponente = pf1.id
    Left Join tipoproduto tp1 On tp1.id = pf1.idTipoProduto
    Left Join (Select Distinct p.id
    From roteiroproduto r
      Left Join produto p On p.id = r.idProduto
      Left Join operacaoroteiroproduto o On o.idRoteiroProduto = r.id
      Left Join recursohabilitadoroteiroproduto rhrp
        On rhrp.idOperacaoRoteiroProduto = o.id
      Left Join recurso re On re.id = rhrp.idRecurso
      Left Join tipoproduto tp On tp.id = p.idTipoProduto
    Where (r.ativo = 1) And (tp.nome = 'Produto em processo' Or
        tp.nome = 'Produto intermediário') And (p.ativo = 1) And
      (re.id In (1, 4, 46, 124, 123))) pfl1 On pfl1.id = pf1.id
    Left Join (Select apv.idProduto,
      alo.opcao
    From atributoprodutovalor apv
      Left Join atributolistaopcao alo On alo.id = apv.idListaOpcao
    Where apv.idAtributo = 540) tm1 On tm1.idProduto = pf1.id
    Left Join produtoqtde pq2 On pq.idProdutoComponente = pq2.idProduto
    Left Join listamateriais lm2 On lm2.id = pq2.idListaMateriais
    Left Join produto pf2 On pq2.idProdutoComponente = pf2.id
    Left Join tipoproduto tp2 On tp2.id = pf2.idTipoProduto
    Left Join (Select Distinct p.id
    From roteiroproduto r
      Left Join produto p On p.id = r.idProduto
      Left Join operacaoroteiroproduto o On o.idRoteiroProduto = r.id
      Left Join recursohabilitadoroteiroproduto rhrp
        On rhrp.idOperacaoRoteiroProduto = o.id
      Left Join recurso re On re.id = rhrp.idRecurso
      Left Join tipoproduto tp On tp.id = p.idTipoProduto
    Where (r.ativo = 1) And (tp.nome = 'Produto em processo' Or
        tp.nome = 'Produto intermediário') And (p.ativo = 1) And
      (re.id In (1, 4, 46, 124, 123))) pfl2 On pfl2.id = pf2.id
    Left Join (Select apv.idProduto,
      alo.opcao
    From atributoprodutovalor apv
      Left Join atributolistaopcao alo On alo.id = apv.idListaOpcao
    Where apv.idAtributo = 540) tm2 On tm2.idProduto = pf2.id
    Left Join produtoqtde pq3 On pq2.idProdutoComponente = pq3.idProduto
    Left Join listamateriais lm3 On lm3.id = pq3.idListaMateriais
    Left Join produto pf3 On pq3.idProdutoComponente = pf3.id
    Left Join tipoproduto tp3 On tp3.id = pf3.idTipoProduto
    Left Join (Select Distinct p.id
    From roteiroproduto r
      Left Join produto p On p.id = r.idProduto
      Left Join operacaoroteiroproduto o On o.idRoteiroProduto = r.id
      Left Join recursohabilitadoroteiroproduto rhrp
        On rhrp.idOperacaoRoteiroProduto = o.id
      Left Join recurso re On re.id = rhrp.idRecurso
      Left Join tipoproduto tp On tp.id = p.idTipoProduto
    Where (r.ativo = 1) And (tp.nome = 'Produto em processo' Or
        tp.nome = 'Produto intermediário') And (p.ativo = 1) And
      (re.id In (1, 4, 46, 124, 123))) pfl3 On pfl3.id = pf3.id
    Left Join (Select apv.idProduto,
      alo.opcao
    From atributoprodutovalor apv
      Left Join atributolistaopcao alo On alo.id = apv.idListaOpcao
    Where apv.idAtributo = 540) tm3 On tm3.idProduto = pf3.id
    Left Join produtoqtde pq4 On pq3.idProdutoComponente = pq4.idProduto
    Left Join listamateriais lm4 On lm4.id = pq4.idListaMateriais
    Left Join produto pf4 On pq4.idProdutoComponente = pf4.id
    Left Join tipoproduto tp4 On tp4.id = pf4.idTipoProduto
    Left Join (Select Distinct p.id
    From roteiroproduto r
      Left Join produto p On p.id = r.idProduto
      Left Join operacaoroteiroproduto o On o.idRoteiroProduto = r.id
      Left Join recursohabilitadoroteiroproduto rhrp
        On rhrp.idOperacaoRoteiroProduto = o.id
      Left Join recurso re On re.id = rhrp.idRecurso
      Left Join tipoproduto tp On tp.id = p.idTipoProduto
    Where (r.ativo = 1) And (tp.nome = 'Produto em processo' Or
        tp.nome = 'Produto intermediário') And (p.ativo = 1) And
      (re.id In (1, 4, 46, 124, 123))) pfl4 On pfl4.id = pf4.id
    Left Join (Select apv.idProduto,
      alo.opcao
    From atributoprodutovalor apv
      Left Join atributolistaopcao alo On alo.id = apv.idListaOpcao
    Where apv.idAtributo = 540) tm4 On tm4.idProduto = pf4.id
    Left Join produtoqtde pq5 On pq4.idProdutoComponente = pq5.idProduto
    Left Join listamateriais lm5 On lm5.id = pq5.idListaMateriais
    Left Join produto pf5 On pq5.idProdutoComponente = pf5.id
    Left Join tipoproduto tp5 On tp5.id = pf5.idTipoProduto
    Left Join (Select Distinct p.id
    From roteiroproduto r
      Left Join produto p On p.id = r.idProduto
      Left Join operacaoroteiroproduto o On o.idRoteiroProduto = r.id
      Left Join recursohabilitadoroteiroproduto rhrp
        On rhrp.idOperacaoRoteiroProduto = o.id
      Left Join recurso re On re.id = rhrp.idRecurso
      Left Join tipoproduto tp On tp.id = p.idTipoProduto
    Where (r.ativo = 1) And (tp.nome = 'Produto em processo' Or
        tp.nome = 'Produto intermediário') And (p.ativo = 1) And
      (re.id In (1, 4, 46, 124, 123))) pfl5 On pfl5.id = pf5.id
    Left Join (Select apv.idProduto,
      alo.opcao
    From atributoprodutovalor apv
      Left Join atributolistaopcao alo On alo.id = apv.idListaOpcao
    Where apv.idAtributo = 540) tm5 On tm5.idProduto = pf5.id
  Where (pq.idProduto = ?) And (pp.idTipoProduto In (8, 15)) And
    (Coalesce(lm.ativo, 1) = 1) And (Coalesce(lm.padrao, 1) = 1) And
    (Coalesce(lm.discriminador, 'Original') = 'Original') And
    (Coalesce(lm2.ativo, 1) = 1) And (Coalesce(lm2.padrao, 1) = 1) And
    (Coalesce(lm2.discriminador, 'Original') = 'Original') And
    (Coalesce(lm3.ativo, 1) = 1) And (Coalesce(lm3.padrao, 1) = 1) And
    (Coalesce(lm3.discriminador, 'Original') = 'Original') And
    (Coalesce(lm4.ativo, 1) = 1) And (Coalesce(lm4.padrao, 1) = 1) And
    (Coalesce(lm4.discriminador, 'Original') = 'Original') And
    (Coalesce(lm5.ativo, 1) = 1) And (Coalesce(lm5.padrao, 1) = 1) And
    (Coalesce(lm5.discriminador, 'Original') = 'Original') And (pp.ativo = 1)
    And ((Case When (tp1.nome Is Not Null Or tp1.nome Is Null) Then 1
      When ((pfl1.id Is Null And (tp1.nome = 'Produto em processo' Or
      tp1.nome = 'Produto intermediário')) And ((pf2.id Is Not Null) And
      (tp2.nome = 'Produto em processo' Or tp2.nome = 'Produto intermediário'))
      Or ((pf3.id Is Not Null) And (tp3.nome = 'Produto em processo' Or
      tp3.nome = 'Produto intermediário')) Or
      ((pf4.id Is Not Null) And (tp2.nome = 'Produto em processo' Or
      tp4.nome = 'Produto intermediário')) Or
      ((pf5.id Is Not Null) And (tp2.nome = 'Produto em processo' Or
      tp5.nome = 'Produto intermediário'))) Then 1 Else 0 End) = 1)) ft
`.trim();

// Segunda consulta: valor unitário por idProduto (idcomponente da primeira). Parâmetro: IN (:idproduto) em dois lugares.
const SQL_VALOR_UNITARIO_BASE = `
Select Distinct cunit.idProduto,
  round(Case When cunit.bobina <> '' Then bobin.valorUnitarioTotal
    Else cunit.valorUnitarioTotal End, 2) As valorUnitario,
  Case When cunit.bobina <> '' Then bobin.dataEntrada Else cunit.dataEntrada
  End As dataEntrada,
  Coalesce(tm.opcao, 'Material Secundário') As opcao
From (Select ud.idProduto,
    Replace((Case When p.descricao Like 'BOBINA%X%MM%' Then (Case
        When Length(p.descricao) - Length(Replace(Upper(p.descricao), 'X',
        '')) = 1 Then Concat(Trim(SubString_Index(Upper(p.descricao), 'X',
        1)), SubString(Upper(p.descricao), Locate('MM', Upper(p.descricao)) +
        2))
        Else Concat(Left(Upper(p.descricao),
        Length(SubString_Index(p.descricao, 'X', 2))),
        SubString(Upper(p.descricao), Locate('MM', Upper(p.descricao)) + 2))
      End) Else '' End), 'BOBINA INTEIRA', 'BOBINA SLITADA') As bobina,
    Case
      When m.idTipoMovimentacao = 142 Then (m.valorUnitario +
      ((m.valorUnitario * Coalesce(round((m.valorTotalFrete / tn.totalnota),
      2), 0)))) Else ((m.valorUnitario - (m.valorUnitario * Coalesce((Case
        When m.idTipoMovimentacao In (71, 142) Then bob.aliquotaICMS
        Else t.aliquotaICMS End / 100), 0) + m.valorUnitario * Coalesce((Case
        When m.idTipoMovimentacao In (71, 142) Then IfNull(bob.aliquotaCOFINS,
        7.6) Else IfNull(t.aliquotaCOFINS, 7.6)
      End / 100), 0) + m.valorUnitario * Coalesce((Case
        When m.idTipoMovimentacao In (71, 142) Then IfNull(bob.aliquotaPIS,
        1.65) Else IfNull(t.aliquotaPIS, 1.65)
      End / 100), 0))) + ((m.valorUnitario * Coalesce(round((m.valorTotalFrete
      / tn.totalnota), 2), 0)))) End As valorUnitarioTotal,
    ud.dataEntrada
  From (Select ide.idProduto,
      Max(d.dataEntrada) As dataEntrada
    From itemdocumentoestoque ide
      Left Join documentoestoque d On d.id = ide.idDocumentoEntrada
      Left Join produto p On p.id = ide.idProduto
    Where (ide.idTipoMovimentacao In (11, 71, 116, 115, 114, 113, 112, 111,
      142)) And (ide.idSetorEntrada In (2, 19, 20, 32))
    Group By ide.idProduto) ud
    Left Join (Select ide.id,
      ide.idDocumentoEntrada,
      ide.idProduto,
      ide.idTipoMovimentacao,
      d.dataEntrada,
      d.valorTotalFrete,
      p.nome,
      ide.qtde,
      ide.valorUnitario
    From itemdocumentoestoque ide
      Left Join documentoestoque d On d.id = ide.idDocumentoEntrada
      Left Join produto p On p.id = ide.idProduto
    Where (ide.idTipoMovimentacao In (11, 71, 116, 115, 114, 113, 112, 111,
      142)) And (ide.idSetorEntrada In (2, 19, 20, 32))) m
      On (m.idProduto = ud.idProduto) And (ud.dataEntrada = m.dataEntrada)
    Left Join tributacao t On t.idItemDocumentoEstoque = m.id
    Left Join (Select ide.idDocumentoEntrada,
      Count(Distinct ide.idProduto) As qtditens
    From itemdocumentoestoque ide
      Left Join documentoestoque d On d.id = ide.idDocumentoEntrada
      Left Join produto p On p.id = ide.idProduto
    Where (ide.idSetorEntrada In (2, 19, 20, 32)) And
      (ide.idTipoMovimentacao In (11, 71, 116, 115, 114, 113, 112, 111, 142))
    Group By ide.idDocumentoEntrada) q On q.idDocumentoEntrada =
      m.idDocumentoEntrada
    Left Join (Select ide.idDocumentoEntrada,
      Sum((ide.qtde * ide.valorUnitario)) As totalnota
    From itemdocumentoestoque ide
      Left Join documentoestoque d On d.id = ide.idDocumentoEntrada
      Left Join produto p On p.id = ide.idProduto
    Where (ide.idTipoMovimentacao In (11, 71, 116, 115, 114, 113, 112, 111,
      142)) And (ide.idSetorEntrada In (2, 19, 20, 32))
    Group By ide.idDocumentoEntrada) tn On tn.idDocumentoEntrada =
      m.idDocumentoEntrada
    Left Join (Select documentoestoque.id,
      Case When documentoestoque.modalidadeTransporte = 0 Then 'CIF'
        When documentoestoque.modalidadeTransporte = 1 Then 'FOB'
        When documentoestoque.modalidadeTransporte = 2 Then 'Terceiros'
        When documentoestoque.modalidadeTransporte = 3 Then 'Remetente'
        When documentoestoque.modalidadeTransporte = 4 Then 'Destinatário'
        Else 'Sem Transporte' End As modalidadeTransporte,
      documentoestoque.valorTotalFrete
    From documentoestoque) mf On mf.id = m.idDocumentoEntrada
    Left Join produto p On m.idProduto = p.id
    Left Join (Select df.id,
      df.chaveAcessoNFe As chaveentradaslitada,
      df.idDocumentoEntrada As documentoentradaslitada,
      nf.idDocumentoEstoque As documentosaidainteira,
      de.idTipoMovimentacao,
      ide.idProduto,
      dfe.chaveAcessoNFe,
      nfe.idDocumentoEstoque As documentoentradainteira,
      t.aliquotaICMS,
      IfNull(t.aliquotaCOFINS, 7.6) As aliquotaCOFINS,
      IfNull(t.aliquotaPIS, 1.65) As aliquotaPIS,
      t.aliquotaIPI
    From documentofiscal df
      Left Join nfe nf On nf.chave = df.chaveAcessoNFe
      Left Join documentoestoque de On de.id = nf.idDocumentoEstoque
      Left Join documentofiscal dfe On nf.idDocumentoEstoque =
        dfe.idDocumentoSaida
      Left Join nfe nfe On nfe.chave = dfe.chaveAcessoNFe
      Left Join itemdocumentoestoque ide On ide.idDocumentoEntrada =
        nfe.idDocumentoEstoque
      Left Join tributacao t On t.idItemDocumentoEstoque = ide.id
    Where de.idTipoMovimentacao In (70, 142)) bob
      On bob.documentoentradaslitada = m.idDocumentoEntrada
    where ud.idProduto in (__IN_IDS__)) cunit
  Left Join (Select Distinct ud.bobina,
    Avg(Case
      When m.idTipoMovimentacao = 142 Then (m.valorUnitario +
      ((m.valorUnitario * Coalesce(round((m.valorTotalFrete / tn.totalnota),
      2), 0)))) Else ((m.valorUnitario - (m.valorUnitario * (Case
        When m.idTipoMovimentacao In (71, 142) Then bob.aliquotaICMS
        Else t.aliquotaICMS End / 100) + m.valorUnitario * (Case
        When m.idTipoMovimentacao In (71, 142) Then IfNull(bob.aliquotaCOFINS,
        7.6) Else IfNull(t.aliquotaCOFINS, 7.6)
      End / 100) + m.valorUnitario * (Case
        When m.idTipoMovimentacao In (71, 142) Then IfNull(bob.aliquotaPIS,
        1.65) Else IfNull(t.aliquotaPIS, 1.65)
      End / 100))) + ((m.valorUnitario * round((m.valorTotalFrete /
      tn.totalnota), 2)))) End) As valorUnitarioTotal,
    ud.dataEntrada
  From (Select p.descricao,
      (Case
        When Length(p.descricao) - Length(Replace(Upper(p.descricao), 'X',
        '')) = 1 Then Concat(Trim(SubString_Index(Upper(p.descricao), 'X',
        1)), SubString(Upper(p.descricao), Locate('MM', Upper(p.descricao)) +
        2))
        Else Concat(Left(Upper(p.descricao),
        Length(SubString_Index(p.descricao, 'X', 2))),
        SubString(Upper(p.descricao), Locate('MM', Upper(p.descricao)) + 2))
      End) As bobina,
      Max(d.dataEntrada) As dataEntrada
    From itemdocumentoestoque ide
      Left Join documentoestoque d On d.id = ide.idDocumentoEntrada
      Left Join produto p On p.id = ide.idProduto
    Where (ide.idTipoMovimentacao In (11, 71, 116, 115, 114, 113, 112, 111,
      142)) And (ide.idSetorEntrada In (2, 19, 20, 32)) And
      (Replace(Upper(p.descricao), 'INOX', 'INO') Like 'BOBINA%X%MM%') And
      (Replace(Upper(p.descricao), 'INOX', 'INO') Not Like '%ETIQUETA%')
    Group By (Case
        When Length(p.descricao) - Length(Replace(Upper(p.descricao), 'X',
        '')) = 1 Then Concat(Trim(SubString_Index(Upper(p.descricao), 'X',
        1)), SubString(Upper(p.descricao), Locate('MM', Upper(p.descricao)) +
        2))
        Else Concat(Left(Upper(p.descricao),
        Length(SubString_Index(p.descricao, 'X', 2))),
        SubString(Upper(p.descricao), Locate('MM', Upper(p.descricao)) + 2))
      End)) ud
    Left Join (Select ide.id,
      ide.idDocumentoEntrada,
      ide.idProduto,
      ide.idTipoMovimentacao,
      d.dataEntrada,
      d.valorTotalFrete,
      p.nome,
      Replace(Case When Upper(p.descricao) Like 'BOBINA%X%MM%' Then (Case
          When Length(p.descricao) - Length(Replace(Upper(p.descricao), 'X',
          '')) = 1 Then Concat(Trim(SubString_Index(Upper(p.descricao), 'X',
          1)), SubString(Upper(p.descricao), Locate('MM', Upper(p.descricao))
          + 2))
          Else Concat(Left(Upper(p.descricao),
          Length(SubString_Index(p.descricao, 'X', 2))),
          SubString(Upper(p.descricao), Locate('MM', Upper(p.descricao)) + 2))
        End) Else Upper(p.descricao)
      End, 'BOBINA INTEIRA', 'BOBINA SLITADA') As bobina,
      ide.qtde,
      ide.valorUnitario
    From itemdocumentoestoque ide
      Left Join documentoestoque d On d.id = ide.idDocumentoEntrada
      Left Join produto p On p.id = ide.idProduto
    Where (ide.idTipoMovimentacao In (11, 71, 116, 115, 114, 113, 112, 111,
      142)) And (ide.idSetorEntrada In (2, 19, 20, 32))) m
      On (m.bobina = ud.bobina) And (ud.dataEntrada = m.dataEntrada)
    Left Join tributacao t On t.idItemDocumentoEstoque = m.id
    Left Join (Select ide.idDocumentoEntrada,
      Count(Distinct ide.idProduto) As qtditens
    From itemdocumentoestoque ide
      Left Join documentoestoque d On d.id = ide.idDocumentoEntrada
      Left Join produto p On p.id = ide.idProduto
    Where (ide.idSetorEntrada In (2, 19, 20, 32)) And
      (ide.idTipoMovimentacao In (11, 71, 116, 115, 114, 113, 112, 111, 142))
    Group By ide.idDocumentoEntrada) q On q.idDocumentoEntrada =
      m.idDocumentoEntrada
    Left Join (Select ide.idDocumentoEntrada,
      Sum((ide.qtde * ide.valorUnitario)) As totalnota
    From itemdocumentoestoque ide
      Left Join documentoestoque d On d.id = ide.idDocumentoEntrada
      Left Join produto p On p.id = ide.idProduto
    Where (ide.idTipoMovimentacao In (11, 71, 116, 115, 114, 113, 112, 111,
      142)) And (ide.idSetorEntrada In (2, 19, 20, 32))
    Group By ide.idDocumentoEntrada) tn On tn.idDocumentoEntrada =
      m.idDocumentoEntrada
    Left Join (Select documentoestoque.id,
      Case When documentoestoque.modalidadeTransporte = 0 Then 'CIF'
        When documentoestoque.modalidadeTransporte = 1 Then 'FOB'
        When documentoestoque.modalidadeTransporte = 2 Then 'Terceiros'
        When documentoestoque.modalidadeTransporte = 3 Then 'Remetente'
        When documentoestoque.modalidadeTransporte = 4 Then 'Destinatário'
        Else 'Sem Transporte' End As modalidadeTransporte,
      documentoestoque.valorTotalFrete
    From documentoestoque) mf On mf.id = m.idDocumentoEntrada
    Left Join produto p On m.idProduto = p.id
    Left Join (Select df.id,
      df.chaveAcessoNFe As chaveentradaslitada,
      df.idDocumentoEntrada As documentoentradaslitada,
      nf.idDocumentoEstoque As documentosaidainteira,
      de.idTipoMovimentacao,
      ide.idProduto,
      dfe.chaveAcessoNFe,
      nfe.idDocumentoEstoque As documentoentradainteira,
      t.aliquotaICMS,
      IfNull(t.aliquotaCOFINS, 7.6) As aliquotaCOFINS,
      IfNull(t.aliquotaPIS, 1.65) As aliquotaPIS,
      t.aliquotaIPI
    From documentofiscal df
      Left Join nfe nf On nf.chave = df.chaveAcessoNFe
      Left Join documentoestoque de On de.id = nf.idDocumentoEstoque
      Left Join documentofiscal dfe On nf.idDocumentoEstoque =
        dfe.idDocumentoSaida
      Left Join nfe nfe On nfe.chave = dfe.chaveAcessoNFe
      Left Join itemdocumentoestoque ide On ide.idDocumentoEntrada =
        nfe.idDocumentoEstoque
      Left Join tributacao t On t.idItemDocumentoEstoque = ide.id
    Where de.idTipoMovimentacao In (70, 142)) bob
      On bob.documentoentradaslitada = m.idDocumentoEntrada
  Where Case When Upper(p.descricao) Like 'BOBINA%X%MM%' Then 1 Else 0 End = 1
  Group By ud.bobina,
    ud.dataEntrada) bobin On bobin.bobina = cunit.bobina
  Left Join (Select apv.idProduto,
    alo.opcao
  From atributoprodutovalor apv
    Left Join atributolistaopcao alo On alo.id = apv.idListaOpcao
  Where apv.idAtributo = 540 and apv.idproduto in (__IN_IDS__)) tm On tm.idProduto = cunit.idProduto
`.trim();

export interface ProdutoPrecificacaoRow {
  id: number;
  nome: string;
  descricao: string | null;
  idNcm: number | null;
  codigoNcm: string | null;
}

/**
 * GET /api/engenharia/produtos-precificacao
 * Lista produtos do Nomus (ativo=1, tipo acabado/intermediário/em processo).
 * Query: q (busca em nome/descrição), limit (default 50, max 100). Reduz carga e tempo de resposta.
 */
export async function getProdutosPrecificacao(req: Request, res: Response): Promise<void> {
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
  const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isNaN(limitRaw) ? DEFAULT_LIMIT : limitRaw));

  try {
    let sql: string;
    let params: (string | number)[];
    if (q) {
      const term = `%${q}%`;
      sql = `${SQL_BASE}
  AND (produto.nome LIKE ? OR produto.descricao LIKE ?)
ORDER BY produto.nome ASC
LIMIT ?`;
      params = [term, term, limit];
    } else {
      sql = `${SQL_BASE}
ORDER BY produto.nome ASC
LIMIT ?`;
      params = [limit];
    }
    const [rows] = await pool.query(sql, params);
    const list = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
    const data = list.map((r: Record<string, unknown>) => {
      const idNcmRaw = r.idNcm ?? r.idncm ?? r.IdNcm;
      const idNcm =
        idNcmRaw != null && idNcmRaw !== '' && !Number.isNaN(Number(idNcmRaw)) ? Number(idNcmRaw) : null;
      const codigoNcmRaw = r.codigoNcm ?? r.codigonc ?? r.CodigoNcm;
      const codigoNcm =
        codigoNcmRaw != null && String(codigoNcmRaw).trim() !== '' ? String(codigoNcmRaw).trim() : null;
      return {
        id: Number(r.id ?? r.ID ?? 0),
        nome: String(r.nome ?? r.Nome ?? ''),
        descricao: (r.descricao ?? r.Descricao) != null ? String(r.descricao ?? r.Descricao) : null,
        idNcm,
        codigoNcm,
      };
    });
    res.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[engenhariaController] getProdutosPrecificacao:', msg);
    res.status(503).json({ data: [], error: msg });
  }
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function toStr(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}
function toFloat(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

/** Formata percentual para o padrão dos campos da ficha (pt-BR). */
function formatPercentBr(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function normalizeNcmDigitsForPsa(ncm: string | null | undefined): string {
  if (ncm == null) return '';
  return String(ncm).replace(/\D/g, '');
}

/**
 * ICMS sugerido pela tabela PSA (SQLite), importada do CSV `psa_ncm_icms_bz0`.
 * Usa o campo `icmsefetivo` quando o NCM (somente dígitos) existe na tabela.
 */
async function buscarIcmsPsaPorNcmBz0(ncmCodigo: string | null | undefined): Promise<number | null> {
  const norm = normalizeNcmDigitsForPsa(ncmCodigo);
  if (!norm) return null;
  try {
    const row = await prisma.psaNcmIcmsBz0.findUnique({
      where: { ncmNormalizado: norm },
    });
    if (!row) return null;
    const v = row.icmsefetivo;
    if (!Number.isFinite(v) || v < 0) return null;
    return v;
  } catch (e) {
    console.error('[engenhariaController] buscarIcmsPsaPorNcmBz0:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * ICMS "real" (com redução de base) por código NCM nas regras "dentro" (Nomus).
 * Parâmetro: código NCM (comparação exata ou só dígitos, sem pontos/espaços).
 */
const SQL_ICMS_REAL_POR_NCM = `
SELECT
  CASE
    WHEN IfNull(tb.pRedBC, 0) IS NULL THEN tb.aliquotaICMS
    ELSE ((tb.aliquotaICMS / 100) - ((tb.aliquotaICMS / 100) * (IfNull(tb.pRedBC, 0) / 100))) * 100
  END AS aliquotaICMSReal
FROM
  regratributacao r
  LEFT JOIN tiporegratributacao t ON t.id = r.idTipoRegraTributacao
  LEFT JOIN tributacao tb ON r.idTributacao = tb.id
  LEFT JOIN inputregratributacao irt ON irt.idRegraTributacao = r.id
  LEFT JOIN ncm n ON n.id = irt.idEntidade
WHERE
  (r.nome NOT LIKE '%devol%')
  AND (r.nome NOT LIKE '%compr%')
  AND (r.nome LIKE '%dentro%')
  AND (r.ativo = 1)
  AND (IfNull(tb.pRedBC, 0) <> 0)
  AND (t.id = 1)
  AND (irt.discriminador = 'NCM')
  AND (
    TRIM(n.codigo) = TRIM(?)
    OR REPLACE(REPLACE(TRIM(n.codigo), '.', ''), ' ', '') = REPLACE(REPLACE(TRIM(?), '.', ''), ' ', '')
  )
ORDER BY r.id ASC
LIMIT 1
`.trim();

async function buscarAliquotaIcmsRealPorNcm(
  pool: NonNullable<ReturnType<typeof getNomusPool>>,
  codigoNcm: string | null | undefined
): Promise<number | null> {
  const raw = codigoNcm != null ? String(codigoNcm).trim() : '';
  if (!raw) return null;
  try {
    const [rows] = await pool.query(SQL_ICMS_REAL_POR_NCM, [raw, raw]);
    const list = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
    if (list.length === 0) return null;
    const v =
      list[0].aliquotaICMSReal ??
      list[0].aliquotaicmsreal ??
      list[0].AliquotaICMSReal;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  } catch (e) {
    console.error('[engenhariaController] buscarAliquotaIcmsRealPorNcm:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Alíquota de IPI por código NCM (regras com t.id = 2, discriminador NCM).
 */
const SQL_IPI_POR_NCM = `
SELECT
  tb.aliquotaIPI AS aliquotaIPI
FROM
  regratributacao r
  LEFT JOIN tiporegratributacao t ON t.id = r.idTipoRegraTributacao
  LEFT JOIN tributacao tb ON r.idTributacao = tb.id
  LEFT JOIN inputregratributacao irt ON irt.idRegraTributacao = r.id
  LEFT JOIN ncm n ON n.id = irt.idEntidade
WHERE
  (r.nome NOT LIKE '%devol%')
  AND (r.nome NOT LIKE '%compr%')
  AND (r.ativo = 1)
  AND (t.id = 2)
  AND (irt.discriminador = 'NCM')
  AND (
    TRIM(n.codigo) = TRIM(?)
    OR REPLACE(REPLACE(TRIM(n.codigo), '.', ''), ' ', '') = REPLACE(REPLACE(TRIM(?), '.', ''), ' ', '')
  )
ORDER BY r.id ASC
LIMIT 1
`.trim();

async function buscarAliquotaIpiPorNcm(
  pool: NonNullable<ReturnType<typeof getNomusPool>>,
  codigoNcm: string | null | undefined
): Promise<number | null> {
  const raw = codigoNcm != null ? String(codigoNcm).trim() : '';
  if (!raw) return null;
  try {
    const [rows] = await pool.query(SQL_IPI_POR_NCM, [raw, raw]);
    const list = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
    if (list.length === 0) return null;
    const v =
      list[0].aliquotaIPI ?? list[0].aliquotaipi ?? list[0].AliquotaIPI ?? list[0].aliquotaIpi;
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  } catch (e) {
    console.error('[engenhariaController] buscarAliquotaIpiPorNcm:', e instanceof Error ? e.message : e);
    return null;
  }
}

async function buscarIdFamiliaProdutoPorIds(
  pool: NonNullable<ReturnType<typeof getNomusPool>>,
  idsProduto: number[]
): Promise<Map<number, number | null>> {
  const mapa = new Map<number, number | null>();
  if (idsProduto.length === 0) return mapa;
  const uniq = [...new Set(idsProduto)];
  const ph = uniq.map(() => '?').join(',');
  const sql = `SELECT id, idFamiliaProduto FROM produto WHERE id IN (${ph})`.trim();
  try {
    const [rows] = await pool.query(sql, uniq);
    const list = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
    for (const r of list) {
      const id = toNum(r.id ?? r.ID);
      const fp = toNum(r.idFamiliaProduto ?? r.idfamiliaproduto ?? r.IdFamiliaProduto);
      if (id != null) mapa.set(id, fp);
    }
  } catch (e) {
    console.error('[engenhariaController] buscarIdFamiliaProdutoPorIds:', e instanceof Error ? e.message : e);
  }
  return mapa;
}

async function buscarCodigoNcmProduto(
  pool: NonNullable<ReturnType<typeof getNomusPool>>,
  idProduto: number
): Promise<string | null> {
  const sql = `
SELECT n.codigo AS codigoNcm
FROM produto p
LEFT JOIN ncm n ON n.id = p.idNcm
WHERE p.id = ?
LIMIT 1
`.trim();
  const [rows] = await pool.query(sql, [idProduto]);
  const list = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
  if (list.length === 0) return null;
  const c = toStr(list[0].codigoNcm ?? list[0].codigonc ?? list[0].codigo);
  return c?.trim() ? c.trim() : null;
}

async function carregarTipoMaterialPorComponente(
  pool: NonNullable<ReturnType<typeof getNomusPool>>,
  idsComponentes: number[]
): Promise<Map<number, string>> {
  const mapa = new Map<number, string>();
  if (idsComponentes.length === 0) return mapa;

  const inPlaceholder = idsComponentes.map(() => '?').join(',');
  const sqlTipoMaterial = `
SELECT
  p.id AS idProduto,
  COALESCE(alo.opcao, 'Material Secundário') AS opcao
FROM produto p
LEFT JOIN atributoprodutovalor apv
  ON apv.idProduto = p.id
  AND apv.idAtributo = 540
LEFT JOIN atributolistaopcao alo
  ON alo.id = apv.idListaOpcao
WHERE p.id IN (${inPlaceholder})
`.trim();
  const [rowsTipo] = await pool.query(sqlTipoMaterial, idsComponentes);
  const listTipo = (Array.isArray(rowsTipo) ? rowsTipo : []) as Record<string, unknown>[];
  for (const r of listTipo) {
    const idProd = toNum(r.idProduto ?? r.idproduto);
    const opcao = toStr(r.opcao)?.trim() || 'Material Secundário';
    if (idProd == null) continue;
    if (!mapa.has(idProd) || mapa.get(idProd) === '') mapa.set(idProd, opcao);
  }
  return mapa;
}

async function carregarUnidadeMedidaPorComponente(
  pool: NonNullable<ReturnType<typeof getNomusPool>>,
  idsComponentes: number[]
): Promise<Map<number, string>> {
  const mapa = new Map<number, string>();
  if (idsComponentes.length === 0) return mapa;

  const inPlaceholder = idsComponentes.map(() => '?').join(',');
  const sqlUm = `
SELECT
  p.id AS idProduto,
  COALESCE(um.abreviatura, um.nome, '') AS unidadeMedida
FROM produto p
LEFT JOIN unidademedida um ON um.id = p.idUnidadeMedida
WHERE p.id IN (${inPlaceholder})
`.trim();
  const [rows] = await pool.query(sqlUm, idsComponentes);
  const list = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
  for (const r of list) {
    const idProd = toNum(r.idProduto ?? r.idproduto);
    const um = toStr(r.unidadeMedida ?? r.unidademedida)?.trim() || '';
    if (idProd == null) continue;
    if (!mapa.has(idProd) || mapa.get(idProd) === '') mapa.set(idProd, um);
  }
  return mapa;
}

/**
 * POST /api/engenharia/precificacao/iniciar
 * Body: { idProduto: number }
 * Executa o SQL de lista de materiais no Nomus, grava precificação e itens no SQLite, retorna precificação + itens.
 */
export async function iniciarPrecificacao(req: Request, res: Response): Promise<void> {
  if (!isNomusEnabled()) {
    res.status(503).json({ error: 'NOMUS_DB_URL não configurado' });
    return;
  }
  const pool = getNomusPool();
  if (!pool) {
    res.status(503).json({ error: 'Conexão Nomus indisponível' });
    return;
  }
  const idProduto = typeof req.body?.idProduto === 'number' ? req.body.idProduto : Number(req.body?.idProduto);
  if (!idProduto || Number.isNaN(idProduto)) {
    res.status(400).json({ error: 'idProduto obrigatório' });
    return;
  }
  const usuario = (req as Request & { user?: { login?: string } }).user?.login ?? null;

  try {
    const [rows] = await pool.query(SQL_PRECIFICACAO_LISTA_MATERIAIS, [idProduto]);
    const list = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];

    let codigoProduto: string | null = null;
    let descricaoProduto: string | null = null;
    if (list.length > 0) {
      codigoProduto = toStr(list[0].codigopai ?? list[0].codigoPai) ?? null;
      descricaoProduto = toStr(list[0].descricaopai ?? list[0].descricaoPai) ?? null;
    } else {
      const [prodRows] = await pool.query('SELECT nome, descricao FROM produto WHERE id = ?', [idProduto]);
      const prodList = (Array.isArray(prodRows) ? prodRows : []) as Record<string, unknown>[];
      if (prodList.length > 0) {
        codigoProduto = toStr(prodList[0].nome) ?? null;
        descricaoProduto = toStr(prodList[0].descricao) ?? null;
      }
    }

    // IDs da coluna idcomponente (Id comp.) para a segunda consulta
    const idsComponentes: number[] = [];
    for (const r of list) {
      const idc = toNum(r.idcomponente);
      if (idc != null && !idsComponentes.includes(idc)) idsComponentes.push(idc);
    }

    // Segunda consulta: valor unitário por idProduto (idcomponente)
    const mapaValorUnitario = new Map<number, number>();
    const mapaDataEntrada = new Map<number, string>();
    const mapaTipoMaterial = new Map<number, string>();
    if (idsComponentes.length > 0) {
      try {
        const inPlaceholder = idsComponentes.map(() => '?').join(',');
        const sqlValorUnitario = SQL_VALOR_UNITARIO_BASE.replace(/__IN_IDS__/g, inPlaceholder);
        const paramsValor = [...idsComponentes, ...idsComponentes];
        const [rowsValor] = await pool.query(sqlValorUnitario, paramsValor);
        const listValor = (Array.isArray(rowsValor) ? rowsValor : []) as Record<string, unknown>[];
        for (const r of listValor) {
          const idProd = toNum(r.idProduto ?? r.idproduto);
          const valor = toFloat(r.valorUnitario ?? r.valorunitario);
          const opcao = toStr(r.opcao)?.trim() || '';
          const dataEntradaRaw = r.dataEntrada ?? r.dataentrada ?? r.DataEntrada ?? r.data_entrada;
          const dataEntrada =
            dataEntradaRaw instanceof Date
              ? dataEntradaRaw.toISOString().slice(0, 10)
              : dataEntradaRaw != null
                ? String(dataEntradaRaw).trim().slice(0, 10)
                : '';
          if (idProd != null) {
            mapaValorUnitario.set(idProd, valor);
            if (!mapaTipoMaterial.has(idProd) || mapaTipoMaterial.get(idProd) === '') {
              mapaTipoMaterial.set(idProd, opcao);
            }
            if (dataEntrada && (!mapaDataEntrada.has(idProd) || mapaDataEntrada.get(idProd) === '')) {
              mapaDataEntrada.set(idProd, dataEntrada);
            }
          }
        }
      } catch (errValor) {
        console.error('[engenhariaController] SQL valor unitário:', errValor instanceof Error ? errValor.message : errValor);
        // segue sem valor unitário
      }
    }

    const mapaUnidadeMedida =
      idsComponentes.length > 0 ? await carregarUnidadeMedidaPorComponente(pool, idsComponentes) : new Map<number, string>();

    const ncmCodigo = await buscarCodigoNcmProduto(pool, idProduto);

    let valoresCamposIniciais: Record<string, string> | null = null;
    let icmsReal = await buscarAliquotaIcmsRealPorNcm(pool, ncmCodigo);
    if (icmsReal == null) {
      icmsReal = await buscarIcmsPsaPorNcmBz0(ncmCodigo);
    }
    const ipiAliq = await buscarAliquotaIpiPorNcm(pool, ncmCodigo);
    if (icmsReal != null || ipiAliq != null) {
      valoresCamposIniciais = {};
      if (icmsReal != null) valoresCamposIniciais.icms = formatPercentBr(icmsReal);
      if (ipiAliq != null) valoresCamposIniciais.ipi = formatPercentBr(ipiAliq);
    }

    const precificacao = await prisma.precificacao.create({
      data: {
        idProduto,
        codigoProduto,
        descricaoProduto,
        ncmCodigo,
        usuario,
        valoresCampos: valoresCamposIniciais ? JSON.stringify(valoresCamposIniciais) : null,
      },
    });

    // Agrupar por idcomponente: somatório de Qtd; Valor Unitário da 2ª consulta; Valor Total = Valor Unitário × somatório Qtd
    const agrupado = new Map<
      number,
      { sumQtd: number; first: Record<string, unknown> }
    >();
    for (const r of list) {
      const idcomp = toNum(r.idcomponente);
      if (idcomp == null) continue;
      const qtd = toFloat(r.qtd);
      const exist = agrupado.get(idcomp);
      if (exist) {
        exist.sumQtd += qtd;
      } else {
        agrupado.set(idcomp, { sumQtd: qtd, first: r });
      }
    }

    const idsComps = [...agrupado.keys()];
    const mapaFamilia =
      idsComps.length > 0 ? await buscarIdFamiliaProdutoPorIds(pool, idsComps) : new Map<number, number | null>();

    const itensData = Array.from(agrupado.entries()).map(([idcomp, { sumQtd, first }]) => {
      const valorUnitario = mapaValorUnitario.get(idcomp) ?? null;
      const valorTotal = valorUnitario != null ? Math.round(sumQtd * valorUnitario * 100) / 100 : null;
      const dataEntrada = mapaDataEntrada.get(idcomp) ?? null;
      return {
        precificacaoId: precificacao.id,
        idprodutopai: toNum(first.idprodutopai ?? first.idprodutoPai),
        codigopai: toStr(first.codigopai ?? first.codigoPai),
        descricaopai: toStr(first.descricaopai ?? first.descricaoPai),
        idcomponente: idcomp,
        idFamiliaProduto: mapaFamilia.get(idcomp) ?? null,
        codigocomponente: toStr(first.codigocomponente ?? first.codigoComponente),
        componente: toStr(first.componente),
        unidadeMedida: mapaUnidadeMedida.get(idcomp) ?? null,
        qtd: Math.round(sumQtd * 100000) / 100000,
        dataEntrada,
        valorUnitario: valorUnitario ?? null,
        valorTotal: valorTotal ?? null,
      };
    });
    if (itensData.length > 0) {
      await prisma.precificacaoItem.createMany({ data: itensData });
    }
    const itens = await prisma.precificacaoItem.findMany({
      where: { precificacaoId: precificacao.id },
      orderBy: { id: 'asc' },
    });

    res.json({
      precificacao: {
        id: precificacao.id,
        idProduto: precificacao.idProduto,
        codigoProduto: precificacao.codigoProduto,
        descricaoProduto: precificacao.descricaoProduto,
        ncmCodigo: precificacao.ncmCodigo,
        valoresCampos: valoresCamposIniciais,
        ticketCrmId: precificacao.ticketCrmId ?? null,
        data: precificacao.data.toISOString(),
        usuario: precificacao.usuario,
      },
      itens: itens.map((i) => ({
        id: i.id,
        idprodutopai: i.idprodutopai,
        codigopai: i.codigopai,
        descricaopai: i.descricaopai,
        idcomponente: i.idcomponente,
        idFamiliaProduto: i.idFamiliaProduto ?? null,
        codigocomponente: i.codigocomponente,
        componente: i.componente,
        unidadeMedida: i.unidadeMedida ?? null,
        qtd: i.qtd,
        dataEntrada: i.dataEntrada ?? null,
        tipoMaterial: (typeof i.idcomponente === 'number' ? mapaTipoMaterial.get(i.idcomponente) : null) ?? null,
        valorUnitario: i.valorUnitario ?? null,
        valorTotal: i.valorTotal ?? null,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[engenhariaController] iniciarPrecificacao:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * GET /api/engenharia/precificacao
 * Lista precificações para a grade inicial (codigo, descricao, data, usuario).
 */
export async function listPrecificacoes(req: Request, res: Response): Promise<void> {
  try {
    const list = await prisma.precificacao.findMany({
      orderBy: { data: 'desc' },
      select: {
        id: true,
        idProduto: true,
        codigoProduto: true,
        descricaoProduto: true,
        data: true,
        usuario: true,
      },
    });
    res.json({
      data: list.map((p) => ({
        id: p.id,
        codigoProduto: p.codigoProduto ?? '',
        descricaoProduto: p.descricaoProduto ?? '',
        data: p.data.toISOString(),
        usuario: p.usuario ?? '',
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[engenhariaController] listPrecificacoes:', msg);
    res.status(503).json({ data: [], error: msg });
  }
}

/**
 * GET /api/engenharia/precificacao/:id/resultado
 * Retorna os itens (grade) do resultado da precificação para exibir no popup.
 */
export async function getPrecificacaoResultado(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id) || id < 1) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  try {
    const precificacao = await prisma.precificacao.findUnique({
      where: { id },
      include: { itens: { orderBy: { id: 'asc' } } },
    });
    if (!precificacao) {
      res.status(404).json({ error: 'Precificação não encontrada' });
      return;
    }
    let valoresCampos: Record<string, string> | null = null;
    if (precificacao.valoresCampos) {
      try {
        valoresCampos = JSON.parse(precificacao.valoresCampos) as Record<string, string>;
      } catch {
        valoresCampos = null;
      }
    }

    const idsComponentes = precificacao.itens
      .map((i) => (typeof i.idcomponente === 'number' ? i.idcomponente : null))
      .filter((n): n is number => n != null);

    const pool = getNomusPool();
    let mapaTipoMaterial = new Map<number, string>();
    let mapaUnidadeMedida = new Map<number, string>();
    if (pool && idsComponentes.length > 0 && isNomusEnabled()) {
      try {
        mapaUnidadeMedida = await carregarUnidadeMedidaPorComponente(pool, idsComponentes);
      } catch (e) {
        console.error('[engenhariaController] getPrecificacaoResultado unidade medida:', e instanceof Error ? e.message : e);
      }
    }

    let ncmCodigoResult = precificacao.ncmCodigo ?? null;
    if (isNomusEnabled() && idsComponentes.length > 0 && pool) {
      try {
        mapaTipoMaterial = await carregarTipoMaterialPorComponente(pool, [...new Set(idsComponentes)]);
      } catch (errTipo) {
        console.error('[engenhariaController] getPrecificacaoResultado tipoMaterial:', errTipo instanceof Error ? errTipo.message : errTipo);
      }
    }

    const idsSemFamilia = precificacao.itens
      .filter((i) => i.idFamiliaProduto == null && typeof i.idcomponente === 'number')
      .map((i) => i.idcomponente as number);
    let mapaFamiliaExtra = new Map<number, number | null>();
    if (isNomusEnabled() && pool && idsSemFamilia.length > 0) {
      try {
        mapaFamiliaExtra = await buscarIdFamiliaProdutoPorIds(pool, [...new Set(idsSemFamilia)]);
      } catch (e) {
        console.error('[engenhariaController] getPrecificacaoResultado idFamilia:', e instanceof Error ? e.message : e);
      }
    }

    if (!ncmCodigoResult && isNomusEnabled() && pool) {
      try {
        ncmCodigoResult = await buscarCodigoNcmProduto(pool, precificacao.idProduto);
      } catch {
        /* mantém null */
      }
    }

    const ncmParaIcms = ncmCodigoResult ?? precificacao.ncmCodigo ?? null;
    const icmsAusente =
      !valoresCampos ||
      typeof valoresCampos !== 'object' ||
      valoresCampos.icms == null ||
      String(valoresCampos.icms).trim() === '';
    if (icmsAusente && ncmParaIcms && pool && isNomusEnabled()) {
      try {
        const icmsReal = await buscarAliquotaIcmsRealPorNcm(pool, ncmParaIcms);
        if (icmsReal != null) {
          valoresCampos = { ...(valoresCampos ?? {}), icms: formatPercentBr(icmsReal) };
        }
      } catch (e) {
        console.error('[engenhariaController] getPrecificacaoResultado icms NCM:', e instanceof Error ? e.message : e);
      }
    }

    const icmsAindaAusente =
      !valoresCampos ||
      typeof valoresCampos !== 'object' ||
      valoresCampos.icms == null ||
      String(valoresCampos.icms).trim() === '';
    if (icmsAindaAusente && ncmParaIcms) {
      try {
        const icmsPsa = await buscarIcmsPsaPorNcmBz0(ncmParaIcms);
        if (icmsPsa != null) {
          valoresCampos = { ...(valoresCampos ?? {}), icms: formatPercentBr(icmsPsa) };
        }
      } catch (e) {
        console.error('[engenhariaController] getPrecificacaoResultado icms PSA:', e instanceof Error ? e.message : e);
      }
    }

    const ipiAusente =
      !valoresCampos ||
      typeof valoresCampos !== 'object' ||
      valoresCampos.ipi == null ||
      String(valoresCampos.ipi).trim() === '';
    if (ipiAusente && ncmParaIcms && pool && isNomusEnabled()) {
      try {
        const ipiAliq = await buscarAliquotaIpiPorNcm(pool, ncmParaIcms);
        if (ipiAliq != null) {
          valoresCampos = { ...(valoresCampos ?? {}), ipi: formatPercentBr(ipiAliq) };
        }
      } catch (e) {
        console.error('[engenhariaController] getPrecificacaoResultado ipi NCM:', e instanceof Error ? e.message : e);
      }
    }

    res.json({
      precificacao: {
        id: precificacao.id,
        codigoProduto: precificacao.codigoProduto,
        descricaoProduto: precificacao.descricaoProduto,
        ncmCodigo: ncmCodigoResult,
        data: precificacao.data.toISOString(),
        usuario: precificacao.usuario,
        valoresCampos,
        ticketCrmId: precificacao.ticketCrmId ?? null,
      },
      itens: precificacao.itens.map((i) => ({
        id: i.id,
        idprodutopai: i.idprodutopai,
        codigopai: i.codigopai,
        descricaopai: i.descricaopai,
        idcomponente: i.idcomponente,
        idFamiliaProduto:
          i.idFamiliaProduto ??
          (typeof i.idcomponente === 'number' ? mapaFamiliaExtra.get(i.idcomponente) ?? null : null),
        codigocomponente: i.codigocomponente,
        componente: i.componente,
        unidadeMedida:
          i.unidadeMedida ??
          (typeof i.idcomponente === 'number' ? mapaUnidadeMedida.get(i.idcomponente) ?? null : null),
        qtd: i.qtd,
        dataEntrada: i.dataEntrada ?? null,
        tipoMaterial: (typeof i.idcomponente === 'number' ? mapaTipoMaterial.get(i.idcomponente) : null) ?? null,
        valorUnitario: i.valorUnitario ?? null,
        valorTotal: i.valorTotal ?? null,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[engenhariaController] getPrecificacaoResultado:', msg);
    res.status(503).json({ error: msg });
  }
}

/** Lista de chaves permitidas para valoresCampos (campos %) */
const VALORES_CAMPOS_KEYS = [
  'sucata', 'fosfatizacao', 'solda', 'gasGlp',
  'maoDeObraDireta', 'maoDeObraIndireta', 'depreciacao', 'despesasAdministrativas',
  'embalagem', 'frete', 'comissoes', 'propaganda',
  'lucro',
  'cofins', 'pis', 'csll', 'irpj', 'icms', 'ipi',
] as const;

/**
 * PATCH /api/engenharia/precificacao/:id/valores
 * Salva os valores (campos %) da precificação. Body: objeto com chaves dos campos e valores string.
 */
export async function salvarPrecificacaoValores(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id) || id < 1) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const valores: Record<string, string> = {};
  for (const key of VALORES_CAMPOS_KEYS) {
    const v = body[key];
    if (v !== undefined && v !== null) valores[key] = String(v).trim();
  }

  let ticketCrmId: number | null | undefined = undefined;
  if (Object.prototype.hasOwnProperty.call(body, 'ticketCrmId')) {
    const raw = body.ticketCrmId;
    if (raw === null || raw === '' || raw === undefined) {
      ticketCrmId = null;
    } else {
      const n = parseInt(String(raw), 10);
      ticketCrmId = Number.isFinite(n) && n >= 1 ? n : null;
    }
  }

  try {
    const precificacao = await prisma.precificacao.findUnique({ where: { id } });
    if (!precificacao) {
      res.status(404).json({ error: 'Precificação não encontrada' });
      return;
    }
    const data: { valoresCampos: string; ticketCrmId?: number | null } = {
      valoresCampos: JSON.stringify(valores),
    };
    if (ticketCrmId !== undefined) {
      data.ticketCrmId = ticketCrmId;
    }
    await prisma.precificacao.update({
      where: { id },
      data,
    });
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[engenhariaController] salvarPrecificacaoValores:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * PATCH /api/engenharia/precificacao/:id/item/:itemId/valor-unitario
 * Atualiza o valor unitário de um item da precificação e recalcula valor total.
 * Body: { valorUnitario: number | null }
 */
export async function atualizarValorUnitarioItemPrecificacao(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  const itemId = parseInt(String(req.params.itemId), 10);
  if (Number.isNaN(id) || id < 1 || Number.isNaN(itemId) || itemId < 1) {
    res.status(400).json({ error: 'IDs inválidos' });
    return;
  }

  const valorRaw = (req.body as { valorUnitario?: unknown } | undefined)?.valorUnitario;
  let valorUnitario: number | null = null;
  if (valorRaw !== null && valorRaw !== undefined && String(valorRaw).trim() !== '') {
    const parsed = Number(valorRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      res.status(400).json({ error: 'valorUnitario inválido' });
      return;
    }
    valorUnitario = Math.round(parsed * 100000) / 100000;
  }

  try {
    const item = await prisma.precificacaoItem.findFirst({
      where: { id: itemId, precificacaoId: id },
      select: { id: true, qtd: true },
    });
    if (!item) {
      res.status(404).json({ error: 'Item da precificação não encontrado' });
      return;
    }

    const valorTotal = valorUnitario != null ? Math.round(item.qtd * valorUnitario * 100) / 100 : null;
    const atualizado = await prisma.precificacaoItem.update({
      where: { id: itemId },
      data: { valorUnitario, valorTotal },
      select: { id: true, valorUnitario: true, valorTotal: true },
    });

    res.json({
      ok: true,
      item: {
        id: atualizado.id,
        valorUnitario: atualizado.valorUnitario,
        valorTotal: atualizado.valorTotal,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[engenhariaController] atualizarValorUnitarioItemPrecificacao:', msg);
    res.status(503).json({ error: msg });
  }
}

/**
 * DELETE /api/engenharia/precificacao/:id/item/:itemId
 * Remove um insumo (linha) da composição da precificação.
 */
export async function excluirItemPrecificacao(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  const itemId = parseInt(String(req.params.itemId), 10);
  if (Number.isNaN(id) || id < 1 || Number.isNaN(itemId) || itemId < 1) {
    res.status(400).json({ error: 'IDs inválidos' });
    return;
  }

  try {
    const del = await prisma.precificacaoItem.deleteMany({
      where: { id: itemId, precificacaoId: id },
    });
    if (del.count === 0) {
      res.status(404).json({ error: 'Item da precificação não encontrado' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[engenhariaController] excluirItemPrecificacao:', msg);
    res.status(503).json({ error: msg });
  }
}
