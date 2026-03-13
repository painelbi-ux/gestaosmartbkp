import { useState, useEffect } from 'react';
import type { FornecedorColetaItem } from '../../api/compras';
import { listarPrecosCotacao, atualizarRegistroColeta, salvarPrecosCotacao } from '../../api/compras';

function getRowValue(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(row, k)) return row[k];
  }
  const lower = keys[0].toLowerCase();
  const found = Object.keys(row).find((key) => key.toLowerCase() === lower);
  if (found != null) return row[found];
  // Só para "Id Produto": fallback em chave que contenha id e produto
  if (keys.some((k) => /id.*produto|produto.*id/i.test(k))) {
    const key = Object.keys(row).find((k) => /id/i.test(k) && /produto/i.test(k));
    return key != null ? row[key] : undefined;
  }
  return undefined;
}

export interface ModalCadastrarPrecosProps {
  row: Record<string, unknown>;
  coletaId: number;
  coletaLabel: string;
  fornecedores: FornecedorColetaItem[];
  /** Quando "Em Aprovação", campos de preço ficam só leitura (apenas Qtde Aprovada editável). */
  statusColeta?: string;
  onClose: () => void;
  /** Chamado após salvar com sucesso (para a tela de preços recarregar e exibir a quantidade aprovada atualizada). */
  onSalvo?: () => void;
}

interface PrecosFornecedor {
  idPessoa: number;
  nome: string;
  valorFrete: string;
  valorFreteTipo: '%' | 'R$' | undefined;
  precoNF: string;
  percDesconto: string;
  percICMS: string;
  percPIS: string;
  percIPI: string;
  percCOFINS: string;
}

const DEFAULT_PIS = '1.65';
const DEFAULT_COFINS = '7.60';

/**
 * Preço Base = Preço NF c/ IPI / (1 + IPI%)
 * Descontos dos créditos = Preço Base × (PIS% + COFINS% + ICMS%)
 * Preço após créditos e desconto = (Preço Base - Descontos dos créditos) × (1 - % desconto)
 * Preço Total = Preço após créditos e desconto + frete (% sobre esse preço ou valor fixo em R$)
 */
function precoTotal(preco: PrecosFornecedor): number {
  const precoNFcIPI = parseFloat(preco.precoNF) || 0;
  const ipi = parseFloat(preco.percIPI) || 0;
  const icms = parseFloat(preco.percICMS) || 0;
  const pis = parseFloat(preco.percPIS) || 0;
  const cofins = parseFloat(preco.percCOFINS) || 0;
  const desconto = parseFloat(preco.percDesconto) || 0;
  const base = precoNFcIPI / (1 + ipi / 100);
  const percTotal = pis / 100 + cofins / 100 + icms / 100;
  const descontosCreditos = base * percTotal;
  const totalAntesDesconto = base - descontosCreditos;
  const totalSemFrete = totalAntesDesconto * (1 - desconto / 100);
  const valorFreteNum = parseFloat(String(preco.valorFrete || '').replace(',', '.')) || 0;
  if (valorFreteNum <= 0) return totalSemFrete;
  if (preco.valorFreteTipo === '%') {
    return totalSemFrete * (1 + valorFreteNum / 100);
  }
  if (preco.valorFreteTipo === 'R$') {
    return totalSemFrete + valorFreteNum;
  }
  return totalSemFrete;
}

