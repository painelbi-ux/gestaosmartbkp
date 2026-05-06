/**
 * Move "Recompra de Título" (2.2.26, id 323) de Receitas Não Operacionais → Despesas Financeiras.
 * Uso: node scripts/patch-dfc-recompra-despesas-fin.cjs
 */
const fs = require('fs');
const path = require('path');

const ARVORE = path.join(__dirname, '../src/pages/financeiro/dfc/estruturaDfcArvore.json');
const MOVE_ID = 323;

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
const df = fin.children.find((c) => c.nome === 'Despesas Financeiras');
if (!rnao || !df) throw new Error('Ramos RNAO ou Despesas Financeiras não encontrados.');
const idx = rnao.children.findIndex((c) => c.id === MOVE_ID);
if (idx < 0) throw new Error(`Conta id=${MOVE_ID} não está em Receitas Não Operacionais.`);
const node = JSON.parse(JSON.stringify(rnao.children[idx]));
remapMacro(node, 'FINANCIAMENTOS');
rnao.children.splice(idx, 1);
df.children.push(node);

data.roots.forEach((r, i) => assignPathKeys(r, `M${i}`));
data.geradoEm = new Date().toISOString();
fs.writeFileSync(ARVORE, JSON.stringify(data, null, 0));
console.log('OK → Recompra de Título em Despesas Financeiras');
