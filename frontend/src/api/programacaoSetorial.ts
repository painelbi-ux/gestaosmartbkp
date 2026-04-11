import { apiJson } from './client';

export type ProgramacaoSetorialPlanningItem = {
  idChave: string;
  id: string;
  Observacoes: string;
  PD: string;
  Previsao: string;
  Cliente: string;
  Cod: string;
  'Descricao do produto': string;
  'Setor de Producao': string;
  Recurso?: string;
  tipoF?: string;
  'Qtde Pendente Real': number;
};

export async function getProgramacaoSetorialPlanning(observacoes?: string): Promise<{
  data: ProgramacaoSetorialPlanningItem[];
}> {
  const qs = observacoes?.trim() ? `?observacoes=${encodeURIComponent(observacoes.trim())}` : '';
  return apiJson(`/api/programacao-setorial/planning${qs}`);
}

export type ProgramacaoSetorialEstoqueRow = {
  cod: string;
  descricao: string;
  saldoSetorFinal: number;
};

export async function getProgramacaoSetorialEstoque(): Promise<{
  data: ProgramacaoSetorialEstoqueRow[];
}> {
  return apiJson('/api/programacao-setorial/estoque');
}

export type ProgramacaoSetorialRegistro = {
  id: number;
  nome: string;
  status: 'PENDENTE' | 'EM_EXECUCAO' | 'CONCLUIDA' | 'CANCELADA';
  observacao: string | null;
  /** JSON serializado no backend (SQLite). */
  dadosProgramacao?: string | null;
  criadoPor: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listarProgramacaoSetorialRegistros(): Promise<{ data: ProgramacaoSetorialRegistro[] }> {
  return apiJson('/api/programacao-setorial/registros');
}

export async function criarProgramacaoSetorialRegistro(payload: {
  nome: string;
  observacao?: string | null;
  dadosProgramacao?: unknown;
}): Promise<ProgramacaoSetorialRegistro> {
  return apiJson('/api/programacao-setorial/registros', { method: 'POST', body: payload as unknown as BodyInit });
}

export async function atualizarProgramacaoSetorialRegistro(
  id: number,
  payload: {
    nome?: string;
    observacao?: string | null;
    status?: ProgramacaoSetorialRegistro['status'];
    /** Objeto ou JSON já serializado; usado p.ex. para congelar datas da impressão no snapshot. */
    dadosProgramacao?: unknown;
  }
): Promise<ProgramacaoSetorialRegistro> {
  return apiJson(`/api/programacao-setorial/registros/${id}`, { method: 'PATCH', body: payload as unknown as BodyInit });
}

