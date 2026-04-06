import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { AssetItem, Inventory, InventoryMetadata, InventoryStats, Result } from '../types/types';
import { toISODate } from '../utils/dateUtils';
import { handleServiceError } from '../utils/errorUtils';

const STORAGE_KEYS = {
  INVENTORIES_INDEX: '@patri_sacan3:inventories_index',
  SETTINGS: '@patri_sacan3:settings',
  LAST_BACKUP: '@patri_sacan3:last_backup',
} as const;

export class StorageService {
  private static readonly DEFAULT_METADATA: InventoryMetadata = {
    id: '0',
    name: 'Novo Inventário',
    importDate: toISODate(new Date()),
    totalItems: 0,
    status: 'active',
  };

  // Gerador de ID único
  static generateInventoryId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `inv_${timestamp}_${random}`;
  }

  // --- Helpers privados ---

  private static safeJSONParse<T>(data: string, fallback: T): T {
    try {
      return JSON.parse(data);
    } catch {
      return fallback;
    }
  }

  private static safeJSONParseOrThrow<T>(data: string, context: string): T {
    try {
      return JSON.parse(data);
    } catch {
      throw new Error(`Falha ao parsear JSON: ${context}`);
    }
  }

  private static getRootDirectory(): Directory {
    return new Directory(Paths.document, 'inventories');
  }

  private static getInventoryDirectory(id: string): Directory {
    return new Directory(this.getRootDirectory(), id);
  }

  private static async ensureDirectoryExists(): Promise<void> {
    const root = this.getRootDirectory();
    if (!root.exists) {
      root.create({ intermediates: true, idempotent: true });
    }
  }

  private static isFoundItem(
    item: AssetItem
  ): item is AssetItem & { found: true; scanDate: string } {
    return item.found === true;
  }

  // Validação de ID (security)
  private static isValidId(id: string): boolean {
    // Previne path traversal e garante formato válido
    return /^inv_\d+_[a-z0-9]+$/.test(id) || id === '0';
  }

  // --- Métodos públicos ---

  static async getInventories(): Promise<Result<string[]>> {
    return handleServiceError(async () => {
      await this.ensureDirectoryExists();
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.INVENTORIES_INDEX);

      const index = raw ? this.safeJSONParse<string[]>(raw, []) : [];

      const root = this.getRootDirectory();
      const folders = root
        .list()
        .filter((f): f is Directory => f instanceof Directory)
        .map((d) => d.name);

      // Filtra apenas IDs válidos
      const valid = index.filter((id) => folders.includes(id) && this.isValidId(id));

      if (valid.length !== index.length) {
        await AsyncStorage.setItem(STORAGE_KEYS.INVENTORIES_INDEX, JSON.stringify(valid));
      }
      return valid;
    }, 'STORAGE_READ_FAILED');
  }

  // Método para listar com metadados (útil para telas de lista)
  static async listInventoriesWithMetadata(): Promise<Result<InventoryMetadata[]>> {
    return handleServiceError(async () => {
      const idsResult = await this.getInventories();
      if (!idsResult.ok) throw idsResult.error;

      const inventories = await Promise.all(
        idsResult.value.map(async (id) => {
          const result = await this.loadMetadata(id);
          return result.ok ? result.value : null;
        })
      );

      // Filtra nulls e ordena por data (mais recente primeiro)
      return inventories
        .filter((inv): inv is InventoryMetadata => inv !== null)
        .sort((a, b) => new Date(b.importDate).getTime() - new Date(a.importDate).getTime());
    }, 'STORAGE_READ_FAILED');
  }

  // Carregar apenas metadados (mais leve)
  static async loadMetadata(id: string): Promise<Result<InventoryMetadata>> {
    return handleServiceError(
      async () => {
        if (!this.isValidId(id)) {
          throw new Error(`ID de inventário inválido: ${id}`);
        }

        const dir = this.getInventoryDirectory(id);
        const metadataFile = new File(dir, 'metadata.json');

        if (!metadataFile.exists) {
          throw new Error(`Metadados do inventário ${id} não encontrados`);
        }

        const metadataRaw = await metadataFile.text();
        return this.safeJSONParseOrThrow<InventoryMetadata>(
          metadataRaw,
          `metadados do inventário ID: ${id}`
        );
      },
      'STORAGE_READ_FAILED',
      { inventoryId: id }
    );
  }

  static async saveInventory(inventory: Inventory): Promise<Result<void>> {
    return handleServiceError(async () => {
      // Valida o ID
      if (!this.isValidId(inventory.metadata.id) && inventory.metadata.id !== '0') {
        throw new Error(`ID de inventário inválido: ${inventory.metadata.id}`);
      }

      const dir = this.getInventoryDirectory(inventory.metadata.id);
      dir.create({ intermediates: true, idempotent: true });

      const itemsFile = new File(dir, 'items.json');
      const metadataFile = new File(dir, 'metadata.json');

      // ✅ Usa toISODate para garantir o tipo ISODateString
      const metadataWithTimestamp = {
        ...inventory.metadata,
        lastModified: toISODate(new Date()),
      };

      await Promise.all([
        itemsFile.write(JSON.stringify(inventory.items, null, 2)),
        metadataFile.write(JSON.stringify(metadataWithTimestamp, null, 2)),
      ]);

      const listResult = await this.getInventories();
      if (!listResult.ok) throw listResult.error;

      const list = listResult.value;
      if (!list.includes(inventory.metadata.id)) {
        await AsyncStorage.setItem(
          STORAGE_KEYS.INVENTORIES_INDEX,
          JSON.stringify([...list, inventory.metadata.id])
        );
      }
    }, 'STORAGE_WRITE_FAILED');
  }

  static async loadInventory(id: string): Promise<Result<Inventory>> {
    return handleServiceError(
      async () => {
        if (!this.isValidId(id)) {
          throw new Error(`ID de inventário inválido: ${id}`);
        }

        const dir = this.getInventoryDirectory(id);
        const itemsFile = new File(dir, 'items.json');
        const metadataFile = new File(dir, 'metadata.json');

        if (!itemsFile.exists || !metadataFile.exists) {
          throw new Error(`Arquivos do inventário (ID: ${id}) não encontrados.`);
        }

        const [itemsRaw, metadataRaw] = await Promise.all([itemsFile.text(), metadataFile.text()]);

        const items = this.safeJSONParse<AssetItem[]>(itemsRaw, []);
        const metadata = this.safeJSONParseOrThrow<InventoryMetadata>(
          metadataRaw,
          `metadados do inventário ID: ${id}`
        );

        return { items, metadata };
      },
      'STORAGE_READ_FAILED',
      { inventoryId: id }
    );
  }

  static async deleteInventory(id: string): Promise<Result<void>> {
    return handleServiceError(
      async () => {
        if (!this.isValidId(id)) {
          throw new Error(`ID de inventário inválido: ${id}`);
        }

        const dir = this.getInventoryDirectory(id);
        if (dir.exists) {
          dir.delete();
        }

        const listResult = await this.getInventories();
        if (!listResult.ok) throw listResult.error;

        const updated = listResult.value.filter((itemId) => itemId !== id);
        await AsyncStorage.setItem(STORAGE_KEYS.INVENTORIES_INDEX, JSON.stringify(updated));
      },
      'STORAGE_DELETE_FAILED',
      { inventoryId: id }
    );
  }

  // Renomear inventário (sem mudar ID)
  static async renameInventory(id: string, newName: string): Promise<Result<void>> {
    return handleServiceError(
      async () => {
        const loadResult = await this.loadInventory(id);
        if (!loadResult.ok) throw loadResult.error;

        const inventory = loadResult.value;
        inventory.metadata.name = newName;
        // ✅ Usa toISODate para garantir o tipo ISODateString
        inventory.metadata.lastModified = toISODate(new Date());

        await this.saveInventory(inventory);
      },
      'STORAGE_WRITE_FAILED',
      { inventoryId: id }
    );
  }

  static async updateItemFoundStatus(
    inventoryId: string,
    itemCode: string,
    found: boolean,
    scanDate?: Date | string
  ): Promise<Result<void>> {
    return handleServiceError(
      async () => {
        const loadResult = await this.loadInventory(inventoryId);
        if (!loadResult.ok) throw loadResult.error;

        const inventory = loadResult.value;

        const index = inventory.items.findIndex((i) => i.code === itemCode);
        if (index === -1) {
          throw new Error(`Item com código "${itemCode}" não encontrado`);
        }

        const originalItem = inventory.items[index];
        let updatedItem: AssetItem;

        if (found) {
          const finalScanDate = scanDate ? toISODate(new Date(scanDate)) : toISODate(new Date());
          if (this.isFoundItem(originalItem)) {
            updatedItem = { ...originalItem, scanDate: finalScanDate };
          } else {
            updatedItem = {
              ...originalItem,
              found: true,
              scanDate: finalScanDate,
            };
          }
        } else {
          if (this.isFoundItem(originalItem)) {
            const { scanDate: _, ...base } = originalItem;
            updatedItem = { ...base, found: false };
          } else {
            updatedItem = originalItem;
          }
        }

        inventory.items[index] = updatedItem;

        const saveResult = await this.saveInventory(inventory);
        if (!saveResult.ok) throw saveResult.error;
      },
      'STORAGE_WRITE_FAILED',
      { inventoryId, itemCode }
    );
  }

  // ✅ Método corrigido - getInventoryStats
  static async getInventoryStats(id: string): Promise<Result<InventoryStats>> {
    return handleServiceError(
      async () => {
        const loadResult = await this.loadInventory(id);
        if (!loadResult.ok) throw loadResult.error;

        const { items, metadata } = loadResult.value;

        const total = metadata.totalItems;
        const scannedCount = items.filter((i) => i.found).length;

        // ✅ Usa toISODate para converter para ISODateString
        // Se lastModified existe, converte; senão, usa importDate
        const lastModified = metadata.lastModified
          ? toISODate(metadata.lastModified)
          : toISODate(metadata.importDate);

        return {
          totalItems: total,
          scannedItems: scannedCount,
          progress: total > 0 ? Math.round((scannedCount / total) * 100) : 0,
          lastModified, // ✅ Agora é ISODateString
        };
      },
      'STORAGE_READ_FAILED',
      { inventoryId: id }
    );
  }

  // Método utilitário para criar novo inventário
  static async createNewInventory(name: string, items: AssetItem[]): Promise<Result<Inventory>> {
    return handleServiceError(async () => {
      const id = this.generateInventoryId();
      const now = toISODate(new Date());

      const newInventory: Inventory = {
        items,
        metadata: {
          id,
          name,
          importDate: now,
          totalItems: items.length,
          status: 'active',
          lastModified: now, // ✅ Agora é ISODateString
        },
      };

      const saveResult = await this.saveInventory(newInventory);
      if (!saveResult.ok) throw saveResult.error;

      return newInventory;
    }, 'STORAGE_WRITE_FAILED');
  }

  // Backup/Export de um inventário
  static async exportInventory(id: string): Promise<Result<string>> {
    return handleServiceError(
      async () => {
        const loadResult = await this.loadInventory(id);
        if (!loadResult.ok) throw loadResult.error;

        // Retorna JSON para compartilhar
        return JSON.stringify(loadResult.value, null, 2);
      },
      'STORAGE_READ_FAILED',
      { inventoryId: id }
    );
  }

  // Import de inventário
  static async importInventory(jsonData: string): Promise<Result<Inventory>> {
    return handleServiceError(async () => {
      const inventory = this.safeJSONParseOrThrow<Inventory>(jsonData, 'importação');

      // Gera novo ID para evitar conflitos
      const newId = this.generateInventoryId();
      const now = toISODate(new Date());

      inventory.metadata.id = newId;
      inventory.metadata.importDate = now;
      inventory.metadata.status = 'active';
      inventory.metadata.lastModified = now; // ✅ Agora é ISODateString

      const saveResult = await this.saveInventory(inventory);
      if (!saveResult.ok) throw saveResult.error;

      return inventory;
    }, 'STORAGE_WRITE_FAILED');
  }
}
