import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { Inventory, AssetItem, InventoryMetadata, InventoryStats, Result } from '../types/types';
import { handleServiceError } from '../utils/error.utils';
import { toISODate } from '../utils/dateUtils';

const STORAGE_KEYS = {
  INVENTORIES_INDEX: '@patriscan:inventories_index',
  SETTINGS: '@patriscan:settings',
} as const;

export class StorageService {
  private static readonly DEFAULT_METADATA: InventoryMetadata = {
    id: '0',
    name: 'Novo Inventário',
    importDate: toISODate(new Date()),
    totalItems: 0,
    status: 'active',
  };

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

  private static getInventoryDirectory(name: string): Directory {
    const safeName = this.getSafeFileName(name);
    return new Directory(this.getRootDirectory(), safeName);
  }

  private static getSafeFileName(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase();
  }

  private static async ensureDirectoryExists(): Promise<void> {
    const root = this.getRootDirectory();
    if (!root.exists) {
      root.create({ intermediates: true, idempotent: true });
    }
  }

  /**
   * Type guard para verificar se um item é do tipo "found"
   */
  private static isFoundItem(
    item: AssetItem
  ): item is AssetItem & { found: true; scanDate: string } {
    return item.found === true;
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

      const valid = index.filter((name) => folders.includes(this.getSafeFileName(name)));

      if (valid.length !== index.length) {
        await AsyncStorage.setItem(STORAGE_KEYS.INVENTORIES_INDEX, JSON.stringify(valid));
      }
      return valid;
    }, 'STORAGE_READ_FAILED');
  }

  static async saveInventory(inventory: Inventory): Promise<Result<void>> {
    return handleServiceError(async () => {
      const dir = this.getInventoryDirectory(inventory.metadata.name);
      dir.create({ intermediates: true, idempotent: true });

      const itemsFile = new File(dir, 'items.json');
      const metadataFile = new File(dir, 'metadata.json');

      await Promise.all([
        itemsFile.write(JSON.stringify(inventory.items)),
        metadataFile.write(JSON.stringify(inventory.metadata)),
      ]);

      const listResult = await this.getInventories();
      if (!listResult.ok) throw new Error(listResult.error.message);
      const list = listResult.value;
      if (!list.includes(inventory.metadata.name)) {
        await AsyncStorage.setItem(
          STORAGE_KEYS.INVENTORIES_INDEX,
          JSON.stringify([...list, inventory.metadata.name])
        );
      }
    }, 'STORAGE_WRITE_FAILED');
  }

  static async loadInventory(name: string): Promise<Result<Inventory>> {
    return handleServiceError(async () => {
      const dir = this.getInventoryDirectory(name);
      const itemsFile = new File(dir, 'items.json');
      const metadataFile = new File(dir, 'metadata.json');

      if (!itemsFile.exists || !metadataFile.exists) {
        throw new Error(`Arquivos do inventário "${name}" não encontrados.`);
      }

      const [itemsRaw, metadataRaw] = await Promise.all([itemsFile.text(), metadataFile.text()]);

      const items = this.safeJSONParse<AssetItem[]>(itemsRaw, []);
      const metadata = this.safeJSONParseOrThrow<InventoryMetadata>(
        metadataRaw,
        `metadados do inventário ${name}`
      );

      return { items, metadata };
    }, 'STORAGE_READ_FAILED');
  }

  static async deleteInventory(name: string): Promise<Result<void>> {
    return handleServiceError(async () => {
      const dir = this.getInventoryDirectory(name);
      if (dir.exists) dir.delete();

      const listResult = await this.getInventories();
      if (!listResult.ok) throw new Error(listResult.error.message);
      const updated = listResult.value.filter((item) => item !== name);
      await AsyncStorage.setItem(STORAGE_KEYS.INVENTORIES_INDEX, JSON.stringify(updated));
    }, 'STORAGE_DELETE_FAILED');
  }

  static async updateItemFoundStatus(
    inventoryName: string,
    itemCode: string,
    found: boolean,
    scanDate?: Date | string
  ): Promise<Result<void>> {
    return handleServiceError(async () => {
      const loadResult = await this.loadInventory(inventoryName);
      if (!loadResult.ok) throw new Error(loadResult.error.message);
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
          // Já encontrado: atualiza apenas a data
          updatedItem = { ...originalItem, scanDate: finalScanDate };
        } else {
          // Não encontrado → marcado como encontrado
          updatedItem = {
            ...originalItem,
            found: true,
            scanDate: finalScanDate,
          };
        }
      } else {
        if (this.isFoundItem(originalItem)) {
          // Encontrado → não encontrado: remove scanDate
          const { scanDate: _, ...base } = originalItem;
          updatedItem = { ...base, found: false };
        } else {
          updatedItem = originalItem;
        }
      }

      inventory.items[index] = updatedItem;

      const saveResult = await this.saveInventory(inventory);
      if (!saveResult.ok) throw new Error(saveResult.error.message);
    }, 'STORAGE_WRITE_FAILED');
  }

  static async getInventoryStats(name: string): Promise<Result<InventoryStats>> {
    return handleServiceError(
      async () => {
        const dir = this.getInventoryDirectory(name);
        if (!dir.exists) throw new Error(`Inventário "${name}" não encontrado`);

        const metadataFile = new File(dir, 'metadata.json');
        const itemsFile = new File(dir, 'items.json');

        if (!metadataFile.exists || !itemsFile.exists) {
          throw new Error('Arquivos de metadados ou itens ausentes');
        }

        const [metadataRaw, itemsRaw] = await Promise.all([metadataFile.text(), itemsFile.text()]);

        const metadata = this.safeJSONParseOrThrow<InventoryMetadata>(
          metadataRaw,
          `metadados do inventário ${name}`
        );
        const items = this.safeJSONParse<AssetItem[]>(itemsRaw, []);

        const total = metadata.totalItems;
        const scannedCount = items.filter((i) => i.found).length;

        return {
          totalItems: total,
          scannedItems: scannedCount,
          progress: total > 0 ? Math.round((scannedCount / total) * 100) : 0,
          lastModified: metadata.importDate,
        };
      },
      'STORAGE_READ_FAILED',
      { inventoryName: name }
    );
  }
}
