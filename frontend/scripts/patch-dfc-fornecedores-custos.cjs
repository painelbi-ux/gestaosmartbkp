/**
 * DFC — ramo 3.x (ex-Custos):
 * - Conta mãe "Custos" → "Fornecedores"
 * - "CMV" → "Fornecedores Revenda"
 * - "CPV" → "Fornecedores Matéria Prima"
 * - Move "Prestador de serviços - Custo" (3.2.4, id 254) para dentro de "Serviços Terceirizados de Produção" (sintética).
 *
 * Uso: node scripts/patch-dfc-fornecedores-custos.cjs
 */
const fs = require('fs');
const path = require('path');

const ARVORE = path.join(__dirname, '../src/pages/financeiro/dfc/estruturaDfcArvore.json');

const ID_CUSTOS = 223;
const ID_CMV = 230;
const ID_CPV = 232;
const ID_PRESTADOR_CUSTO = 254;

function assignPathKeys(node, basePath) {
  node.pathKey = basePath;
  (node.children || []).forEach((ch, i) => assignPathKeys(ch, `${basePath}/${i}`));
}

const data = JSON.parse(fs.readFileSync(ARVORE, 'utf8'));
const op = data.roots.find((r) => r.macro === 'OPERACIONAL');
if (!op) throw new Error('Raiz OPERACIONAL não encontrada.');

const custos = op.children.find((c) => c.id === ID_CUSTOS);
if (!custos) throw new Error('Nó id 223 (ex-Custos) não encontrado.');
custos.nome = 'Fornecedores';

const cmv = custos.children.find((c) => c.id === ID_CMV);
const cpv = custos.children.find((c) => c.id === ID_CPV);
if (!cmv || !cpv) throw new Error('CMV (230) ou CPV (232) não encontrados.');
cmv.nome = 'Fornecedores Revenda';
cpv.nome = 'Fornecedores Matéria Prima';

const servSynth = cpv.children.find(
  (c) => c.tipo === 'S' && c.nome === 'Serviços Terceirizados de Produção'
);
if (!servSynth) throw new Error('Sintética "Serviços Terceirizados de Produção" não encontrada sob CPV.');

function treeHasId(node, id) {
  if (node.id === id) return true;
  return (node.children || []).some((c) => treeHasId(c, id));
}

const idxPrest = cpv.children.findIndex((c) => c.id === ID_PRESTADOR_CUSTO);
if (idxPrest >= 0) {
  const [prestNode] = cpv.children.splice(idxPrest, 1);
  servSynth.children.unshift(prestNode);
} else if (!treeHasId(servSynth, ID_PRESTADOR_CUSTO)) {
  throw new Error('Prestador de serviços - Custo (id 254) não encontrado.');
}

data.roots.forEach((r, i) => assignPathKeys(r, `M${i}`));
data.geradoEm = new Date().toISOString();
fs.writeFileSync(ARVORE, JSON.stringify(data, null, 0));
console.log('OK → Fornecedores / renomes CMV·CPV / 254 movido para Serviços Terceirizados');
