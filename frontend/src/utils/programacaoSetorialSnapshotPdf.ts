import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type SnapshotLinhaPdf = {
  observacoes?: string;
  previsao?: string;
  pd?: string;
  cod?: string;
  descricao?: string;
  setor?: string;
  qtyToProduce?: number;
};

function slugFile(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'doc';
}

export type DownloadProgramacaoSnapshotPdfOpts = {
  /** Omitido ou 0: texto “Modo gerador” no cabeçalho. */
  registroId?: number | null;
  tituloSuffix: string;
  /** Rótulo do período na página de detalhamento. */
  periodoLabel: string;
  /** Rótulo na página de consolidação (default: igual a `periodoLabel`). */
  periodoConsolidadoLabel?: string;
  showPD: boolean;
  linhas: SnapshotLinhaPdf[];
  /** Linhas usadas só na consolidação (por período/setor distinto). Default: mesmas de `linhas`. */
  linhasConsolidacao?: SnapshotLinhaPdf[];
  logoBase64?: string | null;
  incluirConsolidacao?: boolean;
};

/**
 * Gera PDF (detalhado + consolidação) alinhado ao impresso do gerador.
 */
export function downloadProgramacaoSnapshotPdf(opts: DownloadProgramacaoSnapshotPdfOpts): void {
  const {
    registroId,
    tituloSuffix,
    periodoLabel,
    periodoConsolidadoLabel = periodoLabel,
    showPD,
    linhas,
    linhasConsolidacao,
    logoBase64,
    incluirConsolidacao = true,
  } = opts;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const now = new Date();
  const dateStr = now.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const version = Date.now() % 100000;
  const registroPart =
    registroId != null && Number(registroId) > 0 ? `Registro #${registroId}` : 'Modo gerador';

  const drawPageHeader = (title: string, subtitle: string) => {
    const titleX = logoBase64 ? 46 : 14;
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, 8, 30, 10);
      } catch {
        /* ignora logo inválida */
      }
    }
    doc.setFontSize(14);
    doc.setTextColor(0, 26, 61);
    doc.text(title, titleX, 13);
    doc.setFontSize(9);
    doc.text(`Impresso em: ${dateStr} | ${registroPart} | Versão: V.${version}`, logoBase64 ? titleX : 14, 18);
    doc.text(subtitle, logoBase64 ? titleX : 14, 22);
  };

  const items = linhas;
  drawPageHeader(`Programação de Produção — ${tituloSuffix}`, `Período programação: ${periodoLabel}`);

  const headers = [['Observações', 'Previsão', 'Cód', 'Descrição do Produto', 'Qtde Real', 'Obs. Produção']];
  if (showPD) headers[0].splice(2, 0, 'PD');

  const body = items.map((item) => {
    const row = [
      String(item.observacoes || ''),
      String(item.previsao || ''),
      String(item.cod || ''),
      String(item.descricao || ''),
      String(item.qtyToProduce ?? ''),
      '',
    ];
    if (showPD) row.splice(2, 0, String(item.pd || ''));
    return row;
  });

  const descColIdx = showPD ? 4 : 3;
  const codColIdx = showPD ? 3 : 2;
  const pdColIdx = showPD ? 2 : -1;
  const qtyColIdx = showPD ? 5 : 4;
  const obsProdColIdx = showPD ? 6 : 5;

  autoTable(doc as any, {
    startY: 30,
    head: headers,
    body,
    theme: 'grid',
    headStyles: { fillColor: [0, 26, 61], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 9.5, cellPadding: 2, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 20 },
      [codColIdx]: { cellWidth: 22 },
      [descColIdx]: { cellWidth: 'auto' },
      [qtyColIdx]: { cellWidth: 15, halign: 'center' },
      [obsProdColIdx]: { cellWidth: 35 },
      ...(showPD ? { [pdColIdx]: { cellWidth: 18 } } : {}),
    },
  });

  const consSource = linhasConsolidacao ?? items;

  if (incluirConsolidacao) {
    doc.addPage();
    const consolidatedMap: Record<string, { cod: string; desc: string; total: number }> = {};
    for (const item of consSource) {
      const cod = String(item.cod || '');
      if (!consolidatedMap[cod]) consolidatedMap[cod] = { cod, desc: String(item.descricao || ''), total: 0 };
      consolidatedMap[cod].total += Number(item.qtyToProduce ?? 0) || 0;
    }
    const consolidatedFinalList = Object.values(consolidatedMap).sort((a, b) => a.desc.localeCompare(b.desc, 'pt-BR'));
    const grandTotal = consolidatedFinalList.reduce((acc, curr) => acc + curr.total, 0);

    drawPageHeader(`CONSOLIDAÇÃO — ${tituloSuffix}`, `Resumo totalizador | ${periodoConsolidadoLabel}`);

    const consolidatedHeaders = [['Cód', 'Descrição do Produto', 'Total a Produzir']];
    const consolidatedBody: any[][] = consolidatedFinalList.map((item) => [item.cod, item.desc, item.total.toString()]);
    consolidatedBody.push([
      { content: 'TOTAL GERAL', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: grandTotal.toString(), styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 240] } },
    ]);

    autoTable(doc as any, {
      startY: 28,
      head: consolidatedHeaders,
      body: consolidatedBody,
      theme: 'grid',
      headStyles: { fillColor: [242, 169, 0], textColor: [0, 26, 61], fontStyle: 'bold' },
      styles: { fontSize: 11, cellPadding: 3, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
      },
    });
  }

  const idPart = registroId != null && Number(registroId) > 0 ? `R${registroId}` : 'gerador';
  const fname = `programacao_${idPart}_${slugFile(tituloSuffix)}_V${version}.pdf`;
  doc.save(fname);
}

/** Converte item do gerador (ProcessedItem) para linha do PDF. */
export function processedItemToPdfRow(item: {
  Observacoes?: string;
  Previsao?: string;
  PD?: string;
  Cod?: string;
  'Descricao do produto'?: string;
  'Setor de Producao'?: string;
  qtyToProduce?: number;
}): SnapshotLinhaPdf {
  return {
    observacoes: item.Observacoes,
    previsao: item.Previsao,
    pd: item.PD,
    cod: item.Cod,
    descricao: item['Descricao do produto'],
    setor: item['Setor de Producao'],
    qtyToProduce: item.qtyToProduce,
  };
}
