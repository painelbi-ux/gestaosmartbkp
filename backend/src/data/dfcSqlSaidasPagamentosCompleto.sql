-- =============================================================================
-- DFC — SQL completo: SAÍDAS / PAGAMENTOS (Nomus)
-- Espelha backend/src/data/dfcAgendamentoRepository.ts (discriminador P)
--         backend/src/data/dfcLancamentoLpRepository.ts (discriminador LP)
--
-- Parte A: período = data de lançamento do pagamento (pg); MAX(l.dataLancamento) no subquery pg.
-- A1/A2/A3: filtro do intervalo em pg.dataLancamento (igual ao detalhe e ao agregado mensal no app).
--
-- Parâmetros mysql2 (?) — agregados A1,A2,B1,B2: [ dataInicio, dataFim, idEmpresa ]
-- Detalhe A3 / B3 no código: [ dataInicio, dataFim, idEmpresa, ...idsConta, periodoBucket? ]
-- Pode substituir ? por literais '2026-01-01', '2026-12-31', 1 no cliente SQL.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Expressão de valor baixado (agendamento P) — mesma do código TS
-- -----------------------------------------------------------------------------
-- CASE
--   WHEN (pg.valorpago IS NULL OR pg.valorpago = 0) THEN
--     CASE WHEN (af.valorBaixado IS NULL OR af.valorBaixado = 0) THEN af.saldoBaixar ELSE af.valorBaixado END
--   ELSE pg.valorpago
-- END

-- =============================================================================
-- PARTE A — AGENDAMENTOS EFETIVOS (discriminador = 'P'); período por pg.dataLancamento
-- =============================================================================

-- A1) Agregado por DIA (idContaFinanceiro, periodo YYYY-MM-DD, valor)
-- Preferir DATE_FORMAT(...,'%Y-%m-%d') no app para o driver não devolver Date (fuso Node).
-- -----------------------------------------------------------------------------
SELECT
  af.idContaFinanceiro AS idContaFinanceiro,
  DATE_FORMAT(pg.dataLancamento, '%Y-%m-%d') AS periodo,
  SUM(
    CASE
      WHEN (pg.valorpago IS NULL OR pg.valorpago = 0) THEN
        CASE
          WHEN (af.valorBaixado IS NULL OR af.valorBaixado = 0) THEN af.saldoBaixar
          ELSE af.valorBaixado
        END
      ELSE pg.valorpago
    END
  ) AS valor
FROM agendamentofinanceiro af
LEFT JOIN pessoa pe ON pe.id = af.idPessoa
LEFT JOIN contafinanceiro cf ON cf.id = af.idContaFinanceiro
LEFT JOIN (
  SELECT DISTINCT idAgendamentoPagamento
  FROM lancamentofinanceiro l
  WHERE idAgendamentoPagamento IS NOT NULL
) sn ON sn.idAgendamentoPagamento = af.id
LEFT JOIN (
  SELECT idAgendamentoPagamento, MAX(l.dataLancamento) AS dataLancamento, SUM(l.valor) AS valorpago
  FROM lancamentofinanceiro l
  WHERE idAgendamentoPagamento IS NOT NULL
  GROUP BY idAgendamentoPagamento
) pg ON pg.idAgendamentoPagamento = af.id
WHERE DATE(pg.dataLancamento) BETWEEN ? AND ?
  AND af.discriminador = 'P'
  AND af.idEmpresa = ?
  AND af.idPedidoCompra IS NULL
  AND af.dataBaixa IS NOT NULL
  AND af.idContaFinanceiro IS NOT NULL
  AND CASE
    WHEN (sn.idAgendamentoPagamento IS NULL AND DATE(af.dataBaixa) IS NOT NULL) THEN 'Sem Numerario'
    ELSE 'Efetiva'
  END = 'Efetiva'
GROUP BY af.idContaFinanceiro, DATE_FORMAT(pg.dataLancamento, '%Y-%m-%d')
ORDER BY periodo, idContaFinanceiro;

