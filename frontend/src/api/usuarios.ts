import { apiFetch, apiJson } from './client';

export interface Usuario {
  id: number;
  login: string;
  nome: string | null;
  email?: string | null;
  telefone?: string | null;
  ativo: boolean;
  isCommercialTeam?: boolean;
  permissoes: string[];
  grupoId: number | null;
  grupo: string | null;
  fotoUrl: string | null;
  createdAt: string;
}

export async function listarUsuarios(): Promise<Usuario[]> {
  return apiJson<Usuario[]>('/api/usuarios');
}

export async function criarUsuario(payload: {
  login: string;
  senha: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  grupoId: number;
  ativo?: boolean;
  isCommercialTeam?: boolean;
  fotoUrl?: string | null;
}): Promise<Usuario> {
  const res = await apiFetch('/api/usuarios', {
    method: 'POST',
    body: payload,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Erro ao criar usuário');
  }
  return res.json();
}

export async function atualizarUsuario(
  id: number,
  payload: {
    senha?: string;
    nome?: string | null;
    email?: string | null;
    telefone?: string | null;
    grupoId?: number | null;
    ativo?: boolean;
    isCommercialTeam?: boolean;
    fotoUrl?: string | null;
  }
): Promise<Usuario> {
  const res = await apiFetch(`/api/usuarios/${id}`, {
    method: 'PUT',
    body: payload,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Erro ao atualizar usuário');
  }
  return res.json();
}

export async function excluirUsuario(id: number): Promise<void> {
  const res = await apiFetch(`/api/usuarios/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = (err as { error?: string; orientacao?: string }).error ?? 'Erro ao excluir usuário';
    const orient = (err as { orientacao?: string }).orientacao;
    throw new Error(orient ? `${msg}\n${orient}` : msg);
  }
}
