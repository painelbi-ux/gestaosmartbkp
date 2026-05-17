import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import type { RoteiroResultado } from './heatmapRoteirizador';
import {
  fmtBrlRoteiro,
  fmtKmRoteiro,
  totalVendaSelecionados,
  totalExcluidoRoteiro,
  totalVendaRoteiroOriginal,
  vendaPorLabelSelecionados,
  type SelecionadoComChave,
} from './heatmapRoteiroRelatorio';

import type { AjustesQtdeSimulacao } from './heatmapRoteiroSimulacao';
import { simulacaoCargaAtiva } from './heatmapRoteiroSimulacao';
import {
  HEAD_CARGA_PDF,
  HEAD_CONSOLIDADO_PRODUTO_PDF,
  consolidarProdutosCargaPdf,
  linhaTabelaCargaPdf,
  linhaTotalSecaoCargaPdf,
  montarSecoesCargaPdf,
} from './heatmapRoteiroCargaSort';
import { formatQtdeParaInput } from './heatmapAjusteCargaGradeUi';

export type GerarPdfRoteiroHeatmapInput = {
  selecionados: SelecionadoComChave[];
  resultado: RoteiroResultado;
  exclusoesSimulacao?: ReadonlySet<string>;
  ajustesQtdeSimulacao?: AjustesQtdeSimulacao;
  /** Elemento raiz do mapa Leaflet (`.leaflet-container`). */
  mapaElement: HTMLElement;
};

function nomeArquivoPdf(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `roteirizacao-heatmap-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.pdf`;
}

/**
 * PDF A4: cabeçalho → mapa do percurso → mesmo conteúdo do popover (cidades, total, sequência).
 */
