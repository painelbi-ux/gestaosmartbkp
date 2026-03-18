/**
 * Montagem da mensagem de faturamento do dia para WhatsApp.
 * Usado pelo controller e pelo cron de envio às 18h.
 */

const META_FATURAMENTO_MENSAL = 2_500_000;

function formatarBRL(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface DadosFaturamentoParaMensagem {
  faturamentoDiarioValorTotal: number;
  faturamentoDiarioTotalDesconto: number;
  devolucaoDiaria: number;
  faturamentoMensalValorTotalComDesconto: number;
}

export function montarMensagemFaturamentoDiario(dados: DadosFaturamentoParaMensagem): string {
  const valorFaturado = dados.faturamentoDiarioValorTotal;
  const descontos = dados.faturamentoDiarioTotalDesconto;
  const devolucoes = dados.devolucaoDiaria;
  const liquidoDia = valorFaturado - descontos - devolucoes;
  const acumuladoMes = dados.faturamentoMensalValorTotalComDesconto;
  const percentualMeta = META_FATURAMENTO_MENSAL > 0
    ? (acumuladoMes / META_FATURAMENTO_MENSAL) * 100
    : 0;
  const hoje = new Date();
  const dataStr = hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  let msg = 'Olá, Diretoria! Aqui está o faturamento do dia!💵\n';
  msg += `${dataStr}\n\n`;
  msg += `Valor Faturado: ${formatarBRL(valorFaturado)}\n`;
  msg += `Descontos: ${formatarBRL(descontos)}\n`;
  msg += `Valor Devoluções: ${formatarBRL(devolucoes)}\n`;
  msg += `Líquido do Dia: ${formatarBRL(liquidoDia)}\n\n`;
  msg += `Acumulado do Mês: ${formatarBRL(acumuladoMes)}\n\n`;
  msg += `${percentualMeta.toFixed(2).replace('.', ',')}% da meta de R$ 2.500.000,00`;
  return msg;
}
