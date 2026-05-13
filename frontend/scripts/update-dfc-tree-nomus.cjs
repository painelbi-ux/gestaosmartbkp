/**
 * Atualiza estruturaDfcArvore.json com dados atuais do Nomus:
 * 1. Renomeia contas (pelo id) para o nome atual do plano
 * 2. Adiciona novas contas analiticas nos locais corretos da arvore
 * 3. Reatribui pathKeys
 */
const fs = require('fs');
const path = require('path');

const ARV_PATH = path.join(__dirname, '../src/pages/financeiro/dfc/estruturaDfcArvore.json');
const PLANO_PATH = path.join(__dirname, '../src/pages/financeiro/dfc/planoContasAtivoDfc.json');

const plano = JSON.parse(fs.readFileSync(PLANO_PATH, 'utf8'));
const arvore = JSON.parse(fs.readFileSync(ARV_PATH, 'utf8'));

// Mapa id -> { nome, classificacao }
const porId = {};
for (const c of plano) porId[c.id] = c;

// --- STEP 1: Coletar IDs ja na arvore ---
const idsNaArvore = new Set();
function coletarIds(node) {
  if (node.id != null) idsNaArvore.add(node.id);
  for (const ch of (node.children || [])) coletarIds(ch);
}
for (const root of arvore.roots) coletarIds(root);

// --- STEP 2: Atualizar nomes ---
let renCount = 0;
function renomearArvore(node) {
  if (node.id != null && porId[node.id]) {
    const novoNome = porId[node.id].nome;
    if (node.nome !== novoNome) {
      console.log(`  Renomear id=${node.id}: "${node.nome}" -> "${novoNome}"`);
      node.nome = novoNome;
      renCount++;
    }
  }
  for (const ch of (node.children || [])) renomearArvore(ch);
}
for (const root of arvore.roots) renomearArvore(root);
console.log(`Renomeados: ${renCount}`);

// --- STEP 3: Adicionar novas contas ---
// Helper para criar no analitico
function noA(id, nome, macro, codigo) {
  return { id, nome, tipo: 'A', macro, codigo: codigo || '', children: [] };
}
// Helper para criar no sintetico
function noS(id, nome, macro, children) {
  return { id: id || null, nome, tipo: 'S', macro, codigo: '', children };
}

// Encontrar no por pathKey
function findByPathKey(roots, pk) {
  function search(node) {
    if (node.pathKey === pk) return node;
    for (const ch of (node.children || [])) {
      const r = search(ch); if (r) return r;
    }
    return null;
  }
  for (const root of roots) {
    const r = search(root); if (r) return r;
  }
  return null;
}

// Encontrar no pela condicao
function findBy(roots, fn) {
  function search(node) {
    if (fn(node)) return node;
    for (const ch of (node.children || [])) {
      const r = search(ch); if (r) return r;
    }
    return null;
  }
  for (const root of roots) {
    const r = search(root); if (r) return r;
  }
  return null;
}

function addIfNotPresent(parent, node) {
  if (!idsNaArvore.has(node.id)) {
    parent.children.push(node);
    idsNaArvore.add(node.id);
    console.log(`  Adicionado id=${node.id} "${node.nome}" -> "${parent.nome}"`);
  }
}

// ===== M0 - OPERACIONAL =====

// Gastos com Pessoal Operacao (M0/4/0)
const pessoalOp = findBy(arvore.roots, n => n.nome === 'Gastos com Pessoal Opera\u00e7\u00e3o');
if (pessoalOp) {
  // id=39 Ferias Operacional
  if (!idsNaArvore.has(39)) addIfNotPresent(pessoalOp, noA(39, 'F\u00e9rias - Operacional', 'OPERACIONAL', '4.2.2'));
  // id=413 13o Salario Operacional (novo)
  if (!idsNaArvore.has(413)) addIfNotPresent(pessoalOp, noA(413, '13\u00ba Sal\u00e1rio - Operacional', 'OPERACIONAL', '4.2.3'));
} else {
  console.warn('  ATENCAO: nao encontrei "Gastos com Pessoal Operacao"');
}

// Gastos com Pessoal Logistica (M0/4/4)
const pessoalLog = findBy(arvore.roots, n => n.nome === 'Gastos com Pessoal Log\u00edstica');
if (pessoalLog) {
  if (!idsNaArvore.has(414)) addIfNotPresent(pessoalLog, noA(414, '13\u00ba Sal\u00e1rio - Log\u00edstica', 'OPERACIONAL', '4.8.1.2'));
} else {
  console.warn('  ATENCAO: nao encontrei "Gastos com Pessoal Logistica"');
}

