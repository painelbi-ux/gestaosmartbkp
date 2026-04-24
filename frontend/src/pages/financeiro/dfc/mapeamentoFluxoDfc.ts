/**
 * Tradução do plano (contafinanceiro.classificacao) para os três fluxos da DFC (CPC 03 / prática usual).
 * Baseado na exportação do SQL + planilha "Plano de Contas Só Aço" (árvores 1–10, 47, 63, 101).
 *
 * Observações:
 * - Juros recebidos/pagos: no CPC 03 a entidade pode classificar em operacional ou financiamento; aqui
 *   juros de empréstimos bancários (8.1.14/19) vão para FINANCIAMENTOS; demais 6.2 (taxas, IOF, etc.) em OPERACIONAL.
 * - Contas 8.1.4–9 e 8.1.7 tratadas como obrigações / NCG típico → OPERACIONAL (variação de capital de giro).
 * - Ajuste fino por id pode ser acrescentado em EXCECOES_POR_ID se o SQL trouxer casos especiais.
 * - Ramo 1.2 (deduções da receita) e filhas ficam fora da árvore DFC — não entram no fluxo de caixa deste relatório.
 */

export type DfcFluxo = 'OPERACIONAL' | 'INVESTIMENTOS' | 'FINANCIAMENTOS';

export type DfcFluxoComAlerta = DfcFluxo | 'REVISAR_MANUAL';

export const ROTULO_FLUXO: Record<DfcFluxoComAlerta, string> = {
  OPERACIONAL: 'Operacional',
  INVESTIMENTOS: 'Investimentos',
  FINANCIAMENTOS: 'Financiamentos',
  REVISAR_MANUAL: 'Revisar manualmente',
};

/** Prefixos completos de classificação com fluxo explícito. A comparação usa o prefixo mais longo que casa (evita 2.2.29 cair em 2.2.2). */
const PREFIXO_PARA_FLUXO_RAW: { prefix: string; fluxo: DfcFluxoComAlerta }[] = [
  { prefix: '101', fluxo: 'INVESTIMENTOS' },
  { prefix: '63', fluxo: 'FINANCIAMENTOS' },
  { prefix: '7.', fluxo: 'INVESTIMENTOS' },
  { prefix: '7', fluxo: 'INVESTIMENTOS' },
  { prefix: '2.2.3', fluxo: 'INVESTIMENTOS' },
  { prefix: '2.2.7', fluxo: 'INVESTIMENTOS' },
  { prefix: '2.2.1', fluxo: 'FINANCIAMENTOS' },
  { prefix: '2.2.2', fluxo: 'FINANCIAMENTOS' },
  { prefix: '2.2.9', fluxo: 'FINANCIAMENTOS' },
  { prefix: '2.2.25', fluxo: 'FINANCIAMENTOS' },
  { prefix: '2.2.26', fluxo: 'FINANCIAMENTOS' },
  { prefix: '2.2.28', fluxo: 'FINANCIAMENTOS' },
  { prefix: '2.2.29', fluxo: 'FINANCIAMENTOS' },
  { prefix: '6.1.7', fluxo: 'INVESTIMENTOS' },
  { prefix: '6.1.9', fluxo: 'INVESTIMENTOS' },
  { prefix: '6.1.10', fluxo: 'FINANCIAMENTOS' },
  { prefix: '8.1.3', fluxo: 'FINANCIAMENTOS' },
  { prefix: '8.1.10', fluxo: 'FINANCIAMENTOS' },
  { prefix: '8.1.13', fluxo: 'FINANCIAMENTOS' },
  { prefix: '8.1.14', fluxo: 'FINANCIAMENTOS' },
  { prefix: '8.1.15', fluxo: 'FINANCIAMENTOS' },
  { prefix: '8.1.19', fluxo: 'FINANCIAMENTOS' },
  { prefix: '8.1.4', fluxo: 'OPERACIONAL' },
  { prefix: '8.1.5', fluxo: 'OPERACIONAL' },
  { prefix: '8.1.6', fluxo: 'OPERACIONAL' },
  { prefix: '8.1.7', fluxo: 'OPERACIONAL' },
  { prefix: '8.1.8', fluxo: 'OPERACIONAL' },
  { prefix: '8.1.9', fluxo: 'OPERACIONAL' },
  { prefix: '8.1.11', fluxo: 'OPERACIONAL' },
  { prefix: '8.1.18', fluxo: 'OPERACIONAL' },
  { prefix: '6.1.5', fluxo: 'REVISAR_MANUAL' },
];

const PREFIXO_PARA_FLUXO = [...PREFIXO_PARA_FLUXO_RAW].sort(
  (a, b) => b.prefix.length - a.prefix.length || b.prefix.localeCompare(a.prefix, undefined, { numeric: true })
);

/** `classificacao` está na subárvore de `prefix` (igual ou filho), por segmentos — evita 2.2.29 casar com 2.2.2. */
export function classificacaoSobPrefixo(classificacao: string, prefix: string): boolean {
  const cSeg = classificacao.split('.').filter(Boolean);
  const pSeg = prefix.split('.').filter(Boolean);
  if (pSeg.length === 0) return false;
  if (cSeg.length < pSeg.length) return false;
  for (let i = 0; i < pSeg.length; i++) {
    if (cSeg[i] !== pSeg[i]) return false;
  }
  return true;
}

