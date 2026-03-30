// TIPO DO SISTEMA PATRISCAN
// ========================

// ------------- DOMINIO --------------------------------
export interface AssetItem {
  id: string;
  code: string;
  description: string;
  department: string;
  location: string;
  status: string;
  value?: string;
  found?: boolean;
  importDate?: string;
  scanDate?: string;
}

export interface InventoryMetadata {
  id: string;
  name: string;
  importDate: string;
  totalItems: number;
  status: 'active' | 'completed' | 'archived';
}

export interface Inventory {
  metadata: InventoryMetadata;
  items: AssetItem[];
  scanned: AssetItem[];
}

// --- SCANNER ------
export interface ScanResult {
  type: 'success' | 'error' | 'warning';
  message: string;
  item?: AssetItem;
  code?: string;
  timestamp: string;
}

// --- SETTINGS ----
export type ThemeMode = 'light' | 'dark';

export interface AppSettings {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  flashEnabled: boolean;
  theme: ThemeMode;
}

// --- Storage ----
export interface StorageStats {
  totalSize: number;
  inventoryCount: number;
  lastModified: string;
  freeSpace?: number;
}

export interface BackupInfo {
  path: string;
  timestamp: string;
  size: number;
  inventoryCount: number;
}

export interface StorageError {
  code: string;
  message: string;
  details?: any;
}

// ------ CSV / IMPORT ----

// FIX: Corrigido o typo "ColumnMaping" -> "ColumnMapping"
// O alias abaixo garante retrocompatibilidade com código antigo que usar o nome errado
export interface ColumnMapping {
  csvHeader: string;
  mappedField?: keyof AssetItem;
  confidence: number; // 0-100
}

export interface CSVValidationResult {
  validRows: number;
  errorRows: number;
  errors: {
    row: number;
    field: string;
    message: string;
    value?: string;
  }[];
  warnings: {
    row: number;
    field: string;
    message: string;
    value?: string;
  }[];
}

export interface ColumnMappingScreenProps {
  csvData: any[];
  headers: string[];
  onMappingComplete: (mapping: Record<string, string>) => void;
}

// --- Dynamic Schema ---
export type FieldType = 'text' | 'number' | 'date' | 'currency' | 'boolean';

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  fixed?: boolean;
  defaultValue?: any;
  options?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    custom?: string;
  };
}

export interface InventorySchema {
  version: string;
  fields: FieldDefinition[];
}

// --- Statistics ---
export interface InventoryStats {
  totalItems: number;
  scannedItems: number;
  lastModified?: string;
  progress: number;
}

// --- Navegação ---

/**
 * Contrato único de navegação do app.
 *
 * Antes cada tela definia seu próprio RootStackParamList local,
 * o que criava risco de divergência silenciosa entre telas:
 * uma tela podia navegar passando { inventory } enquanto
 * a tela de destino esperava { inventoryName }.
 *
 * Agora todas as telas importam daqui:
 *   import { RootStackParamList } from '../types/types';
 *   const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
 */
export type RootStackParamList = {
  Home: undefined;
  InventoryList: undefined;
  InventoryDetail: { inventoryName: string };
  CreateInventory: undefined;
  Scanner: { inventory: Inventory };
  Reports: undefined;
  ReportDetail: { inventoryName: string };
};

// --- Exportação ---

/**
 * Formatos de exportação disponíveis no ExportActionSheet e nos serviços.
 *
 * Antes estava definido dentro de src/components/inventory/index.tsx,
 * o que obrigava serviços (CSVExportService, ReportService) a importar
 * de uma camada de componente — violando a separação de responsabilidades.
 *
 * Agora o fluxo é:
 *   types.ts (define) → services (implementam) → components (consomem)
 */
export type ExportFormat = 'csv_found' | 'csv_pending' | 'csv_full' | 'pdf';

// --- Erros de aplicação ---

