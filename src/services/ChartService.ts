/**
 * ChartService.ts
 *
 * Gera strings SVG puras para os gráficos do relatório.
 * Não depende de bibliotecas externas — SVG nativo renderiza
 * tanto no react-native-svg (tela) quanto no expo-print (PDF/HTML).
 */

import { GroupStat, ScanEvent } from './AnalyticsService';

// ─── Paleta (alinhada ao design PatriScan) ────────────────────────────────────

const C = {
  found: '#00E5A0',
  pending: '#1E1E2A',
  pendingStroke: '#3a3a50',
  accent: '#00E5A0',
  warn: '#FFB830',
  text: '#F0F0F8',
  dim: '#6B6B88',
  bg: '#14141C',
  surface2: '#1E1E2A',
  bar1: '#00E5A0',
  bar2: '#534AB7',
  bar3: '#D85A30',
  bar4: '#BA7517',
  bar5: '#185FA5',
};

const BAR_COLORS = [C.bar1, C.bar2, C.bar3, C.bar4, C.bar5];

// ─── Helpers internos ─────────────────────────────────────────────────────────

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function pieSlicePath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `A ${r} ${r} 0 ${large} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

// ─── Serviço de Gráficos ──────────────────────────────────────────────────────

export interface PieChartOptions {
  found: number;
  pending: number;
  size?: number; // viewBox size (default 200)
}

export class ChartService {
  // ─── Gráfico de pizza ───────────────────────────────────────────────────────
  static buildPieChart(opts: PieChartOptions): string {
    const { found, pending } = opts;
    const size = opts.size ?? 200;
    const total = found + pending;

    const cx = size / 2;
    const cy = size * 0.42; // ✅ Movido levemente para cima para não colidir com a legenda
    const r = size * 0.35; // ✅ Raio levemente menor
    const innerR = size * 0.2;

    if (total === 0) {
      return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.surface2}" stroke="${C.pendingStroke}" stroke-width="1"/>
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
          font-size="12" fill="${C.dim}" font-family="sans-serif">Sem dados</text>
      </svg>`;
    }

    const foundAngle = total > 0 ? (found / total) * 360 : 0;

    // ✅ Proteção: Só gera o path se houver itens encontrados (evita glitch de 0 graus)
    const foundPath =
      found === total
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.found}"/>`
        : found > 0
          ? `<path d="${pieSlicePath(cx, cy, r, 0, foundAngle)}" fill="${C.found}"/>`
          : '';

    const pendingPath =
      pending === total
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.surface2}" stroke="${C.pendingStroke}" stroke-width="1"/>`
        : pending > 0
          ? `<path d="${pieSlicePath(cx, cy, r, foundAngle, 360)}" fill="${C.surface2}" stroke="${C.pendingStroke}" stroke-width="0.5"/>`
          : '';

    const pct = total > 0 ? Math.round((found / total) * 100) : 0;

    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  ${pendingPath}
  ${foundPath}
  <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="${C.bg}"/>
  <text x="${cx}" y="${cy - 8}" text-anchor="middle" dominant-baseline="central"
    font-size="22" font-weight="800" fill="${C.found}" font-family="sans-serif">${pct}%</text>
  <text x="${cx}" y="${cy + 14}" text-anchor="middle" dominant-baseline="central"
    font-size="10" fill="${C.dim}" font-family="sans-serif">concluído</text>
  
  <rect x="10" y="${size - 36}" width="10" height="10" rx="2" fill="${C.found}"/>
  <text x="24" y="${size - 29}" font-size="10" fill="${C.text}" font-family="sans-serif">Encontrados (${found})</text>
  
  <rect x="10" y="${size - 20}" width="10" height="10" rx="2" fill="${C.surface2}" stroke="${C.pendingStroke}" stroke-width="1"/>
  <text x="24" y="${size - 13}" font-size="10" fill="${C.dim}" font-family="sans-serif">Pendentes (${pending})</text>
