/**
 * Lê `Estrutura DFC.xlsx` (Desktop) e gera `src/pages/financeiro/dfc/estruturaDfcArvore.json`.
 * Colunas: id | nome | codigo | tipo (S/A). Hierarquia por ordem das linhas + regras de stack.
 * Uso: node scripts/build-estrutura-dfc-json.cjs
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DESK = 'C:/Users/Administrator/Desktop';
const FILE = 'Estrutura DFC.xlsx';
const OUT = path.join(__dirname, '../src/pages/financeiro/dfc/estruturaDfcArvore.json');

function norm(s) {
  return String(s ?? '')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function normId(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Sai do ramo de custo (3.x) sem desmontar o stack inteiro: estes S continuam sob CUSTO/CPV. */
const COST_CONTINUE_SYNTHETIC = new Set(
  [
    'Serviços Terceirizados de Produção',
    'Energia Elétrica',
    'Movimentação e Armazenagem',
    'CPV/CMV',
  ].map(norm)
);

/**
 * Antes de empilhar estes S, volta ao nó raiz do macro (irmão de CUSTO / fim de árvore profunda).
 * Não incluir subgrupos de administrativo (Prediais, Burocráticas, etc.) — ficam aninhados via S/A + linha em branco.
 */
const DRAIN_TO_MACRO_BEFORE_PUSH = new Set(
  [
    'Despesas com Pessoal',
    'Despesas Tributárias',
    'Despesas Operacionais Indiretas',
    'Despesas Logísticas',
    'Despesas Administrativas',
  ].map(norm)
);

function buildTree(rows) {
  let macro = 'OPERACIONAL';
  const roots = {
    OPERACIONAL: { nome: 'Fluxo Caixa Operacional', tipo: 'S', macro: 'OPERACIONAL', codigo: '', children: [] },
    FINANCIAMENTOS: { nome: 'Fluxo de Caixa Financeiro', tipo: 'S', macro: 'FINANCIAMENTOS', codigo: '', children: [] },
    INVESTIMENTOS: { nome: 'Fluxo de Caixa Investimentos', tipo: 'S', macro: 'INVESTIMENTOS', codigo: '', children: [] },
  };
  let stack = [roots.OPERACIONAL];
  let prevTipo = '';
  let lastCodigo = '';
  let blankRun = 0;
  for (let i = 1; i < rows.length; i++) {
    const idRaw = rows[i][0];
    const nome = norm(rows[i][1]);
    const codigo = norm(rows[i][2]);
    let tipo = norm(rows[i][3]).toUpperCase();
    if (nome && tipo !== 'S' && tipo !== 'A') {
      tipo = normId(idRaw) != null ? 'A' : 'S';
    }

    if (!nome && !tipo && normId(idRaw) == null) {
      blankRun++;
      continue;
    }

    if (/^fluxo de caixa financeiro/i.test(nome)) {
      macro = 'FINANCIAMENTOS';
      stack = [roots.FINANCIAMENTOS];
      prevTipo = '';
      blankRun = 0;
      continue;
    }
    if (/^fluxo de caixa\s+investimentos/i.test(nome)) {
      macro = 'INVESTIMENTOS';
      stack = [roots.INVESTIMENTOS];
      prevTipo = '';
      blankRun = 0;
      continue;
    }

    if (!tipo || (tipo !== 'S' && tipo !== 'A')) {
      blankRun = 0;
      continue;
    }

    const macroRoot = roots[macro];
    const id = normId(idRaw);

    if (tipo === 'S') {
      const nomeN = norm(nome);
      if (DRAIN_TO_MACRO_BEFORE_PUSH.has(nomeN)) {
        stack = [macroRoot];
      } else if (prevTipo === 'A') {
        const contCost =
          blankRun > 0 &&
          lastCodigo.startsWith('3.') &&
          COST_CONTINUE_SYNTHETIC.has(nomeN);
        if (!contCost && stack.length > 1) {
          stack.pop();
        }
      }

      const node = {
        id,
        nome: nomeN,
        tipo: 'S',
        macro,
        codigo,
        children: [],
      };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      prevTipo = 'S';
    } else {
      const node = {
        id,
        nome,
        tipo: 'A',
        macro,
        codigo,
        children: [],
      };
      stack[stack.length - 1].children.push(node);
      prevTipo = 'A';
    }

    if (codigo) lastCodigo = codigo;
    blankRun = 0;
  }

  return [roots.OPERACIONAL, roots.FINANCIAMENTOS, roots.INVESTIMENTOS];
}

