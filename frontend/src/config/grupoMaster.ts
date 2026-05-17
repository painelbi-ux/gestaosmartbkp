export const GRUPO_MASTER_NOME = 'Master';

export function isGrupoMasterNome(nome: string | null | undefined): boolean {
  return String(nome ?? '').trim() === GRUPO_MASTER_NOME;
}
