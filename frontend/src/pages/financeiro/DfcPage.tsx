import ArvoreContasDfc from './dfc/ArvoreContasDfc';

export default function DfcPage() {
  return (
    <div className="space-y-6 w-full min-w-0">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          DFC — Demonstração dos Fluxos de Caixa
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
          Estrutura DFC (planilha): contas sintéticas (S) e analíticas (A). Use as setas para abrir subníveis ou
          expandir/recolher tudo.
        </p>
      </div>

      <ArvoreContasDfc />
    </div>
  );
}
