import { useState, useRef, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import { logout } from '../api/auth';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { PERMISSOES } from '../config/permissoes';
import PermissionGuard from './PermissionGuard';
import StatusCard from './StatusCard';

function SunIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

const PCP_SUBMENUS: { to: string; label: string }[] = [
  { to: '/pedidos', label: 'Gerenciador de Pedidos' },
  { to: '/pedidos/sycroorder', label: 'SycroOrder' },
  { to: '/pedidos/mrp', label: 'MRP' },
  { to: '/pedidos/mpp', label: 'MPP' },
];

const COMPRAS_SUBMENUS: { to: string; label: string }[] = [
  { to: '/compras/dashboard', label: 'Dashboard' },
  { to: '/compras/coletas-precos', label: 'Coletas de Preços' },
];

const ENGENHARIA_SUBMENUS: { to: string; label: string }[] = [
  { to: '/engenharia/precificacao', label: 'Precificação' },
];

const FINANCEIRO_SUBMENUS: { to: string; label: string }[] = [
  { to: '/financeiro/resumo', label: 'Resumo Financeiro' },
];

const INTEGRACAO_SUBMENUS: { to: string; label: string }[] = [
  { to: '/integracao/alteracao-data-entrega-compra', label: 'Alteração da Data de Entrega do Pedido de Compra' },
];

/** Rotas que podem ser abertas em abas (path → label). Usado na barra de abas. */
const PATH_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/pedidos': 'Gerenciador de Pedidos',
  '/pedidos/sycroorder': 'SycroOrder',
  '/pedidos/mrp': 'MRP',
  '/pedidos/mpp': 'MPP',
  '/heatmap': 'Heatmap',
  '/compras': 'Compras',
  '/compras/dashboard': 'Dashboard',
  '/compras/coletas-precos': 'Coletas de Preços',
  '/engenharia': 'Engenharia',
  '/engenharia/precificacao': 'Precificação',
  '/financeiro': 'Financeiro',
  '/financeiro/resumo': 'Resumo Financeiro',
  '/relatorios': 'Relatórios',
  '/integracao': 'Integração',
  '/integracao/alteracao-data-entrega-compra': 'Alteração Data Entrega',
  '/usuarios': 'Usuários',
  '/whatsapp': 'WhatsApp',
  '/situacao-api': 'Situação da API',
};

