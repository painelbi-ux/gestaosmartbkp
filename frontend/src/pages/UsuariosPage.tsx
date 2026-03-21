import { useState, useEffect, useCallback } from 'react';
import { listarUsuarios, criarUsuario, atualizarUsuario, excluirUsuario, type Usuario } from '../api/usuarios';
import {
  listarGrupos,
  listarPermissoes,
  criarGrupo,
  atualizarGrupo,
  excluirGrupo,
  type Grupo,
  type PermissaoItem,
} from '../api/grupos';
import { z } from 'zod';

const MAX_FOTO_BASE64 = 700000; // ~500KB em base64
const criarUsuarioSchema = z.object({
  login: z.string().min(1, 'Login é obrigatório').max(50),
  senha: z.string().min(4, 'Senha deve ter no mínimo 4 caracteres').max(100),
  nome: z.string().max(100).optional(),
  grupoId: z.number().int().positive().optional().nullable(),
  ativo: z.boolean().optional(),
  permissoes: z.array(z.string()).optional(),
  fotoUrl: z.string().max(MAX_FOTO_BASE64).optional().nullable(),
});

const atualizarUsuarioSchema = z.object({
  senha: z.string().min(4, 'Senha deve ter no mínimo 4 caracteres').max(100).optional(),
  nome: z.string().max(100).optional().nullable(),
  grupoId: z.number().int().positive().optional().nullable(),
  ativo: z.boolean().optional(),
  permissoes: z.array(z.string()).optional(),
  fotoUrl: z.string().max(MAX_FOTO_BASE64).optional().nullable(),
});

type Tab = 'usuarios' | 'grupos';

const SECOES_PERMISSOES: Record<string, string> = {
  pcp: 'PCP',
  usuarios: 'Usuários',
  grupos: 'Grupos de usuários',
  comunicacao: 'COMUNICAÇÃO INTERNA (Comunicação PD)',

  dashboard: 'Dashboard',
  heatmap: 'Heatmap',
  compras: 'Compras',
  precificacao: 'Engenharia',
  relatorios: 'Relatórios',
  integracao: 'Integração',
  financeiro: 'Financeiro',
};

const ORDEM_SECOES_PERMISSOES = [
  'PCP',
  'Usuários',
  'Grupos de usuários',
  'COMUNICAÇÃO INTERNA (Comunicação PD)',
  'Dashboard',
  'Heatmap',
  'Compras',
  'Engenharia',
  'Relatórios',
  'Integração',
  'Financeiro',
];

function agruparPermissoes(permissoes: PermissaoItem[]): { secao: string; itens: PermissaoItem[] }[] {
  const allowedUsuarios = new Set<string>([
    'usuarios.tela.ver',
    'usuarios.criar',
    'usuarios.editar',
    'usuarios.senha.alterar',
    'usuarios.inativar',
    'usuarios.excluir',
    'usuarios.total',
  ]);
  const allowedGrupos = new Set<string>([
    'grupos.tela.ver',
    'grupos.criar',
    'grupos.editar',
    'grupos.inativar',
    'grupos.excluir',
    'grupos.total',
  ]);
  const allowedComunicacao = new Set<string>([
    'comunicacao.tela.ver',
    'comunicacao.novo_pedido',
    'comunicacao.historico.ver',
    'comunicacao.atualizar_card',
    'comunicacao.total',
  ]);

  const map = new Map<string, PermissaoItem[]>();
  for (const p of permissoes) {
    const prefix = p.codigo.split('.')[0] ?? '';
    const secao = SECOES_PERMISSOES[prefix];
    // No editor "module-based", exibimos apenas os módulos solicitados.
    if (!secao) continue;
    // Filtra permissões legadas para manter exatamente as opções que você pediu.
    if (prefix === 'usuarios' && !allowedUsuarios.has(p.codigo)) continue;
    if (prefix === 'grupos' && !allowedGrupos.has(p.codigo)) continue;
    if (prefix === 'comunicacao' && !allowedComunicacao.has(p.codigo)) continue;
    if (!map.has(secao)) map.set(secao, []);
    map.get(secao)!.push(p);
  }

  // Ordena itens por label para ficar previsível na UI.
  for (const [secao, itens] of map.entries()) {
    itens.sort((a, b) => a.label.localeCompare(b.label));
    map.set(secao, itens);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => (ORDEM_SECOES_PERMISSOES.indexOf(a) - ORDEM_SECOES_PERMISSOES.indexOf(b)) || a.localeCompare(b))
    .map(([secao, itens]) => ({ secao, itens }));
}

