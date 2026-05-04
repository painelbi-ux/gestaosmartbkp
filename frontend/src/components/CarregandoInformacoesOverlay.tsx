/**
 * Overlay escuro com spinner e texto — uso durante carregamento de filtros,
 * gravação de análises, etc. (viewport = tela; contained = sobre o pai `relative`).
 */
export type CarregandoInformacoesOverlayProps = {
  show: boolean;
  mensagem?: string;
  mode?: 'viewport' | 'contained';
  className?: string;
};

export default function CarregandoInformacoesOverlay({
  show,
  mensagem = 'Carregando informações...',
  mode = 'viewport',
  className = '',
}: CarregandoInformacoesOverlayProps) {
  if (!show) return null;

  const position =
    mode === 'viewport'
      ? 'fixed inset-0 z-[100] flex items-center justify-center'
      : 'absolute inset-0 z-50 flex min-h-[12rem] items-center justify-center rounded-b-xl';

  return (
    <div
      className={`${position} bg-[#1a2634]/96 backdrop-blur-[2px] ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-4 px-8 py-10">
        <div className="relative h-12 w-12 shrink-0" aria-hidden>
          <div className="absolute inset-0 rounded-full border-[3px] border-sky-500/25" />
          <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-sky-400 border-r-sky-500/40 animate-spin" />
        </div>
        <p className="max-w-sm text-center text-sm font-medium tracking-tight text-slate-200">{mensagem}</p>
      </div>
    </div>
  );
}
