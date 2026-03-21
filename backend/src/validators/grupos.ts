import { z } from 'zod';

export const criarGrupoSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100),
  descricao: z.string().max(500).optional().nullable(),
  permissoes: z.array(z.string()).default([]),
  ativo: z.boolean().optional().default(true),
});

export const atualizarGrupoSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100).optional(),
  descricao: z.string().max(500).optional().nullable(),
  permissoes: z.array(z.string()).optional(),
  ativo: z.boolean().optional(),
});

export type CriarGrupoInput = z.infer<typeof criarGrupoSchema>;
export type AtualizarGrupoInput = z.infer<typeof atualizarGrupoSchema>;
