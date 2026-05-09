import { PERMISSOES, type CodigoPermissao } from '../config/permissoes';

const LEGACY_CHAMADOS: CodigoPermissao[] = [
  PERMISSOES.COMUNICACAO_TELA_VER,
  PERMISSOES.COMUNICACAO_TOTAL,
  PERMISSOES.COMUNICACAO_VER,
  PERMISSOES.PEDIDOS_VER,
];

export const PERMISSOES_ROTA_SUPORTE_CHAMADOS: CodigoPermissao[] = [
  PERMISSOES.SUPORTE_CHAMADOS_VER,
  ...LEGACY_CHAMADOS,
];

export function temLegadoComunicacaoParaSuporte(hasPermission: (c: CodigoPermissao) => boolean): boolean {
  return LEGACY_CHAMADOS.some((p) => hasPermission(p));
}

export function usaPermissoesGranularesSuporte(permissoes: string[]): boolean {
  return permissoes.some((p) => p.startsWith('suporte.'));
}

export function podeAcessarRotaChamadosSuporte(hasPermission: (c: CodigoPermissao) => boolean): boolean {
  return PERMISSOES_ROTA_SUPORTE_CHAMADOS.some((p) => hasPermission(p));
}

export function podeAbrirChamadoSuporte(
  isMaster: boolean,
  hasPermission: (c: CodigoPermissao) => boolean,
  permissoes: string[]
): boolean {
  if (isMaster) return true;
  if (usaPermissoesGranularesSuporte(permissoes)) return hasPermission(PERMISSOES.SUPORTE_CHAMADOS_CRIAR);
  return temLegadoComunicacaoParaSuporte(hasPermission);
}

export function podeResponderChamadoSuporte(
  isMaster: boolean,
  hasPermission: (c: CodigoPermissao) => boolean,
  permissoes: string[]
): boolean {
  if (isMaster) return true;
  if (usaPermissoesGranularesSuporte(permissoes)) return hasPermission(PERMISSOES.SUPORTE_CHAMADOS_RESPONDER);
  return temLegadoComunicacaoParaSuporte(hasPermission);
}

export function podeConfigurarSuporte(isMaster: boolean, hasPermission: (c: CodigoPermissao) => boolean): boolean {
  return isMaster || hasPermission(PERMISSOES.SUPORTE_CONFIGURAR);
}

export function podeVerTodosChamadosSuporte(isMaster: boolean, hasPermission: (c: CodigoPermissao) => boolean): boolean {
  return isMaster || hasPermission(PERMISSOES.SUPORTE_CHAMADOS_VER_TODOS);
}

export function podeAlterarStatusChamadoSuporte(isMaster: boolean, hasPermission: (c: CodigoPermissao) => boolean): boolean {
  return isMaster || hasPermission(PERMISSOES.SUPORTE_CHAMADOS_ALTERAR_STATUS);
}