export default function UsuariosPage() {
  const [tab, setTab] = useState<Tab>('usuarios');
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [permissoesLista, setPermissoesLista] = useState<PermissaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Form usuário
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [grupoId, setGrupoId] = useState<number | ''>('');
  const [ativoNovo, setAtivoNovo] = useState(true);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [salvandoUsuario, setSalvandoUsuario] = useState(false);
  const [formErrorUsuario, setFormErrorUsuario] = useState('');

  // ---------- Editar usuário ----------
  const [editandoUsuarioId, setEditandoUsuarioId] = useState<number | null>(null);
  const [editLogin, setEditLogin] = useState<string>('');
  const [editSenha, setEditSenha] = useState<string>('');
  const [editNome, setEditNome] = useState<string>('');
  const [editGrupoId, setEditGrupoId] = useState<number | ''>('');
  const [editFotoPreview, setEditFotoPreview] = useState<string | null>(null);
  const [editAtivo, setEditAtivo] = useState(true);
  const [editPermissoes, setEditPermissoes] = useState<string[]>([]);
  // undefined = não mexeu; null = remover; string = novo valor
  const [editFotoBase64, setEditFotoBase64] = useState<string | null | undefined>(undefined);
  const [salvandoEditarUsuario, setSalvandoEditarUsuario] = useState(false);
  const [formErrorEditarUsuario, setFormErrorEditarUsuario] = useState('');

  // Form grupo (criar / editar)
  const [grupoNome, setGrupoNome] = useState('');
  const [grupoDescricao, setGrupoDescricao] = useState('');
  const [grupoPermissoes, setGrupoPermissoes] = useState<string[]>([]);
  const [grupoAtivo, setGrupoAtivo] = useState(true);
  const [editandoGrupoId, setEditandoGrupoId] = useState<number | null>(null);
  const [salvandoGrupo, setSalvandoGrupo] = useState(false);
  const [formErrorGrupo, setFormErrorGrupo] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const [u, g, p] = await Promise.all([
        listarUsuarios(),
        listarGrupos(),
        listarPermissoes(),
      ]);
      setUsuarios(u);
      setGrupos(g);
      setPermissoesLista(p);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar';
      setError(msg);
      if (msg.includes('permissão') || msg.includes('403')) setForbidden(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormErrorUsuario('Selecione uma imagem (JPG, PNG ou GIF).');
      return;
    }
    if (file.size > 400_000) {
      setFormErrorUsuario('Imagem deve ter no máximo ~400 KB.');
      return;
    }
    setFormErrorUsuario('');
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      setFotoPreview(data);
      setFotoBase64(data);
    };
    reader.readAsDataURL(file);
  };

  const removerFoto = () => {
    setFotoPreview(null);
    setFotoBase64(null);
  };

  const handleEditFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormErrorEditarUsuario('Selecione uma imagem (JPG, PNG ou GIF).');
      return;
    }
    if (file.size > 400_000) {
      setFormErrorEditarUsuario('Imagem deve ter no máximo ~400 KB.');
      return;
    }
    setFormErrorEditarUsuario('');
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      setEditFotoPreview(data);
      setEditFotoBase64(data);
    };
    reader.readAsDataURL(file);
  };

  const removerEditFoto = () => {
    setEditFotoPreview(null);
    setEditFotoBase64(null);
  };

  // ---------- Usuários ----------
  const handleSubmitUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrorUsuario('');
    const parsed = criarUsuarioSchema.safeParse({
      login,
      senha,
      nome: nome || undefined,
      grupoId: grupoId === '' ? undefined : grupoId,
      ativo: ativoNovo,
      fotoUrl: fotoBase64 || undefined,
    });
    if (!parsed.success) {
      setFormErrorUsuario(parsed.error.flatten().formErrors.join(' ') || 'Preencha os campos.');
      return;
    }
    setSalvandoUsuario(true);
    try {
      const novo = await criarUsuario(parsed.data);
      setUsuarios((prev) => [...prev, novo].sort((a, b) => a.login.localeCompare(b.login)));
      setLogin('');
      setSenha('');
      setNome('');
      setGrupoId('');
      setAtivoNovo(true);
      setFotoPreview(null);
      setFotoBase64(null);
      showToast('Usuário criado com sucesso.');
    } catch (err) {
      setFormErrorUsuario(err instanceof Error ? err.message : 'Erro ao criar usuário.');
    } finally {
      setSalvandoUsuario(false);
    }
  };

  const abrirEditarUsuario = (u: Usuario) => {
    setEditandoUsuarioId(u.id);
    setEditLogin(u.login);
    setEditSenha('');
    setEditNome(u.nome ?? '');
    setEditGrupoId(u.grupoId ?? '');
    setEditAtivo(u.ativo);
    setEditPermissoes(u.permissoes ?? []);
    setEditFotoPreview(u.fotoUrl ?? null);
    setEditFotoBase64(undefined);
    setFormErrorEditarUsuario('');
  };

  const fecharFormEditarUsuario = () => {
    setEditandoUsuarioId(null);
    setEditLogin('');
    setEditSenha('');
    setEditNome('');
    setEditGrupoId('');
    setEditFotoPreview(null);
    setEditFotoBase64(undefined);
    setFormErrorEditarUsuario('');
    setSalvandoEditarUsuario(false);
    setEditAtivo(true);
    setEditPermissoes([]);
  };

  const handleSubmitEditarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editandoUsuarioId) return;

    setFormErrorEditarUsuario('');

    const payloadBase: Record<string, unknown> = {
      nome: editNome.trim() === '' ? null : editNome.trim(),
      grupoId: editGrupoId === '' ? null : Number(editGrupoId),
      ativo: editAtivo,
      permissoes: editPermissoes,
    };

    if (editSenha.trim()) payloadBase.senha = editSenha.trim();

    if (editFotoBase64 !== undefined) {
      payloadBase.fotoUrl = editFotoBase64;
    }

    const parsed = atualizarUsuarioSchema.safeParse(payloadBase);
    if (!parsed.success) {
      setFormErrorEditarUsuario(parsed.error.flatten().formErrors.join(' ') || 'Preencha os campos.');
      return;
    }

    setSalvandoEditarUsuario(true);
    try {
      await atualizarUsuario(editandoUsuarioId, parsed.data);
      await carregar();
      showToast('Usuário atualizado com sucesso.');
      fecharFormEditarUsuario();
    } catch (err) {
      setFormErrorEditarUsuario(err instanceof Error ? err.message : 'Erro ao atualizar usuário.');
    } finally {
      setSalvandoEditarUsuario(false);
    }
  };

  const togglePermissao = (codigo: string) => {
    setGrupoPermissoes((prev) =>
      prev.includes(codigo) ? prev.filter((p) => p !== codigo) : [...prev, codigo]
    );
  };

  const togglePermissaoUsuario = (codigo: string) => {
    setEditPermissoes((prev) =>
      prev.includes(codigo) ? prev.filter((p) => p !== codigo) : [...prev, codigo]
    );
  };

  const abrirEditarGrupo = (g: Grupo) => {
    setEditandoGrupoId(g.id);
    setGrupoNome(g.nome);
    setGrupoDescricao(g.descricao ?? '');
    setGrupoPermissoes(g.permissoes ?? []);
    setGrupoAtivo(g.ativo);
    setFormErrorGrupo('');
  };

  const fecharFormGrupo = () => {
    setEditandoGrupoId(null);
    setGrupoNome('');
    setGrupoDescricao('');
    setGrupoPermissoes([]);
    setGrupoAtivo(true);
    setFormErrorGrupo('');
  };

  const handleSubmitGrupo = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrorGrupo('');
    if (!grupoNome.trim()) {
      setFormErrorGrupo('Nome do grupo é obrigatório.');
      return;
    }
    setSalvandoGrupo(true);
    try {
      if (editandoGrupoId) {
        await atualizarGrupo(editandoGrupoId, {
          nome: grupoNome.trim(),
          descricao: grupoDescricao.trim() || null,
          permissoes: grupoPermissoes,
          ativo: grupoAtivo,
        });
        showToast('Grupo atualizado com sucesso.');
      } else {
        await criarGrupo({
          nome: grupoNome.trim(),
          descricao: grupoDescricao.trim() || null,
          permissoes: grupoPermissoes,
          ativo: grupoAtivo,
        });
        showToast('Grupo criado com sucesso.');
      }
      await carregar();
      fecharFormGrupo();
    } catch (err) {
      setFormErrorGrupo(err instanceof Error ? err.message : 'Erro ao salvar grupo.');
    } finally {
      setSalvandoGrupo(false);
    }
  };

  const handleExcluirUsuario = async (u: Usuario) => {
    if (
      !window.confirm(
        `Excluir o usuário "${u.login}"? A exclusão física só será permitida se ele não possuir vínculos com registros do sistema.`
      )
    )
      return;
    try {
      await excluirUsuario(u.id);
      showToast('Usuário excluído.');
      await carregar();
      if (editandoUsuarioId === u.id) fecharFormEditarUsuario();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao excluir usuário.');
    }
  };

  const handleExcluirGrupo = async (g: Grupo) => {
    if (
      !window.confirm(
        `Excluir o grupo "${g.nome}"? A exclusão física só é permitida se não houver usuários vinculados. Se houver, use inativação (ativo=false).`
      )
    )
      return;
    try {
      await excluirGrupo(g.id);
      showToast('Grupo excluído.');
      await carregar();
      if (editandoGrupoId === g.id) fecharFormGrupo();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao excluir.');
    }
  };

  if (forbidden) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Cadastro de usuários e grupos</h2>
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-6 text-center">
          <p className="text-amber-800 dark:text-amber-200 font-medium">
            Apenas usuários com permissão de gerenciar usuários podem acessar esta página.
          </p>
        </div>
      </div>
    );
  }

  if (loading && usuarios.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Cadastro de usuários e grupos</h2>
        <p className="text-slate-500 dark:text-slate-400">Carregando...</p>
      </div>
    );
  }

  if (error && !forbidden) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Cadastro de usuários e grupos</h2>
        <p className="text-amber-600 dark:text-amber-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Cadastro de usuários e grupos</h2>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setTab('usuarios')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
            tab === 'usuarios'
              ? 'bg-primary-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          Usuários
        </button>
        <button
          type="button"
          onClick={() => setTab('grupos')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
            tab === 'grupos'
              ? 'bg-primary-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          Grupos e permissões
        </button>
      </div>

      {tab === 'usuarios' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-600 dark:text-primary-400 text-sm">+</span>
              Novo usuário
            </h3>
            <form onSubmit={handleSubmitUsuario} className="space-y-4">
              <div className="flex gap-4 items-start">
                <div className="flex-shrink-0">
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Foto</label>
                  <div className="relative">
                    {fotoPreview ? (
                      <div className="relative group">
                        <img
                          src={fotoPreview}
                          alt="Preview"
                          className="w-20 h-20 rounded-full object-cover border-2 border-slate-200 dark:border-slate-600"
                        />
                        <button
                          type="button"
                          onClick={removerFoto}
                          className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition"
                        >
                          Remover
                        </button>
                      </div>
                    ) : (
                      <label className="w-20 h-20 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center cursor-pointer hover:border-primary-500 dark:hover:border-primary-400 bg-slate-50 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 text-2xl">
                        <span>👤</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={handleFotoChange}
                          className="sr-only"
                        />
                      </label>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-4">
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Login</label>
                    <input
                      type="text"
                      value={login}
                      onChange={(e) => setLogin(e.target.value)}
                      className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                      placeholder="Ex.: joao"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Nome (opcional)</label>
                    <input
                      type="text"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                      placeholder="Ex.: João Silva"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Senha</label>
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                  placeholder="Mínimo 4 caracteres"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Grupo (define permissões)</label>
                <select
                  value={grupoId === '' ? '' : grupoId}
                  onChange={(e) => setGrupoId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                >
                  <option value="">Nenhum</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="novo-ativo"
                  type="checkbox"
                  checked={ativoNovo}
                  onChange={(e) => setAtivoNovo(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="novo-ativo" className="text-sm text-slate-700 dark:text-slate-300">
                  Usuário ativo
                </label>
              </div>
              {formErrorUsuario && <p className="text-amber-600 dark:text-amber-400 text-sm">{formErrorUsuario}</p>}
              <button
                type="submit"
                disabled={salvandoUsuario}
                className="rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium w-full"
              >
                {salvandoUsuario ? 'Criando...' : 'Criar usuário'}
              </button>
            </form>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-4">Usuários cadastrados</h3>
            <ul className="space-y-1">
              {usuarios.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center gap-3 py-3 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700/50 last:border-0"
                >
                  {u.fotoUrl ? (
                    <img src={u.fotoUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-600" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold text-sm">
                      {(u.nome || u.login).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-slate-800 dark:text-slate-200 block truncate">{u.login}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block truncate">
                      {u.nome || '—'} · {u.grupo || 'Sem grupo'} · {u.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => abrirEditarUsuario(u)}
                    className="shrink-0 text-primary-600 dark:text-primary-400 hover:underline text-sm"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExcluirUsuario(u)}
                    className="shrink-0 text-amber-600 dark:text-amber-400 hover:underline text-sm"
                  >
                    Excluir
                  </button>
                </li>
              ))}
            </ul>

            {editandoUsuarioId && (
              <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-4">
                  Editar usuário <span className="text-slate-500 dark:text-slate-400 text-sm font-normal">{editLogin}</span>
                </h3>
                <form onSubmit={handleSubmitEditarUsuario} className="space-y-4">
                  <div className="flex gap-4 items-start">
                    <div className="flex-shrink-0">
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Foto</label>
                      <div className="relative">
                        {editFotoPreview ? (
                          <div className="relative group">
                            <img
                              src={editFotoPreview}
                              alt="Preview"
                              className="w-20 h-20 rounded-full object-cover border-2 border-slate-200 dark:border-slate-600"
                            />
                            <button
                              type="button"
                              onClick={removerEditFoto}
                              className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition"
                            >
                              Remover
                            </button>
                          </div>
                        ) : (
                          <label className="w-20 h-20 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center cursor-pointer hover:border-primary-500 dark:hover:border-primary-400 bg-slate-50 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 text-2xl">
                            <span>👤</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/gif,image/webp"
                              onChange={handleEditFotoChange}
                              className="sr-only"
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 space-y-4">
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Nome</label>
                        <input
                          type="text"
                          value={editNome}
                          onChange={(e) => setEditNome(e.target.value)}
                          className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                          placeholder="Opcional"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Grupo (define permissões)</label>
                        <select
                          value={editGrupoId === '' ? '' : editGrupoId}
                          onChange={(e) => setEditGrupoId(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                        >
                          <option value="">Nenhum</option>
                          {grupos.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.nome}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          id="edit-ativo"
                          type="checkbox"
                          checked={editAtivo}
                          onChange={(e) => setEditAtivo(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500"
                        />
                        <label htmlFor="edit-ativo" className="text-sm text-slate-700 dark:text-slate-300">
                          Usuário ativo
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Senha (opcional)</label>
                    <input
                      type="password"
                      value={editSenha}
                      onChange={(e) => setEditSenha(e.target.value)}
                      className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                      placeholder="Deixe em branco para não alterar"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2">Permissões de acesso às telas (por usuário)</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                      Marque apenas o que este usuário pode acessar além do grupo.
                    </p>
                    <div className="space-y-4">
                      {agruparPermissoes(permissoesLista).map(({ secao, itens }) => (
                        <div key={secao} className="rounded-lg border border-slate-200 dark:border-slate-600/50 p-3 bg-slate-50/50 dark:bg-slate-800/30">
                          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">{secao}</div>
                          <div className="flex flex-wrap gap-x-4 gap-y-2">
                            {itens.map((p) => (
                              <label key={p.codigo} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editPermissoes.includes(p.codigo)}
                                  onChange={() => togglePermissaoUsuario(p.codigo)}
                                  className="rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm text-slate-700 dark:text-slate-300">{p.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {formErrorEditarUsuario && (
                    <p className="text-amber-600 dark:text-amber-400 text-sm">{formErrorEditarUsuario}</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={salvandoEditarUsuario}
                      className="flex-1 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium"
                    >
                      {salvandoEditarUsuario ? 'Salvando...' : 'Salvar alterações'}
                    </button>
                    <button
                      type="button"
                      onClick={fecharFormEditarUsuario}
                      disabled={salvandoEditarUsuario}
                      className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'grupos' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 p-6">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">
              {editandoGrupoId ? 'Editar grupo' : 'Novo grupo'}
            </h3>
            <form onSubmit={handleSubmitGrupo} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Nome do grupo</label>
                <input
                  type="text"
                  value={grupoNome}
                  onChange={(e) => setGrupoNome(e.target.value)}
                  className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                  placeholder="Ex.: Operador"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Descrição (opcional)</label>
                <input
                  type="text"
                  value={grupoDescricao}
                  onChange={(e) => setGrupoDescricao(e.target.value)}
                  className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                  placeholder="Ex.: Acesso a pedidos e relatórios"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="grupo-ativo"
                  type="checkbox"
                  checked={grupoAtivo}
                  onChange={(e) => setGrupoAtivo(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="grupo-ativo" className="text-sm text-slate-700 dark:text-slate-300">
                  Grupo ativo
                </label>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2">Permissões de acesso às telas</label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Marque apenas o que este grupo pode acessar. Usuários sem permissão para uma tela não verão o menu nem a rota.
                </p>
                <div className="space-y-4">
                  {agruparPermissoes(permissoesLista).map(({ secao, itens }) => (
                    <div key={secao} className="rounded-lg border border-slate-200 dark:border-slate-600/50 p-3 bg-slate-50/50 dark:bg-slate-800/30">
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">{secao}</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {itens.map((p) => (
                          <label key={p.codigo} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={grupoPermissoes.includes(p.codigo)}
                              onChange={() => togglePermissao(p.codigo)}
                              className="rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">{p.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {formErrorGrupo && <p className="text-amber-600 dark:text-amber-400 text-sm">{formErrorGrupo}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={salvandoGrupo}
                  className="rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium"
                >
                  {salvandoGrupo ? 'Salvando...' : editandoGrupoId ? 'Salvar alterações' : 'Criar grupo'}
                </button>
                {editandoGrupoId && (
                  <button
                    type="button"
                    onClick={fecharFormGrupo}
                    className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 p-6">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">Grupos cadastrados</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-2 text-slate-500 dark:text-slate-400 font-medium">Nome</th>
                    <th className="text-left py-2 text-slate-500 dark:text-slate-400 font-medium">Descrição</th>
                    <th className="text-left py-2 text-slate-500 dark:text-slate-400 font-medium">Usuários</th>
                    <th className="text-left py-2 text-slate-500 dark:text-slate-400 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => (
                    <tr key={g.id} className="border-b border-slate-200 dark:border-slate-700 last:border-0">
                      <td className="py-2 text-slate-800 dark:text-slate-200 font-medium">{g.nome}</td>
                      <td className="py-2 text-slate-600 dark:text-slate-400">
                        {g.descricao || '—'} · {g.ativo ? 'Ativo' : 'Inativo'}
                      </td>
                      <td className="py-2 text-slate-600 dark:text-slate-400">{g.totalUsuarios ?? 0}</td>
                      <td className="py-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => abrirEditarGrupo(g)}
                          className="text-primary-600 dark:text-primary-400 hover:underline text-sm"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExcluirGrupo(g)}
                          className="text-amber-600 dark:text-amber-400 hover:underline text-sm"
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {grupos.length === 0 && (
              <p className="text-slate-500 dark:text-slate-400 text-sm py-4">Nenhum grupo cadastrado.</p>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-4 py-2 text-slate-800 dark:text-slate-100 shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
