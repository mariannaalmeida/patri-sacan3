/**
 * ReportService.ts
 *
 * Gera o relatório em PDF via expo-print (HTML → PDF nativo no iOS/Android).
 * Usa os SVGs do ChartService inline no HTML para evitar dependências externas.
 *
 * Dependências:
 *   npx expo install expo-print expo-sharing
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { InventoryReport, AnalyticsService } from './AnalyticsService';
import { ChartService } from './ChartService';

export class ReportService {
  /**
   * Gera o PDF completo e abre o Share Sheet.
   */
  static async exportPDF(report: InventoryReport): Promise<void> {
    const html = this.buildHTML(report);
    const { uri } = await Print.printToFileAsync({ html, base64: false });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Relatório — ${report.inventoryName}`,
        UTI: 'com.adobe.pdf',
      });
    }
  }

  /**
   * Abre o preview de impressão nativo (iOS/Android).
   */
  static async printPreview(report: InventoryReport): Promise<void> {
    const html = this.buildHTML(report);
    await Print.printAsync({ html });
  }

  // ─── Builder HTML ──────────────────────────────────────────────────────────

  private static buildHTML(report: InventoryReport): string {
    const { overall, byDepartament, byLocation, scanTimeline, notFoundItems } = report;

    const pieSvg = ChartService.buildPieChart({
      found: overall.found,
      pending: overall.pending,
      size: 180,
    });

    const timelineSvg = ChartService.buildTimelineChart(scanTimeline, 480, 130);
    const deptSvg = ChartService.buildBarChart(byDepartament, 480, 150);
    const localSvg = ChartService.buildBarChart(byLocation, 480, 150);

    const generatedAt = AnalyticsService.formatDateTime(report.generatedAt);

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    background: #fff; color: #1a1a2e; font-size: 12px; line-height: 1.6; }
  .page { max-width: 680px; margin: 0 auto; padding: 32px 28px; }

  .header { border-bottom: 3px solid #00E5A0; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { font-size: 22px; font-weight: 800; color: #0A0A0F; letter-spacing: -0.5px; }
  .header-meta { font-size: 11px; color: #6B6B88; margin-top: 4px; }

  .section { margin-bottom: 28px; }
  .section-title {
    font-size: 13px; font-weight: 700; color: #0A0A0F;
    text-transform: uppercase; letter-spacing: 1px;
    border-left: 3px solid #00E5A0; padding-left: 10px;
    margin-bottom: 14px;
  }

  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .stat-card {
    background: #f7f7fa; border-radius: 10px; padding: 12px 14px;
    border: 1px solid #e8e8f0;
  }
  .stat-label { font-size: 10px; color: #6B6B88; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px; }
  .stat-value { font-size: 24px; font-weight: 800; color: #0A0A0F; }
  .stat-value.green { color: #00C87A; }
  .stat-value.amber { color: #BA7517; }

  .progress-track {
    height: 8px; background: #e8e8f0; border-radius: 4px;
    overflow: hidden; margin: 8px 0 4px;
  }
  .progress-fill {
    height: 100%; background: #00E5A0; border-radius: 4px;
    transition: width 0.3s;
  }
  .progress-label { font-size: 11px; color: #6B6B88; text-align: right; }

  .chart-row { display: flex; align-items: flex-start; gap: 20px; }
  .chart-box { flex: 1; }
  .chart-box svg { width: 100%; height: auto; }
  .pie-box { width: 180px; flex-shrink: 0; }
  .pie-box svg { background: #0A0A0F; border-radius: 12px; padding: 8px; }

  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead tr { background: #0A0A0F; color: #F0F0F8; }
  thead th {
    padding: 8px 10px; text-align: left;
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.5px; text-transform: uppercase;
  }
  tbody tr:nth-child(even) { background: #f7f7fa; }
  tbody tr:hover { background: #eef7f5; }
  td { padding: 7px 10px; color: #2a2a3e; border-bottom: 1px solid #e8e8f0; }
  td.code { font-weight: 700; font-family: monospace; font-size: 11px; }
  .badge {
    display: inline-block; border-radius: 10px; padding: 2px 8px;
    font-size: 10px; font-weight: 700;
  }
  .badge.found { background: #d0f5e8; color: #0F6E56; }
  .badge.pending { background: #fee9d0; color: #854F0B; }

  .group-table td.pct { font-weight: 700; color: #00C87A; }
  .mini-bar {
    display: inline-block; height: 6px; background: #00E5A0;
    border-radius: 3px; vertical-align: middle; margin-right: 6px;
  }

  .footer {
    margin-top: 36px; padding-top: 12px;
    border-top: 1px solid #e8e8f0;
    font-size: 10px; color: #9B9BAA; text-align: center;
  }

  .chart-dark { background: #0A0A0F; border-radius: 10px; padding: 12px; }
  .chart-dark svg { width: 100%; height: auto; }

  @media print {
    .page { padding: 20px; }
    .section { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <h1>${escapeHtml(report.inventoryName)}</h1>
    <div class="header-meta">
      Relatório gerado em ${generatedAt}
      ${overall.durationMinutes !== null
        ? ` · Duração do inventário: ${overall.durationMinutes} min`
        : ''}
    </div>
  </div>

  <!-- Resumo geral -->
  <div class="section">
    <div class="section-title">Resumo geral</div>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Total de itens</div>
        <div class="stat-value">${overall.total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Encontrados</div>
        <div class="stat-value green">${overall.found}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pendentes</div>
        <div class="stat-value ${overall.pending > 0 ? 'amber' : 'green'}">${overall.pending}</div>
      </div>
    </div>
    <div style="margin-top:14px;">
      <div class="progress-track">
        <div class="progress-fill" style="width:${overall.progressPct}%"></div>
      </div>
      <div class="progress-label">${overall.progressPct}% concluído</div>
    </div>
    ${overall.startedAt
      ? `<p style="font-size:11px;color:#6B6B88;margin-top:8px;">
           Início: ${AnalyticsService.formatDateTime(overall.startedAt)}
           ${overall.completedAt ? ` · Conclusão: ${AnalyticsService.formatDateTime(overall.completedAt)}` : ''}
         </p>`
      : ''}
  </div>

  <!-- Distribuição (pizza + top departamentos) -->
  <div class="section">
    <div class="section-title">Distribuição</div>
    <div class="chart-row">
      <div class="pie-box">${pieSvg}</div>
      <div class="chart-box">
        <p style="font-size:11px;color:#6B6B88;margin-bottom:12px;">
          ${overall.progressPct === 100
            ? '✓ Todos os itens foram localizados.'
            : `Faltam <strong>${overall.pending}</strong> ite${overall.pending === 1 ? 'm' : 'ns'} para concluir.`}
        </p>
        ${byDepartament.slice(0, 5).map((g) => `
        <div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px;">
            <span style="color:#2a2a3e;font-weight:600;">${escapeHtml(g.label)}</span>
            <span style="color:#00C87A;font-weight:700;">${g.progressPct}%</span>
          </div>
          <div class="progress-track" style="height:5px;">
            <div class="progress-fill" style="width:${g.progressPct}%;background:${g.progressPct === 100 ? '#00E5A0' : '#534AB7'}"></div>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <!-- Linha do tempo -->
  ${scanTimeline.length > 0 ? `
  <div class="section">
    <div class="section-title">Linha do tempo de scans</div>
    <div class="chart-dark">${timelineSvg}</div>
    <p style="font-size:10px;color:#6B6B88;margin-top:6px;">
      ${scanTimeline.length} itens escaneados
      ${overall.durationMinutes !== null ? `em ${overall.durationMinutes} minutos` : ''}
      · Média: ${overall.durationMinutes !== null && scanTimeline.length > 0
        ? ((overall.durationMinutes / scanTimeline.length) * 60).toFixed(0) + 's por item'
        : 'N/D'}
    </p>
  </div>` : ''}

  <!-- Por departamento -->
  ${byDepartament.length > 0 ? `
  <div class="section">
    <div class="section-title">Progresso por departamento</div>
    <div class="chart-dark">${deptSvg}</div>
    <table class="group-table" style="margin-top:10px;">
      <thead><tr><th>Departamento</th><th>Total</th><th>Encontrados</th><th>Pendentes</th><th>%</th></tr></thead>
      <tbody>
        ${byDepartament.map((g) => `<tr>
          <td>${escapeHtml(g.label)}</td>
          <td>${g.total}</td>
          <td>${g.found}</td>
          <td>${g.pending}</td>
          <td class="pct">${g.progressPct}%</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <!-- Por localização -->
  ${byLocation.length > 0 ? `
  <div class="section">
    <div class="section-title">Progresso por localização</div>
    <div class="chart-dark">${localSvg}</div>
    <table class="group-table" style="margin-top:10px;">
      <thead><tr><th>Localização</th><th>Total</th><th>Encontrados</th><th>Pendentes</th><th>%</th></tr></thead>
      <tbody>
        ${byLocation.map((g) => `<tr>
          <td>${escapeHtml(g.label)}</td>
          <td>${g.total}</td>
          <td>${g.found}</td>
          <td>${g.pending}</td>
          <td class="pct">${g.progressPct}%</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <!-- Itens não encontrados -->
  ${notFoundItems.length > 0 ? `
  <div class="section">
    <div class="section-title">Itens não encontrados (${notFoundItems.length})</div>
    <table>
      <thead><tr><th>Código</th><th>Descrição</th><th>Departamento</th><th>Localização</th></tr></thead>
      <tbody>
        ${notFoundItems.map((item) => `<tr>
          <td class="code">${escapeHtml(item.code)}</td>
          <td>${escapeHtml(item.description ?? '—')}</td>
          <td>${escapeHtml(item.department ?? '—')}</td>
          <td>${escapeHtml(item.location ?? '—')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : `
  <div class="section">
    <div class="section-title">Itens não encontrados</div>
    <p style="color:#00C87A;font-weight:600;font-size:12px;">
      ✓ Todos os itens foram localizados com sucesso.
    </p>
  </div>`}

  <!-- Histórico de scans -->
  ${scanTimeline.length > 0 ? `
  <div class="section">
    <div class="section-title">Histórico de scans</div>
    <table>
      <thead><tr><th>#</th><th>Código</th><th>Descrição</th><th>Localização</th><th>Horário</th><th>Min.</th></tr></thead>
      <tbody>
        ${scanTimeline.map((e, i) => `<tr>
          <td style="color:#9B9BAA;">${i + 1}</td>
          <td class="code">${escapeHtml(e.code)}</td>
          <td>${escapeHtml(e.description || '—')}</td>
          <td>${escapeHtml(e.location || '—')}</td>
          <td>${AnalyticsService.formatTime(e.scanDate)}</td>
          <td style="color:#9B9BAA;">+${e.minutesFromStart}min</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <div class="footer">
    PatriScan · Relatório gerado automaticamente em ${generatedAt}
  </div>

</div>
</body>
</html>`;
  }
}

// ─── Helper de escape HTML ────────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}