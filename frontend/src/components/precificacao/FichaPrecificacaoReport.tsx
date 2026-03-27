/**
 * Conteúdo da Ficha de Precificação para impressão e download PDF.
 * Layout conforme modelo PDF: título, dados do produto/CRM, tabela de materiais, totais e campos de markup.
 */

import { jsPDF } from 'jspdf';
import type { PrecificacaoItemRow } from '../../api/engenharia';
import type { TicketDetalhe } from '../../api/integracao';
import {
  aplicarCalculoConsumiveisEspeciais,
  isComponenteConsumivelCalculadoMarkup,
} from '../../utils/precificacaoConsumiveis';
import { computeResumoCalculoPrecificacao } from '../../utils/precificacaoResumoCalculo';

export interface FichaPrecificacaoReportData {
  idPrecificacao: number;
  codigoProduto: string;
  descricaoProduto: string;
  ncmCodigo?: string | null;
  dataPrecificacao?: string;
  usuario?: string;
  itens: PrecificacaoItemRow[];
  valores: Record<string, string>;
  ticketDetalhe?: TicketDetalhe | null;
  ticketId?: string;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const s = String(iso).trim();
  const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (mIso) {
    const ddmmyyyy = `${mIso[3]}/${mIso[2]}/${mIso[1]}`;
    const hh = mIso[4];
    const mm = mIso[5];
    const ss = mIso[6] ?? '00';
    return hh && mm ? `${ddmmyyyy} ${hh}:${mm}:${ss}` : ddmmyyyy;
  }
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function fmtDateOnly(iso?: string | null): string {
  if (!iso) return '—';
  const s = String(iso).trim();
  const mYmd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mYmd) return `${mYmd[3]}/${mYmd[2]}/${mYmd[1]}`;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(iso);
  }
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function normalizarTipoMaterial(v: string | null | undefined): 'Matéria Prima' | 'Material Secundário' | 'Embalagem' {
  const s = String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (s.includes('embalag')) return 'Embalagem';
  if (s.includes('secund')) return 'Material Secundário';
  if (s.includes('materia prima') || s.includes('prima')) return 'Matéria Prima';
  return 'Matéria Prima';
}