export async function gerarPdfRoteiroHeatmap({
  selecionados,
  resultado,
  exclusoesSimulacao,
  ajustesQtdeSimulacao,
  mapaElement,
}: GerarPdfRoteiroHeatmapInput): Promise<void> {
  const exclusoes = exclusoesSimulacao ?? new Set<string>();
  const temExclusoes = simulacaoCargaAtiva(exclusoes, ajustesQtdeSimulacao);
  let imgData: string | null = null;
  try {
    const canvas = await html2canvas(mapaElement, {
      useCORS: true,
      allowTaint: true,
      scale: 2,
      backgroundColor: '#e8eef5',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width: mapaElement.offsetWidth,
      height: mapaElement.offsetHeight,
      windowWidth: mapaElement.offsetWidth,
      windowHeight: mapaElement.offsetHeight,
    });
    imgData = canvas.toDataURL('image/png');
  } catch {
    imgData = null;
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Roteirização — Heatmap', margin, 11);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  const agora = new Date().toLocaleString('pt-BR');
  doc.text(`Gerado em: ${agora}`, margin, 18);

  /** Conteúdo após faixa do cabeçalho (y ≈ 26). */
  let y = 30;

  if (imgData) {
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Mapa do percurso', margin, y);
    y += 6;
    const imgW = pageW - 2 * margin;
    const ratio = mapaElement.offsetHeight / Math.max(mapaElement.offsetWidth, 1);
    let imgH = imgW * ratio;
    const maxMapH = pageH - y - margin - 4;
    const cap = Math.min(maxMapH, pageH * 0.52);
    if (imgH > cap) imgH = cap;
    if (imgH > 6) {
      doc.addImage(imgData, 'PNG', margin, y, imgW, imgH, undefined, 'FAST');
      y += imgH + 10;
    } else {
      y = 32;
    }
  } else {
    y = 32;
  }

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Cidades na rota', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const chipsText = [...selecionados]
    .sort((a, b) => a.item.chave.localeCompare(b.item.chave, 'pt-BR'))
    .map(({ item }) => `${item.municipio}${item.uf ? `/${item.uf}` : ''}`)
    .join(' · ');
  const chipsLines = doc.splitTextToSize(chipsText || '—', pageW - 2 * margin);
  doc.text(chipsLines, margin, y);
  y += chipsLines.length * 4.2 + 5;

  doc.setFont('helvetica', 'bold');
  doc.text(temExclusoes ? 'Total (carga simulada)' : 'Total', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  const totV = totalVendaSelecionados(selecionados, exclusoes, ajustesQtdeSimulacao);
  doc.text(`${fmtKmRoteiro(resultado.totalKm)}  |  ${fmtBrlRoteiro(totV)}`, margin, y);
  if (temExclusoes) {
    y += 4;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const totOrig = totalVendaRoteiroOriginal(selecionados);
    const totExc = totalExcluidoRoteiro(selecionados, exclusoes, ajustesQtdeSimulacao);
    doc.text(`Era ${fmtBrlRoteiro(totOrig)} · excluído da simulação ${fmtBrlRoteiro(totExc)}`, margin, y);
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    y += 5;
  }
  y += 4;

  const vendaMap = vendaPorLabelSelecionados(selecionados, exclusoes, ajustesQtdeSimulacao);
  const body: (string | number)[][] = resultado.pernas.map((p, idx) => {
    const v = vendaMap.get(p.para) ?? 0;
    return [`${idx + 1}`, p.para, fmtKmRoteiro(p.distanciaKm), fmtBrlRoteiro(v)];
  });
  body.push(['↩', 'Retorno Teresina, PI', fmtKmRoteiro(resultado.retornoKm), '—']);

  if (y > pageH - 55) {
    doc.addPage();
    y = margin;
  }

  autoTable(doc as any, {
    startY: y,
    head: [['#', 'Parada', 'Trecho', 'Valor (saldo)']],
    body,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { valign: 'middle' },
    styles: { fontSize: 8.8, cellPadding: 1.8, lineColor: [200, 210, 225], lineWidth: 0.15 },
    columnStyles: {
      0: { cellWidth: 11, halign: 'center' },
      1: { cellWidth: 68 },
      2: { cellWidth: 34, halign: 'right' },
      3: { cellWidth: 42, halign: 'right' },
    },
    margin: { left: margin, right: margin },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  const secoesCarga = montarSecoesCargaPdf(selecionados, resultado, exclusoes, ajustesQtdeSimulacao);
  if (secoesCarga.length > 0) {
    const docAny = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    let yCarga = (docAny.lastAutoTable?.finalY ?? y) + 10;
    if (yCarga > pageH - 40) {
      doc.addPage();
      yCarga = margin;
    }

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Detalhamento da carga (simulação)', margin, yCarga);
    yCarga += 6;

    const tableW = pageW - 2 * margin;
    const colStylesCarga: Record<number, { cellWidth: number; halign?: 'left' | 'right' | 'center' }> = {
      0: { cellWidth: tableW * 0.1 },
      1: { cellWidth: tableW * 0.1 },
      2: { cellWidth: tableW * 0.1 },
      3: { cellWidth: tableW * 0.34 },
      4: { cellWidth: tableW * 0.14, halign: 'right' },
      5: { cellWidth: tableW * 0.14, halign: 'right' },
    };

    for (const sec of secoesCarga) {
      if (yCarga > pageH - 28) {
        doc.addPage();
        yCarga = margin;
      }
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`Parada ${sec.seqParada} — ${sec.labelCidade}`, margin, yCarga);
      yCarga += 5;

      const bodyCarga = sec.itens.map((row) =>
        linhaTabelaCargaPdf(row, sec.municipioChave, ajustesQtdeSimulacao)
      );
      bodyCarga.push(linhaTotalSecaoCargaPdf(sec, ajustesQtdeSimulacao));

      autoTable(doc as any, {
        startY: yCarga,
        head: [HEAD_CARGA_PDF],
        body: bodyCarga,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { valign: 'middle', fontSize: 7.5 },
        styles: { fontSize: 7.5, cellPadding: 1.4, lineColor: [200, 210, 225], lineWidth: 0.12 },
        columnStyles: colStylesCarga,
        margin: { left: margin, right: margin },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === bodyCarga.length - 1) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });

      yCarga = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yCarga;
      yCarga += 6;
    }

    const consolidado = consolidarProdutosCargaPdf(secoesCarga, ajustesQtdeSimulacao);
    if (consolidado.length > 0) {
      if (yCarga > pageH - 40) {
        doc.addPage();
        yCarga = margin;
      }
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Consolidado por produto', margin, yCarga);
      yCarga += 6;

      const bodyConsolidado = consolidado.map((p) => [
        p.codigo,
        p.descricao,
        p.qtde > 0 ? formatQtdeParaInput(p.qtde) : '0',
      ]);

      const tableW = pageW - 2 * margin;
      autoTable(doc as any, {
        startY: yCarga,
        head: [HEAD_CONSOLIDADO_PRODUTO_PDF],
        body: bodyConsolidado,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { valign: 'middle', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 1.6, lineColor: [200, 210, 225], lineWidth: 0.12 },
        columnStyles: {
          0: { cellWidth: tableW * 0.14 },
          1: { cellWidth: tableW * 0.58 },
          2: { cellWidth: tableW * 0.2, halign: 'right' },
        },
        margin: { left: margin, right: margin },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
    }
  }

  doc.save(nomeArquivoPdf());
}