export default function ModalCadastrarPrecos({
  row,
  coletaId,
  coletaLabel,
  fornecedores,
  statusColeta,
  onClose,
  onSalvo,
}: ModalCadastrarPrecosProps) {
  const apenasVisualizacaoPrecos = statusColeta === 'Em Aprovação';
  const codigo = String(getRowValue(row, ['Codigo do Produto', 'codigo do produto']) ?? '');
  const descricao = String(getRowValue(row, ['Descricao do Produto', 'descricao do produto']) ?? '');
  const idProdutoRaw = getRowValue(row, ['Id Produto', 'id produto', 'idProduto']);
  const idProduto =
    typeof idProdutoRaw === 'number'
      ? idProdutoRaw
      : typeof idProdutoRaw === 'string'
        ? parseInt(idProdutoRaw, 10) || 0
        : Number(idProdutoRaw) || 0;

  const ultimoFornecedorRaw = getRowValue(row, ['Ultimo Fornecedor', 'ultimo fornecedor', 'ultimoFornecedor']);
  const ultimoFornecedor = ultimoFornecedorRaw != null && String(ultimoFornecedorRaw).trim() !== ''
    ? String(ultimoFornecedorRaw).trim()
    : null;
  const custoUnitarioRaw = getRowValue(row, ['Custo Unitario Compra', 'custo unitario compra', 'custoUnitarioCompra']);
  const custoUnitarioCompra = custoUnitarioRaw != null && (typeof custoUnitarioRaw === 'number' || String(custoUnitarioRaw).trim() !== '')
    ? (typeof custoUnitarioRaw === 'number' ? custoUnitarioRaw : parseFloat(String(custoUnitarioRaw).replace(',', '.')))
    : null;
  const ultimoPrecoFormatado = custoUnitarioCompra != null && !Number.isNaN(custoUnitarioCompra)
    ? `R$ ${custoUnitarioCompra.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;

  const qtdeSolicitadaRaw = getRowValue(row, ['Qtd Liberada', 'Qtd Confirmada', 'Qtde Solicitada', 'qtd liberada', 'qtd confirmada', 'qtde solicitada']);
  const qtdeSolicitada =
    qtdeSolicitadaRaw != null && (typeof qtdeSolicitadaRaw === 'number' || String(qtdeSolicitadaRaw).trim() !== '')
      ? (typeof qtdeSolicitadaRaw === 'number' ? qtdeSolicitadaRaw : parseFloat(String(qtdeSolicitadaRaw).replace(',', '.')))
      : null;
  const registroIdRaw = row._registroId ?? row.registroId;
  const registroId = typeof registroIdRaw === 'number' && Number.isFinite(registroIdRaw) ? registroIdRaw : 0;
  const qtdeAprovadaInicial = getRowValue(row, ['Qtde Aprovada', 'qtde aprovada']);
  const qtdeAprovadaNum =
    qtdeAprovadaInicial != null && (typeof qtdeAprovadaInicial === 'number' || String(qtdeAprovadaInicial).trim() !== '')
      ? (typeof qtdeAprovadaInicial === 'number' ? qtdeAprovadaInicial : parseFloat(String(qtdeAprovadaInicial).replace(',', '.')))
      : null;

  const [qtdeAprovada, setQtdeAprovada] = useState<string>(() =>
    qtdeAprovadaNum != null && !Number.isNaN(qtdeAprovadaNum) ? String(qtdeAprovadaNum) : ''
  );
  const idFornecedorVencedorInicial = getRowValue(row, ['Id Fornecedor Vencedor', 'id fornecedor vencedor']);
  const idFornecedorVencedorNum =
    idFornecedorVencedorInicial != null && (typeof idFornecedorVencedorInicial === 'number' || String(idFornecedorVencedorInicial).trim() !== '')
      ? (typeof idFornecedorVencedorInicial === 'number' ? idFornecedorVencedorInicial : parseInt(String(idFornecedorVencedorInicial), 10))
      : null;
  const idVencedorInicial = typeof idFornecedorVencedorNum === 'number' && Number.isFinite(idFornecedorVencedorNum) && idFornecedorVencedorNum > 0 ? idFornecedorVencedorNum : null;
  const [idFornecedorVencedor, setIdFornecedorVencedor] = useState<number | null>(() => idVencedorInicial);

  const [precos, setPrecos] = useState<PrecosFornecedor[]>(() =>
    fornecedores.map((f) => ({
      idPessoa: f.idPessoa,
      nome: f.nome ?? '',
      valorFrete: f.valorFrete ?? '',
      valorFreteTipo: f.valorFreteTipo,
      precoNF: '',
      percDesconto: '',
      percICMS: '',
      percPIS: DEFAULT_PIS,
      percIPI: '',
      percCOFINS: DEFAULT_COFINS,
    }))
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingPrecos, setLoadingPrecos] = useState(true);

  useEffect(() => {
    if (coletaId < 1 || idProduto < 1) {
      setLoadingPrecos(false);
      return;
    }
    let cancelled = false;
    setLoadingPrecos(true);
    listarPrecosCotacao(coletaId, idProduto)
      .then(({ data }) => {
        if (cancelled) return;
        if (data.length === 0) {
          setLoadingPrecos(false);
          return;
        }
        setPrecos((prev) =>
          prev.map((p) => {
            const salvo = data.find((s) => s.idFornecedor === p.idPessoa);
            if (!salvo) return p;
            return {
              ...p,
              precoNF: String(salvo.precoNF),
              percICMS: String(salvo.percICMS),
              percPIS: String(salvo.percPIS),
              percIPI: String(salvo.percIPI),
              percCOFINS: String(salvo.percCOFINS),
            };
          })
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingPrecos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coletaId, idProduto]);

  const update = (idx: number, field: keyof PrecosFornecedor, value: string) => {
    setPrecos((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
    setError(null);
  };

  const handleSalvar = async () => {
    if (registroId <= 0) {
      setError('Registro da coleta não identificado. Feche e abra o modal novamente.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const qtde = parseFloat(qtdeAprovada.replace(',', '.')) || 0;
      const { ok: okReg, error: errReg } = await atualizarRegistroColeta(coletaId, registroId, {
        qtdeAprovada: qtde,
        idFornecedorVencedor: idFornecedorVencedor ?? undefined,
      });
      if (!okReg) {
        setError(errReg ?? 'Erro ao salvar.');
        setSaving(false);
        return;
      }
      if (!apenasVisualizacaoPrecos && idProduto > 0) {
        const payload = precos.map((p) => ({
          idPessoa: p.idPessoa,
          precoNF: parseFloat(p.precoNF) || 0,
          percICMS: parseFloat(p.percICMS) || 0,
          percPIS: parseFloat(p.percPIS) || 0,
          percIPI: parseFloat(p.percIPI) || 0,
          percCOFINS: parseFloat(p.percCOFINS) || 0,
          precoTotal: precoTotal(p),
        }));
        const { ok, error: err } = await salvarPrecosCotacao(coletaId, idProduto, payload);
        if (!ok) {
          setError(err ?? 'Erro ao salvar preços.');
          setSaving(false);
          return;
        }
      }
      onSalvo?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const labelClass = 'text-xs text-slate-500 dark:text-slate-400 block mb-0.5';
  const inputClass =
    'rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-cadastrar-precos-title"
    >
      <div
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-600 shrink-0">
          <h2 id="modal-cadastrar-precos-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Cadastrar preços — {coletaLabel}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 dark:hover:text-slate-200"
            aria-label="Fechar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">{codigo}</span>
          {descricao && <span className="text-slate-500 dark:text-slate-400 ml-2 truncate">{descricao}</span>}
        </div>

        {(ultimoFornecedor != null || ultimoPrecoFormatado != null) && (
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-600">
            <div className="rounded-lg border-2 border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-sm flex flex-col gap-2">
              <div>
                <div className="text-xs font-medium text-amber-800 dark:text-amber-200">Último Fornecedor</div>
                <div className="text-slate-800 dark:text-slate-100 font-medium mt-0.5">{ultimoFornecedor ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-amber-800 dark:text-amber-200">Último Preço de Compra</div>
                <div className="text-slate-800 dark:text-slate-100 font-medium mt-0.5">{ultimoPrecoFormatado ?? '—'}</div>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-600 grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Qtde Solicitada</label>
            <div className={inputClass + ' bg-slate-100 dark:bg-slate-600 cursor-default'}>
              {qtdeSolicitada != null && !Number.isNaN(qtdeSolicitada) ? qtdeSolicitada : '—'}
            </div>
          </div>
          <div>
            <label className={labelClass}>Qtde Aprovada (diretoria)</label>
            <input
              type="number"
              step="1"
              min="0"
              value={qtdeAprovada}
              onChange={(e) => setQtdeAprovada(e.target.value)}
              className={inputClass}
              placeholder="Informe a quantidade aprovada"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-4 py-4 space-y-6">
          {loadingPrecos && (
            <div className="flex items-center justify-center py-8 text-slate-500 dark:text-slate-400 text-sm">
              <span className="animate-pulse">Carregando preços salvos...</span>
            </div>
          )}
          {!loadingPrecos && precos.map((p, idx) => (
            <div
              key={`${p.idPessoa}-${idx}`}
              className={`rounded-lg border border-slate-200 dark:border-slate-600 p-4 bg-slate-50/50 dark:bg-slate-700/20 ${apenasVisualizacaoPrecos ? 'opacity-75' : ''}`}
            >
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{p.nome}</h3>
                <label className={`inline-flex items-center gap-2 select-none ${statusColeta === 'Finalizada' ? 'cursor-default opacity-75' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={idFornecedorVencedor === p.idPessoa}
                    onChange={() => setIdFornecedorVencedor(idFornecedorVencedor === p.idPessoa ? null : p.idPessoa)}
                    disabled={statusColeta === 'Finalizada'}
                    className="rounded border-slate-400 text-primary-600 focus:ring-primary-500 disabled:opacity-60"
                  />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Vencedor</span>
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Preço NF c/ IPI</label>
                  {apenasVisualizacaoPrecos ? (
                    <div className={inputClass + ' bg-slate-200/90 dark:bg-slate-600/90 cursor-default opacity-90'}>{p.precoNF || '0,00'}</div>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={p.precoNF}
                      onChange={(e) => update(idx, 'precoNF', e.target.value)}
                      className={inputClass}
                      placeholder="0,00"
                    />
                  )}
                </div>
                <div>
                  <label className={labelClass}>% de desconto</label>
                  {apenasVisualizacaoPrecos ? (
                    <div className={inputClass + ' bg-slate-200/90 dark:bg-slate-600/90 cursor-default opacity-90'}>{p.percDesconto || '0'}</div>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={p.percDesconto}
                      onChange={(e) => update(idx, 'percDesconto', e.target.value)}
                      className={inputClass}
                      placeholder="0"
                    />
                  )}
                </div>
                <div>
                  <label className={labelClass}>% ICMS</label>
                  {apenasVisualizacaoPrecos ? (
                    <div className={inputClass + ' bg-slate-200/90 dark:bg-slate-600/90 cursor-default opacity-90'}>{p.percICMS || '0'}</div>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={p.percICMS}
                      onChange={(e) => update(idx, 'percICMS', e.target.value)}
                      className={inputClass}
                      placeholder="0"
                    />
                  )}
                </div>
                <div>
                  <label className={labelClass}>% PIS</label>
                  {apenasVisualizacaoPrecos ? (
                    <div className={inputClass + ' bg-slate-200/90 dark:bg-slate-600/90 cursor-default opacity-90'}>{p.percPIS || '1,65'}</div>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={p.percPIS}
                      onChange={(e) => update(idx, 'percPIS', e.target.value)}
                      className={inputClass}
                      placeholder="1,65"
                    />
                  )}
                </div>
                <div>
                  <label className={labelClass}>% IPI</label>
                  {apenasVisualizacaoPrecos ? (
                    <div className={inputClass + ' bg-slate-200/90 dark:bg-slate-600/90 cursor-default opacity-90'}>{p.percIPI || '0'}</div>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={p.percIPI}
                      onChange={(e) => update(idx, 'percIPI', e.target.value)}
                      className={inputClass}
                      placeholder="0"
                    />
                  )}
                </div>
                <div>
                  <label className={labelClass}>% COFINS</label>
                  {apenasVisualizacaoPrecos ? (
                    <div className={inputClass + ' bg-slate-200/90 dark:bg-slate-600/90 cursor-default opacity-90'}>{p.percCOFINS || '7,60'}</div>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={p.percCOFINS}
                      onChange={(e) => update(idx, 'percCOFINS', e.target.value)}
                      className={inputClass}
                      placeholder="7,60"
                    />
                  )}
                </div>
                <div>
                  <label className={labelClass}>% Frete</label>
                  <div className={inputClass + ' bg-slate-100 dark:bg-slate-600 cursor-default' + (apenasVisualizacaoPrecos ? ' opacity-90' : '')}>
                    {p.valorFrete ? `${p.valorFrete} ${p.valorFreteTipo === '%' ? '%' : 'R$'}` : '—'}
                  </div>
                </div>
                {(() => {
                  const totais = precos.map((pr) => precoTotal(pr));
                  const minTotal = Math.min(...totais);
                  const temAlgumPreco = totais.some((t) => t > 0);
                  const isGanhador = temAlgumPreco && precoTotal(p) === minTotal;
                  return (
                    <div className="sm:col-start-2">
                      <label className={labelClass}>Preço Total</label>
                      <div className="flex w-full items-start gap-3 flex-wrap">
                        <div
                          title="Preço Base = Preço NF c/ IPI / (1+IPI). Total = Base - Base×(PIS+COFINS+ICMS)%; depois % desconto"
                          className={inputClass + ' bg-slate-100 dark:bg-slate-600 cursor-default font-medium shrink-0 w-24'}
                        >
                          {precoTotal(p).toFixed(2)}
                        </div>
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isGanhador && (
                              <div
                                className="inline-flex items-center gap-1.5 rounded-lg border-2 border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1.5 text-amber-800 dark:text-amber-200 animate-melhor-preco-in shrink-0"
                                title="Melhor preço no momento"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                  <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.5L5.7 21l2.3-7-6-4.6h7.6L12 2z" />
                                </svg>
                                <span className="text-xs font-semibold">Melhor preço</span>
                              </div>
                            )}
                            {custoUnitarioCompra != null && custoUnitarioCompra > 0 && (() => {
                              const total = precoTotal(p);
                              const variacaoPct = ((total - custoUnitarioCompra) / custoUnitarioCompra) * 100;
                              const maior = variacaoPct > 0;
                              const menor = variacaoPct < 0;
                              const texto = `${variacaoPct >= 0 ? '+' : ''}${variacaoPct.toFixed(1)}%`;
                              return (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium shrink-0 ${
                                    maior
                                      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                      : menor
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                        : 'bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
                                  }`}
                                  title={maior ? 'Preço acima do último de compra' : menor ? 'Preço abaixo do último de compra' : 'Mesmo preço'}
                                >
                                  {maior && (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                      <path d="M18 15l-6-6-6 6" />
                                    </svg>
                                  )}
                                  {menor && (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                      <path d="M6 9l6 6 6-6" />
                                    </svg>
                                  )}
                                  {!maior && !menor && (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                      <line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                  )}
                                  {texto}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-600 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-sm font-medium disabled:opacity-50"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={saving || loadingPrecos}
            className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Salvando…' : loadingPrecos ? 'Carregando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
