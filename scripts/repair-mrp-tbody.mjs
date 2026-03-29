import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = join(__dirname, '../frontend/src/pages/pedidos/MRPPage.tsx');
let s = fs.readFileSync(path, 'utf8');

const hacky =
  'className={`py-2 px-2 text-xs text-right tabular-nums bg-amber-50/40 dark:bg-amber-950/20 ${HORIZONTE_BORDA_INTERNA.replace(/amber-\\d+/g, \'slate-200\').replace(/amber-800\\/40/g, \'slate-600\')} dark:bg-amber-950/20 dark:border-slate-600 dark:border-l-slate-700/50`}';
const good =
  'className={`py-2 px-2 text-xs text-right tabular-nums bg-amber-50/40 dark:bg-amber-950/20 ${HORIZONTE_TD_INTERNA}`}';

if (!s.includes('HORIZONTE_BORDA_INTERNA.replace')) {
  console.error('hacky className not found');
  process.exit(1);
}
s = s.replace(hacky, good);

const anchor = s.indexOf('fmtNum2(cel.saldoEstoque ?? 0)');
const start = s.indexOf('```\r\n\r\nWait', anchor);
if (start < 0) {
  console.error('garbage start not found');
  process.exit(1);
}
const end = s.indexOf('                    </tr>', start);
if (end < 0) {
  console.error('</tr> not found');
  process.exit(1);
}

const lines = [
  '                              <td',
  '                                key={`${cel.data}-e`}',
  '                                className={`py-2 px-2 text-xs text-right tabular-nums bg-amber-50/40 dark:bg-amber-950/20 ${HORIZONTE_TD_INTERNA}`}',
  '                              >',
  '                                {fmtNum2(cel.entrada)}',
  '                              </td>,',
  '                              <td',
  '                                key={`${cel.data}-n`}',
  '                                className={`py-2 px-2 text-xs text-right tabular-nums font-medium bg-amber-50/60 dark:bg-amber-950/30 ${HORIZONTE_TD_INTERNA}`}',
  '                              >',
  '                                {fmtNum2(',
  '                                  Math.max(',
  '                                    0,',
  "                                    typeof cel.necessidade === 'number'",
  '                                      ? cel.necessidade',
  '                                      : cel.consumo - ((cel.saldoEstoque ?? 0) + cel.entrada)',
  '                                  )',
  '                                )}',
  '                              </td>,',
  '                            ])',
  '                          : horizonte.datas.flatMap((d, di) => [',
  '                              <td',
  '                                key={`${d}-c-empty`}',
  '                                className={`py-2 px-2 text-xs text-center text-slate-400 bg-white dark:bg-slate-800 border-t border-b border-r border-slate-200 dark:border-slate-600 ${horizonteBordaInicioDia(di)}`}',
  '                              >',
  '                                —',
  '                              </td>,',
  '                              <td',
  '                                key={`${d}-se-empty`}',
  '                                className={`py-2 px-2 text-xs text-center text-slate-400 bg-white dark:bg-slate-800 ${HORIZONTE_TD_INTERNA}`}',
  '                              >',
  '                                —',
  '                              </td>,',
  '                              <td',
  '                                key={`${d}-e-empty`}',
  '                                className={`py-2 px-2 text-xs text-center text-slate-400 bg-white dark:bg-slate-800 ${HORIZONTE_TD_INTERNA}`}',
  '                              >',
  '                                —',
  '                              </td>,',
  '                              <td',
  '                                key={`${d}-n-empty`}',
  '                                className={`py-2 px-2 text-xs text-center text-slate-400 bg-white dark:bg-slate-800 ${HORIZONTE_TD_INTERNA}`}',
  '                              >',
  '                                —',
  '                              </td>,',
  '                            ]))}',
  '',
];
const insert = lines.join('\r\n');

s = s.slice(0, start) + insert + s.slice(end);
fs.writeFileSync(path, s, 'utf8');
console.log('MRPPage.tsx tbody repaired');
