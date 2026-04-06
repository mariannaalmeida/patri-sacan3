import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import Papa from 'papaparse';
import {
  AssetItem,
  AssetItemBase,
  AssetStatus,
  ColumnMapping,
  CSVValidationResult,
  Inventory,
  MappableField,
  Result,
} from '../types/types';
import { toISODate } from '../utils/dateUtils';
import { handleServiceError } from '../utils/errorUtils';
import { StorageService } from './StorageService';

export class ImportService {
  /**
   * 1. Selecionar o arquivo CSV do dispositivo
   */
  static async pickCSVFile(): Promise<Result<DocumentPicker.DocumentPickerResult | null>> {
    return handleServiceError(async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      return result.canceled ? null : result;
    }, 'IMPORT_INVALID_FILE');
  }

  /**
   * 2. Ler e parsear o conteúdo do CSV
   */
  static async parseCSVFile(uri: string): Promise<
    Result<{
      headers: string[];
      data: Record<string, string>[];
      raw: string;
    }>
  > {
    return handleServiceError(
      async () => {
        const csvFile = new File(uri);
        const csvContent = await csvFile.text();

        return new Promise((resolve, reject) => {
          Papa.parse(csvContent, {
            header: true,
            skipEmptyLines: true,
            encoding: 'UTF-8',
            complete: (results) => {
              resolve({
                headers: results.meta.fields || [],
                data: results.data as Record<string, string>[],
                raw: csvContent,
              });
            },
            error: (error: { message: string }) => {
              reject(new Error(`Erro ao parsear CSV: ${error.message}`));
            },
          });
        });
      },
      'IMPORT_PARSE_FAILED',
      { fileUri: uri }
    );
  }

  /**
   * 3. Sugerir mapeamento de colunas baseado em heurística
   */
  static suggestColumnMapping(headers: string[]): ColumnMapping[] {
    const fieldKeywords: Partial<Record<MappableField, string[]>> = {
      code: ['código', 'codigo', 'code', 'patrimônio', 'patrimonio', 'tombo', 'id', 'registro'],
      description: ['descrição', 'descricao', 'description', 'nome', 'item', 'produto', 'bem'],
      department: ['departamento', 'departament', 'setor', 'divisão', 'divisao', 'unidade'],
      location: ['local', 'localização', 'localizacao', 'location', 'sala', 'andar', 'prédio'],
      status: ['status', 'estado', 'situação', 'situacao', 'condição', 'condicao'],
      value: ['valor', 'value', 'preço', 'preco', 'custo', 'montante'],
    };

    return headers.map((header) => {
      const lowerHeader = header.toLowerCase().trim();
      let bestField: MappableField | undefined;
      let bestConfidence = 0;

      for (const [field, keywords] of Object.entries(fieldKeywords)) {
        if (!keywords || keywords.length === 0) continue;

        if (keywords.some((kw) => lowerHeader === kw)) {
          bestField = field as MappableField;
          bestConfidence = 100;
          break;
        }
        if (keywords.some((kw) => lowerHeader.includes(kw)) && bestConfidence < 80) {
          bestField = field as MappableField;
          bestConfidence = 80;
        }
        if (bestConfidence < 60) {
          const headerWords = lowerHeader.split(/[\s_\-]+/);
          for (const word of headerWords) {
            if (keywords.some((kw) => kw.includes(word) || word.includes(kw))) {
              bestField = field as MappableField;
              bestConfidence = 60;
              break;
            }
          }
        }
      }

      return {
        csvHeader: header,
        mappedField: bestField,
        confidence: bestConfidence,
      };
    });
  }

  /**
   * 4. Validar os dados do CSV contra o mapeamento fornecido
   */
  static validateCSVData(
    data: Record<string, string>[],
    mapping: Record<string, MappableField>
  ): CSVValidationResult {
    const result: CSVValidationResult = {
      validRows: 0,
      errorRows: 0,
      errors: [],
      warnings: [],
    };
    const seenCodes = new Set<string>();

    const hasCodeMapping = Object.values(mapping).includes('code');
    const hasDescMapping = Object.values(mapping).includes('description');

    if (!hasCodeMapping) {
      result.errors.push({
        row: 0,
        field: 'code',
        message: 'Nenhuma coluna foi mapeada para "Código". A importação não pode continuar.',
      });
      return result;
    }
    if (!hasDescMapping) {
      result.warnings.push({
        row: 0,
        field: 'description',
        message:
          'Nenhuma coluna foi mapeada para "Descrição". Itens serão importados sem descrição.',
      });
    }

    const colCode = Object.entries(mapping).find(([_, f]) => f === 'code')![0];
    const colDesc = Object.entries(mapping).find(([_, f]) => f === 'description')?.[0];
    const colValue = Object.entries(mapping).find(([_, f]) => f === 'value')?.[0];

    data.forEach((row, idx) => {
      const rowNum = idx + 2;
      let isRowValid = true;
      const rowErrors: string[] = [];

      const codeVal = row[colCode]?.toString().trim();
      if (!codeVal) {
        rowErrors.push(`Código obrigatório (coluna: ${colCode})`);
        isRowValid = false;
      } else if (seenCodes.has(codeVal)) {
        rowErrors.push(`Código duplicado: ${codeVal}`);
        isRowValid = false;
      } else {
        seenCodes.add(codeVal);
      }

      if (colDesc) {
        const descVal = row[colDesc]?.toString().trim();
        if (!descVal) {
          rowErrors.push(`Descrição obrigatória (coluna: ${colDesc})`);
          isRowValid = false;
        }
      }

      if (colValue && row[colValue]) {
        const rawValue = row[colValue].toString().trim();
        const numericStr = rawValue.replace(/\./g, '').replace(',', '.');
        const numeric = parseFloat(numericStr);
        if (isNaN(numeric)) {
          result.warnings.push({
            row: rowNum,
            field: colValue,
            message: 'Valor numérico inválido',
            value: rawValue,
          });
        }
      }

      if (isRowValid) {
        result.validRows++;
      } else {
        result.errorRows++;
        rowErrors.forEach((msg) => {
          result.errors.push({ row: rowNum, field: 'row', message: msg });
        });
      }
    });

    return result;
  }

  /**
   * ✅ Converter string de status para AssetStatus válido
   */
  private static normalizeStatus(status: string): AssetStatus {
    const statusMap: Record<string, AssetStatus> = {
      bom: 'good',
      good: 'good',
      ótimo: 'good',
      otimo: 'good',
      excelente: 'good',
      danificado: 'damaged',
      damaged: 'damaged',
      'danificado parcial': 'damaged',
      avariado: 'damaged',
      extraviado: 'missing',
      missing: 'missing',
      perdido: 'missing',
      desaparecido: 'missing',
      'em manutenção': 'in_repair',
      'em manutencao': 'in_repair',
      in_repair: 'in_repair',
      reparo: 'in_repair',
      conserto: 'in_repair',
    };

    const normalized = status.toLowerCase().trim();
    return statusMap[normalized] || 'good'; // ✅ default para 'good'
  }

  /**
   * 5. Converter dados do CSV para AssetItem (com found: false inicialmente)
   */
  static convertToAssetItems(
    data: Record<string, string>[],
    mapping: Record<string, MappableField>
  ): AssetItem[] {
    const timestamp = Date.now();
    return data.map((row, index) => {
      const base: AssetItemBase = {
        code: '',
        description: '',
        department: '',
        location: '',
        status: 'good', // ✅ Status padrão válido
        value: undefined,
        importDate: undefined,
      };

      for (const [csvCol, assetField] of Object.entries(mapping)) {
        const rawValue = row[csvCol];
        if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
          const strValue = rawValue.toString().trim();
          switch (assetField) {
            case 'value':
              const numericStr = strValue.replace(/\./g, '').replace(',', '.');
              const num = parseFloat(numericStr);
              if (!isNaN(num)) base.value = num;
              break;
            case 'status':
              base.status = this.normalizeStatus(strValue); // ✅ Normaliza status
              break;
            default:
              // @ts-ignore - atribuição dinâmica segura
              base[assetField] = strValue;
          }
        }
      }

      return { ...base, found: false };
    });
  }

  /**
   * 6. Criar inventário a partir dos itens convertidos e salvar no Storage
   */
  static async createInventoryFromCSV(
    name: string,
    items: AssetItem[]
  ): Promise<Result<Inventory>> {
    return handleServiceError(async () => {
      const inventory: Inventory = {
        metadata: {
          id: StorageService.generateInventoryId(), // ✅ Usar o gerador de ID
          name,
          importDate: toISODate(new Date()),
          totalItems: items.length,
          status: 'active',
        },
        items,
      };

      const saveResult = await StorageService.saveInventory(inventory);
      if (!saveResult.ok) {
        throw new Error(saveResult.error.message);
      }
      return inventory;
    }, 'STORAGE_WRITE_FAILED');
  }
}