-- A2) Agregado por MÊS (idContaFinanceiro, periodo YYYY-MM, valor)
-- -----------------------------------------------------------------------------
SELECT
  af.idContaFinanceiro AS idContaFinanceiro,
  DATE_FORMAT(pg.dataLancamento, '%Y-%m') AS periodo,
  SUM(
    CASE
      WHEN (pg.valorpago IS NULL OR pg.valorpago = 0) THEN
        CASE
          WHEN (af.valorBaixado IS NULL OR af.valorBaixado = 0) THEN af.saldoBaixar
          ELSE af.valorBaixado
        END
      ELSE pg.valorpago
    END
  ) AS valor
FROM agendamentofinanceiro af
LEFT JOIN pessoa pe ON pe.id = af.idPessoa
LEFT JOIN contafinanceiro cf ON cf.id = af.idContaFinanceiro
LEFT JOIN (
  SELECT DISTINCT idAgendamentoPagamento
  FROM lancamentofinanceiro l
  WHERE idAgendamentoPagamento IS NOT NULL
) sn ON sn.idAgendamentoPagamento = af.id
LEFT JOIN (
  SELECT idAgendamentoPagamento, MAX(l.dataLancamento) AS dataLancamento, SUM(l.valor) AS valorpago
  FROM lancamentofinanceiro l
  WHERE idAgendamentoPagamento IS NOT NULL
  GROUP BY idAgendamentoPagamento
) pg ON pg.idAgendamentoPagamento = af.id
WHERE DATE(pg.dataLancamento) BETWEEN ? AND ?
  AND af.discriminador = 'P'
  AND af.idEmpresa = ?
  AND af.idPedidoCompra IS NULL
  AND af.dataBaixa IS NOT NULL
  AND af.idContaFinanceiro IS NOT NULL
  AND CASE
    WHEN (sn.idAgendamentoPagamento IS NULL AND DATE(af.dataBaixa) IS NOT NULL) THEN 'Sem Numerario'
    ELSE 'Efetiva'
  END = 'Efetiva'
GROUP BY af.idContaFinanceiro, DATE_FORMAT(pg.dataLancamento, '%Y-%m')
ORDER BY periodo, idContaFinanceiro;

-- A3) DETALHE (linhas para modal) — acrescentar:
--     AND af.idContaFinanceiro IN (?, ?, ...)
--     Opcional mensal: AND DATE_FORMAT(pg.dataLancamento, '%Y-%m') = ?
--     Opcional diário: AND DATE(pg.dataLancamento) = ?
-- -----------------------------------------------------------------------------
SELECT
  af.id AS id,
  af.descricaoLancamento AS descricaoLancamento,
  pe.nome AS nome,
  DATE(af.dataVencimento) AS dataVencimento,
  DATE(pg.dataLancamento) AS dataBaixa,
  CASE
    WHEN (pg.valorpago IS NULL OR pg.valorpago = 0) THEN
      CASE
        WHEN (af.valorBaixado IS NULL OR af.valorBaixado = 0) THEN af.saldoBaixar
        ELSE af.valorBaixado
      END
    ELSE pg.valorpago
  END AS valorBaixado
FROM agendamentofinanceiro af
LEFT JOIN pessoa pe ON pe.id = af.idPessoa
LEFT JOIN contafinanceiro cf ON cf.id = af.idContaFinanceiro
LEFT JOIN (
  SELECT DISTINCT idAgendamentoPagamento
  FROM lancamentofinanceiro l
  WHERE idAgendamentoPagamento IS NOT NULL
) sn ON sn.idAgendamentoPagamento = af.id
LEFT JOIN (
  SELECT idAgendamentoPagamento, MAX(l.dataLancamento) AS dataLancamento, SUM(l.valor) AS valorpago
  FROM lancamentofinanceiro l
  WHERE idAgendamentoPagamento IS NOT NULL
  GROUP BY idAgendamentoPagamento
) pg ON pg.idAgendamentoPagamento = af.id
WHERE DATE(pg.dataLancamento) BETWEEN ? AND ?
  AND af.discriminador = 'P'
  AND af.idEmpresa = ?
  AND af.idPedidoCompra IS NULL
  AND af.dataBaixa IS NOT NULL
  AND af.idContaFinanceiro IS NOT NULL
  AND CASE
    WHEN (sn.idAgendamentoPagamento IS NULL AND DATE(af.dataBaixa) IS NOT NULL) THEN 'Sem Numerario'
    ELSE 'Efetiva'
  END = 'Efetiva'
