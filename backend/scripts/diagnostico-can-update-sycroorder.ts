/**
 * Diagnostico: para um usuário, dizer quais cards ele pode atualizar
 * (conforme regras do updateOrder em sycroorderController).
 *
 * Uso: npx tsx scripts/diagnostico-can-update-sycroorder.ts [login]
 * Ex.: npx tsx scripts/diagnostico-can-update-sycroorder.ts marquesfilho2
 */
import { prisma } from '../src/config/prisma.js';

function normalizeLogin(login?: string | null): string {
  return String(login ?? '').trim().toLowerCase();
}

function isGrupoAdministrador(grupoNome?: string | null): boolean {
  const n = normalizeLogin(grupoNome);
  return n === 'admin' || n === 'administrador';
}

function isResponsavelJosenildo(deliveryMethod: string): boolean {
  const fm = String(deliveryMethod ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  return (
    (fm.includes('entrega') && fm.includes('grande')) ||
    (fm.includes('retirada') && fm.includes('moveis')) ||
    fm.includes('so aco')
  );
}

type Decision = {
  order_number: string;
  id: number;
  status: string;
  delivery_method: string;
  created_by?: number | null;
  isCriador: boolean;
  isAdminGrupo: boolean;
  hasResponsavel: boolean;
  isJosenildo: boolean;
  isVinicius: boolean;
  canRespond: boolean;
  reason: string;
};

async function main() {
  const login = process.argv[2] ? String(process.argv[2]) : 'marquesfilho2';
  const loginNorm = normalizeLogin(login);

  const u = await prisma.usuario.findUnique({
    where: { login },
    select: { id: true, login: true, grupoId: true, grupo: { select: { nome: true } } },
  });
  if (!u) {
    console.log(`Usuário "${login}" não encontrado no banco (table usuario).`);
    return;
  }

  const isAdminGrupo = !!u.grupo?.nome && isGrupoAdministrador(u.grupo.nome);

  const orders = await prisma.sycroOrderOrder.findMany({
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      order_number: true,
      status: true,
      delivery_method: true,
      created_by: true,
    },
  });

  const decisions: Decision[] = orders.map((o) => {
    const hasResponsavel = isResponsavelJosenildo(o.delivery_method);
    const isCriador = o.created_by != null && o.created_by === u.id;
    const isJosenildo = loginNorm === 'josenildo';
    const isVinicius = loginNorm === 'viniciusrodrigues';

    const canRespondBase = hasResponsavel
      ? isCriador || isJosenildo || isVinicius
      : !isJosenildo || isCriador;
    const canRespond = isAdminGrupo || canRespondBase;

    let reason = '';
    if (String(o.status) === 'FINISHED') {
      reason = 'Bloqueado: card em FINISHED (apenas visualização).';
    } else if (!canRespond) {
      reason = hasResponsavel
        ? 'Bloqueado: rota indica responsável josenildo e usuário não é criador nem josenildo nem vinicius.'
        : 'Bloqueado: rota não indica responsável josenildo, mas usuário é josenildo e não é criador.';
    } else {
      reason = hasResponsavel
        ? 'Permitido: rota indica responsável josenildo e usuário é criador/josenildo/vinicius.'
        : 'Permitido: rota não indica responsável josenildo (ou usuário é criador).';
    }

    return {
      id: o.id,
      order_number: o.order_number,
      status: String(o.status),
      delivery_method: o.delivery_method,
      created_by: o.created_by,
      isCriador,
      isAdminGrupo,
      hasResponsavel,
      isJosenildo,
      isVinicius,
      canRespond,
      reason,
    };
  });

  console.log(`Diagnostico update SycroOrder para login="${login}" (grupoAdmin=${isAdminGrupo})`);
  console.log(`Total cards=${decisions.length}\n`);

  // Prioriza mostrar os que bloqueiam
  const sorted = [...decisions].sort((a, b) => Number(b.canRespond) - Number(a.canRespond) || (b.id - a.id));
  for (const d of sorted.slice(0, 30)) {
    console.log(
      `#${d.id} pedido=${d.order_number} status=${d.status} criador=${d.created_by ?? 'null'} ` +
        `hasResp=${d.hasResponsavel ? 'sim' : 'não'} can=${d.canRespond ? 'sim' : 'não'}; ${d.reason}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

