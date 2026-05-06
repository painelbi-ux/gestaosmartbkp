/**
 * Move contas de "Receitas Não Operacionais" (operacional) para "Receitas Financeiras".
 * Regenerar pathKeys. Uso: node scripts/patch-dfc-move-para-receitas-financeiras.cjs
 *
 * Ordem pedida: 2.2.30, 2.2.4, 2.2.6, 2.2.7, 2.2.28
 */
const fs = require('fs');
const path = require('path');

const ARVORE = path.join(__dirname, '../src/pages/financeiro/dfc/estruturaDfcArvore.json');

/** id Nomus — conferir com planoContasAtivoDfc.json */
const MOVE_ORDER = [231, 234, 241, 125, 324];

function remapMacro(node, macro) {
  node.macro = macro;
  (node.children || []).forEach((c) => remapMacro(c, macro));
}

function assignPathKeys(node, basePath) {
  node.pathKey = basePath;
  (node.children || []).forEach((ch, i) => assignPathKeys(ch, `${basePath}/${i}`));
}

const data = JSON.parse(fs.readFileSync(ARVORE, 'utf8'));
const op = data.roots.find((r) => r.macro === 'OPERACIONAL');
const fin = data.roots.find((r) => r.macro === 'FINANCIAMENTOS');
if (!op || !fin) throw new Error('Raízes OPERACIONAL/FINANCIAMENTOS não encontradas.');
const rnao = op.children.find((c) => c.nome === 'Receitas Não Operacionais');
const rf = fin.children.find((c) => c.nome === 'Receitas Financeiras');
if (!rnao || !rf) throw new Error('Receitas Não Operacionais ou Receitas Financeiras não encontradas.');

const moveSet = new Set(MOVE_ORDER);
const toAppend = [];
for (const id of MOVE_ORDER) {
  const idx = rnao.children.findIndex((c) => c.id === id);
  if (idx < 0) throw new Error(`Conta id=${id} não está em Receitas Não Operacionais.`);
  const node = JSON.parse(JSON.stringify(rnao.children[idx]));
  remapMacro(node, 'FINANCIAMENTOS');
  toAppend.push(node);
}
rnao.children = rnao.children.filter((c) => !moveSet.has(c.id));
rf.children = [...rf.children, ...toAppend];

data.roots.forEach((r, i) => assignPathKeys(r, `M${i}`));
data.geradoEm = new Date().toISOString();
fs.writeFileSync(ARVORE, JSON.stringify(data, null, 0));
console.log('OK →', ARVORE, 'movidas:', MOVE_ORDER.join(', '));