function getLabelForPath(path: string): string {
  return PATH_LABELS[path] ?? (path || 'Início');
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { hasPermission, isMaster } = useAuth();
  const [pcpOpen, setPcpOpen] = useState(false);
  const pcpRef = useRef<HTMLDivElement>(null);
  const [comprasOpen, setComprasOpen] = useState(false);
  const comprasRef = useRef<HTMLDivElement>(null);
  const [integracaoOpen, setIntegracaoOpen] = useState(false);
  const integracaoRef = useRef<HTMLDivElement>(null);
  const [engenhariaOpen, setEngenhariaOpen] = useState(false);
  const engenhariaRef = useRef<HTMLDivElement>(null);
  const [financeiroOpen, setFinanceiroOpen] = useState(false);
  const financeiroRef = useRef<HTMLDivElement>(null);

  const isPcpActive = location.pathname.startsWith('/pedidos');
  const isComprasActive = location.pathname.startsWith('/compras');
  const isIntegracaoActive = location.pathname.startsWith('/integracao');
  const isEngenhariaActive = location.pathname.startsWith('/engenharia');
  const isFinanceiroActive = location.pathname.startsWith('/financeiro');
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);
  const syncPanelRef = useRef<HTMLDivElement>(null);

  /** Abas abertas no topo da área de conteúdo (cada submenu/rota em uma aba). */
  const [abas, setAbas] = useState<{ id: string; path: string; label: string }[]>(() => {
    const path = location.pathname || '/';
    return [{ id: path, path, label: getLabelForPath(path) }];
  });

  /** Perfil compras (não-master com Compras): ao abrir em / ou /compras, vai para Dashboard Compras com uma única aba. */
  const soCompras = !isMaster && hasPermission(PERMISSOES.COMPRAS_VER);
  useEffect(() => {
    if (!soCompras) return;
    const path = location.pathname || '/';
    if (path === '/' || path === '/compras') {
      setAbas([{ id: '/compras/dashboard', path: '/compras/dashboard', label: 'Dashboard' }]);
      navigate('/compras/dashboard', { replace: true });
    }
  }, [location.pathname, soCompras, navigate]);

  useEffect(() => {
    const path = location.pathname || '/';
    setAbas((prev) => {
      if (soCompras && path.startsWith('/compras')) {
        return [{ id: path, path, label: getLabelForPath(path) }];
      }
      const exists = prev.some((a) => a.path === path);
      if (exists) return prev;
      return [...prev, { id: path, path, label: getLabelForPath(path) }];
    });
  }, [location.pathname, soCompras]);

  const navigateAposFecharRef = useRef<string | null>(null);
  const dragTabIndexRef = useRef<number | null>(null);
  const justDraggedRef = useRef(false);

  const reordenarAbas = useCallback((dragIndex: number, dropIndex: number) => {
    if (dragIndex === dropIndex) return;
    setAbas((prev) => {
      const next = [...prev];
      const [removed] = next.splice(dragIndex, 1);
      next.splice(dropIndex, 0, removed);
      return next;
    });
  }, []);

  const fecharAba = useCallback((pathToClose: string) => {
    const pathname = location.pathname;
    setAbas((prev) => {
      const next = prev.filter((a) => a.path !== pathToClose);
      if (next.length === 0) return prev;
      if (pathname === pathToClose) {
        const idx = prev.findIndex((a) => a.path === pathToClose);
        navigateAposFecharRef.current = next[Math.min(idx, next.length - 1)].path;
      }
      return next;
    });
    setTimeout(() => {
      const p = navigateAposFecharRef.current;
      if (p) {
        navigateAposFecharRef.current = null;
        navigate(p);
      }
    }, 0);
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!syncPanelOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (syncPanelRef.current && !syncPanelRef.current.contains(e.target as Node)) {
        setSyncPanelOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [syncPanelOpen]);

  const handleSincronizado = () => {
    window.dispatchEvent(new CustomEvent('sincronizado'));
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pcpRef.current && !pcpRef.current.contains(e.target as Node)) {
        setPcpOpen(false);
      }
      if (comprasRef.current && !comprasRef.current.contains(e.target as Node)) {
        setComprasOpen(false);
      }
      if (integracaoRef.current && !integracaoRef.current.contains(e.target as Node)) {
        setIntegracaoOpen(false);
      }
      if (engenhariaRef.current && !engenhariaRef.current.contains(e.target as Node)) {
        setEngenhariaOpen(false);
      }
      if (financeiroRef.current && !financeiroRef.current.contains(e.target as Node)) {
        setFinanceiroOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/entrar', { replace: true });
    } catch {
      navigate('/entrar', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <header className="border-b border-slate-200 bg-white/80 dark:border-slate-700/50 dark:bg-slate-800/50 sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 mr-6">Gestão Smart 2.0</h1>
          <nav className="flex items-center gap-1">
            {hasPermission(PERMISSOES.DASHBOARD_VER) && (
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/50'
                  }`
                }
              >
                Dashboard
              </NavLink>
            )}
            {hasPermission(PERMISSOES.PEDIDOS_VER) && (
              <div className="relative" ref={pcpRef}>
                <button
                  type="button"
                  onClick={() => setPcpOpen((v) => !v)}
                  onMouseEnter={() => setPcpOpen(true)}
                  className={`inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    isPcpActive
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/50'
                  }`}
                  aria-expanded={pcpOpen}
                  aria-haspopup="true"
                >
                  PCP
                  <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {pcpOpen && (
                  <div
                    className="absolute left-0 top-full mt-1 py-1 w-56 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg z-50"
                    onMouseLeave={() => setPcpOpen(false)}
                  >
                    {PCP_SUBMENUS.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setPcpOpen(false)}
                        className={({ isActive }) =>
                          `block px-4 py-2 text-sm transition ${
                            isActive
                              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200 font-medium'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}
            {hasPermission(PERMISSOES.HEATMAP_VER) && (
              <NavLink
                to="/heatmap"
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/50'
                  }`
                }
              >
                Heatmap
              </NavLink>
            )}
            {hasPermission(PERMISSOES.COMPRAS_VER) && (
              <div className="relative" ref={comprasRef}>
                <button
                  type="button"
                  onClick={() => setComprasOpen((v) => !v)}
                  onMouseEnter={() => setComprasOpen(true)}
                  className={`inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    isComprasActive
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/50'
                  }`}
                  aria-expanded={comprasOpen}
                  aria-haspopup="true"
                >
                  Compras
                  <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {comprasOpen && (
                  <div
                    className="absolute left-0 top-full mt-1 py-1 w-56 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg z-50"
                    onMouseLeave={() => setComprasOpen(false)}
                  >
                    {COMPRAS_SUBMENUS.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setComprasOpen(false)}
                        className={({ isActive }) =>
                          `block px-4 py-2 text-sm transition ${
                            isActive
                              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200 font-medium'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}
            {hasPermission(PERMISSOES.PRECIFICACAO_VER) && (
              <div className="relative" ref={engenhariaRef}>
                <button
                  type="button"
                  onClick={() => setEngenhariaOpen((v) => !v)}
                  onMouseEnter={() => setEngenhariaOpen(true)}
                  className={`inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    isEngenhariaActive
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/50'
                  }`}
                  aria-expanded={engenhariaOpen}
                  aria-haspopup="true"
                >
                  Engenharia
                  <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {engenhariaOpen && (
                  <div
                    className="absolute left-0 top-full mt-1 py-1 w-56 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg z-50"
                    onMouseLeave={() => setEngenhariaOpen(false)}
                  >
                    {ENGENHARIA_SUBMENUS.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setEngenhariaOpen(false)}
                        className={({ isActive }) =>
                          `block px-4 py-2 text-sm transition ${
                            isActive
                              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200 font-medium'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}
            {hasPermission(PERMISSOES.FINANCEIRO_VER) && (
              <div className="relative" ref={financeiroRef}>
                <button
                  type="button"
                  onClick={() => setFinanceiroOpen((v) => !v)}
                  onMouseEnter={() => setFinanceiroOpen(true)}
                  className={`inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    isFinanceiroActive
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/50'
                  }`}
                  aria-expanded={financeiroOpen}
                  aria-haspopup="true"
                >
                  Financeiro
                  <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {financeiroOpen && (
                  <div
                    className="absolute left-0 top-full mt-1 py-1 w-64 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg z-50"
                    onMouseLeave={() => setFinanceiroOpen(false)}
                  >
                    {FINANCEIRO_SUBMENUS.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setFinanceiroOpen(false)}
                        className={({ isActive }) =>
                          `block px-4 py-2 text-sm transition ${
                            isActive
                              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200 font-medium'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}
            {hasPermission(PERMISSOES.INTEGRACAO_VER) && (
              <div className="relative" ref={integracaoRef}>
                <button
                  type="button"
                  onClick={() => setIntegracaoOpen((v) => !v)}
                  onMouseEnter={() => setIntegracaoOpen(true)}
                  className={`inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    isIntegracaoActive
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/50'
                  }`}
                  aria-expanded={integracaoOpen}
                  aria-haspopup="true"
                >
                  Integração
                  <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {integracaoOpen && (
                  <div
                    className="absolute left-0 top-full mt-1 py-1 w-72 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg z-50"
                    onMouseLeave={() => setIntegracaoOpen(false)}
                  >
                    {INTEGRACAO_SUBMENUS.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setIntegracaoOpen(false)}
                        className={({ isActive }) =>
                          `block px-4 py-2 text-sm transition ${
                            isActive
                              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200 font-medium'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}
            {isMaster && (
              <NavLink
                to="/whatsapp"
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/50'
                  }`
                }
              >
                WhatsApp
              </NavLink>
            )}
            {isMaster && (
              <NavLink
                to="/situacao-api"
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/50'
                  }`
                }
              >
                Situação da API
              </NavLink>
            )}
            {hasPermission(PERMISSOES.RELATORIOS_VER) && (
              <NavLink
                to="/relatorios"
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/50'
                  }`
                }
              >
                Relatórios
              </NavLink>
            )}
          </nav>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700 transition"
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            {hasPermission(PERMISSOES.USUARIOS_GERENCIAR) && (
              <Link
                to="/usuarios"
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                title="Cadastro de usuários"
                aria-label="Cadastro de usuários"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </Link>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg bg-slate-600 hover:bg-slate-500 px-4 py-2 text-sm font-medium text-white dark:text-slate-200 transition"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-4 py-6 flex flex-col min-h-0">
        {abas.length > 0 && (
          <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto mb-4 shrink-0">
            {abas.map((aba, index) => {
              const ativa = location.pathname === aba.path;
              return (
                <div
                  key={aba.id}
                  draggable
                  onDragStart={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('button[aria-label="Fechar aba"]')) {
                      e.preventDefault();
                      return;
                    }
                    dragTabIndexRef.current = index;
                    e.dataTransfer.setData('text/plain', String(index));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dragIndex = dragTabIndexRef.current;
                    if (dragIndex == null) return;
                    reordenarAbas(dragIndex, index);
                    dragTabIndexRef.current = null;
                    justDraggedRef.current = true;
                    setTimeout(() => { justDraggedRef.current = false; }, 100);
                  }}
                  onDragEnd={() => {
                    dragTabIndexRef.current = null;
                  }}
                  className={`shrink-0 flex items-center gap-1 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition cursor-grab active:cursor-grabbing ${
                    ativa
                      ? 'border-primary-600 text-primary-600 dark:text-primary-400 bg-white dark:bg-slate-800'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (justDraggedRef.current) return;
                      navigate(aba.path);
                    }}
                    className="truncate max-w-[200px] text-left"
                  >
                    {aba.label}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fecharAba(aba.path);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 shrink-0"
                    aria-label="Fechar aba"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <PermissionGuard>
          <Outlet />
        </PermissionGuard>
      </main>

      {/* Botão fixo no rodapé: Conexão API / ERP — disponível em todas as abas */}
      <div ref={syncPanelRef} className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
        {syncPanelOpen && (
          <div className="mb-2 w-80 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl p-4 relative">
            <button
              type="button"
              onClick={() => setSyncPanelOpen(false)}
              className="absolute top-3 right-3 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              aria-label="Fechar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
            <StatusCard onSincronizado={handleSincronizado} />
          </div>
        )}
        <button
          type="button"
          onClick={() => setSyncPanelOpen((v) => !v)}
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg transition ${
            syncPanelOpen
              ? 'bg-primary-600 text-white'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
          title="Conexão com API / ERP e sincronização"
          aria-expanded={syncPanelOpen}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
          </svg>
          Conexão API / ERP
        </button>
      </div>
    </div>
  );
}
