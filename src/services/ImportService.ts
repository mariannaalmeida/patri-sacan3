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
  isStandardField,
} from '../types/types';
import { toISODate } from '../utils/dateUtils';
import { handleServiceError } from '../utils/errorUtils';
import { StorageService } from './StorageService';
import { generateBasicSchema } from '../utils/schemaUtils';
import { parseBrazilianCurrencySafe } from '../utils/currencyUtils';

export class ImportService {
  /**
   *  Selecionar o arquivo CSV do dispositivo
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
   *  Ler e parsear o conteúdo do CSV
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
   *  Sugerir mapeamento de colunas baseado em heurística
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
   *  Validar os dados do CSV contra o mapeamento fornecido
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

      // Descrição agora é opcional: apenas avisa, não invalida a linha
      if (colDesc) {
        const descVal = row[colDesc]?.toString().trim();
        if (!descVal) {
          result.warnings.push({
            row: rowNum,
            field: colDesc,
            message: 'Descrição não informada',
          });
          // isRowValid não é alterado
        }
      }

      if (colValue && row[colValue]) {
        const rawValue = row[colValue].toString().trim();
        const numeric = parseBrazilianCurrencySafe(rawValue);
        if (numeric === undefined) {
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
   * Converter string de status para AssetStatus válido
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
    return statusMap[normalized] || 'good'; //  default para 'good'
  }

  /**
   *  Converter dados do CSV para AssetItem (com found: false inicialmente)
   */
  static convertToAssetItems(
    data: Record<string, string>[],
    mapping: Record<string, MappableField>
  ): AssetItem[] {
    return data.map((row, index) => {
      const base: AssetItemBase = {
        code: '',
        description: '',
        department: '',
        location: '',
        status: 'good', //  Status padrão válido
        value: undefined,
        importDate: undefined,
        customFields: {}, // Inicializa vazio
      };

      for (const [csvCol, assetField] of Object.entries(mapping)) {
        const rawValue = row[csvCol];
        if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
          const strValue = rawValue.toString().trim();
          if (isStandardField(assetField)) {
            switch (assetField) {
              case 'value': {
                const parsed = parseBrazilianCurrencySafe(strValue);
                if (parsed !== undefined) base.value = parsed;
                break;
              }
              case 'status':
                base.status = this.normalizeStatus(strValue);
                break;
              default:
                // code, description, department, location
                base[assetField] = strValue;
                break;
            }
          } else {
            // Campo customizado
            if (base.customFields) {
              base.customFields[assetField] = strValue;
            }
          }
        }
      }

      return { ...base, found: false };
    });
  }

  /**
   *  Criar inventário a partir dos itens convertidos e salvar no Storage
   */
  static async createInventoryFromCSV(
    name: string,
    items: AssetItem[]
  ): Promise<Result<Inventory>> {
    return handleServiceError(async () => {
      //  Gera o schema a partir dos itens
      const schema = generateBasicSchema(items);
      const inventory: Inventory = {
        metadata: {
          id: StorageService.generateInventoryId(), // Usar o gerador de ID
          name,
          importDate: toISODate(new Date()),
          totalItems: items.length,
          status: 'active',
        },
        items,
        schema, //  Inclui o schema obrigatório
      };

      const saveResult = await StorageService.saveInventory(inventory);
      if (!saveResult.ok) {
        throw new Error(saveResult.error.message);
      }
      return inventory;
    }, 'STORAGE_WRITE_FAILED');
  }
}
