import { apiFetch, apiJson } from './client';

export interface Grupo {
  id: number;
  nome: string;
  descricao: string | null;
  permissoes: string[];
  ativo: boolean;
  totalUsuarios?: number;
}

export interface PermissaoItem {
  codigo: string;
  label: string;
}

export async function listarGrupos(): Promise<Grupo[]> {
  return apiJson<Grupo[]>('/api/grupos');
}

export async function listarPermissoes(): Promise<PermissaoItem[]> {
  return apiJson<PermissaoItem[]>('/api/grupos/permissoes');
}

export async function criarGrupo(payload: {
  nome: string;
  descricao?: string | null;
  permissoes: string[];
  ativo?: boolean;
}): Promise<Grupo> {
  const res = await apiFetch('/api/grupos', {
    method: 'POST',
    body: payload,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro ao criar grupo' }));
    throw new Error((err as { error?: string }).error ?? 'Erro ao criar grupo');
  }
  return res.json();
}

export async function atualizarGrupo(
  id: number,
  payload: { nome?: string; descricao?: string | null; permissoes?: string[]; ativo?: boolean }
): Promise<Grupo> {
  const res = await apiFetch(`/api/grupos/${id}`, {
    method: 'PUT',
    body: payload,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro ao atualizar grupo' }));
    throw new Error((err as { error?: string }).error ?? 'Erro ao atualizar grupo');
  }
  return res.json();
}

export async function excluirGrupo(id: number): Promise<void> {
  const res = await apiFetch(`/api/grupos/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro ao excluir grupo' }));
    const msg = (err as { error?: string; orientacao?: string }).error ?? 'Erro ao excluir grupo';
    const orient = (err as { error?: string; orientacao?: string }).orientacao;
    throw new Error(orient ? `${msg}\n${orient}` : msg);
  }
}