const RAIZ_DEFAULT: Record<string, DfcFluxoComAlerta> = {
  '1': 'OPERACIONAL',
  '2': 'OPERACIONAL',
  '3': 'OPERACIONAL',
  '4': 'OPERACIONAL',
  '5': 'OPERACIONAL',
  '6': 'OPERACIONAL',
  '7': 'INVESTIMENTOS',
  '8': 'FINANCIAMENTOS',
  '9': 'OPERACIONAL',
  '10': 'OPERACIONAL',
  '47': 'OPERACIONAL',
  '63': 'FINANCIAMENTOS',
  '101': 'INVESTIMENTOS',
};

/** Sobrescreve por id da contafinanceiro quando a classificação não bastar. */
export const EXCECOES_POR_ID: Record<number, DfcFluxoComAlerta> = {};

function normalizarClassificacao(classificacao: string | number | null | undefined): string {
  return String(classificacao ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\.+$/, '');
}

/** Classificações (e toda a subárvore) que não entram na DFC / árvore do relatório. */
const CLASSIFICACOES_EXCLUIDAS_ARVORE_DFC: readonly string[] = ['1.2'];

export function classificacaoExcluidaDaArvoreDfc(classificacao: string | number | null | undefined): boolean {
  const c = normalizarClassificacao(classificacao);
  if (!c) return true;
  return CLASSIFICACOES_EXCLUIDAS_ARVORE_DFC.some((prefix) => classificacaoSobPrefixo(c, prefix));
}

/**
 * Retorna o fluxo sugerido para a DFC a partir de `classificacao` (ex.: "4.6.12").
 * Quando não houver regra específica, usa o primeiro nível numérico da árvore (ex.: "4" → Despesas operacionais).
 */
export function sugerirFluxoDfcPorClassificacao(classificacao: string | number | null | undefined): DfcFluxoComAlerta {
  const c = normalizarClassificacao(classificacao);
  if (!c) return 'REVISAR_MANUAL';

  for (const { prefix, fluxo } of PREFIXO_PARA_FLUXO) {
    if (classificacaoSobPrefixo(c, prefix)) return fluxo;
  }

  const raiz = c.split('.')[0] ?? '';
  const d = RAIZ_DEFAULT[raiz];
  if (d) return d;

  return 'REVISAR_MANUAL';
}

export function sugerirFluxoDfcConta(conta: {
  id: number;
  classificacao: string | number | null | undefined;
}): DfcFluxoComAlerta {
  const porId = EXCECOES_POR_ID[conta.id];
  if (porId) return porId;
  return sugerirFluxoDfcPorClassificacao(conta.classificacao);
}

/** Resumo das árvores de 1º nível do plano analisado (rótulo → fluxo predominante). */
export const RESUMO_ARVORE_RAIZ: { classificacao: string; titulo: string; predominante: DfcFluxoComAlerta; nota?: string }[] =
  [
    { classificacao: '1', titulo: 'RECEITAS', predominante: 'OPERACIONAL' },
    {
      classificacao: '2',
      titulo: 'RECEITAS NÃO OPERACIONAIS',
      predominante: 'OPERACIONAL',
      nota: 'Misto: aportes/captações/distribuição e títulos → financ.; venda imobilizado e rendimento de aplicação → invest.',
    },
    { classificacao: '3', titulo: 'CUSTO (CMV/CPV)', predominante: 'OPERACIONAL' },
    { classificacao: '4', titulo: 'DESPESAS OPERACIONAIS', predominante: 'OPERACIONAL' },
    { classificacao: '5', titulo: 'DESPESAS TRIBUTÁRIAS', predominante: 'OPERACIONAL' },
    {
      classificacao: '6',
      titulo: 'DESPESAS NÃO OPERACIONAIS / FINANCEIRAS',
      predominante: 'OPERACIONAL',
      nota: '6.2 em geral operacional (taxas bancárias, cartão, IOF); 6.1.7/9 invest.; 6.1.10 finan.',
    },
    { classificacao: '7', titulo: 'CAPEX', predominante: 'INVESTIMENTOS' },
    {
      classificacao: '8',
      titulo: 'ENDIVIDAMENTO',
      predominante: 'FINANCIAMENTOS',
      nota: 'Exceções operacionais: dívidas fiscais/trabalhistas/fornecedores/clientes (NCG).',
    },
    { classificacao: '9', titulo: 'OUTRAS MOVIMENTAÇÕES', predominante: 'OPERACIONAL' },
    { classificacao: '10', titulo: 'Ajustes (fazendas / devoluções)', predominante: 'OPERACIONAL' },
    { classificacao: '47', titulo: 'Tarifas (custódia)', predominante: 'OPERACIONAL' },
    { classificacao: '63', titulo: 'Retirada não identificada', predominante: 'FINANCIAMENTOS' },
    { classificacao: '101', titulo: 'Investimento em aplicações financeiras', predominante: 'INVESTIMENTOS' },
  ];
