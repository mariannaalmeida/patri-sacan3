import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system';
import { Inventory, AssetItem, InventoryMetadata, InventoryStats } from './../types/types';

// Definir as chaves para armazenamento no AsyncStorage
const STORAGE_KEYS = {
  INVENTORIES_INDEX: '@patriscan:inventories_index', // lista de nome de inventários
  SETTINGS: '@patriscan:settings',
} as const;

export class StorageService {
  // Propriedade estática para servir de molde
  private static readonly DEFAULT_METADATA: InventoryMetadata = {
    id: '0',
    name: 'Novo Inventário',
    importDate: new Date().toISOString(),
    totalItems: 0,
    status: 'active',
  };

  // Helpers seguros
  /**
   * Faz parse seguro de JSON, retornando um valor padrão em caso de erro
   * Evita quebrar a aplicação se algum arquivo estiver corrompido
   */
  private static safeJSONParse<T>(data: string, fallback: T): T {
    try {
      // Tenta transformar a string em objeto
      return JSON.parse(data);
    } catch {
      // Se a string for inválida (ex: "{" mal formatado),
      // ele cai aqui e retorna o 'fallback' (valor padrão)
      return fallback;
    }
    /**
     * Retorna o diretório raiz onde todos os inventários são armazenados.
     * Usa Paths.document que é diretório privado do app (seguro e  persistente)
     */
  }
  private static getRootDirectory(): Directory {
    return new Directory(Paths.document, 'inventories');
  }

  /**
   * Retorna o diretório de um inventário específico, como nome sanitizado
   */

  private static getInventoryDirectory(name: string): Directory {
    const safeName = this.getSafeFileName(name);
    return new Directory(this.getRootDirectory(), safeName);
  }

  // Definir as chaves para armazenamento no AsyncStorage
  private static getSafeFileName(name: string): string {
    return name
      .normalize('NFD') // decompõe caracteres acentuados
      .replace(/[\u0300-\u036f]/g, '') // remove diacríticos (acentos)
      .replace(/[^a-z0-9]/gi, '_') // substitui qualquer caractere não alfanumérico por _ FIX: flag 'i' adicionada para pegar maiúsculas também
      .toLowerCase(); // Converte para minúsculas
  }

  // --- 1. Inicialização ---
  /**
   * Garante que o diretório raiz ()
   */
  static async ensureDirectoryExists(): Promise<void> {
    try {
      const root = this.getRootDirectory();
      if (!root.exists) {
        root.create({ intermediates: true, idempotent: true });
      }
    } catch (error: any) {
      console.warn('Erro ao garantir diretório raiz', error);
    }
  }

  // --- 2. Listar inventários ---
  /**
   * Retorna a lista de nomes de inventários válidos
   * Faz reconciliação entre o índice no AsyncStorage e as pastas físicas
   */
  static async getInventories(): Promise<string[]> {
    try {
      // 1. Lê o índice do AsyncStorage

      const raw = await AsyncStorage.getItem(STORAGE_KEYS.INVENTORIES_INDEX);
      const index = raw ? this.safeJSONParse<string[]>(raw, []) : [];

      // 2. Garante que o diretório raiz exista (para evitar erro ao listar)
      await this.ensureDirectoryExists();
      const root = this.getRootDirectory();

      // 3. Lista as pastas existentes no disco

      const folders = root
        .list() // Retorna array de File| Directory
        .filter((f): f is Directory => f instanceof Directory) // Filtra apenas os diretórios
        .map((d) => d.name); // Extrai o nome da pasta

      // 4. Reconcilia: mantém no índice apenas nomes que têm pasta correspondente
      const valid = index.filter((name) => {
        return folders.includes(this.getSafeFileName(name));
      });

      // 5. Se o índice mudou (por exemplo, pasta excluída manualmente), atualiza o AsyscStorage

      if (valid.length !== index.length) {
        await AsyncStorage.setItem(STORAGE_KEYS.INVENTORIES_INDEX, JSON.stringify(valid));
      }

      return valid;
    } catch (error) {
      console.error('Erro ao listar inventários', error);
      return [];
    }
  }

  // --- 3. Salvar inventário ---

  /**
   * Salva um inventário completo no disco.
   * Cria a pasta do inventário se não existir, e escreve os três arquivos:
   * - items.json: lista completa de itens
   * - scanned.json: lista de itens já escaneados
   * - metadata.json: metadados do inventário
   */

