import { useState, useEffect } from 'react';
import {
  listarMotivosSugestao,
  criarMotivoSugestao,
  atualizarMotivoSugestao,
  excluirMotivoSugestao,
  type MotivoSugestao,
} from '../api/motivosSugestao';
import { useAuth } from '../contexts/AuthContext';
import { PERMISSOES } from '../config/permissoes';

interface ModalGerenciarMotivosProps {
  onClose: () => void;
  onError: (msg: string) => void;
  onAtualizado?: () => void;
}

export default function ModalGerenciarMotivos({
  onClose,
  onError,
  onAtualizado,
}: ModalGerenciarMotivosProps) {
  const [lista, setLista] = useState<MotivoSugestao[]>([]);
  const [loading, setLoading] = useState(true);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoTexto, setEditandoTexto] = useState('');
  const [novoTexto, setNovoTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [modalSenha, setModalSenha] = useState<{ tipo: 'editar' } | { tipo: 'excluir'; id: number } | null>(null);
  const [senhaConfirmacao, setSenhaConfirmacao] = useState('');
  const [senhaErro, setSenhaErro] = useState<string | null>(null);
  const [senhaLoading, setSenhaLoading] = useState(false);
  const { hasPermission } = useAuth();
  const podeGerenciar =
    hasPermission(PERMISSOES.PCP_MOTIVO_CRIAR) ||
    hasPermission(PERMISSOES.PCP_MOTIVO_EDITAR) ||
    hasPermission(PERMISSOES.PCP_MOTIVO_EXCLUIR) ||
    hasPermission(PERMISSOES.PCP_TOTAL);

  const carregar = () => {
    setLoading(true);
    listarMotivosSugestao()
      .then(setLista)
      .catch(() => onError('Erro ao carregar motivos.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    carregar();
  }, []);

  const handleCriar = async () => {
    const t = novoTexto.trim();
    if (!t) return;
    setSalvando(true);
    try {
      const novo = await criarMotivoSugestao(t);
      setLista((prev) => [...prev, novo].sort((a, b) => a.descricao.localeCompare(b.descricao)));
      setNovoTexto('');
      onAtualizado?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao cadastrar.');
    } finally {
      setSalvando(false);
    }
  };

  const handleEditar = (m: MotivoSugestao) => {
    setEditandoId(m.id);
    setEditandoTexto(m.descricao);
  };

  const handleSalvarEdicao = () => {
    if (editandoId == null) return;
    const t = editandoTexto.trim();
    if (!t) return;
    setModalSenha({ tipo: 'editar' });
    setSenhaConfirmacao('');
    setSenhaErro(null);
  };

  const handleExcluir = (id: number) => {
    setModalSenha({ tipo: 'excluir', id });
    setSenhaConfirmacao('');
    setSenhaErro(null);
  };

  const confirmarComSenha = async () => {
    const senha = senhaConfirmacao.trim();
    if (!senha) {
      setSenhaErro('Digite sua senha.');
      return;
    }
    setSenhaErro(null);
    setSenhaLoading(true);
    try {
      if (modalSenha?.tipo === 'editar' && editandoId != null) {
        const t = editandoTexto.trim();
        const atualizado = await atualizarMotivoSugestao(editandoId, t, senha);
        setLista((prev) =>
          prev.map((s) => (s.id === editandoId ? atualizado : s)).sort((a, b) => a.descricao.localeCompare(b.descricao))
        );
        setEditandoId(null);
        setEditandoTexto('');
        setModalSenha(null);
        onAtualizado?.();
      } else if (modalSenha?.tipo === 'excluir') {
        await excluirMotivoSugestao(modalSenha.id, senha);
        setLista((prev) => prev.filter((s) => s.id !== modalSenha.id));
        setModalSenha(null);
        onAtualizado?.();
      }
    } catch (err) {
      setSenhaErro(err instanceof Error ? err.message : 'Senha incorreta ou erro na operação.');
    } finally {
      setSenhaLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 dark:bg-black/70" onClick={onClose}>
      <div
        className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl max-w-3xl w-full p-6 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Gerenciar motivos de alteração</h3>

        {!podeGerenciar && (
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">Apenas usuários autorizados (master, admin ou grupo Administrador) podem criar, editar ou excluir motivos.</p>
        )}

        {podeGerenciar && (
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={novoTexto}
              onChange={(e) => setNovoTexto(e.target.value)}
              placeholder="Novo motivo"
              className="flex-1 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCriar())}
            />
            <button
              type="button"
              onClick={handleCriar}
              disabled={!novoTexto.trim() || salvando}
              className="p-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white transition-colors"
              title="Inserir"
              aria-label="Inserir"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-slate-600 dark:text-slate-400 text-sm">Carregando...</p>
        ) : (
          <ul className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
            {lista.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                {podeGerenciar && editandoId === s.id ? (
                  <>
                    <input
                      type="text"
                      value={editandoTexto}
                      onChange={(e) => setEditandoTexto(e.target.value)}
                      className="flex-1 rounded bg-slate-100 dark:bg-slate-600 border border-slate-300 dark:border-slate-500 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleSalvarEdicao()}
                    />
                    <button
                      type="button"
                      onClick={handleSalvarEdicao}
                      disabled={salvando}
                      className="p-1.5 rounded text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                      title="Salvar"
                      aria-label="Salvar"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditandoId(null)}
                      className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                      title="Cancelar"
                      aria-label="Cancelar"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-slate-800 dark:text-slate-200 flex-1 min-w-0 break-words">{s.descricao}</span>
                    {podeGerenciar && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleEditar(s)}
                          className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                          title="Editar"
                          aria-label="Editar"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExcluir(s.id)}
                          className="p-1.5 rounded text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                          title="Excluir"
                          aria-label="Excluir"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                        </button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-800 dark:text-slate-100 transition-colors"
            title="Fechar"
            aria-label="Fechar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      {modalSenha && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center rounded-xl bg-black/50" onClick={() => setModalSenha(null)}>
          <div
            className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-6 shadow-xl max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-2">
              {modalSenha.tipo === 'editar' ? 'Confirmar edição' : 'Confirmar exclusão'}
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Digite sua senha para confirmar a ação.
            </p>
            <input
              type="password"
              value={senhaConfirmacao}
              onChange={(e) => { setSenhaConfirmacao(e.target.value); setSenhaErro(null); }}
              placeholder="Senha"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-800 dark:text-slate-200 placeholder-slate-500"
              autoFocus
            />
            {senhaErro && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{senhaErro}</p>}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setModalSenha(null)}
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={senhaLoading || !senhaConfirmacao.trim()}
                onClick={confirmarComSenha}
                className="flex-1 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
              >
                {senhaLoading ? 'Confirmando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
