import { useEffect, useMemo, useState } from 'react';
import ProgramacaoSetorialPage from './ProgramacaoSetorialPage';
import {
  atualizarProgramacaoSetorialRegistro,
  listarProgramacaoSetorialRegistros,
  type ProgramacaoSetorialRegistro,
} from '../../api/programacaoSetorial';

const STATUS_LABEL: Record<ProgramacaoSetorialRegistro['status'], string> = {
  PENDENTE: 'Pendente',
  EM_EXECUCAO: 'Em execução',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

const STATUS_BADGE: Record<ProgramacaoSetorialRegistro['status'], string> = {
  PENDENTE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  EM_EXECUCAO: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  CONCLUIDA: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  CANCELADA: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

function fmtDate(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR');
}

export default function ProgramacaoSetorialPainelPage() {
  const [registros, setRegistros] = useState<ProgramacaoSetorialRegistro[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [showGeradorModal, setShowGeradorModal] = useState(false);

  async function carregarRegistros() {
    setLoading(true);
    setErro(null);
    try {
      const res = await listarProgramacaoSetorialRegistros();
      setRegistros(res.data ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarRegistros();
  }, []);

  const totalAbertas = useMemo(
    () => registros.filter((r) => r.status === 'PENDENTE' || r.status === 'EM_EXECUCAO').length,
    [registros]
  );

  async function mudarStatus(id: number, status: ProgramacaoSetorialRegistro['status']) {
    try {
      await atualizarProgramacaoSetorialRegistro(id, { status });
      await carregarRegistros();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="p-6 flex flex-col gap-4 min-h-0">
      {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Programações Setoriais</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Abertas: {totalAbertas} | Total: {registros.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGeradorModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition"
          >
            Gerar Programação
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="py-3 px-4 font-semibold">Identificador / Nome</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Criado por</th>
                <th className="py-3 px-4 font-semibold">Data de criação</th>
                <th className="py-3 px-4 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 px-4 text-center text-slate-500">Carregando...</td>
                </tr>
              ) : registros.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-14 px-4 text-center text-slate-500">Nenhuma programação registrada.</td>
                </tr>
              ) : (
                registros.map((r) => (
                  <tr key={r.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="py-3 px-4">#{r.id} - {r.nome}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    </td>
                    <td className="py-3 px-4">{r.criadoPor ?? '-'}</td>
                    <td className="py-3 px-4">{fmtDate(r.createdAt)}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setShowGeradorModal(true)} className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition">
                          Abrir Gerador
                        </button>
                        <button type="button" onClick={() => mudarStatus(r.id, 'EM_EXECUCAO')} className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 text-xs font-medium">
                          Em execução
                        </button>
                        <button type="button" onClick={() => mudarStatus(r.id, 'CONCLUIDA')} className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 text-xs font-medium">
                          Concluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showGeradorModal && (
        <div className="fixed inset-0 z-[120] bg-black/70 p-2 sm:p-4">
          <div className="h-full w-full rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 flex flex-col">
            <div className="shrink-0 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Gerar Programação</h3>
              <button type="button" onClick={() => setShowGeradorModal(false)} className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm">
                Fechar
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <ProgramacaoSetorialPage />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

