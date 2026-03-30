import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { listarUsuarios, criarUsuario, atualizarUsuario, excluirUsuario, type Usuario } from '../api/usuarios';
import { listarGrupos, listarPermissoes, criarGrupo, atualizarGrupo, excluirGrupo, type Grupo, type PermissaoItem } from '../api/grupos';
import { OPCOES_TELA_PRINCIPAL, mensagemSeTelaPrincipalInvalidaParaGrupo } from '../config/telaPrincipalGrupo';
import { z } from 'zod';

const MAX_FOTO_BASE64 = 700000;
const PHONE_DIGITS_MAX = 11;

const criarUsuarioSchema = z.object({
  login: z.string().min(1, 'Login é obrigatório').max(50),
  senha: z.string().min(4, 'Senha deve ter no mínimo 4 caracteres').max(100),
  nome: z.string().min(1, 'Nome é obrigatório').max(100),
  email: z.string().email('E-mail inválido').optional().nullable(),
  telefone: z.string().max(20).optional().nullable(),
  grupoId: z.number().int().positive('Grupo é obrigatório'),
  ativo: z.boolean().optional(),
  isCommercialTeam: z.boolean().optional(),
  fotoUrl: z.string().max(MAX_FOTO_BASE64).optional().nullable(),
});

const atualizarUsuarioSchema = z.object({
  senha: z.string().min(4, 'Senha deve ter no mínimo 4 caracteres').max(100).optional(),
  nome: z.string().max(100).optional().nullable(),
  email: z.string().email('E-mail inválido').optional().nullable(),
  telefone: z.string().max(20).optional().nullable(),
  grupoId: z.number().int().positive().optional().nullable(),
  ativo: z.boolean().optional(),
  isCommercialTeam: z.boolean().optional(),
  fotoUrl: z.string().max(MAX_FOTO_BASE64).optional().nullable(),
});

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
  const map = new Map<string, PermissaoItem[]>();
  for (const p of permissoes) {
    const prefix = p.codigo.split('.')[0] ?? '';
    const secao = SECOES_PERMISSOES[prefix];
    if (!secao) continue;
    if (!map.has(secao)) map.set(secao, []);
    map.get(secao)!.push(p);
  }
  for (const [secao, itens] of map.entries()) {
    itens.sort((a, b) => a.label.localeCompare(b.label));
    map.set(secao, itens);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (ORDEM_SECOES_PERMISSOES.indexOf(a) - ORDEM_SECOES_PERMISSOES.indexOf(b)) || a.localeCompare(b))
    .map(([secao, itens]) => ({ secao, itens }));
}

function somenteDigitos(v: string): string {
  return v.replace(/\D/g, '').slice(0, PHONE_DIGITS_MAX);
}

function formatarTelefoneInput(v: string): string {
  const d = somenteDigitos(v);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

function normalizarTelefoneParaSalvar(v: string): string {
  const d = somenteDigitos(v);
  if (!d) return '';
  return formatarTelefoneInput(d);
}

function ModalContainer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-600 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
        </div>
        <div className="p-5 overflow-y-auto max-h-[calc(88vh-64px)]">{children}</div>
      </div>
    </div>
  );
}

