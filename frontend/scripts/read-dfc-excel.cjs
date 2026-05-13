/**
 * Lê a estrutura do arquivo "Estrutura DFC Só Aço.xlsx" e imprime no console.
 * Uso: node scripts/read-dfc-excel.cjs
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const DESK = 'C:/Users/Administrator/Desktop';
const files = fs.readdirSync(DESK);
// Usar o arquivo com "Só Aço" (o mais novo/especifico)
const dfc = files.filter(f => f.toLowerCase().includes('dfc') && f.endsWith('.xlsx'));
console.log('Arquivos DFC:', dfc);
const file = dfc.find(f => f.includes('\u00c7') || f.includes('\u00e7') || f.toLowerCase().includes('a\u00e7')) || dfc[0];
if (!file) {
  const dfc = files.filter(f => f.toLowerCase().includes('dfc') && f.endsWith('.xlsx'));
  console.error('Arquivos DFC encontrados:', dfc);
  process.exit(1);
}

console.log('Lendo arquivo:', file);
const wb = XLSX.readFile(path.join(DESK, file));
console.log('Abas:', wb.SheetNames);

wb.SheetNames.forEach(sheetName => {
  const ws = wb.Sheets[sheetName];
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  console.log('\n====', sheetName, '(', range.e.r + 1, 'linhas x', range.e.c + 1, 'cols) ====');

  // Ler todas as células com fórmulas e valores
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  rows.forEach((row, i) => {
    const filled = row.map((v, j) => {
      const cellAddr = XLSX.utils.encode_cell({ r: i, c: j });
      const cell = ws[cellAddr];
      if (!cell) return '';
      let out = String(v || '');
      if (cell.f) out += ' [f=' + cell.f + ']';
      return out;
    });
    // Mostrar apenas linhas não vazias
    if (filled.some(v => v.trim())) {
      console.log('L' + (i+1) + ':', filled.join(' | '));
    }
  });
});