function assignPathKeys(node, basePath) {
  node.pathKey = basePath;
  (node.children || []).forEach((ch, i) => assignPathKeys(ch, `${basePath}/${i}`));
}

/** Contas analíticas de transferência (plano Nomus) — raiz master OUTRAS na DFC. */
const IDS_TRANSFER_DFC = [166, 135, 165];

function stripTransferAnalytics(node) {
  if (!node.children) return;
  node.children = node.children.filter((ch) => {
    if (ch.tipo === 'A' && ch.id != null && IDS_TRANSFER_DFC.includes(ch.id)) return false;
    stripTransferAnalytics(ch);
    return true;
  });
}

function removeEmptySyntheticBranches(node) {
  if (!node.children) return;
  for (const ch of node.children) {
    removeEmptySyntheticBranches(ch);
  }
  node.children = node.children.filter(
    (ch) => !(ch.tipo === 'S' && (!ch.children || ch.children.length === 0))
  );
}

/** 4ª raiz da DFC (nível master), com transferências como analíticas. */
function injectOutrasMovimentacoesRoot(roots) {
  const planoPath = path.join(__dirname, '../src/pages/financeiro/dfc/planoContasAtivoDfc.json');
  if (!fs.existsSync(planoPath)) {
    console.warn('planoContasAtivoDfc.json não encontrado; skip Outras Movimentações.');
    return;
  }
  const plano = JSON.parse(fs.readFileSync(planoPath, 'utf8'));
  const inv = roots[2];
  if (inv && inv.macro === 'INVESTIMENTOS') {
    inv.children = (inv.children || []).filter((ch) => !/^Outras Moviment/i.test(ch.nome || ''));
  }
  for (let i = roots.length - 1; i >= 0; i--) {
    const r = roots[i];
    if (r.macro === 'OUTRAS' && /^Outras Moviment/i.test(r.nome || '')) roots.splice(i, 1);
  }
  const byId = Object.fromEntries(
    plano.filter((c) => IDS_TRANSFER_DFC.includes(c.id)).map((c) => [c.id, c])
  );
  const children = IDS_TRANSFER_DFC.map((id) => {
    const c = byId[id];
    if (!c) return null;
    return {
      id: c.id,
      nome: c.nome,
      tipo: 'A',
      macro: 'OUTRAS',
      codigo: c.classificacao,
      children: [],
    };
  }).filter(Boolean);
  roots.push({
    nome: 'Outras Movimentações',
    tipo: 'S',
    macro: 'OUTRAS',
    codigo: '',
    children,
  });
}

const xlsxPath = path.join(DESK, FILE);
if (!fs.existsSync(xlsxPath)) {
  console.error('Arquivo não encontrado:', xlsxPath);
  process.exit(1);
}
const wb = XLSX.readFile(xlsxPath);
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Planilha2'] || wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
const roots = buildTree(rows);
roots.forEach((r) => stripTransferAnalytics(r));
roots.forEach((r) => removeEmptySyntheticBranches(r));
injectOutrasMovimentacoesRoot(roots);
roots.forEach((r, i) => assignPathKeys(r, `M${i}`));
fs.writeFileSync(OUT, JSON.stringify({ versao: 1, geradoEm: new Date().toISOString(), roots }, null, 0));
console.log('OK →', OUT, 'macro roots', roots.map((r) => r.nome));
