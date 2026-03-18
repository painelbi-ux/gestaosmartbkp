/**
 * Envio diário às 18h da mensagem de faturamento para os números da diretoria.
 */

import * as cron from 'node-cron';
import { obterDadosFaturamentoDiario } from '../data/faturamentoDiarioRepository.js';
import { montarMensagemFaturamentoDiario } from '../services/faturamentoDiarioMensagem.js';
import { sendWhatsAppTextTo } from '../services/evolutionApi.js';

const NUMEROS_DIRETORIA = ['5586995887672', '5586999766623', '5586999350016', '5586999145111'];

export function iniciarCronFaturamentoDiario(): void {
  cron.schedule('0 18 * * *', async () => {
    console.log('[faturamentoDiarioCron] Executando envio das 18h...');
    try {
      const result = await obterDadosFaturamentoDiario();
      if (result.erro || !result.dados) {
        console.error('[faturamentoDiarioCron] Erro ao obter dados:', result.erro);
        return;
      }
      const mensagem = montarMensagemFaturamentoDiario(result.dados);
      for (const numero of NUMEROS_DIRETORIA) {
        const sendResult = await sendWhatsAppTextTo(numero, mensagem);
        if (sendResult.ok) {
          console.log('[faturamentoDiarioCron] Enviado para', numero);
        } else {
          console.error('[faturamentoDiarioCron] Falha para', numero, sendResult.error);
        }
      }
    } catch (err) {
      console.error('[faturamentoDiarioCron]', err);
    }
  });
  console.log('[faturamentoDiarioCron] Agendado: todos os dias às 18:00');
}