// Gastos com Pessoal Administrativo (M0/4/5)
const pessoalAdm = findBy(arvore.roots, n => n.nome === 'Gastos com Pessoal Administrativo');
if (pessoalAdm) {
  if (!idsNaArvore.has(38)) addIfNotPresent(pessoalAdm, noA(38, '13\u00ba Sal\u00e1rio', 'OPERACIONAL', '5.1.3'));
  if (!idsNaArvore.has(388)) addIfNotPresent(pessoalAdm, noA(388, 'F\u00e9rias - Administrativa', 'OPERACIONAL', '5.1.4'));
  if (!idsNaArvore.has(43)) addIfNotPresent(pessoalAdm, noA(43, 'FGTS', 'OPERACIONAL', '5.1.6'));
  if (!idsNaArvore.has(308)) addIfNotPresent(pessoalAdm, noA(308, 'INSS', 'OPERACIONAL', '5.1.7'));
} else {
  console.warn('  ATENCAO: nao encontrei "Gastos com Pessoal Administrativo"');
}

// Demais (M0/8/8)
const demais = findBy(arvore.roots, n => n.nome === 'Demais' && n.macro === 'OPERACIONAL');
if (demais) {
  if (!idsNaArvore.has(277)) addIfNotPresent(demais, noA(277, 'A\u00e7\u00f5es Sociais', 'OPERACIONAL', '5.12.3'));
} else {
  console.warn('  ATENCAO: nao encontrei "Demais" (OPERACIONAL)');
}

// Distribuicao de Lucros (M0/8/13/5)
const distLucros = findBy(arvore.roots, n => n.id === 325 && n.tipo === 'S');
if (distLucros) {
  if (!idsNaArvore.has(415)) addIfNotPresent(distLucros, noA(415, 'PLR', 'OPERACIONAL', '10.1'));
} else {
  console.warn('  ATENCAO: nao encontrei "Distribuicao de Lucros" (S, id=325)');
}

// ISS s/vendas (M0/5/0 - Impostos sob Vendas)
const impVendas = findBy(arvore.roots, n => n.nome === 'Impostos sob Vendas' && n.tipo === 'S');
if (impVendas) {
  if (!idsNaArvore.has(10)) addIfNotPresent(impVendas, noA(10, 'ISS s/vendas', 'OPERACIONAL', '1.3.11'));
} else {
  console.warn('  ATENCAO: nao encontrei "Impostos sob Vendas"');
}

// Receitas Nao Operacionais (M0/2, id=220) - adicionar novas contas operacionais
const recNaoOp = findBy(arvore.roots, n => n.id === 220 && n.tipo === 'S');
if (recNaoOp) {
  const contas2 = [
    { id: 396, nome: 'Venda de Sucatas', codigo: '2.1' },
    { id: 406, nome: 'Venda de Materiais Obsoletos', codigo: '2.2' },
    { id: 407, nome: 'Cr\u00e9ditos Fiscais Recuperados', codigo: '2.3' },
    { id: 403, nome: 'Cr\u00e9ditos de Desbloqueios Judiciais', codigo: '2.4' },
    { id: 408, nome: 'Indeniza\u00e7\u00f5es Recebidas', codigo: '2.5' },
    { id: 409, nome: 'Multas Contratuais Recebidas', codigo: '2.6' },
    { id: 401, nome: 'Recebimento de Impostos a Recolher', codigo: '14.4' },
    { id: 402, nome: 'Pagamentos de Clientes a Maior', codigo: '14.5' },
    { id: 456, nome: 'Lan\u00e7amento de Cr\u00e9dito de Cliente', codigo: '9.1.2' },
    { id: 182, nome: 'Reten\u00e7\u00f5es Sobre Servi\u00e7os Tomados', codigo: '15.2' },
  ];
  for (const c of contas2) {
    if (!idsNaArvore.has(c.id)) addIfNotPresent(recNaoOp, noA(c.id, c.nome, 'OPERACIONAL', c.codigo));
  }
} else {
  console.warn('  ATENCAO: nao encontrei Receitas Nao Operacionais (id=220)');
}

// Devolucoes (M0/1) - adicionar estornos e devolucoes
const devolucoes = findBy(arvore.roots, n => n.nome === 'Devolu\u00e7\u00f5es' && n.tipo === 'S');
if (devolucoes) {
  const estornos = [
    { id: 397, nome: 'Estorno ou Devolu\u00e7\u00e3o de Adiantamento de Rota', codigo: '16.1' },
    { id: 398, nome: 'Estorno ou Devolu\u00e7\u00e3o de Pagamento Indevido a Colaboradores', codigo: '16.2' },
    { id: 399, nome: 'Estorno ou Devolu\u00e7\u00e3o de Clientes', codigo: '16.3' },
    { id: 400, nome: 'Estorno ou Devolu\u00e7\u00e3o de Fornecedores', codigo: '16.4' },
  ];
  for (const c of estornos) {
    if (!idsNaArvore.has(c.id)) addIfNotPresent(devolucoes, noA(c.id, c.nome, 'OPERACIONAL', c.codigo));
  }
} else {
  console.warn('  ATENCAO: nao encontrei "Devolucoes" (S)');
}

// ===== M1 - FINANCIAMENTOS =====

