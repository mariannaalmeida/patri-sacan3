/**
 * CSVExportService.ts
 *
 * Gera e compartilha CSVs do inventário via expo-sharing.
 * Três exports disponíveis:
 * - exportFound()    → itens escaneados com timestamps
 * - exportPending()  → itens não encontrados
 * - exportFull()     → relatório completo (todos os itens + status)
 */

import { Directory, File, Paths } from 'expo-file-system'; // ✅ Nova API
import * as Sharing from 'expo-sharing';
import { AssetItem, Result } from '../types/types';
import { handleServiceError } from '../utils/error.utils';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface InventoryReport {
  inventoryName: string;
  foundItems: AssetItem[]; // itens com found === true
  notFoundItems: AssetItem[]; // itens com found === false
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Escapa campo para CSV (RFC 4180) */
function csvField(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(csvField).join(',');
}

/**
 * ✅ Escreve o arquivo usando a nova API do FileSystem e compartilha
 */
async function writeAndShare(filename: string, content: string): Promise<void> {
  const bom = '\uFEFF'; // BOM UTF-8 para compatibilidade com Excel

  // 1. Acessa a pasta de cache do sistema
  const cacheDir = new Directory(Paths.cache);

  // 2. Cria a referência do arquivo
  const file = new File(cacheDir, filename);

  // 3. Escreve o conteúdo (a nova API usa UTF-8 por padrão para strings)
  await file.write(bom + content);

  // 4. Verifica se o dispositivo pode compartilhar
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Compartilhamento não disponível neste dispositivo.');
  }

  // 5. Compartilha usando a URI gerada pelo novo objeto File
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: `Exportar ${filename}`,
    UTI: 'public.comma-separated-values-text',
  });
}

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase();
}

/**
 * Type guard para verificar se um item tem scanDate (encontrado)
 */
function hasScanDate(item: AssetItem): item is AssetItem & { found: true; scanDate: string } {
  return item.found === true;
}

// ─── Serviço ──────────────────────────────────────────────────────────────────

export class CSVExportService {
  /**
   * Exporta todos os itens encontrados com timestamp de scan.
   * ✅ Agora retorna Promise<Result<void>>
   */
  static async exportFound(report: InventoryReport): Promise<Result<void>> {
    return handleServiceError(async () => {
      const header = csvRow([
        'Código',
        'Descrição',
        'Departamento',
        'Localização',
        'Status',
        'Valor',
        'Data do Scan',
        'Hora do Scan',
      ]);

      const rows = report.foundItems.map((item) => {
        const scanDateObj = hasScanDate(item) ? new Date(item.scanDate) : null;
        return csvRow([
          item.code,
          item.description,
          item.department,
          item.location,
          item.status,
          item.value,
          scanDateObj ? scanDateObj.toLocaleDateString('pt-BR') : '',
          scanDateObj
            ? scanDateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '',
        ]);
      });

      const safeName = sanitizeFileName(report.inventoryName);
      await writeAndShare(`${safeName}_encontrados.csv`, [header, ...rows].join('\r\n'));
    }, 'EXPORT_WRITE_FAILED');
  }

  /**
   * Exporta itens NÃO encontrados (pendentes ao final do inventário).
   * ✅ Agora retorna Promise<Result<void>>
   */
  static async exportPending(report: InventoryReport): Promise<Result<void>> {
    return handleServiceError(async () => {
      const header = csvRow([
        'Código',
        'Descrição',
        'Departamento',
        'Localização',
        'Status',
        'Valor',
      ]);

      const rows = report.notFoundItems.map((item) =>
        csvRow([
          item.code,
          item.description,
          item.department,
          item.location,
          item.status,
          item.value,
        ])
      );

      const safeName = sanitizeFileName(report.inventoryName);
      await writeAndShare(`${safeName}_nao_encontrados.csv`, [header, ...rows].join('\r\n'));
    }, 'EXPORT_WRITE_FAILED');
  }

  /**
   * Exporta relatório completo: todos os itens + coluna de situação.
   * ✅ Agora retorna Promise<Result<void>>
   */
  static async exportFull(report: InventoryReport): Promise<Result<void>> {
    return handleServiceError(async () => {
      const header = csvRow([
        'Código',
        'Descrição',
        'Departamento',
        'Localização',
        'Status Original',
        'Valor',
        'Situação',
        'Data do Scan',
        'Hora do Scan',
      ]);

      const allItems = [...report.foundItems, ...report.notFoundItems].sort((a, b) =>
        a.code.localeCompare(b.code)
      );

      const rows = allItems.map((item) => {
        const isFound = item.found;
        const scanDateObj = isFound && hasScanDate(item) ? new Date(item.scanDate) : null;
        return csvRow([
          item.code,
          item.description,
          item.department,
          item.location,
          item.status,
          item.value,
          isFound ? 'Encontrado' : 'Pendente',
          scanDateObj ? scanDateObj.toLocaleDateString('pt-BR') : '',
          scanDateObj
            ? scanDateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '',
        ]);
      });

      const safeName = sanitizeFileName(report.inventoryName);
      await writeAndShare(`${safeName}_relatorio_completo.csv`, [header, ...rows].join('\r\n'));
    }, 'EXPORT_WRITE_FAILED');
  }
}