ORDER BY valorBaixado DESC, af.id DESC
LIMIT 2000;

-- =============================================================================
-- PARTE B — LANÇAMENTOS LP (sem vínculo agendamento), data LANÇAMENTO = baixa na DFC
-- =============================================================================

-- B1) Agregado por DIA
-- -----------------------------------------------------------------------------
SELECT
  lf.idContaFinanceiro AS idContaFinanceiro,
  DATE_FORMAT(lf.dataLancamento, '%Y-%m-%d') AS periodo,
  SUM(lf.valor) AS valor
FROM lancamentofinanceiro lf
LEFT JOIN pessoa pe ON pe.id = lf.idPessoa
LEFT JOIN contafinanceiro cf ON cf.id = lf.idContaFinanceiro
WHERE DATE(lf.dataLancamento) BETWEEN ? AND ?
  AND lf.idEmpresa = ?
  AND lf.discriminador = 'LP'
  AND lf.idAgendamentoPagamento IS NULL
  AND lf.idContaFinanceiro IS NOT NULL
GROUP BY lf.idContaFinanceiro, DATE_FORMAT(lf.dataLancamento, '%Y-%m-%d')
ORDER BY periodo, idContaFinanceiro;

-- B2) Agregado por MÊS
-- -----------------------------------------------------------------------------
SELECT
  lf.idContaFinanceiro AS idContaFinanceiro,
  DATE_FORMAT(lf.dataLancamento, '%Y-%m') AS periodo,
  SUM(lf.valor) AS valor
FROM lancamentofinanceiro lf
LEFT JOIN pessoa pe ON pe.id = lf.idPessoa
LEFT JOIN contafinanceiro cf ON cf.id = lf.idContaFinanceiro
WHERE DATE(lf.dataLancamento) BETWEEN ? AND ?
  AND lf.idEmpresa = ?
  AND lf.discriminador = 'LP'
  AND lf.idAgendamentoPagamento IS NULL
  AND lf.idContaFinanceiro IS NOT NULL
GROUP BY lf.idContaFinanceiro, DATE_FORMAT(lf.dataLancamento, '%Y-%m')
ORDER BY periodo, idContaFinanceiro;

-- B3) DETALHE LP — acrescentar:
--     AND lf.idContaFinanceiro IN (?, ?, ...)
--     Opcional: AND DATE_FORMAT(lf.dataLancamento, '%Y-%m') = ?
--               ou AND DATE(lf.dataLancamento) = ?
-- -----------------------------------------------------------------------------
SELECT
  lf.id AS id,
  lf.descricao AS descricaoLancamento,
  pe.nome AS nome,
  DATE(lf.dataCompetencia) AS dataVencimento,
  DATE(lf.dataLancamento) AS dataBaixa,
  lf.valor AS valorBaixado
FROM lancamentofinanceiro lf
LEFT JOIN pessoa pe ON pe.id = lf.idPessoa
LEFT JOIN contafinanceiro cf ON cf.id = lf.idContaFinanceiro
WHERE DATE(lf.dataLancamento) BETWEEN ? AND ?
  AND lf.idEmpresa = ?
  AND lf.discriminador = 'LP'
  AND lf.idAgendamentoPagamento IS NULL
  AND lf.idContaFinanceiro IS NOT NULL
ORDER BY valorBaixado DESC, lf.id DESC
LIMIT 2000;
