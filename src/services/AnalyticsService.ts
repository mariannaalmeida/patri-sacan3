/**
 * AnalyticsService.ts
 *
 * Camada de dados pura — sem I/O, sem navegação.
 * Recebe um Inventory e devolve métricas prontas para
 * ReportService, ChartService e as telas de relatório.
 */

import { AssetItem, Inventory } from '../types/types';

// ─── Tipos de saída ───────────────────────────────────────────────────────────

export interface OverallStats {
  total: number;
  found: number;
  pending: number;
  progressPct: number; // 0-100
  startedAt: string | null; // ISO — primeiro scan da sessão
  completedAt: string | null; // ISO — último scan (se 100%)
  durationMinutes: number | null;
}

export interface GroupStat {
  label: string;
  total: number;
  found: number;
  pending: number;
  progressPct: number;
}

export interface ScanEvent {
  code: string;
  description: string;
  location: string;
  department: string;
  scanDate: string; // ISO (só existe para found items)
  minutesFromStart: number; // delta desde o primeiro scan
}

export interface InventoryReport {
  inventoryName: string;
  generatedAt: string; // ISO
  overall: OverallStats;
  byDepartment: GroupStat[];
  byLocation: GroupStat[];
  scanTimeline: ScanEvent[];
  notFoundItems: AssetItem[];
  foundItems: AssetItem[];
}

// ─── Serviço ──────────────────────────────────────────────────────────────────

export class AnalyticsService {
  /**
   * Ponto de entrada principal.
   * Computa o relatório completo a partir de um Inventory.
   */
  static compute(inventory: Inventory): InventoryReport {
    // Separa itens encontrados (found === true) e não encontrados
    const foundItems = inventory.items.filter(
      (item): item is AssetItem & { found: true; scanDate: string } => item.found === true
    );
    const notFoundItems = inventory.items.filter((item) => item.found === false);

    const overall = this.computeOverall(inventory);
    const byDepartment = this.computeByGroup(inventory, 'department');
    const byLocation = this.computeByGroup(inventory, 'location');
    const scanTimeline = this.computeTimeline(foundItems, overall.startedAt);

    return {
      inventoryName: inventory.metadata.name,
      generatedAt: new Date().toISOString(),
      overall,
      byDepartment,
      byLocation,
      scanTimeline,
      notFoundItems,
      foundItems,
    };
  }

  // ─── Overall ───────────────────────────────────────────────────────────────

  private static computeOverall(inventory: Inventory): OverallStats {
    const total = inventory.items.length;
    const found = inventory.items.filter((i) => i.found).length;
    const pending = total - found;
    const progressPct = total > 0 ? Math.round((found / total) * 100) : 0;

    // Datas a partir dos scanDates dos itens encontrados
    const dates = inventory.items
      .filter((i): i is AssetItem & { found: true; scanDate: string } => i.found === true)
      .map((i) => new Date(i.scanDate).getTime())
      .sort((a, b) => a - b);

    const startedAt = dates.length > 0 ? new Date(dates[0]).toISOString() : null;
    const completedAt =
      progressPct === 100 && dates.length > 0
        ? new Date(dates[dates.length - 1]).toISOString()
        : null;

    const durationMinutes =
      startedAt && dates.length > 1
        ? Math.round((dates[dates.length - 1] - dates[0]) / 60000)
        : null;

    return {
      total,
      found,
      pending,
      progressPct,
      startedAt,
      completedAt,
      durationMinutes,
    };
  }

  // ─── Agrupamento por campo ─────────────────────────────────────────────────

  private static computeByGroup(
    inventory: Inventory,
    field: 'department' | 'location'
  ): GroupStat[] {
    // Set rápido de códigos encontrados
    const foundCodes = new Set(inventory.items.filter((i) => i.found).map((i) => i.code));

    const groups = new Map<string, { total: number; found: number }>();

    for (const item of inventory.items) {
      const key = item[field]?.trim() || '(não informado)';
      const existing = groups.get(key) ?? { total: 0, found: 0 };
      existing.total++;
      if (foundCodes.has(item.code)) existing.found++;
      groups.set(key, existing);
    }

    return Array.from(groups.entries())
      .map(([label, { total, found }]) => ({
        label,
        total,
        found,
        pending: total - found,
        progressPct: total > 0 ? Math.round((found / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }

  // ─── Timeline ──────────────────────────────────────────────────────────────

  private static computeTimeline(
    foundItems: (AssetItem & { found: true; scanDate: string })[],
    startedAt: string | null
  ): ScanEvent[] {
    const startMs = startedAt ? new Date(startedAt).getTime() : null;

    return foundItems
      .slice() // cria cópia para não modificar original
      .sort((a, b) => new Date(a.scanDate).getTime() - new Date(b.scanDate).getTime())
      .map((item) => {
        const scanMs = new Date(item.scanDate).getTime();
        return {
          code: item.code,
          description: item.description ?? '',
          location: item.location ?? '',
          department: item.department ?? '',
          scanDate: item.scanDate,
          minutesFromStart: startMs !== null ? Math.round((scanMs - startMs) / 60000) : 0,
        };
      });
  }

  // ─── Helpers de formatação (usados pelas telas e pelo export) ──────────────

  static formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  static formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  static formatDateTime(iso: string): string {
    return `${this.formatDate(iso)} às ${this.formatTime(iso)}`;
  }
}
