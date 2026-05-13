const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const DESK = 'C:/Users/Administrator/Desktop';
const files = fs.readdirSync(DESK);
const file = files.find(f => f.includes('Estrutura DFC S') && f.endsWith('.xlsx'));
const wb = XLSX.readFile(path.join(DESK, file));
const ws = wb.Sheets['Estrutura DFC'];
const range = XLSX.utils.decode_range(ws['!ref']);

for (let r = 120; r <= 215; r++) {
  const getCell = c => ws[XLSX.utils.encode_cell({ r, c })];
  const cA = getCell(0), cB = getCell(1), cC = getCell(2), cD = getCell(3);
  const id = cA ? String(cA.v != null ? cA.v : '') : '';
  const cls = cB ? String(cB.v || '') : '';
  const nome = cC ? String(cC.v || '') : '';
  const formula = cD && cD.f ? String(cD.f) : '';
  if (id || cls || nome || formula) {
    console.log(`R${String(r+1).padStart(3)}: id=${id.padEnd(5)} cls=${cls.padEnd(12)} nome=${nome.substring(0,40).padEnd(40)} formula=${formula}`);
  }
}
