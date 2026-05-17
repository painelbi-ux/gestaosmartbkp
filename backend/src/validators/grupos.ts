import { z } from 'zod';

/** Aceita string, vazio ou null; normalização e validação de chave ficam no controller. */
const telaPrincipalInicialField = z
  .union([z.string().max(64), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v));

const logoutInatividadeMinutosField = z
  .union([z.number().int().min(1).max(24 * 60), z.null()])
  .optional();

export const criarGrupoSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100),
  descricao: z.string().max(500).optional().nullable(),
  permissoes: z.array(z.string()).default([]),
  ativo: z.boolean().optional().default(true),
  telaPrincipalInicial: telaPrincipalInicialField,
  logoutInatividadeMinutos: logoutInatividadeMinutosField,
});

export const atualizarGrupoSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100).optional(),
  descricao: z.string().max(500).optional().nullable(),
  permissoes: z.array(z.string()).optional(),
  ativo: z.boolean().optional(),
  telaPrincipalInicial: telaPrincipalInicialField,
  logoutInatividadeMinutos: logoutInatividadeMinutosField,
});

export type CriarGrupoInput = z.infer<typeof criarGrupoSchema>;
export type AtualizarGrupoInput = z.infer<typeof atualizarGrupoSchema>;