const MARGIN = 12;
const PAGE_W = 210;
const PAGE_H = 297;
const LINE_H = 5;
const FONT_TITLE = 14;
const FONT_NORMAL = 10;
const FONT_SMALL = 8;

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Falha ao converter imagem'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Gera e faz o download do PDF da Ficha de Precificação (sem abrir nova aba). */
export async function downloadFichaPrecificacaoPdf(data: FichaPrecificacaoReportData): Promise<void> {
  const {
    idPrecificacao,
    codigoProduto,
    descricaoProduto,
    ncmCodigo,
    dataPrecificacao,
    usuario,
    itens,
    valores,
    ticketDetalhe,
    ticketId,
  } = data;

  const itensAjustados = aplicarCalculoConsumiveisEspeciais(itens, valores);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;
  const maxW = PAGE_W - 2 * MARGIN;
  const COLOR_PRIMARY = [10, 17, 34] as const;
  const COLOR_GRID_BG = [13, 29, 65] as const;
  const COLOR_BORDER = [203, 213, 225] as const;
  const COLOR_BG_LIGHT = [248, 250, 252] as const;
  const COLOR_TEXT = [30, 41, 59] as const;

  const v = (key: string) => valores[key]?.trim() || '—';
  const t = ticketDetalhe;
  const codigoCrm = ticketId ? `#${ticketId}` : '—';
  const totalMateriais = itensAjustados.reduce((s, i) => s + (i.valorTotal ?? 0), 0);
  const now = new Date();
  const dataHoraImpressao = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const descLines = doc.splitTextToSize(descricaoProduto || '—', maxW - 6);

  // Logo pequena no canto superior esquerdo.
  const logoDataUrl = await imageUrlToDataUrl('/logo-soaco.png');
  if (logoDataUrl) {
    try {
      // Dimensão ajustada para reduzir alargamento lateral.
      doc.addImage(logoDataUrl, 'PNG', MARGIN, y - 1.5, 16, 11);
    } catch {
      // Mantém a geração do PDF mesmo se a imagem falhar.
    }
  }

  const drawDadosFixosTopo = () => {
    drawSectionHeader('Dados da precificação');
    const dadosBodyH = 24.5 + descLines.length * 3.8;
    drawSectionBody(dadosBodyH);
    doc.setFontSize(FONT_SMALL);
    doc.setFont('helvetica', 'normal');
    let yy = y + 5;
    doc.text(`Código Precificação: ${idPrecificacao}`, MARGIN + 3, yy);
    doc.text(`Data Precificação: ${fmtDate(dataPrecificacao)}`, MARGIN + 68, yy);
    yy += 4.5;
    doc.text(`Código Produto: ${codigoProduto}`, MARGIN + 3, yy);
    doc.text(`Usuário: ${usuario || '—'}`, MARGIN + 68, yy);
    yy += 4.5;
    doc.text(`NCM: ${ncmCodigo?.trim() ? ncmCodigo.trim() : '—'}`, MARGIN + 3, yy);
    yy += 4.5;
    doc.setFont('helvetica', 'bold');
    doc.text('Produto:', MARGIN + 3, yy);
    doc.setFont('helvetica', 'normal');
    yy += 3.8;
    doc.text(descLines, MARGIN + 3, yy);
    y += dadosBodyH + 4;

    drawSectionHeader('Dados CRM');
    const crmBodyH = 19;
    drawSectionBody(crmBodyH);
    yy = y + 5;
    doc.setFontSize(FONT_SMALL);
    doc.text(`Código CRM: ${codigoCrm}`, MARGIN + 3, yy);
    doc.text(`Cliente: ${(t?.cliente ?? '—').toString().slice(0, 42)}`, MARGIN + 68, yy);
    yy += 4.5;
    doc.text(`Município: ${(t?.municipio ?? '—').toString()}`, MARGIN + 3, yy);
    doc.text(`UF: ${(t?.UF ?? '—').toString()}`, MARGIN + 68, yy);
    yy += 4.5;
    doc.text(`Vendedor/Representante: ${(t?.vendedorrep ?? '—').toString().slice(0, 34)}`, MARGIN + 3, yy);
    doc.text(`Data Criação CRM: ${t?.datacriacao ? fmtDate(t.datacriacao) : '—'}`, MARGIN + 95, yy);
    yy += 4.5;
    doc.text(`Tipo Pessoa: ${(t?.tipopessoa ?? '—').toString()}`, MARGIN + 3, yy);
    y += crmBodyH + 4;
  };

  const newPageIfNeeded = (need: number) => {
    if (y + need > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
      drawDadosFixosTopo();
    }
  };

  const drawSectionHeader = (title: string) => {
    newPageIfNeeded(10);
    doc.setFillColor(...COLOR_PRIMARY);
    doc.roundedRect(MARGIN, y, maxW, 8, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT_NORMAL);
    doc.text(title, MARGIN + 3, y + 5.3);
    doc.setTextColor(...COLOR_TEXT);
    y += 8;
  };

  const drawSectionBody = (height: number) => {
    doc.setDrawColor(...COLOR_BORDER);
    doc.setFillColor(...COLOR_BG_LIGHT);
    doc.roundedRect(MARGIN, y, maxW, height, 1.5, 1.5, 'FD');
  };

  doc.setTextColor(...COLOR_TEXT);
  doc.setFontSize(FONT_TITLE);
  doc.setFont('helvetica', 'bold');
  doc.text('FICHA DE PRECIFICAÇÃO - SÓ AÇO INDUSTRIAL', PAGE_W / 2, y, { align: 'center' });
  y += LINE_H + 1;
  doc.setFontSize(FONT_SMALL);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(dataHoraImpressao, PAGE_W / 2, y, { align: 'center' });
  doc.setTextColor(...COLOR_TEXT);
  y += LINE_H + 3;

  drawDadosFixosTopo();

  drawSectionHeader('Materiais');
  const grupos: Array<{ titulo: 'Matéria Prima' | 'Material Secundário' | 'Embalagem'; itens: PrecificacaoItemRow[] }> = [
    { titulo: 'Matéria Prima', itens: [] },
    { titulo: 'Material Secundário', itens: [] },
    { titulo: 'Embalagem', itens: [] },
  ];
  for (const item of itensAjustados) {
    const tipo = normalizarTipoMaterial(item.tipoMaterial);
    grupos.find((g) => g.titulo === tipo)?.itens.push(item);
  }
  for (const grupo of grupos) {
    grupo.itens.sort((a, b) => {
      const aa = (a.componente ?? a.codigocomponente ?? '').toString();
      const bb = (b.componente ?? b.codigocomponente ?? '').toString();
      return aa.localeCompare(bb, 'pt-BR', { sensitivity: 'base' });
    });
  }

  const colW = [20, 54, 12, 20, 16, 24, 24];
  const headers = ['Código', 'Componente', 'UM', 'Últ. Ent.', 'Qtde', 'Valor Unitário', 'Valor Total'];

  const renderTabelaGrupo = (tituloGrupo: string, itensGrupo: PrecificacaoItemRow[]) => {
    newPageIfNeeded(18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT_NORMAL);
    doc.text(tituloGrupo, MARGIN, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FONT_SMALL);
    doc.text(`Itens: ${itensGrupo.length}`, MARGIN + maxW, y + 4, { align: 'right' });
    y += 6;

    let x = MARGIN;
    const tableStartY = y;
    doc.setFillColor(...COLOR_GRID_BG);
    doc.setDrawColor(...COLOR_BORDER);
    doc.rect(MARGIN, tableStartY, maxW, 8, 'FD');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT_SMALL);
    headers.forEach((h, i) => {
      const alignRight = i >= 4;
      const tx = alignRight ? x + colW[i] - 2 : x + 2;
      doc.text(h, tx, tableStartY + 5.2, alignRight ? { align: 'right' } : {});
      x += colW[i];
    });
    doc.setTextColor(...COLOR_TEXT);
    y += 8;

    if (itensGrupo.length === 0) {
      doc.setDrawColor(...COLOR_BORDER);
      doc.rect(MARGIN, y, maxW, 6.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(FONT_SMALL);
      doc.text('Sem itens neste grupo', MARGIN + 2, y + 4.5);
      y += 8.5;
      return 0;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FONT_SMALL);
    const totalGrupo = itensGrupo.reduce((acc, item) => acc + (item.valorTotal ?? 0), 0);
    const totalQtdGrupo = itensGrupo.reduce((acc, item) => {
      // Soma da Qtd deve refletir a coluna exibida no PDF (consumíveis especiais aparecem como "—")
      if (isComponenteConsumivelCalculadoMarkup(item)) return acc;
      return typeof item.qtd === 'number' && Number.isFinite(item.qtd) ? acc + item.qtd : acc;
    }, 0);

    for (const item of itensGrupo) {
      const compLines = doc.splitTextToSize(item.componente ?? '—', colW[1] - 4);
      const rowH = Math.max(6.5, compLines.length * 3.8 + 2);
      newPageIfNeeded(rowH + 2);
      const consumivelMarkup = isComponenteConsumivelCalculadoMarkup(item);

      x = MARGIN;
      doc.setDrawColor(...COLOR_BORDER);
      doc.rect(MARGIN, y, maxW, rowH);

      doc.text(item.codigocomponente ?? '—', x + 2, y + 4.5);
      x += colW[0];
      doc.text(compLines, x + 2, y + 4.2);
      x += colW[1];
      doc.text((item.unidadeMedida ?? '').trim() || '—', x + 2, y + 4.5);
      x += colW[2];
      doc.text(fmtDateOnly(item.dataEntrada), x + colW[3] - 2, y + 4.5, { align: 'right' });
      x += colW[3];
      doc.text(consumivelMarkup ? '—' : fmtNum(item.qtd), x + colW[4] - 2, y + 4.5, { align: 'right' });
      x += colW[4];
      doc.text(consumivelMarkup ? '—' : fmtCurrency(item.valorUnitario), x + colW[5] - 2, y + 4.5, { align: 'right' });
      x += colW[5];
      doc.text(fmtCurrency(item.valorTotal), x + colW[6] - 2, y + 4.5, { align: 'right' });

      let vx = MARGIN;
      for (const w of colW.slice(0, -1)) {
        vx += w;
        doc.line(vx, y, vx, y + rowH);
      }
      y += rowH;
    }

    newPageIfNeeded(8);
    doc.setFillColor(226, 232, 240);
    doc.rect(MARGIN, y, maxW, 7, 'FD');
    doc.setFont('helvetica', 'bold');
    if (tituloGrupo === 'Matéria Prima') {
      const qtdLabelRight = MARGIN + colW[0] + colW[1] + colW[2] + colW[3] - 2;
      const qtdColRight = MARGIN + colW[0] + colW[1] + colW[2] + colW[3] + colW[4] - 2;
      doc.text('Total Matéria Prima:', qtdLabelRight, y + 4.8, { align: 'right' });
      doc.text(fmtNum(totalQtdGrupo), qtdColRight, y + 4.8, { align: 'right' });
    }
    if (tituloGrupo !== 'Matéria Prima') {
      doc.text(`Total ${tituloGrupo}:`, MARGIN + maxW - colW[6] - 4, y + 4.8, { align: 'right' });
    }
    doc.text(fmtCurrency(totalGrupo), MARGIN + maxW - 2, y + 4.8, { align: 'right' });
    y += 9;
    return totalGrupo;
  };

  for (const grupo of grupos) {
    renderTabelaGrupo(grupo.titulo, grupo.itens);
    y += 1.5;
  }

  newPageIfNeeded(9);
  doc.setFillColor(203, 213, 225);
  doc.rect(MARGIN, y, maxW, 8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_NORMAL);
  doc.text('Total geral materiais:', MARGIN + maxW - colW[6] - 6, y + 5.5, { align: 'right' });
  doc.text(fmtCurrency(totalMateriais), MARGIN + maxW - 2, y + 5.5, { align: 'right' });
  y += 11;

  const resumoCalculoPdf = computeResumoCalculoPrecificacao(itensAjustados, valores);
  const precoVendaFinal = resumoCalculoPdf.precoVendaFinal;

  const calcLineH = 5.2;
  /** Altura do corpo do resumo: linhas + faixa Preço Venda (ICMS/impostos detalhados ficam abaixo do bloco). */
  const calcBodyH = 128;
  newPageIfNeeded(calcBodyH + 45);
  drawSectionHeader('Resumo de cálculo');
  drawSectionBody(calcBodyH);
  doc.setFontSize(FONT_SMALL);
  doc.setTextColor(...COLOR_TEXT);

  const resumoInnerRight = MARGIN + maxW - 3;
  /** Coluna de % termina aqui; valores alinhados à borda direita do quadro (largura total). */
  const percX = resumoInnerRight - 34;
  const valX = resumoInnerRight;
  const leftX = MARGIN + 3;
  const resumoRowW = maxW - 2;
  let cy = y + 5;
  for (const row of resumoCalculoPdf.itens) {
    if (row.tipo === 'espaco') {
      cy += 1.5;
      continue;
    }
    const { label, perc, valor, destaque } = row;
    if (destaque) {
      doc.setFillColor(226, 232, 240);
      doc.rect(MARGIN + 1, cy - 3.5, resumoRowW, 5.2, 'F');
      doc.setFont('helvetica', 'bold');
    } else {
      doc.setFont('helvetica', 'normal');
    }
    doc.text(label, leftX, cy);
    if (perc != null) doc.text(`${perc.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`, percX, cy, { align: 'right' });
    doc.text(valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), valX, cy, { align: 'right' });
    cy += calcLineH;
  }

  const impostosRows: Array<[string, number, number]> = resumoCalculoPdf.impostosDetalhe.map(
    (r) => [r.nome, r.perc, r.valor] as [string, number, number]
  );

  // faixa final preço venda (logo após o último passo do resumo)
  cy += 2;
  const finalY = cy;
  doc.setFillColor(245, 242, 0);
  doc.rect(MARGIN + 1, finalY, resumoRowW, 5.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_NORMAL);
  doc.text('Preço Venda:', leftX, finalY + 3.8);
  doc.text(precoVendaFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), valX, finalY + 3.8, { align: 'right' });
  y += calcBodyH + 4;

  // Quadro detalhado de impostos abaixo do bloco "Resumo de cálculo"
  const impostosHeaderH = 5.5;
  const impostosRowH = 4.1;
  const impostosBoxH = impostosHeaderH + impostosRows.length * impostosRowH + 2;
  newPageIfNeeded(impostosBoxH + 14);
  const boxX = MARGIN + 3;
  const boxW = maxW - 6;
  const boxY = y + 2;
  doc.setDrawColor(...COLOR_BORDER);
  doc.setFillColor(255, 255, 255);
  doc.rect(boxX, boxY, boxW, impostosBoxH, 'FD');
  doc.setFillColor(203, 213, 225);
  doc.rect(boxX, boxY, boxW, impostosHeaderH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_SMALL);
  doc.setTextColor(...COLOR_TEXT);
  doc.text('IMPOSTOS', boxX + boxW / 2, boxY + 3.8, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  let iy = boxY + impostosHeaderH + 4;
  impostosRows.forEach(([nome, perc, val]) => {
    doc.text(nome, boxX + 2, iy);
    doc.text(`${perc.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`, boxX + boxW - 32, iy, { align: 'right' });
    doc.text(val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), boxX + boxW - 2, iy, { align: 'right' });
    iy += impostosRowH;
  });
  y = boxY + impostosBoxH + 6;

  doc.setFontSize(FONT_SMALL);
  doc.setTextColor(71, 85, 105);
  newPageIfNeeded(8);
  doc.text('Documento gerado pelo Gestão Smart 2.0', PAGE_W / 2, y, { align: 'center' });

  const fileName = `Ficha-Precificacao-${codigoProduto.replace(/\s/g, '-')}-${idPrecificacao}.pdf`;
  doc.save(fileName);
}

