import { z } from 'zod';

export const ajustarPrevisaoSchema = z.object({
  previsao_nova: z.string().refine(
    (v) => !Number.isNaN(new Date(v).getTime()),
    { message: 'Data inválida (use ISO ou YYYY-MM-DD)' }
  ),
  motivo: z.string().min(1, 'Motivo é obrigatório').max(500),
  observacao: z.string().max(1000).optional().nullable(),
  /** Se true, replica motivo/observação e nova previsão para todos os itens da mesma rota/carrada (ROTA …). */
  replicate_carrada: z.boolean().optional(),
  /**
   * Se informado, grava o ajuste como override apenas para esta rota (Observacoes do romaneio).
   * Útil quando o mesmo (PD, item) está em 2+ rotas e o PCP quer datas distintas por rota.
   * Quando omitido, grava como ajuste base (vale para todas as rotas em que o (PD, item) aparecer).
   */
  rota: z.string().max(500).optional().nullable(),
});

export type AjustarPrevisaoInput = z.infer<typeof ajustarPrevisaoSchema>;

const itemAjusteLoteSchema = z.object({
  id_pedido: z.string().min(1),
  previsao_nova: z.string().optional(),
  motivo: z.string().max(500).optional().default(''),
  /** Observação do ajuste (coluna Observação no export/import). Armazenada na tabela de previsão e exibida no histórico. */
  observacao: z.string().max(1000).optional().nullable(),
  previsao_atual: z.string().optional(),
  /**
   * Rota (Observacoes) da linha selecionada.
   *   - Quando `apply_rota=true` (ou no fluxo do lote do Gerenciador): grava override por rota.
   *   - Caso contrário: campo é só metadado de validação (verificar conflitos de carrada).
   */
  rota: z.string().optional(),
  /** Se true, grava o ajuste como override apenas para a `rota` informada. Se false/ausente, grava como ajuste base. */
  apply_rota: z.boolean().optional(),
  /** Coluna Igual? do arquivo (true = Nova previsão = Previsão atual). Importação rejeitada se qualquer linha tiver igual: true. */
  igual: z.boolean().optional(),
});

export const ajustarPrevisaoLoteSchema = z.object({
  ajustes: z.array(itemAjusteLoteSchema).min(1).max(1000),
});

export type AjustarPrevisaoLoteInput = z.infer<typeof ajustarPrevisaoLoteSchema>;

export const listarPedidosQuerySchema = z.object({
  cliente: z.string().optional(),
  observacoes: z.string().optional(),
  pd: z.string().optional(),
  cod: z.string().optional(),
  data_emissao_ini: z.string().optional(),
  data_emissao_fim: z.string().optional(),
  data_entrega_ini: z.string().optional(),
  data_entrega_fim: z.string().optional(),
  data_previsao_anterior_ini: z.string().optional(),
  data_previsao_anterior_fim: z.string().optional(),
  data_ini: z.string().optional(),
  data_fim: z.string().optional(),
  atrasados: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  grupo_produto: z.string().optional(),
  setor_producao: z.string().optional(),
  uf: z.string().optional(),
  municipio_entrega: z.string().optional(),
  motivo: z.string().optional(),
  vendedor: z.string().optional(),
  tipo_f: z.string().optional(),
  status: z.string().optional(),
  metodo: z.string().optional(),
  forma_pagamento: z.string().optional(),
  descricao_produto: z.string().optional(),
  a_vista: z.string().optional(),
  requisicao_loja: z.string().optional(),
  page: z.string().optional().transform((v) => (v ? Math.max(1, parseInt(v, 10) || 1) : 1)),
  limit: z.string().optional().transform((v) => (v ? Math.min(500, Math.max(1, parseInt(v, 10) || 100)) : 100)),
  /** JSON array de { id: string, dir: 'asc'|'desc' } para classificação antes da paginação. */
  sort_levels: z
    .string()
    .optional()
    .transform((v) => {
      if (!v?.trim()) return undefined;
      try {
        const arr = JSON.parse(v) as unknown;
        if (!Array.isArray(arr) || arr.length === 0) return undefined;
        return arr
          .filter((x): x is { id: string; dir: 'asc' | 'desc' } => typeof x?.id === 'string' && (x.dir === 'asc' || x.dir === 'desc'))
          .slice(0, 10);
      } catch {
        return undefined;
      }
    }),
});

export type ListarPedidosQuery = z.infer<typeof listarPedidosQuerySchema>;

export const limparHistoricoSchema = z.object({
  senha: z.string().min(1, 'Senha é obrigatória para confirmar a ação'),
});
export type LimparHistoricoInput = z.infer<typeof limparHistoricoSchema>;
