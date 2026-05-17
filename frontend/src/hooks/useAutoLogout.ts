import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'mousemove'] as const;

/**
 * Desconecta o usuário após período de inatividade (minutos), se configurado no grupo.
 */
export function useAutoLogout(minutos: number | null | undefined, onLogout: () => void): void {
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

  useEffect(() => {
    if (minutos == null || minutos < 1) return;

    const timeoutMs = minutos * 60 * 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        onLogoutRef.current();
      }, timeoutMs);
    };

    const onActivity = () => schedule();

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule();
    };
    document.addEventListener('visibilitychange', onVisible);

    schedule();

    return () => {
      if (timer) clearTimeout(timer);
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [minutos]);
}
