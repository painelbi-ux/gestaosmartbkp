import { describe, expect, it } from 'vitest';
import { addDiasCorridos, diffDiasCorridos, parseDataIsoLocal, simularAntecipacaoDataFaturamento } from './painelComercialSimulacaoAntecipacao';

describe('painelComercialSimulacaoAntecipacao', () => {
  it('parseDataIsoLocal e addDiasCorridos', () => {
    const d = parseDataIsoLocal('2026-03-12');
    expect(d).not.toBeNull();
    const fat = addDiasCorridos(d!, 60);
    expect(fat.getFullYear()).toBe(2026);
    expect(fat.getMonth()).toBe(4);
    expect(fat.getDate()).toBe(11);
  });

  it('simula 30/60/90/120 com taxa 2% a.m. (fórmula da planilha: VP = parcela / (1+taxa)^(dias/30))', () => {
    const taxa = 0.02;
    const r = simularAntecipacaoDataFaturamento({
      emissaoYmd: '2026-03-12',
      diasCondicao: [30, 60, 90, 120],
      totalPedido: 74650 + 50000,
      somaEntrada: 50000,
      taxaMensal: taxa,
      diasAteFaturamento: 60,
      taxaEmissaoBoletosTotal: 22,
      valorTac: 150,
      valorTed: 30,
    });
    expect(r).not.toBeNull();
    expect(r!.valorAPrazo).toBeCloseTo(74650, 5);
    expect(r!.valorParcela).toBeCloseTo(18662.5, 5);
    expect(r!.linhas).toHaveLength(4);
    expect(r!.linhas[0].diferencaDias).toBe(90);
    const vp0 = 18662.5 / Math.pow(1 + taxa, 90 / 30);
    expect(r!.linhas[0].valorPresente).toBeCloseTo(vp0, 5);
    expect(r!.somaValorPresente + r!.somaDesagioParcelas).toBeCloseTo(74650, 2);
    expect(r!.totalCustosFixos).toBeCloseTo(202, 5);
    expect(r!.valorLiquidoAntecipado).toBeCloseTo(r!.somaValorPresente - r!.totalCustosFixos, 5);
    expect(r!.pctDescontoTotalOperacao).toBeCloseTo(((74650 - r!.valorLiquidoAntecipado) / 74650) * 100, 3);
  });

  it('cenário II: dias para VP = data faturamento → vencimento (30, 60, …)', () => {
    const taxa = 0.02;
    const r = simularAntecipacaoDataFaturamento({
      emissaoYmd: '2026-03-12',
      diasCondicao: [30, 60, 90, 120],
      totalPedido: 74650 + 50000,
      somaEntrada: 50000,
      taxaMensal: taxa,
      diasAteFaturamento: 60,
      taxaEmissaoBoletosTotal: 22,
      valorTac: 150,
      valorTed: 30,
      baseDiasParaVp: 'faturamento',
    });
    expect(r).not.toBeNull();
    expect(r!.linhas[0].diferencaDias).toBe(30);
    expect(r!.linhas[1].diferencaDias).toBe(60);
    const vp0 = 18662.5 / Math.pow(1 + taxa, 30 / 30);
    expect(r!.linhas[0].valorPresente).toBeCloseTo(vp0, 5);
  });
});