// Receitas Financeiras (M1/0)
const recFin = findBy(arvore.roots, n => n.nome === 'Receitas Financeiras' && n.macro === 'FINANCIAMENTOS');
if (recFin) {
  const novosRF = [
    { id: 319, nome: 'Empr\u00e9stimos de S\u00f3cios', codigo: '8.1.2' },
    { id: 340, nome: 'Cr\u00e9dito de Conta Garantida', codigo: '8.1.7' },
    { id: 405, nome: 'Recebimento de Cr\u00e9dito de Cons\u00f3rcios', codigo: '8.1.8' },
  ];
  for (const c of novosRF) {
    if (!idsNaArvore.has(c.id)) addIfNotPresent(recFin, noA(c.id, c.nome, 'FINANCIAMENTOS', c.codigo));
  }
} else {
  console.warn('  ATENCAO: nao encontrei "Receitas Financeiras" (FINANCIAMENTOS)');
}

// Taxas e Demais (M1/3)
const taxasDemais = findBy(arvore.roots, n => n.nome === 'Taxas e Demais' && n.macro === 'FINANCIAMENTOS');
if (taxasDemais) {
  if (!idsNaArvore.has(207)) addIfNotPresent(taxasDemais, noA(207, 'Tarifas de Cust\u00f3dia de Cheques', 'FINANCIAMENTOS', '8.2.2'));
  if (!idsNaArvore.has(404)) addIfNotPresent(taxasDemais, noA(404, 'Devolu\u00e7\u00e3o de Cheque Descontado', 'FINANCIAMENTOS', '14.3'));
} else {
  console.warn('  ATENCAO: nao encontrei "Taxas e Demais" (FINANCIAMENTOS)');
}

// ===== M2 - INVESTIMENTOS =====

// Investimentos (M2/0/0) - adicionar novas aquisicoes e vendas
const investNode = findBy(arvore.roots, n => n.nome === 'Investimentos' && n.macro === 'INVESTIMENTOS' && n.tipo === 'S');
if (investNode) {
  // Novas aquisicoes CAPEX
  if (!idsNaArvore.has(416)) addIfNotPresent(investNode, noA(416, 'Aquisi\u00e7\u00e3o de M\u00e1quinas e Equipamentos', 'INVESTIMENTOS', '11.1.2'));
  if (!idsNaArvore.has(417)) addIfNotPresent(investNode, noA(417, 'Aquisi\u00e7\u00e3o de Im\u00f3veis', 'INVESTIMENTOS', '11.1.3'));
  if (!idsNaArvore.has(155)) addIfNotPresent(investNode, noA(155, 'Cons\u00f3rcio', 'INVESTIMENTOS', '11.1.4'));
} else {
  console.warn('  ATENCAO: nao encontrei "Investimentos" (INVESTIMENTOS)');
}

// Receitas Provenientes de Investimentos (M2/0) - adicionar venda de imobilizado
const recInvest = findBy(arvore.roots, n => n.nome === 'Receitas Provenientes de Investimentos' && n.macro === 'INVESTIMENTOS');
if (recInvest) {
  // Criar sub-grupo Venda de Imobilizado se nao existir
  let vendaImob = recInvest.children.find(c => c.nome === 'Venda de Imobilizado');
  if (!vendaImob) {
    vendaImob = noS(null, 'Venda de Imobilizado', 'INVESTIMENTOS', []);
    recInvest.children.push(vendaImob);
    console.log('  Criado grupo "Venda de Imobilizado" em Receitas Provenientes de Investimentos');
  }
  const vendasImob = [
    { id: 410, nome: 'Venda de Ve\u00edculos', codigo: '2.7.2' },
    { id: 411, nome: 'Venda de M\u00e1quinas/Equipamentos', codigo: '2.7.3' },
    { id: 412, nome: 'Venda de Im\u00f3veis', codigo: '2.7.4' },
  ];
  for (const c of vendasImob) {
    if (!idsNaArvore.has(c.id)) addIfNotPresent(vendaImob, noA(c.id, c.nome, 'INVESTIMENTOS', c.codigo));
  }
} else {
  console.warn('  ATENCAO: nao encontrei "Receitas Provenientes de Investimentos"');
}

// --- STEP 4: Reatribuir pathKeys ---
function assignPathKeys(node, basePath) {
  node.pathKey = basePath;
  (node.children || []).forEach((ch, i) => assignPathKeys(ch, `${basePath}/${i}`));
}
arvore.roots.forEach((r, i) => assignPathKeys(r, `M${i}`));

// --- STEP 5: Salvar ---
fs.writeFileSync(ARV_PATH, JSON.stringify(arvore));
console.log(`\nSalvo: ${ARV_PATH}`);

// Resumo final
let totalNos = 0;
function contarNos(node) { totalNos++; for (const ch of (node.children||[])) contarNos(ch); }
for (const r of arvore.roots) contarNos(r);
console.log(`Total nos na arvore: ${totalNos}`);
