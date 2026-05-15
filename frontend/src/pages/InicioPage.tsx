import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { primeiraRotaPermitida } from '../utils/routePermission';

export default function InicioPage() {
  const navigate = useNavigate();
  const { telaInicialPath, mustChangePassword, profileLoaded, hasPermission, isMaster } = useAuth();

  useEffect(() => {
    if (!profileLoaded) return;
    if (mustChangePassword) return;
    const destino = telaInicialPath || primeiraRotaPermitida(hasPermission, isMaster);
    if (destino) {
      navigate(destino, { replace: true });
    }
  }, [telaInicialPath, mustChangePassword, profileLoaded, navigate, hasPermission, isMaster]);

  if (!profileLoaded) {
    return (
      <div className="h-[calc(100vh-180px)] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900">
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-180px)] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900" />
  );
}
