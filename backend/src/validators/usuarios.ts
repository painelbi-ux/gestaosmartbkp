import { z } from 'zod';

export const criarUsuarioSchema = z.object({
  login: z.string().min(1, 'Login é obrigatório').max(50),
  senha: z.string().min(4, 'Senha deve ter no mínimo 4 caracteres').max(100),
  nome: z.string().min(1, 'Nome é obrigatório').max(100),
  email: z.string().email('E-mail inválido').max(120).optional().nullable(),
  telefone: z.string().max(20).optional().nullable(),
  grupoId: z.number().int().positive(),
  ativo: z.boolean().optional().default(true),
  isCommercialTeam: z.boolean().optional().default(false),
  permissoes: z.array(z.string()).optional().default([]),
  /** Foto do usuário (data URL base64 ou URL). Opcional; máx. 500KB em base64. */
  fotoUrl: z.string().max(700000).optional().nullable(),
});

export const atualizarUsuarioSchema = z.object({
  /** Se informado, altera a senha (hash). */
  senha: z.string().min(4, 'Senha deve ter no mínimo 4 caracteres').max(100).optional(),
  /** Se `null`, limpa o nome. Se `undefined`, não altera. */
  nome: z.string().max(100).optional().nullable(),
  email: z.string().email('E-mail inválido').max(120).optional().nullable(),
  telefone: z.string().max(20).optional().nullable(),
  /** Se `null`, remove do grupo. Se `undefined`, não altera. */
  grupoId: z.number().int().positive().optional().nullable(),
  ativo: z.boolean().optional(),
  isCommercialTeam: z.boolean().optional(),
  permissoes: z.array(z.string()).optional(),
  /** Se `null`, remove a foto. Se `undefined`, não altera. */
  fotoUrl: z.string().max(700000).optional().nullable(),
});
