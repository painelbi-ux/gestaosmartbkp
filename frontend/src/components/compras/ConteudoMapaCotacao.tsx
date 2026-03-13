import { useState, useEffect, useRef, useMemo } from 'react';
import { listarPrecosColeta, listarPrecosCotacaoToda, type ColetaPrecosListItem, type FornecedorColetaItem, type PrecoCotacaoSalvoItem } from '../../api/compras';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

function getRowValue(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(row, k)) return row[k];
  }
  const lower = keys[0].toLowerCase();
  const found = Object.keys(row).find((key) => key.toLowerCase() === lower);
  return found != null ? row[found] : undefined;
}

export interface ConteudoMapaCotacaoProps {
  coleta: ColetaPrecosListItem;
  onClose?: () => void;
}

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatarDataShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function fmtNum(v: unknown): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—';
}

function fmtData(v: unknown): string {
  if (v == null || v === '') return '—';
  try {
    const d = typeof v === 'string' ? new Date(v) : new Date(Number(v));
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(v);
  }
}

/** Remove prefixo CNPJ/código (ex: "34.036.601/0005-08 - ") e retorna apenas o nome do fornecedor. */
function apenasNomeFornecedor(nomeOuConcat: string | null | undefined): string {
  if (nomeOuConcat == null || !String(nomeOuConcat).trim()) return nomeOuConcat?.trim() ?? '';
  const s = String(nomeOuConcat).trim();
  const idx = s.indexOf(' - ');
  if (idx !== -1) {
    const antes = s.slice(0, idx).trim();
    const depois = s.slice(idx + 3).trim();
    if (/^[\d.\/\-]+$/.test(antes) && depois) return depois;
  }
  const match = s.match(/^[\d.\/\-]+\s*[-–—]\s*(.+)$/);
  if (match && match[1].trim()) return match[1].trim();
  return s;
}

