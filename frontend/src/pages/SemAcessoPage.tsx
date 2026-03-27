export default function SemAcessoPage() {
  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-8 text-center">
      <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-200">Sem acesso</h2>
      <p className="mt-2 text-amber-700 dark:text-amber-300">
        Seu usuário não possui permissão para acessar nenhum módulo.
      </p>
      <p className="mt-1 text-amber-700 dark:text-amber-300">
        Solicite a liberação com o administrador do sistema.
      </p>
    </div>
  );
}