/**
 * Tipo de erro padronizado para todos os serviços.
 *
 * Problema anterior: serviços sinalizavam falha retornando boolean (false)
 * ou null, sem nenhuma informação sobre o que deu errado. Isso forçava
 * as telas a exibir mensagens genéricas como "Falha ao salvar. Tente novamente."
 *
 * Com AppError, o serviço pode comunicar:
 *   - code:    identificador da categoria do erro (para lógica de retry ou fallback)
 *   - message: texto legível para exibir ao usuário
 *   - cause:   o erro original para logging/debugging
 *   - context: dados adicionais para diagnóstico (ex: nome do arquivo, linha do CSV)
 *
 * Uso nos serviços — padrão Result<T>:
 *   type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };
 *
 * Exemplo:
 *   static async saveInventory(inv: Inventory): Promise<Result<void>> {
 *     try {
 *       ...
 *       return { ok: true, value: undefined };
 *     } catch (e) {
 *       return { ok: false, error: {
 *         code: 'STORAGE_WRITE_FAILED',
 *         message: 'Não foi possível salvar o inventário.',
 *         cause: e,
 *         context: { inventoryName: inv.metadata.name },
 *       }};
 *     }
 *   }
 *
 * Nas telas:
 *   const result = await StorageService.saveInventory(inv);
 *   if (!result.ok) {
 *     Alert.alert('Erro', result.error.message);
 *     return;
 *   }
 */
export interface AppError {
  /** Identificador da categoria do erro. Use SNAKE_UPPER_CASE. */
  code: AppErrorCode;
  /** Mensagem legível para exibição ao usuário. */
  message: string;
  /** Erro original capturado no catch, para logging. */
  cause?: unknown;
  /** Dados de contexto adicionais para diagnóstico. */
  context?: Record<string, unknown>;
}

/**
 * Catálogo de códigos de erro do app.
 * Centralizar aqui permite tratar categorias de forma uniforme
 * (ex: todos os erros STORAGE_* disparam um toast de "problema de armazenamento").
 */
export type AppErrorCode =
  // Armazenamento
  | 'STORAGE_WRITE_FAILED'
  | 'STORAGE_READ_FAILED'
  | 'STORAGE_DELETE_FAILED'
  | 'STORAGE_NOT_FOUND'
  // Importação
  | 'IMPORT_INVALID_FILE'
  | 'IMPORT_PARSE_FAILED'
  | 'IMPORT_MAPPING_INCOMPLETE'
  // Scanner
  | 'SCAN_INVALID_CODE'
  | 'SCAN_CONFIRM_FAILED'
  // Exportação
  | 'EXPORT_WRITE_FAILED'
  | 'EXPORT_SHARE_UNAVAILABLE'
  // Genérico
  | 'UNKNOWN';

/**
 * Helper para construir um AppError a partir de qualquer exceção capturada.
 * Útil nos blocos catch onde o tipo do erro é desconhecido.
 *
 * Exemplo:
 *   } catch (e) {
 *     return Err(unknownToAppError(e, 'STORAGE_WRITE_FAILED'));
 *   }
 */
export function unknownToAppError(cause: unknown, code: AppErrorCode = 'UNKNOWN'): AppError {
  const message =
    cause instanceof Error ? cause.message : 'Ocorreu um erro inesperado. Tente novamente.';
  return { code, message, cause };
}

/**
 * Tipo Result<T> para serviços que antes retornavam boolean | null.
 *
 * Substitui:
 *   static async saveInventory(...): Promise<boolean>
 * Por:
 *   static async saveInventory(...): Promise<Result<void>>
 *
 * Nas telas, em vez de:
 *   if (!saved) { Alert.alert('Erro', 'Falha genérica') }
 * Passa a ser:
 *   if (!result.ok) { Alert.alert('Erro', result.error.message) }
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

/** Atalhos para construir Results sem boilerplate. */
export const Ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const Err = (error: AppError): Result<never> => ({ ok: false, error });
