/**
 * Tradução do plano (contafinanceiro.classificacao) para os três fluxos da DFC (CPC 03 / prática usual).
 * Baseado na exportação do Nomus (atualizado mai/2026 — nova estrutura do plano de contas Só Aço).
 *
 * Nova estrutura de raízes:
 *  1  RECEITAS (operacional)
 *  2  RECEITAS NÃO OPERACIONAIS (maioria operacional; 2.7 → investimentos)
 *  3  CUSTO (operacional)
 *  4  DESPESAS OPERACIONAIS (operacional)
 *  5  DESPESAS ADMINISTRATIVAS (operacional)
 *  6  DESPESAS COMERCIAIS (operacional)
 *  7  SERVIÇOS TERCEIRIZADOS (operacional)
 *  8  RESULTADO FINANCEIRO (misto — ver prefixos específicos)
 *  9  IMPOSTOS SOBRE O LUCRO (operacional)
 * 10  DISTRIBUIÇÃO DE LUCROS (financiamentos)
 * 11  CAPEX (investimentos)
 * 12  ENDIVIDAMENTO (misto — bancário → financiamentos; fiscal/trabalhista → operacional)
 * 13  OUTRAS MOVIMENTAÇÕES (transferências → revisar manualmente)
 * 14  MOVIMENTAÇÕES DE RECEBÍVEIS (operacional)
 * 15  OUTRAS RECUPERAÇÕES (operacional)
 * 16  ESTORNOS E DEVOLUÇÕES (operacional)
 *
 * Observações:
 * - Ramo 1.2 (deduções da receita) fica fora da árvore DFC.
 * - 8.1.1–8.1.3 (captações/empréstimos) → financiamentos
 * - 8.1.5–8.1.6 (juros auferidos, rendimento aplicações) → investimentos
 * - 8.2.4–8.2.5 (principal e juros de empréstimos) → financiamentos
 * - 8.2 demais (tarifas, IOF, juros mora) → operacional
 * - 12.1–12.2 (dívida bancária principal e juros) → financiamentos
 * - 12.3–12.9 (dívidas diversas / NCG) → operacional
 * - 13.2, 13.3, 13.5 (transferências inter-empresa / conta) → revisar manualmente
 */

export type DfcFluxo = 'OPERACIONAL' | 'INVESTIMENTOS' | 'FINANCIAMENTOS';

export type DfcFluxoComAlerta = DfcFluxo | 'REVISAR_MANUAL';

export const ROTULO_FLUXO: Record<DfcFluxoComAlerta, string> = {
  OPERACIONAL: 'Operacional',
  INVESTIMENTOS: 'Investimentos',
  FINANCIAMENTOS: 'Financiamentos',
  REVISAR_MANUAL: 'Revisar manualmente',
};

/** Prefixos completos de classificação com fluxo explícito. A comparação usa o prefixo mais longo que casa. */
const PREFIXO_PARA_FLUXO_RAW: { prefix: string; fluxo: DfcFluxoComAlerta }[] = [
  // ── INVESTIMENTOS ──────────────────────────────────────────────
  { prefix: '11', fluxo: 'INVESTIMENTOS' },      // CAPEX inteiro
  { prefix: '2.7', fluxo: 'INVESTIMENTOS' },     // Venda de imobilizado
  { prefix: '8.1.5', fluxo: 'INVESTIMENTOS' },   // Juros Auferidos
  { prefix: '8.1.6', fluxo: 'INVESTIMENTOS' },   // Rendimento de Aplicações Financeiras

  // ── FINANCIAMENTOS ─────────────────────────────────────────────
  { prefix: '10', fluxo: 'FINANCIAMENTOS' },     // Distribuição de Lucros
  { prefix: '8.1.1', fluxo: 'FINANCIAMENTOS' },  // Captações de Empréstimos e Financiamentos
  { prefix: '8.1.2', fluxo: 'FINANCIAMENTOS' },  // Empréstimos de Sócios
  { prefix: '8.1.3', fluxo: 'FINANCIAMENTOS' },  // Captações de Empréstimos de Sócios
  { prefix: '8.1.7', fluxo: 'FINANCIAMENTOS' },  // Crédito de Conta Garantida
  { prefix: '8.2.4', fluxo: 'FINANCIAMENTOS' },  // Principal de Empréstimos e Financiamentos
  { prefix: '8.2.5', fluxo: 'FINANCIAMENTOS' },  // Juros de Empréstimos e Financiamentos
  { prefix: '12.1', fluxo: 'FINANCIAMENTOS' },   // Dívida Bancária Principal
  { prefix: '12.2', fluxo: 'FINANCIAMENTOS' },   // Dívida Bancária Juros

  // ── OPERACIONAL (exceções dentro de raízes mistas) ─────────────
  { prefix: '8.1.4', fluxo: 'OPERACIONAL' },     // Descontos Obtidos
  { prefix: '8.1.8', fluxo: 'OPERACIONAL' },     // Recebimento de Crédito de Consórcios
  { prefix: '12.3', fluxo: 'OPERACIONAL' },      // Dívida Clientes
  { prefix: '12.4', fluxo: 'OPERACIONAL' },      // Dívida Estadual
  { prefix: '12.5', fluxo: 'OPERACIONAL' },      // Dívida Federal
  { prefix: '12.6', fluxo: 'OPERACIONAL' },      // Dívida Fornecedores - Principal
  { prefix: '12.7', fluxo: 'OPERACIONAL' },      // Dívida Fornecedores - Juros
  { prefix: '12.8', fluxo: 'OPERACIONAL' },      // Dívida Municipal
  { prefix: '12.9', fluxo: 'OPERACIONAL' },      // Dívida Trabalhista

  // ── REVISAR MANUALMENTE ────────────────────────────────────────
  { prefix: '13.2', fluxo: 'REVISAR_MANUAL' },   // Transferências entre Empresas - Crédito
  { prefix: '13.3', fluxo: 'REVISAR_MANUAL' },   // Transferências entre Empresas - Débito
  { prefix: '13.5', fluxo: 'REVISAR_MANUAL' },   // Transferências
];

