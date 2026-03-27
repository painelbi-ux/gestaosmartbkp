import { z } from 'zod';

export const loginSchema = z.object({
  login: z.string().min(1, 'Login é obrigatório').transform((s) => s.trim()),
  senha: z.string().min(1, 'Senha é obrigatória').transform((s) => s.trim()),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Senha atual é obrigatória').transform((s) => s.trim()),
    novaSenha: z.string().min(4, 'Nova senha deve ter no mínimo 4 caracteres').max(100).transform((s) => s.trim()),
    confirmarNovaSenha: z.string().min(1, 'Confirmação da nova senha é obrigatória').transform((s) => s.trim()),
  })
  .refine((data) => data.novaSenha === data.confirmarNovaSenha, {
    message: 'Confirmação da nova senha não confere.',
    path: ['confirmarNovaSenha'],
  });
