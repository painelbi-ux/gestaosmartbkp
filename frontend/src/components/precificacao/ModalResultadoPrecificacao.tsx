import { useState, useEffect } from 'react';
import type { PrecificacaoItemRow } from '../../api/engenharia';
import { salvarPrecificacaoValores } from '../../api/engenharia';
import { listarTickets, obterTicketPorId, type TicketItem, type TicketDetalhe } from '../../api/integracao';
import SelectWithSearch from '../SelectWithSearch';
import { MensagemSemRegistrosInline } from '../MensagemSemRegistros';
import { downloadFichaPrecificacaoPdf } from './FichaPrecificacaoReport';

const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-sm font-medium';
const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50 transition';

const labelClass = 'text-xs text-slate-500 dark:text-slate-400 block mb-0.5';
const inputClass =
  'w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-2 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

const SEGMENTOS = {
  Consumíveis: [
    { key: 'sucata', label: 'Sucata' },
    { key: 'fosfatizacao', label: 'Fosfatização' },
    { key: 'solda', label: 'Solda' },
    { key: 'gasGlp', label: 'Gás GLP' },
  ],
  'Despesas Operacionais': [
    { key: 'maoDeObraDireta', label: 'Mão de Obra Direta' },
    { key: 'maoDeObraIndireta', label: 'Mão de Obra Indireta' },
    { key: 'depreciacao', label: 'Depreciação' },
    { key: 'despesasAdministrativas', label: 'Despesas Administrativas' },
    { key: 'embalagem', label: 'Embalagem' },
    { key: 'frete', label: 'Frete' },
    { key: 'comissoes', label: 'Comissões' },
    { key: 'propaganda', label: 'Propaganda' },
  ],
  Lucro: [{ key: 'lucro', label: 'Lucro' }],
  'Impostos Sobre a Venda': [
    { key: 'cofins', label: 'COFINS' },
    { key: 'pis', label: 'PIS' },
    { key: 'csll', label: 'CSLL' },
    { key: 'irpj', label: 'IRPJ' },
    { key: 'icms', label: 'ICMS' },
    { key: 'ipi', label: 'IPI' },
  ],
} as const;

type CampoKey = (typeof SEGMENTOS)[keyof typeof SEGMENTOS][number]['key'];

const INITIAL_VALUES: Record<CampoKey, string> = {
  sucata: '',
  fosfatizacao: '',
  solda: '',
  gasGlp: '',
  maoDeObraDireta: '',
  maoDeObraIndireta: '',
  depreciacao: '',
  despesasAdministrativas: '',
  embalagem: '',
  frete: '',
  comissoes: '',
  propaganda: '',
  lucro: '',
  cofins: '',
  pis: '',
  csll: '',
  irpj: '',
  icms: '',
  ipi: '',
};

export interface ModalResultadoPrecificacaoProps {
  idPrecificacao: number;
  codigoProduto: string;
  descricaoProduto: string;
  /** Data da precificação (ISO ou formatada) para o relatório */
  dataPrecificacao?: string;
  /** Usuário que criou a precificação */
  usuario?: string;
  itens: PrecificacaoItemRow[];
  initialValores?: Record<string, string> | null;
  onClose: () => void;
}

