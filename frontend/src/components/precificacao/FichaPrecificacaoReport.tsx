/**
 * Conteúdo da Ficha de Precificação para impressão e download PDF.
 * Layout conforme modelo PDF: título, dados do produto/CRM, tabela de materiais, totais e campos de markup.
 */

import { jsPDF } from 'jspdf';
import type { PrecificacaoItemRow } from '../../api/engenharia';
import type { TicketDetalhe } from '../../api/integracao';

export interface FichaPrecificacaoReportData {
  idPrecificacao: number;
  codigoProduto: string;
  descricaoProduto: string;
  dataPrecificacao?: string;
  usuario?: string;
  itens: PrecificacaoItemRow[];
  valores: Record<string, string>;
  ticketDetalhe?: TicketDetalhe | null;
  ticketId?: string;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
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

const MARGIN = 12;
const PAGE_W = 210;
const PAGE_H = 297;
const LINE_H = 5;
const FONT_TITLE = 14;
const FONT_NORMAL = 10;
const FONT_SMALL = 8;

/** Gera e faz o download do PDF da Ficha de Precificação (sem abrir nova aba). */
export function downloadFichaPrecificacaoPdf(data: FichaPrecificacaoReportData): void {
  const {
    idPrecificacao,
    codigoProduto,
    descricaoProduto,
    dataPrecificacao,
    usuario,
    itens,
    valores,
    ticketDetalhe,
    ticketId,
  } = data;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;
  const maxW = PAGE_W - 2 * MARGIN;

  const v = (key: string) => valores[key]?.trim() || '—';
  const t = ticketDetalhe;
  const codigoCrm = ticketId ? `#${ticketId}` : '—';
  const totalMateriais = itens.reduce((s, i) => s + (i.valorTotal ?? 0), 0);
  const now = new Date();
  const dataHoraImpressao = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const newPageIfNeeded = (need: number) => {
    if (y + need > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  doc.setFontSize(FONT_TITLE);
  doc.setFont('helvetica', 'bold');
  doc.text('FICHA DE PRECIFICAÇÃO - SÓ AÇO INDUSTRIAL', PAGE_W / 2, y, { align: 'center' });
  y += LINE_H + 2;
  doc.setFontSize(FONT_SMALL);
  doc.setFont('helvetica', 'normal');
  doc.text(dataHoraImpressao, PAGE_W / 2, y, { align: 'center' });
  y += LINE_H + 4;

  doc.setFontSize(FONT_NORMAL);
  doc.setFont('helvetica', 'bold');
  doc.text('Dados da precificação', MARGIN, y);
  y += LINE_H;
  doc.setFont('helvetica', 'normal');
  doc.text(`Código Precificação: ${idPrecificacao}`, MARGIN, y);
  doc.text(`Data Precificação: ${fmtDate(dataPrecificacao)}`, MARGIN + 60, y);
  y += LINE_H;
  doc.text(`Código Produto: ${codigoProduto}`, MARGIN, y);
  doc.text(`Usuário: ${usuario || '—'}`, MARGIN + 60, y);
  y += LINE_H;
  doc.text('Produto:', MARGIN, y);
  y += LINE_H * 0.6;
  const descLines = doc.splitTextToSize(descricaoProduto || '—', maxW);
  doc.text(descLines, MARGIN, y);
  y += descLines.length * LINE_H * 0.8 + 4;

  newPageIfNeeded(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Dados CRM', MARGIN, y);
  y += LINE_H;
  doc.setFont('helvetica', 'normal');
  doc.text(`Código CRM: ${codigoCrm}`, MARGIN, y);
  doc.text(`Cliente: ${(t?.cliente ?? '—').toString().slice(0, 40)}`, MARGIN + 70, y);
  y += LINE_H;
  doc.text(`Município: ${(t?.municipio ?? '—').toString()}`, MARGIN, y);
  doc.text(`UF: ${(t?.UF ?? '—').toString()}`, MARGIN + 70, y);
  y += LINE_H;
  doc.text(`Vendedor/Representante: ${(t?.vendedorrep ?? '—').toString().slice(0, 35)}`, MARGIN, y);
  doc.text(`Data Criação CRM: ${t?.datacriacao ? fmtDate(t.datacriacao) : '—'}`, MARGIN + 95, y);
  y += LINE_H;
  doc.text(`Tipo Pessoa: ${(t?.tipopessoa ?? '—').toString()}`, MARGIN, y);
  y += LINE_H + 4;

  newPageIfNeeded(30);
  doc.setFont('helvetica', 'bold');
  doc.text('Materiais', MARGIN, y);
  y += LINE_H;
  const colW = [22, 70, 18, 28, 32];
  const headers = ['Código', 'Componente', 'Qtde', 'C. Unit.', 'C. Total'];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_SMALL);
  let x = MARGIN;
  headers.forEach((h, i) => {
    doc.text(h, x + (i === 1 ? 0 : (colW[i] || 0) / 2), y, i >= 2 ? { align: 'right' } : {});
    x += colW[i];
  });
  y += LINE_H;
  doc.setFont('helvetica', 'normal');
  const rowH = 5.5;
  for (const i of itens) {
    newPageIfNeeded(rowH + 2);
    x = MARGIN;
    const comp = (i.componente ?? '—').slice(0, 45);
    doc.text(i.codigocomponente ?? '—', x, y);
    x += colW[0];
    doc.text(comp, x, y);
    x += colW[1];
    doc.text(fmtNum(i.qtd), x + colW[2], y, { align: 'right' });
    x += colW[2];
    doc.text(fmtCurrency(i.valorUnitario), x + colW[3], y, { align: 'right' });
    x += colW[3];
    doc.text(fmtCurrency(i.valorTotal), x + colW[4], y, { align: 'right' });
    y += rowH;
  }
  newPageIfNeeded(rowH + 2);
  doc.setFont('helvetica', 'bold');
  doc.text('Total:', MARGIN + colW[0] + colW[1] + colW[2] + colW[3], y, { align: 'right' });
  doc.text(fmtCurrency(totalMateriais), PAGE_W - MARGIN - colW[4], y, { align: 'right' });
  y += LINE_H + 4;

  newPageIfNeeded(50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_NORMAL);
  doc.text('Campos de markup (%)', MARGIN, y);
  y += LINE_H;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FONT_SMALL);
  const markupItems = [
    { key: 'maoDeObraDireta', title: 'Mão de Obra Direta' },
    { key: 'maoDeObraIndireta', title: 'Mão de Obra Indireta' },
    { key: 'depreciacao', title: 'Depreciação' },
    { key: 'despesasAdministrativas', title: 'Despesas Administrativas' },
    { key: 'frete', title: 'Frete' },
    { key: 'propaganda', title: 'Propaganda' },
    { key: 'embalagem', title: 'Embalagem' },
    { key: 'lucro', title: 'Lucro' },
    { key: 'cofins', title: 'COFINS' },
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
  for (const { key, title } of markupItems) {
    doc.text(`${title}: ${v(key)}`, MARGIN, y);
    y += LINE_H * 0.9;
  }
  y += 6;
  doc.setFontSize(FONT_SMALL);
  doc.text('Documento gerado pelo Gestão Smart 2.0', PAGE_W / 2, y, { align: 'center' });

  const fileName = `Ficha-Precificacao-${codigoProduto.replace(/\s/g, '-')}-${idPrecificacao}.pdf`;
  doc.save(fileName);
}

export function buildFichaPrecificacaoPrintHtml(data: FichaPrecificacaoReportData): string {
  const {
    idPrecificacao,
    codigoProduto,
    descricaoProduto,
    dataPrecificacao,
    usuario,
    itens,
    valores,
    ticketDetalhe,
    ticketId,
  } = data;

  const totalMateriais = itens.reduce((s, i) => s + (i.valorTotal ?? 0), 0);
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

  const rows = itens.map(
    (i) =>
      `<tr>
        <td>${i.codigocomponente ?? '—'}</td>
        <td>${(i.componente ?? '—').replace(/</g, '&lt;')}</td>
        <td class="num">${fmtNum(i.qtd)}</td>
        <td class="num">${fmtCurrency(i.valorUnitario)}</td>
        <td class="num">${fmtCurrency(i.valorTotal)}</td>
      </tr>`
  ).join('');

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
