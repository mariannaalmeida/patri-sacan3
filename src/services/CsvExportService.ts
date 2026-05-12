/**
 * CSVExportService.ts
 *
 * Gera e compartilha CSVs do inventário via expo-sharing.
 * Três exports disponíveis:
 * - exportFound()    → itens escaneados com timestamps
 * - exportPending()  → itens não encontrados
 * - exportFull()     → relatório completo (todos os itens + status)
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Result, isScannedItem, InventorySchema } from '../types/types';
import { handleServiceError } from '../utils/errorUtils';
import { formatDisplayDate, formatDisplayTime } from '../utils/dateUtils';
import { InventoryReport } from '../services/AnalyticsService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Escapa campo para CSV (RFC 4180) */
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // Se contém caracteres especiais, encapsular entre aspas
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(csvField).join(',');
}

/**
 * Helper para extrair apenas os nomes dos campos customizados (dinâmicos) do schema
 */
function getCustomFieldNames(schema?: InventorySchema): string[] {
  if (!schema || !schema.fields) return [];
  return schema.fields.filter((f) => !f.fixed).map((f) => f.name);
}

/**
 * Escreve o arquivo usando a nova API do FileSystem e compartilha
 */
async function writeAndShare(filename: string, content: string): Promise<void> {
  const bom = '\uFEFF'; // BOM UTF-8 para compatibilidade com Excel

  try {
    // 1. Acessa a pasta de cache do sistema
    const cacheDir = new Directory(Paths.cache);

    // Garante que o diretório existe
    if (!cacheDir.exists) {
      cacheDir.create({ intermediates: true, idempotent: true });
    }

    // 2. Cria a referência do arquivo
    const file = new File(cacheDir, filename);

    // 3. Escreve o conteúdo (a nova API usa UTF-8 por padrão para strings)
    file.write(bom + content);

    // 4. Verifica se o dispositivo pode compartilhar
    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (!isSharingAvailable) {
      throw new Error('Compartilhamento não disponível neste dispositivo.');
    }

    // 5. Compartilha usando a URI gerada pelo novo objeto File
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: `Exportar ${filename}`,
      UTI: 'public.comma-separated-values-text',
    });
  } catch (error) {
    console.error('Erro ao escrever/compartilhar arquivo:', error);
    throw new Error(
      `Falha ao exportar arquivo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    );
  }
}

function sanitizeFileName(name: string): string {
  if (!name) return 'inventario';

  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9]/gi, '_') // Substitui caracteres especiais por _
    .replace(/_+/g, '_') // Remove múltiplos underscores
    .replace(/^_|_$/g, '') // Remove underscores do início/fim
    .toLowerCase()
    .substring(0, 50); // Limita tamanho do nome
}

// ─── Serviço ──────────────────────────────────────────────────────────────────

export class CSVExportService {
  /**
   * Exporta todos os itens encontrados com timestamp de scan.
   */
  static async exportFound(
    report: InventoryReport,
    schema?: InventorySchema
  ): Promise<Result<void>> {
    return handleServiceError(async () => {
      if (!report.foundItems.length) {
        throw new Error('Não há itens encontrados para exportar.');
      }

      const customFields = getCustomFieldNames(schema);

      const header = csvRow([
        'Código',
        'Descrição',
        'Departamento',
        'Localização',
        'Status',
        'Valor',
        ...customFields,
        'Data do Scan',
        'Hora do Scan',
      ]);

      const rows = report.foundItems.map((item) => {
        const scanDateObj = isScannedItem(item) ? new Date(item.scanDate) : null;
        const customValues = customFields.map((field) => item.customFields?.[field] || '');
        return csvRow([
          item.code,
          item.description,
          item.department,
          item.location,
          item.status,
          item.value,
          ...customValues,
          scanDateObj ? formatDisplayDate(scanDateObj) : '',
          scanDateObj ? formatDisplayTime(scanDateObj) : '',
        ]);
      });

      const safeName = sanitizeFileName(report.inventoryName);
      await writeAndShare(`${safeName}_encontrados.csv`, [header, ...rows].join('\r\n'));
    }, 'EXPORT_WRITE_FAILED');
  }

  /**
   * Exporta itens NÃO encontrados (pendentes ao final do inventário).
   */
  static async exportPending(
    report: InventoryReport,
    schema?: InventorySchema
  ): Promise<Result<void>> {
    return handleServiceError(async () => {
      if (!report.notFoundItems.length) {
        throw new Error('Não há itens pendentes para exportar.');
      }

      const customFields = getCustomFieldNames(schema);

      const header = csvRow([
        'Código',
        'Descrição',
        'Departamento',
        'Localização',
        'Status',
        'Valor',
        ...customFields,
      ]);

      const rows = report.notFoundItems.map((item) => {
        const customValues = customFields.map((field) => item.customFields?.[field] || '');
        return csvRow([
          item.code,
          item.description,
          item.department,
          item.location,
          item.status,
          item.value,
          ...customValues,
        ]);
      });

      const safeName = sanitizeFileName(report.inventoryName);
      await writeAndShare(`${safeName}_nao_encontrados.csv`, [header, ...rows].join('\r\n'));
    }, 'EXPORT_WRITE_FAILED');
  }

  /**
   * Exporta relatório completo: todos os itens + coluna de situação.
   */
  static async exportFull(
    report: InventoryReport,
    schema?: InventorySchema
  ): Promise<Result<void>> {
    return handleServiceError(async () => {
      if (!report.foundItems.length && !report.notFoundItems.length) {
        throw new Error('Não há itens para exportar.');
      }

      const customFields = getCustomFieldNames(schema);

      const header = csvRow([
        'Código',
        'Descrição',
        'Departamento',
        'Localização',
        'Status Original',
        'Valor',
        'Situação',
        ...customFields,
        'Data do Scan',
        'Hora do Scan',
      ]);

      // Combina e ordena todos os itens
      const allItems = [...report.foundItems, ...report.notFoundItems].sort((a, b) =>
        a.code.localeCompare(b.code)
      );

      const rows = allItems.map((item) => {
        const isFound = item.found === true;
        const scanDateObj = isFound && isScannedItem(item) ? new Date(item.scanDate) : null;
        const customValues = customFields.map((field) => item.customFields?.[field] || '');

        return csvRow([
          item.code,
          item.description,
          item.department,
          item.location,
          item.status,
          item.value,
          isFound ? 'Encontrado' : 'Pendente',
          ...customValues,
          scanDateObj ? formatDisplayDate(scanDateObj) : '',
          scanDateObj ? formatDisplayTime(scanDateObj) : '',
        ]);
      });

      const safeName = sanitizeFileName(report.inventoryName);
      await writeAndShare(`${safeName}_relatorio_completo.csv`, [header, ...rows].join('\r\n'));
    }, 'EXPORT_WRITE_FAILED');
  }
}
