/**
 * Move "Aporte de investimento de sócios" (2.2.1, id 120) de Receitas Não Operacionais → Receitas Financeiras.
 * Uso: node scripts/patch-dfc-aporte-receitas-fin.cjs
 */
const fs = require('fs');
const path = require('path');

const ARVORE = path.join(__dirname, '../src/pages/financeiro/dfc/estruturaDfcArvore.json');
const MOVE_ID = 120;

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
if (!op || !fin) throw new Error('Raízes não encontradas.');
const rnao = op.children.find((c) => c.nome === 'Receitas Não Operacionais');
const rf = fin.children.find((c) => c.nome === 'Receitas Financeiras');
if (!rnao || !rf) throw new Error('Ramos RNAO ou Receitas Financeiras não encontrados.');
const idx = rnao.children.findIndex((c) => c.id === MOVE_ID);
if (idx < 0) throw new Error(`Conta id=${MOVE_ID} não está em Receitas Não Operacionais.`);
const node = JSON.parse(JSON.stringify(rnao.children[idx]));
remapMacro(node, 'FINANCIAMENTOS');
rnao.children.splice(idx, 1);
rf.children.push(node);

data.roots.forEach((r, i) => assignPathKeys(r, `M${i}`));
data.geradoEm = new Date().toISOString();
fs.writeFileSync(ARVORE, JSON.stringify(data, null, 0));
console.log('OK → Aporte de investimento de sócios em Receitas Financeiras');
