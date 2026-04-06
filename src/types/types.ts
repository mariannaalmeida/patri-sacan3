// TIPO DO SISTEMA PATRISCAN
// ========================

// ------------- DOMINIO --------------------------------


export type InventoryId = string;
export type AssetId = string;

// Sugestão de tipagem estrita para o status (adicione os que fizerem sentido pro seu negócio)
export type AssetStatus = 'good' | 'damaged' | 'missing' | 'in_repair' | string;


  export  type AssetItemBase = {
  id: AssetId;
  code: string;
  description: string;
  department: string;
  location: string;
  status: AssetStatus;
  value?: number;
  importDate?: ISODateString;
};

 export type AssetItem = 
  | (AssetItemBase & { found: true; scanDate: ISODateString })
  | (AssetItemBase & { found: false; scanDate?: never });


export interface InventoryMetadata {
  id: InventoryId;
  name: string;
  importDate: ISODateString;
  totalItems: number;
  status: 'active' | 'completed' | 'archived';
}

export interface Inventory {
  metadata: InventoryMetadata;
  items: AssetItem[];
  schema?: InventorySchema;
  stats?: InventoryStats;
}

// --- SCANNER ------
export interface ScanResult {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  item?: AssetItem;
  code?: string;
  timestamp: string;
  alreadyScanned?: boolean;
}

export interface ScanSession {
  id: string;
  inventoryId: string;
  startedAt: string;
  endedAt?: string;
  scannedCodes: string[];
}

// --- SETTINGS ----
export type ThemeMode = 'light' | 'dark';

export interface AppSettings {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  flashEnabled: boolean;
  theme: ThemeMode;
}

// --- STORAGE ----
export interface StorageStats {
  totalSize: number;
  inventoryCount: number;
  lastModified: ISODateString;
  freeSpace?: number;
}

export interface BackupInfo {
  path: string;
  timestamp: string;
  size: number;
  inventoryCount: number;
}

// ------ CSV / IMPORT ----

export interface ColumnMapping {
  csvHeader: string;
  mappedField?: keyof AssetItemBase;
  confidence: number;
}

export interface CSVValidationResult {
  validRows: number;
  errorRows: number;
  errors: { row: number; field: string; message: string; value?: string; }[];
  warnings: { row: number; field: string; message: string; value?: string; }[];
}

export interface ColumnMappingScreenProps {
  headers: string[];
  rawData: Record<string, string | number | boolean | null>[];
  inventoryName: string;
  onComplete: (mapping: Record<string, keyof AssetItem>) => void;
}

// ---  Dynamic Schema ---
export type FieldType = 'text' | 'number' | 'date' | 'currency' | 'boolean';

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  fixed?: boolean;
  defaultValue?: string | number | boolean | null; 
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
  lastModified?: ISODateString;
  progress: number;
}

// --- Adição de Metadados de Paginação  ---
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}

// --- Date ---
/**
 * Representa uma data serializada no formato ISO 8601.
 * Transformado em Branded Type para maior segurança.
 */
export type ISODateString = string & { readonly __brand: unique symbol };

// --- Navegation ---
export type RootStackParamList = {
  Home: undefined;
  InventoryList: undefined;
  InventoryDetail: { inventoryName: string };
  CreateInventory: undefined;
  Scanner: { inventoryId: string };
  Reports: undefined;
  ReportDetail: { inventoryName: string };
};

// --- Export ---
export type ExportFormat = 'csv_found' | 'csv_pending' | 'csv_full' | 'pdf' | 'xlsx' | 'json';

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
  | 'IMPORT_NO_CODE_COLUMN'
  | 'IMPORT_DUPLICATE_CODE'
  | 'IMPORT_VALIDATION_FAILED'
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


