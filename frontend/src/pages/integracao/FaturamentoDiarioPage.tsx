import { useState } from 'react';
import { getMensagemFaturamentoDiario, enviarFaturamentoDiario } from '../../api/integracao';

const NUMEROS_OPCOES = [
  { value: '86995887672', label: '86995887672' },
  { value: '86999766623', label: '86999766623' },
  { value: '86999350016', label: '86999350016' },
  { value: '86999145111', label: '86999145111' },
];

export default function FaturamentoDiarioPage() {
  const [numero, setNumero] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const handleEnviar = async () => {
    if (!numero.trim()) {
      setErro('Selecione um número para envio.');
      return;
    }
    setErro(null);
    setMensagemSucesso(null);
    setEnviando(true);
    try {
      await enviarFaturamentoDiario(numero.trim());
      setMensagemSucesso(`Mensagem enviada para ${numero}.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao enviar.');
    } finally {
      setEnviando(false);
    }
  };

  const handlePreview = async () => {
    setErro(null);
    setPreview(null);
    setCarregandoPreview(true);
    try {
      const { mensagem } = await getMensagemFaturamentoDiario();
      setPreview(mensagem);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar preview.');
    } finally {
      setCarregandoPreview(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Faturamento Diário – Envio WhatsApp</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        A mensagem de faturamento do dia é enviada automaticamente às 18h para os números da diretoria.
        Use esta tela para testar o envio para um número específico.
      </p>

      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-4 space-y-4">
        <div>
          <label htmlFor="numero-faturamento" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Número para teste
          </label>
          <select
            id="numero-faturamento"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            className="w-full max-w-xs rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Selecione...</option>
            {NUMEROS_OPCOES.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleEnviar}
            disabled={enviando || !numero.trim()}
            className="rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
          >
            {enviando ? 'Enviando...' : 'Enviar mensagem de teste'}
          </button>
          <button
            type="button"
            onClick={handlePreview}
            disabled={carregandoPreview}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
          >
            {carregandoPreview ? 'Carregando...' : 'Ver preview da mensagem'}
          </button>
        </div>

        {mensagemSucesso && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
            {mensagemSucesso}
          </div>
        )}
        {erro && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            {erro}
          </div>
        )}
      </div>

      {preview != null && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Preview da mensagem</h2>
          <pre className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100 font-sans">{preview}</pre>
        </div>
      )}
    </div>
  );
}
