/**
 * Regenera `src/pages/financeiro/dfc/planoContasAtivoDfc.json` a partir da planilha do Desktop
 * (mesmo SQL: id, nome, classificacao da aba Consulta1).
 * Uso: node scripts/export-plano-contas-dfc.cjs
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const desk = 'C:/Users/Administrator/Desktop';
const file = fs.readdirSync(desk).find((f) => f.includes('Plano') && f.endsWith('.xlsx'));
if (!file) {
  console.error('Nenhum arquivo "Plano*.xlsx" encontrado em', desk);
  process.exit(1);
}
const wb = XLSX.readFile(path.join(desk, file));
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Consulta1'] || wb.Sheets[wb.SheetNames[0]], { defval: '' });

function classificacaoSobPrefixo(c, prefix) {
  const cSeg = c.split('.').filter(Boolean);
  const pSeg = prefix.split('.').filter(Boolean);
  if (pSeg.length === 0 || cSeg.length < pSeg.length) return false;
  for (let i = 0; i < pSeg.length; i++) if (cSeg[i] !== pSeg[i]) return false;
  return true;
}

/** Mesmo critério de `classificacaoExcluidaDaArvoreDfc` no frontend (DFC). */
function excluidaDfc(classificacao) {
  const c = String(classificacao || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\.+$/, '');
  if (!c) return true;
  return classificacaoSobPrefixo(c, '1.2');
}

const out = rows
  .map((r) => ({
    id: Number(r.id),
    nome: String(r.nome || '').trim(),
    classificacao: String(r.classificacao || '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/\.+$/, ''),
  }))
  .filter((r) => r.classificacao && !excluidaDfc(r.classificacao));
out.sort((a, b) => a.classificacao.localeCompare(b.classificacao, undefined, { numeric: true }));

const target = path.join(__dirname, '../src/pages/financeiro/dfc/planoContasAtivoDfc.json');
fs.writeFileSync(target, JSON.stringify(out));
console.log('OK', out.length, 'contas →', target);