</svg>`;
  }

  // ─── Linha do tempo ─────────────────────────────────────────────────────────
  static buildTimelineChart(events: ScanEvent[], width = 320, height = 120): string {
    if (events.length === 0) {
      return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <text x="${width / 2}" y="${height / 2}" text-anchor="middle"
          font-size="11" fill="${C.dim}" font-family="sans-serif">Sem scans registrados</text>
      </svg>`;
    }

    const PAD = { top: 16, right: 20, bottom: 28, left: 36 };
    const W = width - PAD.left - PAD.right;
    const H = height - PAD.top - PAD.bottom;

    const maxMin = Math.max(...events.map((e) => e.minutesFromStart), 1);
    const maxCount = events.length;

    const points = events.map((e, i) => ({
      x: PAD.left + (e.minutesFromStart / maxMin) * W,
      y: PAD.top + H - ((i + 1) / maxCount) * H,
      count: i + 1,
    }));

    const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // ✅ Uso do Set para evitar duplicar labels em inventários muito curtos
    const yLabels = [...new Set([0, Math.round(maxCount / 2), maxCount])];
    const xLabels = [...new Set([0, Math.round(maxMin / 2), maxMin])];

    return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  ${yLabels
    .map((v) => {
      const y = PAD.top + H - (v / maxCount) * H;
      return `<line x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${PAD.left + W}" y2="${y.toFixed(1)}"
      stroke="${C.surface2}" stroke-width="1"/>`;
    })
    .join('\n  ')}

  ${xLabels
    .map((min) => {
      const x = PAD.left + (min / maxMin) * W;
      return `<text x="${x.toFixed(1)}" y="${height - 6}" text-anchor="middle"
      font-size="9" fill="${C.dim}" font-family="sans-serif">${min}min</text>`;
    })
    .join('\n  ')}

  ${yLabels
    .map((v) => {
      const y = PAD.top + H - (v / maxCount) * H;
      return `<text x="${PAD.left - 4}" y="${y.toFixed(1)}" text-anchor="end"
      dominant-baseline="central" font-size="9" fill="${C.dim}" font-family="sans-serif">${v}</text>`;
    })
    .join('\n  ')}

  <polygon
    points="${polyline} ${(PAD.left + W).toFixed(1)},${(PAD.top + H).toFixed(1)} ${PAD.left},${(PAD.top + H).toFixed(1)}"
    fill="${C.found}" fill-opacity="0.12"/>

  <polyline points="${polyline}"
    fill="none" stroke="${C.found}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>

  ${points
    .map(
      (p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5"
    fill="${C.found}" stroke="${C.bg}" stroke-width="1"/>`
    )
    .join('\n  ')}
</svg>`;
  }

  // ─── Barras por grupo ───────────────────────────────────────────────────────
  static buildBarChart(groups: GroupStat[], width = 320, height = 160, maxGroups = 8): string {
    const data = groups.slice(0, maxGroups);

    if (data.length === 0) {
      return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <text x="${width / 2}" y="${height / 2}" text-anchor="middle"
          font-size="11" fill="${C.dim}" font-family="sans-serif">Sem dados</text>
      </svg>`;
    }

    const PAD = { top: 12, right: 16, bottom: 40, left: 16 };
    const W = width - PAD.left - PAD.right;
    const H = height - PAD.top - PAD.bottom;

    const maxTotal = Math.max(...data.map((g) => g.total), 1);
    const barGroupW = W / data.length;
    const barW = Math.min(barGroupW * 0.55, 28);
    const gap = barGroupW - barW;

    return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  ${data
    .map((g, i) => {
      const x = PAD.left + i * barGroupW + gap / 2;
      const foundH = (g.found / maxTotal) * H;
      const totalH = (g.total / maxTotal) * H;
      const barY = PAD.top + H;

      const label = g.label.length > 10 ? g.label.substring(0, 9) + '…' : g.label;

      return `
  <rect x="${x.toFixed(1)}" y="${(barY - totalH).toFixed(1)}"
    width="${barW}" height="${totalH.toFixed(1)}" rx="3"
    fill="${C.surface2}" stroke="${C.pendingStroke}" stroke-width="0.5"/>
  <rect x="${x.toFixed(1)}" y="${(barY - foundH).toFixed(1)}"
    width="${barW}" height="${foundH.toFixed(1)}" rx="3"
    fill="${BAR_COLORS[i % BAR_COLORS.length]}" fill-opacity="0.85"/>
  <text x="${(x + barW / 2).toFixed(1)}" y="${(barY - totalH - 4).toFixed(1)}"
    text-anchor="middle" font-size="8" fill="${C.dim}" font-family="sans-serif">${g.progressPct ?? 0}%</text>
  <text x="${(x + barW / 2).toFixed(1)}" y="${(barY + 12).toFixed(1)}"
    text-anchor="middle" font-size="9" fill="${C.text}" font-family="sans-serif">${label}</text>
  <text x="${(x + barW / 2).toFixed(1)}" y="${(barY + 24).toFixed(1)}"
    text-anchor="middle" font-size="8" fill="${C.dim}" font-family="sans-serif">${g.found}/${g.total}</text>`;
    })
    .join('')}
</svg>`;
  }
}
