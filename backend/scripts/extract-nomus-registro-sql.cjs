const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'src', 'data', 'sqlRegistroColetaPrecos.ts');
const s = fs.readFileSync(src, 'utf8');
const m = s.match(/SQL_REGISTRO_COLETA_BASE = `([\s\S]*?)`\.trim/);
if (!m) {
  console.error('no match');
  process.exit(1);
}
const out = path.join(__dirname, '..', 'src', 'data', '_paste_nomus.sql');
fs.writeFileSync(out, m[1].trim() + '\n', 'utf8');
console.log('wrote', out, fs.statSync(out).size);
