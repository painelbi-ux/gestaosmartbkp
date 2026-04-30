import { describe, expect, it } from 'vitest';
import {
  analisarConformidade,
  arraysDiasIguais,
  DEFAULT_POLITICA_COMERCIAL,
  diasEsperadosParcelas,
  extrairDiasDaCondicao,
  faixaTicket,
  isRetiradaSoAco,
  mediaPrazoDias,
  prazoMedioParcelasConforme,
} from './painelComercialConformidade.js';

describe('painelComercialConformidade', () => {
  it('extrai dias do nome da condição', () => {
    expect(extrairDiasDaCondicao('30 + 45 + 60 DIAS')).toEqual([30, 45, 60]);
    expect(extrairDiasDaCondicao('20/30/40')).toEqual([20, 30, 40]);
  });

  it('extrai todas as parcelas longas (ex.: até 300 dias)', () => {
    const s = '(11x) Entrada/30/60/90/120/150/180/210/240/270/300';
    expect(extrairDiasDaCondicao(s)).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
    expect(mediaPrazoDias(extrairDiasDaCondicao(s))).toBe(165);
  });

  it('extrai dias respeitando prazo inicial/final da política', () => {
    const p = { ...DEFAULT_POLITICA_COMERCIAL, diasCondicaoMin: 25, diasCondicaoMax: 90 };
    expect(extrairDiasDaCondicao('20/30/40', p)).toEqual([30, 40]);
    expect(extrairDiasDaCondicao('100 + 120', p)).toEqual([]);
  });

  it('faixa de ticket', () => {
    expect(faixaTicket(2500)).toBe('ate_3000');
    expect(faixaTicket(5000)).toBe('entre_3001_10000');
    expect(faixaTicket(15000)).toBe('acima_10000');
  });

  it('dias esperados por total', () => {
    expect(diasEsperadosParcelas(3000)).toEqual([20, 30, 40]);
    expect(diasEsperadosParcelas(8000)).toEqual([30, 45, 60]);
    expect(diasEsperadosParcelas(20000)).toEqual([30, 45, 60, 75]);
  });

  it('retirada Só Aço', () => {
    expect(isRetiradaSoAco('1-Retirada na So Aço')).toBe(true);
    expect(isRetiradaSoAco('2-Retirada na So Moveis')).toBe(false);
  });

  it('pedido conforme entrada e prazos', () => {
    const r = analisarConformidade({
      totalPedido: 5000,
      somaEntrada: 1500,
      formaPagamento: 'Boleto',
      nomeCondicao: '30 + 45 + 60',
      observacoesTipicas: '4-Inserir em Romaneio',
    });
    expect(r.entradaOk).toBe(true);
    expect(r.prazosOk).toBe(true);
    expect(r.status).toBe('ok');
  });

  it('cartão exclui política', () => {
    const r = analisarConformidade({
      totalPedido: 5000,
      somaEntrada: 0,
      formaPagamento: 'Cartão Visa',
      nomeCondicao: 'X',
      observacoesTipicas: '',
    });
    expect(r.status).toBe('excluido_politica');
  });

  it('arraysDiasIguais', () => {
    expect(arraysDiasIguais([30, 45, 60], [60, 30, 45])).toBe(true);
    expect(arraysDiasIguais([20, 30, 40], [30, 45, 60])).toBe(false);
  });

  it('mediaPrazoDias e prazoMedioParcelasConforme', () => {
    expect(mediaPrazoDias([30, 45, 60, 75])).toBe(52.5);
    expect(mediaPrazoDias([30, 60, 90])).toBe(60);
    expect(prazoMedioParcelasConforme([30, 60, 90], [30, 45, 60, 75])).toBe(false);
    expect(prazoMedioParcelasConforme([30, 45, 60, 75], [30, 45, 60, 75])).toBe(true);
    expect(prazoMedioParcelasConforme([20, 30, 40], [30, 45, 60, 75])).toBe(true);
  });

  it('prazo médio acima da referência: não conforme nos prazos (entrada ok)', () => {
    const r = analisarConformidade({
      totalPedido: 20_000,
      somaEntrada: 6000,
      formaPagamento: 'Boleto',
      nomeCondicao: '(3x) 30/60/90',
      observacoesTipicas: '4-Inserir em Romaneio',
    });
    expect(r.entradaOk).toBe(true);
    expect(r.prazosOk).toBe(false);
    expect(r.status).toBe('nao_conforme');
    expect(r.motivos.some((m) => m.includes('Prazo médio'))).toBe(true);
  });

  it('até limite faixa 1: exige à vista — parcelamento não conforme', () => {
    const r = analisarConformidade({
      totalPedido: 2500,
      somaEntrada: 750,
      formaPagamento: 'Boleto',
      nomeCondicao: '30 + 45 + 60',
      observacoesTipicas: '',
    });
    expect(r.prazosOk).toBe(false);
    expect(r.status).toBe('nao_conforme');
    expect(r.motivos.some((m) => m.includes('à vista'))).toBe(true);
  });

  it('à vista: conforme na entrada com qualquer % (valor alto)', () => {
    const r = analisarConformidade({
      totalPedido: 5000,
      somaEntrada: 100,
      formaPagamento: 'Boleto',
      nomeCondicao: 'A VISTA',
      observacoesTipicas: '',
    });
    expect(r.entradaOk).toBe(true);
    expect(r.prazosOk).toBe(true);
    expect(r.status).toBe('ok');
    expect(r.motivos.some((m) => m.includes('Entrada'))).toBe(false);
  });

  it('à vista: conforme na entrada com 0% (valor baixo, faixa 1)', () => {
    const r = analisarConformidade({
      totalPedido: 244.2,
      somaEntrada: 0,
      formaPagamento: 'Transferência bancária',
      nomeCondicao: 'À Vista.',
      observacoesTipicas: '',
    });
    expect(r.entradaOk).toBe(true);
    expect(r.prazosOk).toBe(true);
    expect(r.status).toBe('ok');
    expect(r.motivos.some((m) => m.includes('Entrada'))).toBe(false);
  });

  it('no limite faixa 1 (inclusive): parcelas ainda exigem à vista', () => {
    const r = analisarConformidade({
      totalPedido: 3000,
      somaEntrada: 900,
      formaPagamento: 'Boleto',
      nomeCondicao: '20 + 30 + 40',
      observacoesTipicas: '',
    });
    expect(r.status).toBe('nao_conforme');
    expect(r.motivos.some((m) => m.includes('à vista'))).toBe(true);
  });

  it('prazo médio igual ou abaixo: conforme mesmo com parcelas diferentes do pacote', () => {
    const igualMedia = analisarConformidade({
      totalPedido: 20_000,
      somaEntrada: 6000,
      formaPagamento: 'Boleto',
      nomeCondicao: '30 + 45 + 60 + 75',
      observacoesTipicas: '',
    });
    expect(igualMedia.prazosOk).toBe(true);
    expect(igualMedia.status).toBe('ok');

    const abaixo = analisarConformidade({
      totalPedido: 20_000,
      somaEntrada: 6000,
      formaPagamento: 'Boleto',
      nomeCondicao: '20 + 30 + 40',
      observacoesTipicas: '',
    });
    expect(abaixo.prazosOk).toBe(true);
    expect(abaixo.status).toBe('ok');
  });
});
