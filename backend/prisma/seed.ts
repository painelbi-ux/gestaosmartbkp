/**
 * Seed: cria usuários de exemplo e grupos com permissões.
 * Execute: npm run seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { TODAS_PERMISSOES } from '../src/config/permissoes.js';
import { GRUPO_MASTER_NOME } from '../src/config/grupoMaster.js';

const prisma = new PrismaClient();

const PERM_MASTER = JSON.stringify([...TODAS_PERMISSOES]);

const PERM_ALL = JSON.stringify([
  'dashboard.ver',
  'pedidos.ver',
  'pedidos.editar',
  'heatmap.ver',
  'compras.ver',
  'relatorios.ver',
  'integracao.ver',
  'usuarios.gerenciar',
]);
const PERM_OPERADOR = JSON.stringify([
  'dashboard.ver',
  'pedidos.ver',
  'pedidos.editar',
  'heatmap.ver',
  'compras.ver',
  'relatorios.ver',
  'integracao.ver',
]);
const PERM_VISUALIZADOR = JSON.stringify([
  'dashboard.ver',
  'pedidos.ver',
  'relatorios.ver',
]);

async function main() {
  // Grupos de usuários
  const admin = await prisma.grupoUsuario.upsert({
    where: { nome: 'Administrador' },
    update: { permissoes: PERM_ALL, descricao: 'Acesso total ao sistema' },
    create: {
      nome: 'Administrador',
      descricao: 'Acesso total ao sistema',
      permissoes: PERM_ALL,
    },
  });
  const operador = await prisma.grupoUsuario.upsert({
    where: { nome: 'Operador' },
    update: { permissoes: PERM_OPERADOR, descricao: 'Pedidos e relatórios; pode editar previsões' },
    create: {
      nome: 'Operador',
      descricao: 'Pedidos e relatórios; pode editar previsões',
      permissoes: PERM_OPERADOR,
    },
  });
  await prisma.grupoUsuario.upsert({
    where: { nome: 'Visualizador' },
    update: { permissoes: PERM_VISUALIZADOR, descricao: 'Apenas visualização (dashboard, pedidos, relatórios)' },
    create: {
      nome: 'Visualizador',
      descricao: 'Apenas visualização (dashboard, pedidos, relatórios)',
      permissoes: PERM_VISUALIZADOR,
    },
  });
  const grupoMaster = await prisma.grupoUsuario.upsert({
    where: { nome: GRUPO_MASTER_NOME },
    update: {
      permissoes: PERM_MASTER,
      descricao: 'Acesso total ao sistema (equivalente ao usuário master)',
      ativo: true,
    },
    create: {
      nome: GRUPO_MASTER_NOME,
      descricao: 'Acesso total ao sistema (equivalente ao usuário master)',
      permissoes: PERM_MASTER,
      ativo: true,
    },
  });
  console.log('Seed: grupos Administrador, Operador, Visualizador e Master criados.');

  // Usuário master (acesso principal) - grupo Master
  const senhaMaster = await bcrypt.hash('123', 10);
  await prisma.usuario.upsert({
    where: { login: 'master' },
    update: { senhaHash: senhaMaster, grupoId: grupoMaster.id },
    create: {
      login: 'master',
      senhaHash: senhaMaster,
      nome: 'Master',
      grupoId: grupoMaster.id,
    },
  });
  console.log('Seed: usuário master criado (login: master, senha: 123)');

  // Usuário admin (opcional) - grupo Administrador
  const senhaAdmin = await bcrypt.hash('admin123', 10);
  await prisma.usuario.upsert({
    where: { login: 'admin' },
    update: { grupoId: admin.id },
    create: {
      login: 'admin',
      senhaHash: senhaAdmin,
      nome: 'Administrador',
      grupoId: admin.id,
    },
  });
  console.log('Seed: usuário admin criado (login: admin, senha: admin123)');

  // Motivos de alteração sugeridos (popup de ajuste)
  const motivosPadrao = [
    'Atraso no fornecedor',
    'Ajuste de programação de produção',
    'Solicitação do cliente',
    'Problema de logística',
    'Reagendamento por demanda',
  ];
  for (const descricao of motivosPadrao) {
    await prisma.motivoSugestao.upsert({
      where: { descricao },
      update: {},
      create: { descricao },
    });
  }
  console.log('Seed: 5 motivos de alteração cadastrados.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