const PREFIXO_PARA_FLUXO = [...PREFIXO_PARA_FLUXO_RAW].sort(
  (a, b) => b.prefix.length - a.prefix.length || b.prefix.localeCompare(a.prefix, undefined, { numeric: true })
);

/** `classificacao` está na subárvore de `prefix` (igual ou filho), por segmentos — evita 2.7.1 casar com 2.7. */
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
  '1': 'OPERACIONAL',      // RECEITAS
  '2': 'OPERACIONAL',      // RECEITAS NÃO OPERACIONAIS (exceto 2.7 → invest.)
  '3': 'OPERACIONAL',      // CUSTO
  '4': 'OPERACIONAL',      // DESPESAS OPERACIONAIS
  '5': 'OPERACIONAL',      // DESPESAS ADMINISTRATIVAS
  '6': 'OPERACIONAL',      // DESPESAS COMERCIAIS
  '7': 'OPERACIONAL',      // SERVIÇOS TERCEIRIZADOS
  '8': 'OPERACIONAL',      // RESULTADO FINANCEIRO (default; exceções por prefixo)
  '9': 'OPERACIONAL',      // IMPOSTOS SOBRE O LUCRO
  '10': 'FINANCIAMENTOS',  // DISTRIBUIÇÃO DE LUCROS
  '11': 'INVESTIMENTOS',   // CAPEX
  '12': 'FINANCIAMENTOS',  // ENDIVIDAMENTO (default bancário; exceções por prefixo)
  '13': 'OPERACIONAL',     // OUTRAS MOVIMENTAÇÕES (ajustes/transações)
  '14': 'OPERACIONAL',     // MOVIMENTAÇÕES DE RECEBÍVEIS
  '15': 'OPERACIONAL',     // OUTRAS RECUPERAÇÕES
  '16': 'OPERACIONAL',     // ESTORNOS E DEVOLUÇÕES
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
 * Quando não houver regra específica, usa o primeiro nível numérico da árvore (ex.: "4" → operacional).
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

/** Resumo das árvores de 1º nível do plano (rótulo → fluxo predominante). */
export const RESUMO_ARVORE_RAIZ: { classificacao: string; titulo: string; predominante: DfcFluxoComAlerta; nota?: string }[] =
  [
    { classificacao: '1', titulo: 'RECEITAS', predominante: 'OPERACIONAL' },
    {
      classificacao: '2',
      titulo: 'RECEITAS NÃO OPERACIONAIS',
      predominante: 'OPERACIONAL',
      nota: 'Venda de imobilizado (2.7) → investimentos.',
    },
    { classificacao: '3', titulo: 'CUSTO', predominante: 'OPERACIONAL' },
    { classificacao: '4', titulo: 'DESPESAS OPERACIONAIS', predominante: 'OPERACIONAL' },
    { classificacao: '5', titulo: 'DESPESAS ADMINISTRATIVAS', predominante: 'OPERACIONAL' },
    { classificacao: '6', titulo: 'DESPESAS COMERCIAIS', predominante: 'OPERACIONAL' },
    { classificacao: '7', titulo: 'SERVIÇOS TERCEIRIZADOS', predominante: 'OPERACIONAL' },
    {
      classificacao: '8',
      titulo: 'RESULTADO FINANCEIRO',
      predominante: 'OPERACIONAL',
      nota: '8.1.1–8.1.3 captações → financiamentos; 8.1.5–8.1.6 rendimentos → investimentos; 8.2.4–8.2.5 amort./juros empréstimos → financiamentos.',
    },
    { classificacao: '9', titulo: 'IMPOSTOS SOBRE O LUCRO', predominante: 'OPERACIONAL' },
    { classificacao: '10', titulo: 'DISTRIBUIÇÃO DE LUCROS', predominante: 'FINANCIAMENTOS' },
    { classificacao: '11', titulo: 'CAPEX', predominante: 'INVESTIMENTOS' },
    {
      classificacao: '12',
      titulo: 'ENDIVIDAMENTO',
      predominante: 'FINANCIAMENTOS',
      nota: '12.1–12.2 dívida bancária → financiamentos; 12.3–12.9 dívidas diversas (NCG) → operacional.',
    },
    {
      classificacao: '13',
      titulo: 'OUTRAS MOVIMENTAÇÕES',
      predominante: 'OPERACIONAL',
      nota: 'Transferências inter-empresa (13.2, 13.3, 13.5) → revisar manualmente.',
    },
    { classificacao: '14', titulo: 'MOVIMENTAÇÕES DE RECEBÍVEIS', predominante: 'OPERACIONAL' },
    { classificacao: '15', titulo: 'OUTRAS RECUPERAÇÕES', predominante: 'OPERACIONAL' },
    { classificacao: '16', titulo: 'ESTORNOS E DEVOLUÇÕES', predominante: 'OPERACIONAL' },
  ];
