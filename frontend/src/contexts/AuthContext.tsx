import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { getMe } from '../api/auth';
import { getStoredToken } from '../api/client';
import type { CodigoPermissao } from '../config/permissoes';

interface AuthContextValue {
  login: string | null;
  nome: string | null;
  grupo: string | null;
  isCommercialTeam: boolean;
  permissoes: string[];
  isMaster: boolean;
  hasPermission: (codigo: CodigoPermissao) => boolean;
  setUser: (
    login: string | null,
    data?: { nome?: string | null; grupo?: string | null; isCommercialTeam?: boolean; permissoes?: string[] }
  ) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [login, setLogin] = useState<string | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<string | null>(null);
  const [isCommercialTeam, setIsCommercialTeam] = useState(false);
  const [permissoes, setPermissoes] = useState<string[]>([]);

  const refreshUser = useCallback(async () => {
    if (!getStoredToken()) return;
    try {
      const me = await getMe();
      setLogin(me.login ?? null);
      setNome(me.nome ?? null);
      setGrupo(me.grupo ?? null);
      setIsCommercialTeam(!!me.isCommercialTeam);
      setPermissoes(me.permissoes ?? []);
    } catch {
      setLogin(null);
      setNome(null);
      setGrupo(null);
      setIsCommercialTeam(false);
      setPermissoes([]);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const hasPermission = useCallback(
    (codigo: CodigoPermissao) => login === 'master' || permissoes.includes(codigo),
    [login, permissoes]
  );

  const setUser = useCallback(
    (
      l: string | null,
      data?: { nome?: string | null; grupo?: string | null; isCommercialTeam?: boolean; permissoes?: string[] }
    ) => {
      setLogin(l);
      if (data) {
        if (data.nome !== undefined) setNome(data.nome);
        if (data.grupo !== undefined) setGrupo(data.grupo);
        if ((data as { isCommercialTeam?: boolean }).isCommercialTeam !== undefined) {
          setIsCommercialTeam(!!(data as { isCommercialTeam?: boolean }).isCommercialTeam);
        }
        if (data.permissoes !== undefined) setPermissoes(data.permissoes);
      }
    },
    []
  );

  const value: AuthContextValue = useMemo(
    () => ({
      login,
      nome,
      grupo,
      isCommercialTeam,
      permissoes,
      isMaster: login === 'master',
      hasPermission,
      setUser,
      refreshUser,
    }),
    [login, nome, grupo, isCommercialTeam, permissoes, hasPermission, setUser, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
