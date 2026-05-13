/**
 * Analisa a estrutura hierárquica do "Estrutura DFC Só Aço.xlsx"
 * baseado nas fórmulas SUM para montar a árvore DFC.
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const DESK = 'C:/Users/Administrator/Desktop';
const files = fs.readdirSync(DESK);
const file = files.find(f => f.includes('Estrutura DFC') && (f.includes('ç') || f.includes('Ã')) && f.endsWith('.xlsx')) || files.find(f => f.includes('Estrutura DFC S') && f.endsWith('.xlsx'));
console.log('Arquivo:', file);

const wb = XLSX.readFile(path.join(DESK, file));
const ws = wb.Sheets['Estrutura DFC'];
const range = XLSX.utils.decode_range(ws['!ref']);

// Extrair todas as linhas com dados (colunas A=id, B=classif, C=nome, D=valor/formula)
const allRows = [];
for (let r = 0; r <= range.e.r; r++) {
  const getCell = c => ws[XLSX.utils.encode_cell({ r, c })];
  const cA = getCell(0), cB = getCell(1), cC = getCell(2), cD = getCell(3);
  
  const id = cA ? (cA.v != null ? String(cA.v) : '') : '';
  const classif = cB ? String(cB.v || '') : '';
  const nome = cC ? String(cC.v || '') : '';
  const formula = cD && cD.f ? String(cD.f) : '';
  const valor = cD && cD.v != null ? Number(cD.v) : null;
  
  allRows.push({ row: r + 1, id, classif, nome, formula, valor, hasData: !!(id || classif || nome || formula) });
}

// Identificar linhas com fórmulas SUM para mapear hierarquia
// Uma linha com SUM(Dx:Dy) ou SUM(Dx, Dy, ...) é pai das linhas referenciadas
const sections = [];
let currentSection = null;

// Mapear blocos de seção pelos cabeçalhos de texto sem ID
for (const row of allRows) {
  if (!row.hasData) continue;
  
  // Cabeçalhos de seção (sem ID numérico)
  const idNum = parseInt(row.id);
  const isHeader = !Number.isFinite(idNum) || row.id.trim() === '';
  
  if (isHeader && (row.nome === 'Fluxo Financeiro' || row.nome === 'Outras Movimentações')) {
    currentSection = row.nome;
  }
  
  console.log(`R${row.row.toString().padStart(3)}: id=${row.id.padEnd(5)} cls=${row.classif.padEnd(12)} nome=${row.nome.substring(0,40).padEnd(40)} formula=${row.formula}`);
}