export function buildFichaPrecificacaoPrintHtml(data: FichaPrecificacaoReportData): string {
  const {
    idPrecificacao,
    codigoProduto,
    descricaoProduto,
    ncmCodigo,
    dataPrecificacao,
    usuario,
    itens,
    valores,
    ticketDetalhe,
    ticketId,
  } = data;

  const itensAjustados = aplicarCalculoConsumiveisEspeciais(itens, valores);
  const totalMateriais = itensAjustados.reduce((s, i) => s + (i.valorTotal ?? 0), 0);
  const now = new Date();
  const dataHoraImpressao = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const v = (key: string) => valores[key]?.trim() || '—';
  const label = (key: string, title: string) => `${title}: ${v(key)}`;

  const imprimirValores = [
    { key: 'maoDeObraDireta', title: 'Mão de Obra Direta' },
    { key: 'maoDeObraIndireta', title: 'Mão de Obra Indireta' },
    { key: 'depreciacao', title: 'Depreciação' },
    { key: 'despesasAdministrativas', title: 'Despesas Administrativas' },
    { key: 'frete', title: 'Frete' },
    { key: 'propaganda', title: 'Propaganda' },
    { key: 'embalagem', title: 'Embalagem' },
    { key: 'lucro', title: 'Lucro' },
    { key: 'cofins', title: 'Impostos Federais (COFINS)' },
    { key: 'icms', title: 'ICMS' },
    { key: 'comissoes', title: 'Comissões' },
    { key: 'pis', title: 'PIS' },
    { key: 'csll', title: 'CSLL' },
    { key: 'irpj', title: 'IRPJ' },
    { key: 'ipi', title: 'IPI' },
    { key: 'fosfatizacao', title: 'Fosfatização' },
    { key: 'gasGlp', title: 'Gás GLP' },
    { key: 'solda', title: 'Solda' },
    { key: 'sucata', title: 'Sucata' },
  ] as const;

  const rows = itensAjustados
    .map((i) => {
      const esp = isComponenteConsumivelCalculadoMarkup(i);
      return `<tr>
        <td>${i.codigocomponente ?? '—'}</td>
        <td>${(i.componente ?? '—').replace(/</g, '&lt;')}</td>
        <td class="num">${esp ? '—' : fmtNum(i.qtd)}</td>
        <td class="num">${esp ? '—' : fmtCurrency(i.valorUnitario)}</td>
        <td class="num">${fmtCurrency(i.valorTotal)}</td>
      </tr>`;
    })
    .join('');

  const t = ticketDetalhe;
  const codigoCrm = ticketId ? `#${ticketId}` : '—';
  const cliente = t?.cliente ?? '—';
  const municipio = t?.municipio ?? '—';
  const uf = t?.UF ?? '—';
  const vendedor = t?.vendedorrep ?? '—';
  const dataCriacaoCrm = t?.datacriacao ? fmtDate(t.datacriacao) : '—';
  const tipoPessoa = t?.tipopessoa ?? '—';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Ficha de Precificação - ${codigoProduto}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Poppins', system-ui, sans-serif;
      font-size: 11px;
      line-height: 1.35;
      color: #1e293b;
      margin: 0;
      padding: 16px 20px;
      max-width: 100%;
    }
    h1 {
      font-size: 14px;
      font-weight: 700;
      margin: 0 0 4px 0;
      text-align: center;
    }
    .subtitle { text-align: center; margin-bottom: 12px; color: #475569; }
    .block {
      margin-bottom: 14px;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
    }
    .block-title { font-weight: 600; margin-bottom: 6px; font-size: 11px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px 12px; }
    .field { display: flex; gap: 6px; }
    .field-label { font-weight: 500; color: #475569; min-width: 100px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 8px; text-align: left; }
    th { background: #0f172a; color: #fff; font-weight: 600; }
    .num { text-align: right; white-space: nowrap; }
    .total-row { font-weight: 600; background: #e2e8f0; }
    .markup-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 12px; margin-top: 8px; }
    .markup-item { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid #e2e8f0; }
    @media print {
      body { padding: 12px; }
      .block { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>FICHA DE PRECIFICAÇÃO - SÓ AÇO INDUSTRIAL</h1>
  <p class="subtitle">${dataHoraImpressao}</p>

  <div class="block">
    <div class="block-title">Dados da precificação</div>
    <div class="grid-4">
      <div class="field"><span class="field-label">Código Precificação:</span> ${idPrecificacao}</div>
      <div class="field"><span class="field-label">Data Precificação:</span> ${fmtDate(dataPrecificacao)}</div>
      <div class="field"><span class="field-label">Código Produto:</span> ${codigoProduto}</div>
      <div class="field"><span class="field-label">Usuário:</span> ${usuario || '—'}</div>
      <div class="field"><span class="field-label">NCM:</span> ${ncmCodigo?.trim() ? String(ncmCodigo).replace(/</g, '&lt;') : '—'}</div>
    </div>
    <div style="margin-top:6px"><span class="field-label">Produto:</span><br>${(descricaoProduto || '—').replace(/</g, '&lt;')}</div>
  </div>

  <div class="block">
    <div class="block-title">Dados CRM</div>
    <div class="grid-4">
      <div class="field"><span class="field-label">Código CRM:</span> ${codigoCrm}</div>
      <div class="field"><span class="field-label">Cliente:</span> ${(cliente as string).replace(/</g, '&lt;')}</div>
      <div class="field"><span class="field-label">Município:</span> ${(municipio as string).replace(/</g, '&lt;')}</div>
      <div class="field"><span class="field-label">UF:</span> ${uf}</div>
      <div class="field"><span class="field-label">Vendedor/Representante:</span> ${(vendedor as string).replace(/</g, '&lt;')}</div>
      <div class="field"><span class="field-label">Data Criação CRM:</span> ${dataCriacaoCrm}</div>
      <div class="field"><span class="field-label">Tipo Pessoa:</span> ${(tipoPessoa as string).replace(/</g, '&lt;')}</div>
    </div>
  </div>

  <div class="block">
    <div class="block-title">Materiais</div>
    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Componente</th>
          <th class="num">Qtde</th>
          <th class="num">Custo Unit.</th>
          <th class="num">Custo Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="total-row">
          <td colspan="4" style="text-align:right">Total:</td>
          <td class="num">${fmtCurrency(totalMateriais)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="block">
    <div class="block-title">Campos de markup (%)</div>
    <div class="markup-grid">
      ${imprimirValores.map(({ key, title }) => `<div class="markup-item"><span>${title}</span><span>${v(key)}</span></div>`).join('')}
    </div>
  </div>

  <p class="subtitle" style="margin-top:16px">Documento gerado pelo Gestão Smart 2.0</p>
</body>
</html>`;
}