export default function ModalResultadoPrecificacao({
  idPrecificacao,
  codigoProduto,
  descricaoProduto,
  dataPrecificacao,
  usuario,
  itens,
  initialValores,
  onClose,
}: ModalResultadoPrecificacaoProps) {
  const [valores, setValores] = useState<Record<CampoKey, string>>(() => {
    if (initialValores && typeof initialValores === 'object') {
      return { ...INITIAL_VALUES, ...initialValores } as Record<CampoKey, string>;
    }
    return { ...INITIAL_VALUES };
  });
  const [salvando, setSalvando] = useState(false);
  const [mensagemSalvar, setMensagemSalvar] = useState<'ok' | 'erro' | null>(null);

  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [ticketId, setTicketId] = useState<string>('');
  const [ticketDetalhe, setTicketDetalhe] = useState<TicketDetalhe | null>(null);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingTicketDetalhe, setLoadingTicketDetalhe] = useState(false);

  const [subaba, setSubaba] = useState<'materiais' | 'markup'>('materiais');

  useEffect(() => {
    if (initialValores && typeof initialValores === 'object') {
      setValores((prev) => ({ ...prev, ...initialValores } as Record<CampoKey, string>));
    }
  }, [idPrecificacao, initialValores]);

  useEffect(() => {
    setLoadingTickets(true);
    listarTickets()
      .then((data) => {
        setTickets(data);
        if (data.length > 0 && !ticketId) setTicketId(String(data[0].id));
      })
      .catch(() => setTickets([]))
      .finally(() => setLoadingTickets(false));
  }, []);

  useEffect(() => {
    const id = ticketId ? parseInt(ticketId, 10) : 0;
    if (!Number.isFinite(id) || id < 1) {
      setTicketDetalhe(null);
      return;
    }
    setLoadingTicketDetalhe(true);
    obterTicketPorId(id)
      .then((d) => setTicketDetalhe(d ?? null))
      .catch(() => setTicketDetalhe(null))
      .finally(() => setLoadingTicketDetalhe(false));
  }, [ticketId]);

  const handleChange = (key: CampoKey, value: string) => {
    setValores((prev) => ({ ...prev, [key]: value }));
    setMensagemSalvar(null);
  };

  const handleSalvar = async () => {
    setSalvando(true);
    setMensagemSalvar(null);
    const { error } = await salvarPrecificacaoValores(idPrecificacao, valores);
    setSalvando(false);
    if (error) {
      setMensagemSalvar('erro');
      return;
    }
    setMensagemSalvar('ok');
  };

  const handleBaixarPdf = () => {
    downloadFichaPrecificacaoPdf({
      idPrecificacao,
      codigoProduto,
      descricaoProduto,
      dataPrecificacao,
      usuario,
      itens,
      valores,
      ticketDetalhe,
      ticketId: ticketId || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Resultado da precificação"
    >
      <div
        className="rounded-xl shadow-xl w-full max-w-6xl max-h-[95vh] flex flex-col border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-600 shrink-0 space-y-1" aria-label="Dados da precificação">
          <dl className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            <div>
              <span className="font-medium">#{idPrecificacao}</span>
            </div>
            <div>
              <dt className="inline font-medium after:content-[':'] after:mr-1">Código do Produto</dt>
              <dd className="inline">{codigoProduto || '—'}</dd>
            </div>
            <div>
              <dt className="inline font-medium after:content-[':'] after:mr-1">Descrição do Produto</dt>
              <dd className="inline break-words">{descricaoProduto || '—'}</dd>
            </div>
          </dl>
        </header>

        {/* Subabas dentro do modal: Materiais | Markup */}
        <div className="shrink-0 border-b border-slate-200 dark:border-slate-600 px-6">
          <nav className="flex gap-1" aria-label="Abas da precificação">
            <button
              type="button"
              onClick={() => setSubaba('materiais')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition -mb-px ${
                subaba === 'materiais'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Materiais
            </button>
            <button
              type="button"
              onClick={() => setSubaba('markup')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition -mb-px ${
                subaba === 'markup'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Markup
            </button>
          </nav>
        </div>

        <div className="flex-1 min-h-0 flex flex-col px-6 py-4 gap-4 overflow-hidden">
          {subaba === 'materiais' && (
            <>
          {/* Acima da grade: select Ticket (ID) + Cliente, Vendedor, Município, UF */}
          <div className="shrink-0 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
            <div>
              <SelectWithSearch
                id="modal-precificacao-ticket"
                label="Ticket (ID)"
                placeholder="Selecione..."
                options={tickets.map((t) => ({
                  value: String(t.id),
                  label: `#${t.id}${t.titulo ? ` — ${t.titulo.length > 50 ? t.titulo.slice(0, 50) + '…' : t.titulo}` : ''}`,
                }))}
                value={ticketId}
                onChange={setTicketId}
                disabled={loadingTickets}
                labelClass={labelClass}
                maxListHeight={260}
              />
            </div>
            {loadingTicketDetalhe && ticketId && (
              <p className="text-xs text-slate-500 dark:text-slate-400">Carregando informações do ticket...</p>
            )}
            {!loadingTicketDetalhe && ticketDetalhe && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <span className={labelClass}>Cliente</span>
                  <p className="text-sm text-slate-800 dark:text-slate-200">{ticketDetalhe.cliente ?? '—'}</p>
                </div>
                <div>
                  <span className={labelClass}>Vendedor</span>
                  <p className="text-sm text-slate-800 dark:text-slate-200">{ticketDetalhe.vendedorrep ?? '—'}</p>
                </div>
                <div>
                  <span className={labelClass}>Município</span>
                  <p className="text-sm text-slate-800 dark:text-slate-200">{ticketDetalhe.municipio ?? '—'}</p>
                </div>
                <div>
                  <span className={labelClass}>UF</span>
                  <p className="text-sm text-slate-800 dark:text-slate-200">{ticketDetalhe.UF ?? '—'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Grade de materiais */}
          <div className="flex-1 min-h-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-auto" style={{ maxHeight: '50vh' }}>
              <table className="w-full text-sm text-left min-w-[800px]">
                <thead className="bg-primary-600 text-white">
                  <tr>
                    <th className="py-3 px-4 font-semibold">#</th>
                    <th className="py-3 px-4 font-semibold">Id comp.</th>
                    <th className="py-3 px-4 font-semibold">Cód. comp.</th>
                    <th className="py-3 px-4 font-semibold">Componente</th>
                    <th className="py-3 px-4 font-semibold">Qtd</th>
                    <th className="py-3 px-4 font-semibold text-right">Valor Unitário</th>
                    <th className="py-3 px-4 font-semibold text-right">Valor Total</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 dark:text-slate-200">
                  {itens.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 px-4 text-center">
                        <MensagemSemRegistrosInline />
                      </td>
                    </tr>
                  )}
                  {itens.map((item, idx) => (
                    <tr
                      key={item.id}
                      className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30"
                    >
                      <td className="py-3 px-4 font-medium tabular-nums">{idx + 1}</td>
                      <td className="py-3 px-4 tabular-nums">{item.idcomponente ?? '—'}</td>
                      <td className="py-3 px-4">{item.codigocomponente ?? '—'}</td>
                      <td className="py-3 px-4">{item.componente ?? '—'}</td>
                      <td className="py-3 px-4 tabular-nums">
                        {typeof item.qtd === 'number' ? item.qtd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 5 }) : item.qtd}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {item.valorUnitario != null
                          ? item.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {item.valorTotal != null
                          ? item.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
            </>
          )}

          {subaba === 'markup' && (
          <div className="flex-1 min-h-0 overflow-auto">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Campos % (valores e percentuais)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {Object.entries(SEGMENTOS).map(([tituloSeg, campos]) => (
              <div
                key={tituloSeg}
                className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 p-4 space-y-3"
              >
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-600 pb-2">
                  {tituloSeg}
                </h3>
                <div className="space-y-2">
                  {campos.map(({ key, label }) => (
                    <div key={key}>
                      <label htmlFor={key} className={labelClass}>
                        {label}
                      </label>
                      <input
                        id={key}
                        type="text"
                        inputMode="decimal"
                        value={valores[key as CampoKey]}
                        onChange={(e) => handleChange(key as CampoKey, e.target.value)}
                        className={inputClass}
                        placeholder="0,00 %"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            </div>
          </div>
          )}
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 rounded-b-xl">
          {mensagemSalvar === 'ok' && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Salvo com sucesso.</span>
          )}
          {mensagemSalvar === 'erro' && (
            <span className="text-sm text-red-600 dark:text-red-400 font-medium">Erro ao salvar. Tente novamente.</span>
          )}
          <button
            type="button"
            onClick={handleBaixarPdf}
            className={btnSecondary}
            title="Baixa a ficha de precificação em PDF"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Baixar PDF
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className={btnPrimary}
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
          <button type="button" onClick={onClose} className={btnSecondary}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