  static async saveInventory(inventory: Inventory): Promise<boolean> {
    try {
      // 1. Obtém o diretório do inventário (cria se necessário)
      const dir = this.getInventoryDirectory(inventory.metadata.name);

      dir.create({ intermediates: true, idempotent: true });

      // 2. Cria referências para três arquivos

      const itemsFile = new File(dir, 'items.json');
      const scannedFile = new File(dir, 'scanned.json');
      const metadataFile = new File(dir, 'metadata.json');

      // 3. Escreve os três arquivos em paralelo para melhor performance

      await Promise.all([
        itemsFile.write(JSON.stringify(inventory.items)),
        scannedFile.write(JSON.stringify(inventory.scanned)),
        metadataFile.write(JSON.stringify(inventory.metadata)),
      ]);

      // 4. Atualiza o índice no AsyncStorage se for um novo inventário

      const list = await this.getInventories();
      if (!list.includes(inventory.metadata.name)) {
        await AsyncStorage.setItem(
          STORAGE_KEYS.INVENTORIES_INDEX,
          JSON.stringify([...list, inventory.metadata.name])
        );
      }
      return true;
    } catch (error) {
      console.error('Erro ao salvar o inventário:', error);
      return false;
    }
  }

  // --- 4. Carregar inventário ---
  /**
   * Carrega um inventário completo do disco.
   * Retorna null se o inventário não existir ou se algum arquivo estiver corrompido.
   */
  static async loadInventory(name: string): Promise<Inventory | null> {
    try {
      const dir = this.getInventoryDirectory(name);

      // Referências para os arquivos
      const itemsFile = new File(dir, 'items.json');
      const scannedFile = new File(dir, 'scanned.json');
      const metadataFile = new File(dir, 'metadata.json');

      // Lê os três arquivos em paralelo
      const [itemsRaw, scannedRaw, metadataRaw] = await Promise.all([
        itemsFile.text(),
        scannedFile.text(),
        metadataFile.text(),
      ]);

      // Converter JSON com fallback seguro
      return {
        items: this.safeJSONParse(itemsRaw, []), // Se estiver corrompido, ele retorna uma lista vazia e o App segue rodando.
        scanned: this.safeJSONParse(scannedRaw, []),
        metadata: this.safeJSONParse(metadataRaw, this.DEFAULT_METADATA),
      };
    } catch (error) {
      console.error(`Erro ao carregar inventário "${name}":`, error);
      return null;
    }
  }

  // --- 5. Excluir inventário ---
  /**
   * Exclui um inventário do disco e remove do índice.
   */
  static async deleteInventory(name: string): Promise<boolean> {
    try {
      const dir = this.getInventoryDirectory(name);
      if (dir.exists) {
        dir.delete(); // Exclui a pasta e todo seu conteúdo
      }

      // Remove do índice

      const list = await this.getInventories();
      const updated = list.filter((item) => item !== name);
      await AsyncStorage.setItem(STORAGE_KEYS.INVENTORIES_INDEX, JSON.stringify(updated));

      return true;
    } catch (error) {
      console.error(`Erro ao excluir inventário ${name}:`, error);
      return false;
    }
  }

  // --- 6. Atualizar itens escaneados ---
  /**
   * Atualiza apenas o arquivo scanned.json de um inventário.
   * Útil durante o escaneamento, evitando reescrever items.json e metadata.json.
   */
  static async updateScannedItems(name: string, scanned: AssetItem[]): Promise<boolean> {
    try {
      const dir = this.getInventoryDirectory(name);
      if (!dir.exists) return false;

      const file = new File(dir, 'scanned.json');
      file.write(JSON.stringify(scanned));

      return true;
    } catch (error) {
      console.error('Erro ao atualizar itens escaneados', error);
      return false;
    }
  }

  /**
   * Retorna estatísticas rápidas de um inventário sem carregar a lista completa de itens.
   * Apenas lê metadata.json e scanned.json, o que é muito mais eficiente para inventários grandes.
   */
  static async getInventoryStats(name: string): Promise<InventoryStats | null> {
    try {
      const dir = this.getInventoryDirectory(name);
      if (!dir.exists) return null;

      const metadataFile = new File(dir, 'metadata.json');
      const scannedFile = new File(dir, 'scanned.json');

      if (!metadataFile.exists || !scannedFile.exists) return null;

      // Lê apenas os dois arquivos necessários
      const [metadataRaw, scannedRaw] = await Promise.all([
        metadataFile.text(),
        scannedFile.text(),
      ]);

      const metadata = this.safeJSONParse<InventoryMetadata | null>(metadataRaw, null);
      const scanned = this.safeJSONParse<AssetItem[]>(scannedRaw, []);

      if (!metadata) return null;

      const total = metadata.totalItems || 0;
      const scannedCount = scanned.length;

      return {
        totalItems: total,
        scannedItems: scannedCount,
        progress: total > 0 ? Math.round((scannedCount / total) * 100) : 0,
        lastModified: metadata.importDate ?? new Date().toISOString(),
      };
    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      return null;
    }
  }
}
