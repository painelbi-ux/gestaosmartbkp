import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function InicioPage() {
  const navigate = useNavigate();
  const { telaInicialPath, mustChangePassword } = useAuth();

  useEffect(() => {
    if (mustChangePassword) return;
    if (telaInicialPath) {
      navigate(telaInicialPath, { replace: true });
    }
  }, [telaInicialPath, mustChangePassword, navigate]);

  return (
    <div className="h-[calc(100vh-180px)] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900" />
  );
}