export default function UsuariosPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const inGrupos = location.pathname.startsWith('/usuarios/grupos');

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [permissoesLista, setPermissoesLista] = useState<PermissaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState<number | ''>('');
  const [filtroTime, setFiltroTime] = useState<'todos' | 'comercial' | 'nao-comercial'>('todos');

  const [modalCriarUsuarioOpen, setModalCriarUsuarioOpen] = useState(false);
  const [modalEditarUsuarioOpen, setModalEditarUsuarioOpen] = useState(false);
  const [modalGrupoOpen, setModalGrupoOpen] = useState(false);

  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [grupoId, setGrupoId] = useState<number | ''>('');
  const [ativoNovo, setAtivoNovo] = useState(true);
  const [isCommercialTeamNovo, setIsCommercialTeamNovo] = useState(false);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [salvandoUsuario, setSalvandoUsuario] = useState(false);
  const [formErrorUsuario, setFormErrorUsuario] = useState('');

  const [editandoUsuarioId, setEditandoUsuarioId] = useState<number | null>(null);
  const [editLogin, setEditLogin] = useState<string>('');
  const [editSenha, setEditSenha] = useState<string>('');
  const [editNome, setEditNome] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editTelefone, setEditTelefone] = useState<string>('');
  const [editGrupoId, setEditGrupoId] = useState<number | ''>('');
  const [editFotoPreview, setEditFotoPreview] = useState<string | null>(null);
  const [editAtivo, setEditAtivo] = useState(true);
  const [editIsCommercialTeam, setEditIsCommercialTeam] = useState(false);
  const [editFotoBase64, setEditFotoBase64] = useState<string | null | undefined>(undefined);
  const [salvandoEditarUsuario, setSalvandoEditarUsuario] = useState(false);
  const [formErrorEditarUsuario, setFormErrorEditarUsuario] = useState('');

  const [grupoNome, setGrupoNome] = useState('');
  const [grupoDescricao, setGrupoDescricao] = useState('');
  const [grupoPermissoes, setGrupoPermissoes] = useState<string[]>([]);
  const [grupoAtivo, setGrupoAtivo] = useState(true);
  const [grupoTelaPrincipal, setGrupoTelaPrincipal] = useState('');
  const [editandoGrupoId, setEditandoGrupoId] = useState<number | null>(null);
  const [salvandoGrupo, setSalvandoGrupo] = useState(false);
  const [formErrorGrupo, setFormErrorGrupo] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const [u, g, p] = await Promise.all([listarUsuarios(), listarGrupos(), listarPermissoes()]);
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

  const usuariosFiltrados = useMemo(() => {
    return usuarios.filter((u) => {
      const q = filtroUsuario.trim().toLowerCase();
      if (q) {
        const alvo = `${u.login} ${u.nome ?? ''}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      if (filtroGrupo !== '' && u.grupoId !== filtroGrupo) return false;
      if (filtroTime === 'comercial' && !u.isCommercialTeam) return false;
      if (filtroTime === 'nao-comercial' && !!u.isCommercialTeam) return false;
      return true;
    });
  }, [usuarios, filtroUsuario, filtroGrupo, filtroTime]);

  const limparFormCriarUsuario = () => {
    setLogin('');
    setSenha('');
    setNome('');
    setEmail('');
    setTelefone('');
    setGrupoId('');
    setAtivoNovo(true);
    setIsCommercialTeamNovo(false);
    setFotoPreview(null);
    setFotoBase64(null);
    setFormErrorUsuario('');
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

  const handleSubmitUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrorUsuario('');
    const parsed = criarUsuarioSchema.safeParse({
      login: login.trim(),
      senha,
      nome: nome.trim(),
      email: email.trim() ? email.trim() : null,
      telefone: telefone.trim() ? normalizarTelefoneParaSalvar(telefone) : null,
      grupoId: grupoId === '' ? undefined : grupoId,
      ativo: ativoNovo,
      isCommercialTeam: isCommercialTeamNovo,
      fotoUrl: fotoBase64 || undefined,
    });
    if (!parsed.success) {
      setFormErrorUsuario(parsed.error.flatten().formErrors.join(' ') || 'Preencha os campos obrigatórios.');
      return;
    }
    setSalvandoUsuario(true);
    try {
      const novo = await criarUsuario(parsed.data);
      setUsuarios((prev) => [...prev, novo].sort((a, b) => a.login.localeCompare(b.login)));
      limparFormCriarUsuario();
      setModalCriarUsuarioOpen(false);
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
    setEditEmail(u.email ?? '');
    setEditTelefone(u.telefone ?? '');
    setEditGrupoId(u.grupoId ?? '');
    setEditAtivo(u.ativo);
    setEditIsCommercialTeam(!!u.isCommercialTeam);
    setEditFotoPreview(u.fotoUrl ?? null);
    setEditFotoBase64(undefined);
    setFormErrorEditarUsuario('');
    setModalEditarUsuarioOpen(true);
  };

  const fecharFormEditarUsuario = () => {
    setEditandoUsuarioId(null);
    setEditLogin('');
    setEditSenha('');
    setEditNome('');
    setEditEmail('');
    setEditTelefone('');
    setEditGrupoId('');
    setEditFotoPreview(null);
    setEditFotoBase64(undefined);
    setFormErrorEditarUsuario('');
    setSalvandoEditarUsuario(false);
    setEditAtivo(true);
    setEditIsCommercialTeam(false);
    setModalEditarUsuarioOpen(false);
  };

  const handleSubmitEditarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editandoUsuarioId) return;
    setFormErrorEditarUsuario('');

    const payloadBase: Record<string, unknown> = {
      nome: editNome.trim() === '' ? null : editNome.trim(),
      email: editEmail.trim() === '' ? null : editEmail.trim(),
      telefone: editTelefone.trim() === '' ? null : normalizarTelefoneParaSalvar(editTelefone),
      grupoId: editGrupoId === '' ? null : Number(editGrupoId),
      ativo: editAtivo,
      isCommercialTeam: editIsCommercialTeam,
    };
    if (editSenha.trim()) payloadBase.senha = editSenha.trim();
    if (editFotoBase64 !== undefined) payloadBase.fotoUrl = editFotoBase64;

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

  const abrirNovoGrupo = () => {
    setEditandoGrupoId(null);
    setGrupoNome('');
    setGrupoDescricao('');
    setGrupoPermissoes([]);
    setGrupoAtivo(true);
    setGrupoTelaPrincipal('');
    setFormErrorGrupo('');
    setModalGrupoOpen(true);
  };

  const abrirEditarGrupo = (g: Grupo) => {
    setEditandoGrupoId(g.id);
    setGrupoNome(g.nome);
    setGrupoDescricao(g.descricao ?? '');
    setGrupoPermissoes(g.permissoes ?? []);
    setGrupoAtivo(g.ativo);
    setGrupoTelaPrincipal(g.telaPrincipalInicial ?? '');
    setFormErrorGrupo('');
    setModalGrupoOpen(true);
  };

  const fecharFormGrupo = () => {
    setEditandoGrupoId(null);
    setGrupoNome('');
    setGrupoDescricao('');
    setGrupoPermissoes([]);
    setGrupoAtivo(true);
    setGrupoTelaPrincipal('');
    setFormErrorGrupo('');
    setModalGrupoOpen(false);
  };

  const togglePermissao = (codigo: string) => {
    setGrupoPermissoes((prev) => (prev.includes(codigo) ? prev.filter((p) => p !== codigo) : [...prev, codigo]));
  };

  const handleSubmitGrupo = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrorGrupo('');
    if (!grupoNome.trim()) {
      setFormErrorGrupo('Nome do grupo é obrigatório.');
      return;
    }
    if (grupoTelaPrincipal) {
      const msg = mensagemSeTelaPrincipalInvalidaParaGrupo(grupoTelaPrincipal, grupoPermissoes);
      if (msg) {
        setFormErrorGrupo(msg);
        return;
      }
    }
    setSalvandoGrupo(true);
    try {
      const telaPayload = grupoTelaPrincipal || null;
      if (editandoGrupoId) {
        await atualizarGrupo(editandoGrupoId, {
          nome: grupoNome.trim(),
          descricao: grupoDescricao.trim() || null,
          permissoes: grupoPermissoes,
          ativo: grupoAtivo,
          telaPrincipalInicial: telaPayload,
        });
        showToast('Grupo atualizado com sucesso.');
      } else {
        await criarGrupo({
          nome: grupoNome.trim(),
          descricao: grupoDescricao.trim() || null,
          permissoes: grupoPermissoes,
          ativo: grupoAtivo,
          telaPrincipalInicial: telaPayload,
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
    if (!window.confirm(`Excluir o usuário "${u.login}"?`)) return;
    try {
      await excluirUsuario(u.id);
      await carregar();
      showToast('Usuário excluído.');
      if (editandoUsuarioId === u.id) fecharFormEditarUsuario();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao excluir usuário.');
    }
  };

  const handleExcluirGrupo = async (g: Grupo) => {
    if (!window.confirm(`Excluir o grupo "${g.nome}"?`)) return;
    try {
      await excluirGrupo(g.id);
      await carregar();
      showToast('Grupo excluído.');
      if (editandoGrupoId === g.id) fecharFormGrupo();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao excluir grupo.');
    }
  };

  if (forbidden) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Gestão de usuários</h2>
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-6 text-center">
          <p className="text-amber-800 dark:text-amber-200 font-medium">Apenas usuários com permissão podem acessar esta página.</p>
        </div>
      </div>
    );
  }

  if (loading && usuarios.length === 0) {
    return <p className="text-slate-500 dark:text-slate-400">Carregando...</p>;
  }
  if (error && !forbidden) {
    return <p className="text-amber-600 dark:text-amber-400">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{inGrupos ? 'Grupos de usuários' : 'Usuários cadastrados'}</h2>
        {inGrupos ? (
          <button type="button" onClick={abrirNovoGrupo} className="rounded-lg bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 text-sm font-medium">
            Cadastrar novo grupo
          </button>
        ) : (
          <button type="button" onClick={() => { limparFormCriarUsuario(); setModalCriarUsuarioOpen(true); }} className="rounded-lg bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 text-sm font-medium">
            Cadastrar novo usuário
          </button>
        )}
      </div>

      {!inGrupos && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <input value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)} placeholder="Filtrar por usuário" className="rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-sm px-3 py-2" />
          <select value={filtroGrupo === '' ? '' : filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value === '' ? '' : Number(e.target.value))} className="rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-sm px-3 py-2">
            <option value="">Todos os grupos</option>
            {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
          </select>
          <select value={filtroTime} onChange={(e) => setFiltroTime(e.target.value as typeof filtroTime)} className="rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-sm px-3 py-2">
            <option value="todos">Todos os times</option>
            <option value="comercial">Time comercial</option>
            <option value="nao-comercial">Não comercial</option>
          </select>
          <button type="button" onClick={() => { setFiltroUsuario(''); setFiltroGrupo(''); setFiltroTime('todos'); }} className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
            Limpar filtros
          </button>
        </div>
      )}

      {!inGrupos ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 p-6 shadow-sm">
          <ul className="space-y-1">
            {usuariosFiltrados.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-3 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
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
                    {u.nome || '—'} · {u.grupo || 'Sem grupo'} · {u.ativo ? 'Ativo' : 'Inativo'} · {u.isCommercialTeam ? 'Time comercial' : 'Não comercial'}
                  </span>
                </div>
                <button type="button" onClick={() => abrirEditarUsuario(u)} className="shrink-0 text-primary-600 dark:text-primary-400 hover:underline text-sm">Editar</button>
                <button type="button" onClick={() => handleExcluirUsuario(u)} className="shrink-0 text-amber-600 dark:text-amber-400 hover:underline text-sm">Excluir</button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 p-6">
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
                    <td className="py-2 text-slate-600 dark:text-slate-400">{g.descricao || '—'} · {g.ativo ? 'Ativo' : 'Inativo'}</td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">{g.totalUsuarios ?? 0}</td>
                    <td className="py-2 flex gap-2">
                      <button type="button" onClick={() => abrirEditarGrupo(g)} className="text-primary-600 dark:text-primary-400 hover:underline text-sm">Editar</button>
                      <button type="button" onClick={() => handleExcluirGrupo(g)} className="text-amber-600 dark:text-amber-400 hover:underline text-sm">Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalCriarUsuarioOpen && (
        <ModalContainer title="Cadastrar novo usuário" onClose={() => setModalCriarUsuarioOpen(false)}>
          <form onSubmit={handleSubmitUsuario} className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0">
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Foto</label>
                <label className="w-20 h-20 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center cursor-pointer hover:border-primary-500 dark:hover:border-primary-400 bg-slate-50 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 text-2xl">
                  {fotoPreview ? <img src={fotoPreview} alt="" className="w-20 h-20 rounded-full object-cover" /> : <span>👤</span>}
                  <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleFotoChange} className="sr-only" />
                </label>
              </div>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label className="block text-xs mb-1">Login</label><input value={login} onChange={(e) => setLogin(e.target.value)} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs mb-1">Nome *</label><input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs mb-1">E-mail</label><input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs mb-1">Telefone</label><input value={telefone} onChange={(e) => setTelefone(formatarTelefoneInput(e.target.value))} placeholder="(XX) XXXXX-XXXX" className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs mb-1">Senha *</label><input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" /></div>
                <div>
                  <label className="block text-xs mb-1">Grupo *</label>
                  <select value={grupoId === '' ? '' : grupoId} onChange={(e) => setGrupoId(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm">
                    <option value="">Selecione</option>
                    {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ativoNovo} onChange={(e) => setAtivoNovo(e.target.checked)} /> Usuário ativo</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isCommercialTeamNovo} onChange={(e) => setIsCommercialTeamNovo(e.target.checked)} /> Time comercial</label>
              </div>
            </div>
            {formErrorUsuario && <p className="text-amber-600 dark:text-amber-400 text-sm">{formErrorUsuario}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={salvandoUsuario} className="rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium">{salvandoUsuario ? 'Criando...' : 'Criar usuário'}</button>
              <button type="button" onClick={() => setModalCriarUsuarioOpen(false)} className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm">Cancelar</button>
            </div>
          </form>
        </ModalContainer>
      )}

      {modalEditarUsuarioOpen && (
        <ModalContainer title={`Editar usuário ${editLogin}`} onClose={fecharFormEditarUsuario}>
          <form onSubmit={handleSubmitEditarUsuario} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className="block text-xs mb-1">Nome</label><input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs mb-1">E-mail</label><input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs mb-1">Telefone</label><input value={editTelefone} onChange={(e) => setEditTelefone(formatarTelefoneInput(e.target.value))} placeholder="(XX) XXXXX-XXXX" className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs mb-1">Senha (opcional)</label><input type="password" value={editSenha} onChange={(e) => setEditSenha(e.target.value)} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" /></div>
              <div>
                <label className="block text-xs mb-1">Grupo</label>
                <select value={editGrupoId === '' ? '' : editGrupoId} onChange={(e) => setEditGrupoId(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm">
                  <option value="">Sem grupo</option>
                  {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-5">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editAtivo} onChange={(e) => setEditAtivo(e.target.checked)} /> Usuário ativo</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editIsCommercialTeam} onChange={(e) => setEditIsCommercialTeam(e.target.checked)} /> Time comercial</label>
              </div>
              <div>
                <label className="block text-xs mb-1">Foto</label>
                <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleEditFotoChange} className="w-full text-sm" />
                {editFotoPreview && <img src={editFotoPreview} alt="" className="w-14 h-14 mt-2 rounded-full object-cover" />}
              </div>
            </div>
            {formErrorEditarUsuario && <p className="text-amber-600 dark:text-amber-400 text-sm">{formErrorEditarUsuario}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={salvandoEditarUsuario} className="rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium">{salvandoEditarUsuario ? 'Salvando...' : 'Salvar alterações'}</button>
              <button type="button" onClick={fecharFormEditarUsuario} className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm">Cancelar</button>
            </div>
          </form>
        </ModalContainer>
      )}

      {modalGrupoOpen && (
        <ModalContainer title={editandoGrupoId ? 'Editar grupo' : 'Cadastrar novo grupo'} onClose={fecharFormGrupo}>
          <form onSubmit={handleSubmitGrupo} className="space-y-4">
            <div><label className="block text-xs mb-1">Nome do grupo</label><input value={grupoNome} onChange={(e) => setGrupoNome(e.target.value)} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs mb-1">Descrição</label><input value={grupoDescricao} onChange={(e) => setGrupoDescricao(e.target.value)} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" /></div>
            <div>
              <label className="block text-xs mb-1 text-slate-700 dark:text-slate-300">Tela principal ao iniciar</label>
              <select
                value={grupoTelaPrincipal}
                onChange={(e) => setGrupoTelaPrincipal(e.target.value)}
                className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-800 dark:text-slate-100"
              >
                <option value="">Padrão do sistema</option>
                {OPCOES_TELA_PRINCIPAL.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Usuários deste grupo passam a abrir nesta tela ao entrar no sistema. É necessário que o grupo tenha permissão para acessar a área escolhida.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={grupoAtivo} onChange={(e) => setGrupoAtivo(e.target.checked)} /> Grupo ativo</label>
            <div className="space-y-3">
              {agruparPermissoes(permissoesLista).map(({ secao, itens }) => (
                <div key={secao} className="rounded-lg border border-slate-200 dark:border-slate-600/50 p-3 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">{secao}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {itens.map((p) => (
                      <label key={p.codigo} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={grupoPermissoes.includes(p.codigo)} onChange={() => togglePermissao(p.codigo)} />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {formErrorGrupo && <p className="text-amber-600 dark:text-amber-400 text-sm">{formErrorGrupo}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={salvandoGrupo} className="rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium">
                {salvandoGrupo ? 'Salvando...' : editandoGrupoId ? 'Salvar alterações' : 'Criar grupo'}
              </button>
              <button type="button" onClick={fecharFormGrupo} className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm">Cancelar</button>
            </div>
          </form>
        </ModalContainer>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-4 py-2 text-slate-800 dark:text-slate-100 shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