export default function ConteudoMapaCotacao({ coleta, onClose }: ConteudoMapaCotacaoProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<Record<string, unknown>[]>([]);
  const [cotacao, setCotacao] = useState<PrecoCotacaoSalvoItem[]>([]);
  const [exportando, setExportando] = useState(false);

  /** Fornecedores da coleta; se vazio, deriva da cotação (ids únicos dos preços salvos) para exibir as colunas. */
  const fornecedores: FornecedorColetaItem[] = useMemo(() => {
    const daColeta = coleta.fornecedores ?? [];
    if (daColeta.length > 0) return daColeta;
    const ids = Array.from(new Set(cotacao.map((c) => c.idFornecedor).filter((id) => Number.isFinite(id) && id > 0)));
    ids.sort((a, b) => a - b);
    return ids.map((idPessoa) => ({ idPessoa, nome: `Fornecedor ${idPessoa}` }));
  }, [coleta.fornecedores, cotacao]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErro(null);
    Promise.all([
      listarPrecosColeta(coleta.id),
      listarPrecosCotacaoToda(coleta.id),
    ])
      .then(([resPrecos, resCotacao]) => {
        if (cancelled) return;
        if (resPrecos.error) {
          setErro(resPrecos.error);
          setProdutos([]);
        } else {
          setProdutos(resPrecos.data ?? []);
        }
        if (resCotacao.error) {
          if (!resPrecos.error) setErro(resCotacao.error);
          setCotacao([]);
        } else {
          setCotacao(resCotacao.data ?? []);
        }
      })
      .catch((e) => {
        if (!cancelled) setErro(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coleta.id]);

  const getPrecoFor = (idProduto: number, idFornecedor: number): number | null => {
    const item = cotacao.find(
      (c) => c.idProduto === idProduto && c.idFornecedor === idFornecedor
    );
    return item != null ? item.precoTotal : null;
  };

  const getCotacaoItem = (idProduto: number, idFornecedor: number): PrecoCotacaoSalvoItem | null => {
    return cotacao.find(
      (c) => c.idProduto === idProduto && c.idFornecedor === idFornecedor
    ) ?? null;
  };

  const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPerc = (v: number) => (v === 0 ? '0,00%' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

  /** Largura do conteúdo em px = largura útil A4 paisagem (297mm - 16mm margem ≈ 1061px). Preenche 100% da largura do papel. */
  const PDF_CONTENT_WIDTH_PX = 1061;

  const exportarPDF = async () => {
    const el = reportRef.current;
    if (!el) return;
    setExportando(true);
    const origWidth = el.style.width;
    const origMinWidth = el.style.minWidth;
    const scale = 2;
    try {
      el.style.width = `${PDF_CONTENT_WIDTH_PX}px`;
      el.style.minWidth = `${PDF_CONTENT_WIDTH_PX}px`;
      const w = el.scrollWidth;
      const h = el.scrollHeight;
      const canvas = await html2canvas(el, {
        width: w,
        height: h,
        scale,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
      });

      // Medir tabela ANTES de restaurar estilos; posições relativas ao topo do conteúdo de el
      const table = el.querySelector('table');
      const thead = table?.querySelector('thead');
      const tbodyRows = table?.querySelectorAll('tbody tr');
      let headerBlockPx = 0;
      let theadHeightPx = 0;
      let rowHeightsPx: number[] = [];
      if (table && thead && tbodyRows && tbodyRows.length > 0) {
        const tableEl = table as HTMLElement;
        const theadEl = thead as HTMLElement;
        let tableTop = 0;
        let cur: HTMLElement | null = tableEl;
        while (cur && cur !== el) {
          tableTop += cur.offsetTop;
          cur = cur.offsetParent as HTMLElement | null;
          if (cur && !el.contains(cur)) break;
        }
        if (cur !== el) tableTop = (tableEl.getBoundingClientRect().top - el.getBoundingClientRect().top) + (el.scrollTop || 0);
        headerBlockPx = tableTop * scale;
        theadHeightPx = theadEl.offsetHeight * scale;
        rowHeightsPx = Array.from(tbodyRows).map((tr) => (tr as HTMLElement).offsetHeight * scale);
      }
      el.style.width = origWidth;
      el.style.minWidth = origMinWidth;

      const pdf = new jsPDF('l', 'mm', 'a4');
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const wMm = pdfW - 2 * margin;
      const pageH = pdfH - 2 * margin;
      const imgWMm = wMm;
      const imgHMmTotal = (canvas.height * wMm) / canvas.width;
      const pageHeightPx = (canvas.height * pageH) / imgHMmTotal;
      const hasTableStructure = rowHeightsPx.length > 0;

      if (imgHMmTotal <= pageH) {
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        pdf.addImage(imgData, 'JPEG', margin, margin, imgWMm, imgHMmTotal);
      } else if (hasTableStructure) {
        const firstPageRowsHeight = pageHeightPx - headerBlockPx - theadHeightPx;
        let rowStart = 0;
        let sumBefore = 0;
        let pageNum = 0;
        while (rowStart < rowHeightsPx.length) {
          let rowEnd = rowStart;
          let rowsH = 0;
          const maxRowsH = pageNum === 0 ? firstPageRowsHeight : pageHeightPx - theadHeightPx;
          while (rowEnd < rowHeightsPx.length && rowsH + rowHeightsPx[rowEnd] <= maxRowsH) {
            rowsH += rowHeightsPx[rowEnd];
            rowEnd++;
          }
          if (rowEnd === rowStart) rowEnd = rowStart + 1;
          const sliceStartPx = pageNum === 0 ? 0 : headerBlockPx + theadHeightPx + sumBefore;
          const sliceHPx = pageNum === 0
            ? headerBlockPx + theadHeightPx + rowsH
            : theadHeightPx + rowsH;
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = Math.round(sliceHPx);
          const ctx = sliceCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            if (pageNum === 0) {
              ctx.drawImage(canvas, 0, 0, canvas.width, sliceHPx, 0, 0, canvas.width, sliceHPx);
            } else {
              ctx.drawImage(canvas, 0, headerBlockPx, canvas.width, theadHeightPx, 0, 0, canvas.width, theadHeightPx);
              ctx.drawImage(canvas, 0, sliceStartPx, canvas.width, rowsH, 0, theadHeightPx, canvas.width, rowsH);
            }
          }
          const sliceImg = sliceCanvas.toDataURL('image/jpeg', 0.92);
          const sliceHMm = Math.min((sliceCanvas.height * wMm) / canvas.width, pageH);
          if (pageNum > 0) pdf.addPage();
          pdf.addImage(sliceImg, 'JPEG', margin, margin, imgWMm, sliceHMm);
          sumBefore += rowsH;
          rowStart = rowEnd;
          pageNum++;
        }
      } else {
        let offsetY = 0;
        let pageNum = 0;
        while (offsetY < canvas.height) {
          if (pageNum > 0) pdf.addPage();
          const sliceH = Math.min(pageHeightPx, canvas.height - offsetY);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceH;
          const ctx = sliceCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            ctx.drawImage(canvas, 0, offsetY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          }
          const sliceImg = sliceCanvas.toDataURL('image/jpeg', 0.92);
          const sliceHMm = (sliceH * wMm) / canvas.width;
          pdf.addImage(sliceImg, 'JPEG', margin, margin, imgWMm, sliceHMm);
          offsetY += sliceH;
          pageNum++;
        }
      }

      const totalPages = pdf.getNumberOfPages();
      const horarioImpressao = new Date().toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      pdf.setFontSize(9);
      pdf.setTextColor(80, 80, 80);
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);
        pdf.text(horarioImpressao, pdfW - margin, margin + 4, { align: 'right' });
        pdf.text(`${p} / ${totalPages}`, pdfW - margin, pdfH - margin - 2, { align: 'right' });
      }

      pdf.save(`Mapa-Cotacao-Coleta-${coleta.id}-${formatarDataShort(coleta.dataCriacao).replace(/\//g, '-')}.pdf`);
    } catch (e) {
      console.error(e);
      if (el) {
        el.style.width = origWidth;
        el.style.minWidth = origMinWidth;
      }
    } finally {
      setExportando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 dark:text-slate-400">
        <span className="animate-pulse">Carregando mapa de cotação...</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-red-700 dark:text-red-300 text-sm">
        {erro}
      </div>
    );
  }

  const statusColeta = coleta.status ?? '';
  const podeImprimirExportar = statusColeta !== 'Em cotação';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end gap-2 pb-3 shrink-0">
        <button
          type="button"
          onClick={exportarPDF}
          disabled={exportando || !podeImprimirExportar}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          title={!podeImprimirExportar ? 'Exportar/imprimir disponível quando a coleta não estiver mais em cotação' : undefined}
        >
          {exportando ? 'Gerando PDF…' : 'Exportar PDF'}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            Fechar
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto min-w-0 w-full">
        <div
          ref={reportRef}
          className="mapa-cotacao-pdf bg-white text-black rounded-lg border border-slate-200 print:border-0 print:shadow-none [color:black]"
          style={{ fontSize: '9px', padding: '6px', width: '100%', minWidth: '100%', maxWidth: '100%', color: 'black', boxSizing: 'border-box' }}
        >
          {/* Cabeçalho fiel ao PDF */}
          <div className="mb-2 space-y-0.5 text-black" style={{ fontSize: '9px', color: 'black' }}>
            <p className="font-semibold">Sistema de Qualidade - Só Aço</p>
            <p>01.001.004 - Coleta de Preços</p>
            <p>{formatarDataShort(coleta.dataCriacao)}</p>
            <p>Usuário Criação: {(coleta.usuarioCriacao ?? '—').toUpperCase()}</p>
            <p>Data Coleta: {formatarData(coleta.dataCriacao)}</p>
            <p>Coleta: Itens Selecionados - Só Aço</p>
            <p>Nº Coleta: {coleta.id}</p>
          </div>

          <table className="w-full border-collapse border border-slate-300 table-fixed" style={{ fontSize: 'inherit', writingMode: 'horizontal-tb', width: '100%', minWidth: '100%', tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-primary-600 text-white">
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ fontSize: '0.95em' }}>Código</th>
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ wordBreak: 'break-word', fontSize: '0.95em' }}>Descrição</th>
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ fontSize: '0.95em' }}>Und Medida</th>
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ wordBreak: 'break-word', fontSize: '0.95em' }}>Observações</th>
                {fornecedores.map((f) => (
                  <th key={f.idPessoa} className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle bg-slate-300 text-black" style={{ wordBreak: 'break-word', fontSize: '0.9em', color: 'black' }} title={apenasNomeFornecedor(f.nome) || undefined}>
                    {apenasNomeFornecedor(f.nome) || `F${f.idPessoa}`}
                  </th>
                ))}
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ fontSize: '0.95em' }}>Qtde Emp</th>
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ fontSize: '0.95em' }}>CM</th>
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ fontSize: '0.95em' }}>Data Solicit.</th>
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ fontSize: '0.95em' }}>Data Necess.</th>
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ fontSize: '0.95em' }}>Qtd Solicit.</th>
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle bg-amber-200 text-black" style={{ fontSize: '0.95em', color: 'black' }}>Qtd Aprov</th>
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ fontSize: '0.95em' }}>Estoq Atual</th>
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ fontSize: '0.95em' }}>Qtde Ultm Comp</th>
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ fontSize: '0.95em' }}>Data Ult Entrada</th>
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ fontSize: '0.95em' }}>Qtde Antes Ultm Entr</th>
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ wordBreak: 'break-word', fontSize: '0.9em' }}>Ultimo Fornecedor</th>
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ fontSize: '0.95em' }}>Preço Ant</th>
                <th className="border border-slate-300 px-0.5 py-0.5 text-center font-semibold align-middle" style={{ fontSize: '0.95em' }}>PC Pend</th>
              </tr>
            </thead>
            <tbody>
              {produtos.length === 0 && (
                <tr>
                  <td colSpan={17 + fornecedores.length} className="border border-slate-300 px-0.5 py-2 text-center text-black">
                    Nenhum produto na coleta ou nenhum preço cadastrado.
                  </td>
                </tr>
              )}
              {produtos.map((row, idx) => {
                const idProduto = Number(getRowValue(row, ['Id Produto', 'id produto', 'idProduto']) ?? 0);
                const codigo = String(getRowValue(row, ['Codigo do Produto', 'codigo do produto']) ?? '');
                const descricao = String(getRowValue(row, ['Descricao do Produto', 'descricao do produto']) ?? '');
                const observacoes = String(getRowValue(row, ['Observacoes SC', 'observacoes sc']) ?? '');
                const qtdeEmp = getRowValue(row, ['Qtde Empenhada', 'qtde empenhada']);
                const cm = getRowValue(row, ['Consumo Medio', 'consumo medio']);
                const qtdAprov = getRowValue(row, ['Qtde Aprovada', 'qtde aprovada', 'Qtd Confirmada', 'qtd confirmada']);
                const estoqAtual = getRowValue(row, ['Saldo Estoque', 'Saldo de Estoque', 'saldo estoque']);
                const dataUltEntrada = getRowValue(row, ['Ultima Entrada', 'ultima entrada']);
                const precoAnt = getRowValue(row, ['Custo Unitario Compra', 'custo unitario compra']);
                const pcPend = getRowValue(row, ['PC_Aguardando Liberacao', 'PC Pend', 'pc_aguardando liberacao']);
                const qtdSolicit = getRowValue(row, ['Qtd Liberada', 'qtd liberada']);
                const dataNecess = getRowValue(row, ['Data Necessidade', 'data necessidade']);
                const ultimoFornecedor = String(getRowValue(row, ['Ultimo Fornecedor', 'ultimo fornecedor']) ?? '—');
                const qtdeUltComp = getRowValue(row, ['Qtde Ult Compra', 'qtde ult compra']);
                const qtdeAntesUltEntr = getRowValue(row, ['Saldo em Estoque Antes UE', 'saldo em estoque antes ue']);
                const dataSolicit = getRowValue(row, ['Data Solicitacao', 'Data Solicitacao', 'data solicitacao']);
                const undMedida = String(getRowValue(row, ['Unidade de Medida', 'unidade de medida']) ?? '');
                const precoAntStr = precoAnt != null && Number(precoAnt) > 0
                  ? `R$ ${Number(precoAnt).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—';
                return (
                  <tr key={idProduto || idx} className="hover:bg-slate-50 text-black">
                    <td className="border border-slate-300 px-0.5 py-0.5 whitespace-nowrap align-top text-black" style={{ fontSize: '0.95em' }}>{codigo}</td>
                    <td className="border border-slate-300 px-0.5 py-0.5 align-top break-words text-black" style={{ wordBreak: 'break-word', fontSize: '0.95em' }}>{descricao || '—'}</td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center whitespace-nowrap align-top text-black" style={{ fontSize: '0.95em' }}>{undMedida || '—'}</td>
                    <td className="border border-slate-300 px-0.5 py-0.5 align-top break-words text-black" style={{ wordBreak: 'break-word', fontSize: '0.95em' }}>{apenasNomeFornecedor(observacoes) || '—'}</td>
                    {fornecedores.map((f) => {
                      const item = getCotacaoItem(idProduto, f.idPessoa);
                      return (
                        <td key={f.idPessoa} className="border border-slate-300 px-0.5 py-0.5 text-center align-top overflow-hidden text-black" style={{ fontSize: '0.9em', color: 'black' }}>
                          {item != null ? (
                            <div className="flex flex-col items-center gap-0 leading-tight min-w-0 w-full break-words text-black" style={{ wordBreak: 'break-word', color: 'black' }}>
                              <span className="font-medium">Preço NF: R$ {fmtMoeda(item.precoNF)}</span>
                              <span>IPI: {fmtPerc(item.percIPI)} | ICMS: {fmtPerc(item.percICMS)}</span>
                              <span className="font-medium">Total: R$ {fmtMoeda(item.precoTotal)}</span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                      );
                    })}
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center whitespace-nowrap align-top text-black" style={{ fontSize: '0.95em' }}>{fmtNum(qtdeEmp)}</td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center whitespace-nowrap align-top text-black" style={{ fontSize: '0.95em' }}>{fmtNum(cm)}</td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center whitespace-nowrap align-top text-black" style={{ fontSize: '0.95em' }}>{fmtData(dataSolicit)}</td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center whitespace-nowrap align-top text-black" style={{ fontSize: '0.95em' }}>{fmtData(dataNecess)}</td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center whitespace-nowrap align-top text-black" style={{ fontSize: '0.95em' }}>{fmtNum(qtdSolicit)}</td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center whitespace-nowrap align-top bg-amber-200 text-black" style={{ fontSize: '0.95em', color: 'black' }}>{fmtNum(qtdAprov)}</td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center whitespace-nowrap align-top text-black" style={{ fontSize: '0.95em' }}>{fmtNum(estoqAtual)}</td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center whitespace-nowrap align-top text-black" style={{ fontSize: '0.95em' }}>{fmtNum(qtdeUltComp)}</td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center whitespace-nowrap align-top text-black" style={{ fontSize: '0.95em' }}>{fmtData(dataUltEntrada)}</td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center whitespace-nowrap align-top text-black" style={{ fontSize: '0.95em' }}>{fmtNum(qtdeAntesUltEntr)}</td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-left align-top break-words text-black" style={{ wordBreak: 'break-word', fontSize: '0.9em' }}>{apenasNomeFornecedor(ultimoFornecedor) || '—'}</td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-right whitespace-nowrap align-top text-black" style={{ fontSize: '0.95em' }}>{precoAntStr}</td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center whitespace-nowrap align-top text-black" style={{ fontSize: '0.95em' }}>{fmtNum(pcPend)}</td>
                  </tr>
                );
              })}
              {fornecedores.length > 0 && produtos.length > 0 && (
                <tr className="bg-primary-50 dark:bg-slate-700/50 text-black [color:black]">
                  <td colSpan={4} className="border border-slate-300 px-0.5 py-0.5 align-middle text-center font-medium text-black" style={{ fontSize: '0.85em', color: 'black' }}>
                    Condições por fornecedor
                  </td>
                  {fornecedores.map((f) => (
                    <td key={f.idPessoa} className="border border-slate-300 px-0.5 py-0.5 align-top overflow-hidden text-black" style={{ fontSize: '0.85em', wordBreak: 'break-word', color: 'black' }}>
                      <div className="space-y-0.5">
                        <div>Pag.: {f.condicaoPagamento ?? 'A VISTA'}</div>
                        <div>Forma: {f.formaPagamento ?? '—'}</div>
                        <div>Entrega: {formatarDataShort(coleta.dataCriacao)}</div>
                        <div>Frete: {f.valorFrete ? `${f.valorFrete}${f.valorFreteTipo === '%' ? '%' : ' R$'}` : 'CIF'}</div>
                        <div>Mín. pedido: {f.pedidoMinimo ?? '1'}</div>
                      </div>
                    </td>
                  ))}
                  <td colSpan={13} className="border border-slate-300 px-0.5 py-0.5" />
                </tr>
              )}
            </tbody>
          </table>

          {/* Observações da coleta (abaixo das grades e da coluna Observações) */}
          {(coleta.observacoes != null && String(coleta.observacoes).trim() !== '') && (
            <div className="mt-3 pt-3 border-t border-slate-300 text-black" style={{ fontSize: '9px', color: 'black' }}>
              <strong>Observações da coleta:</strong>
              <p className="mt-1 whitespace-pre-wrap break-words" style={{ maxWidth: '100%' }}>{String(coleta.observacoes).trim()}</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
