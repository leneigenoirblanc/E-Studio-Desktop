import { ProductRecord } from '../types';
import { api } from './api';

export interface ImportReport {
  id: string;
  timestamp: string;
  filename: string;
  totalRowsRead: number;
  importedCount: number;
  updatedCount: number;
  rejectedCount: number;
  duplicateCount: number;
  warnings: string[];
}

export interface WorkspaceExportData {
  version: string;
  exportedAt: string;
  catalog: {
    products: ProductRecord[];
    importHistory: ImportReport[];
  };
  templates?: any[];
}

class CatalogRepository {
  private products: ProductRecord[] = [];
  private listeners: Array<(products: ProductRecord[]) => void> = [];
  private importReports: ImportReport[] = [];
  private isLoaded = false;

  constructor() {
    this.init();
  }

  public async init(): Promise<void> {
    try {
      const prods = await api.catalogSearch('');
      this.products = prods || [];
      try {
        const batches = await api.batchImportList();
        if (batches && batches.length > 0) {
          this.importReports = batches.map((b: any) => ({
            id: b.id || `batch_${Date.now()}`,
            timestamp: b.timestamp || b.created_at || new Date().toISOString(),
            filename: b.filename || 'import',
            totalRowsRead: b.totalRowsRead ?? b.total_rows ?? 0,
            importedCount: b.importedCount ?? b.imported_count ?? 0,
            updatedCount: b.updatedCount ?? b.updated_count ?? 0,
            rejectedCount: b.rejectedCount ?? b.rejected_count ?? 0,
            duplicateCount: b.duplicateCount ?? b.duplicate_count ?? 0,
            warnings: b.warnings || [],
          }));
        } else {
          const historyStr = await api.prefsGet('catalog_import_history');
          if (historyStr) {
            this.importReports = JSON.parse(historyStr);
          }
        }
      } catch {
        const historyStr = await api.prefsGet('catalog_import_history');
        if (historyStr) {
          try {
            this.importReports = JSON.parse(historyStr);
          } catch {}
        }
      }
      this.isLoaded = true;
      this.notify();
    } catch (e) {
      console.warn('Failed to load catalog from database', e);
      this.products = [];
      this.isLoaded = true;
      this.notify();
    }
  }

  private notify() {
    const list = [...this.products];
    this.listeners.forEach((l) => {
      try {
        l(list);
      } catch (err) {
        console.error('Error in catalog listener', err);
      }
    });
  }

  public subscribe(listener: (products: ProductRecord[]) => void): () => void {
    this.listeners.push(listener);
    listener([...this.products]);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public getProducts(): ProductRecord[] {
    return [...this.products];
  }

  public getProductById(id: string): ProductRecord | undefined {
    return this.products.find((p) => p.id === id || p.PRODUCT_SCAN === id || p.PARTNO === id);
  }

  public search(query: string, department?: string): ProductRecord[] {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery && !department) {
      return [...this.products];
    }

    const words = cleanQuery.split(/\s+/).filter(Boolean);
    return this.products.filter((prod) => {
      if (department && department !== 'all') {
        const prodDept = (prod.DEPT_NAME || prod.CATEGORY_NAME || '').toLowerCase();
        if (prodDept !== department.toLowerCase()) return false;
      }
      if (words.length === 0) return true;

      const searchable = [
        prod.ITEMNAME,
        prod.PRODUCT_SCAN,
        prod.PARTNO,
        prod.BRAND_INFO,
        prod.VENDOR_NAME,
        prod.DEPT_NAME,
        prod.CATEGORY_NAME,
        prod.STORE_NAME,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return words.every((w) => searchable.includes(w));
    });
  }

  public saveToMasterDatabase(
    incomingProducts: ProductRecord[],
    mode: 'merge_update' | 'replace' | 'keep_existing' | 'update_upsert' | 'overwrite' | 'append' = 'merge_update'
  ): { totalCount: number; updatedCount: number; addedCount: number } {
    let updatedCount = 0;
    let addedCount = 0;

    const isReplace = mode === 'replace' || mode === 'overwrite';
    const isAppendOnly = mode === 'append' || mode === 'keep_existing';

    if (isReplace) {
      this.products = [...incomingProducts];
      addedCount = incomingProducts.length;
      api.catalogReplaceAll(incomingProducts).catch((err) => console.error(err));
    } else {
      const map = new Map<string, ProductRecord>();
      this.products.forEach((p) => {
        const key = p.id || p.PARTNO || p.PRODUCT_SCAN;
        map.set(key, p);
      });

      incomingProducts.forEach((prod) => {
        const key = prod.id || prod.PARTNO || prod.PRODUCT_SCAN;
        const existing = map.get(key);
        if (existing) {
          if (!isAppendOnly) {
            map.set(key, { ...existing, ...prod });
            updatedCount++;
          }
        } else {
          map.set(key, prod);
          addedCount++;
        }
      });
      this.products = Array.from(map.values());
      api.catalogUpsert(incomingProducts).catch((err) => console.error(err));
    }

    this.notify();
    return {
      totalCount: this.products.length,
      updatedCount,
      addedCount,
    };
  }

  public async saveToMasterDatabaseAsync(
    incomingProducts: ProductRecord[],
    mode: 'merge_update' | 'replace' | 'keep_existing' | 'update_upsert' | 'overwrite' | 'append' = 'merge_update'
  ): Promise<{ totalCount: number; updatedCount: number; addedCount: number }> {
    const res = this.saveToMasterDatabase(incomingProducts, mode);
    try {
      if (mode === 'replace' || mode === 'overwrite') {
        await api.catalogReplaceAll(incomingProducts);
      } else {
        await api.catalogUpsert(incomingProducts);
      }
    } catch (err) {
      console.error('Failed to persist to SQLite catalog', err);
      throw err;
    }
    return res;
  }

  public commitImport(
    importedRecords: ProductRecord[],
    report: ImportReport,
    mode: 'merge_update' | 'replace' | 'review_collisions' = 'merge_update',
    skipKeys?: Set<string>
  ) {
    if (mode === 'replace') {
      this.products = [...importedRecords];
      api.catalogReplaceAll(importedRecords).catch((err) => console.error(err));
    } else {
      const map = new Map<string, ProductRecord>();
      this.products.forEach((p) => {
        const key = p.id || p.PARTNO || p.PRODUCT_SCAN;
        map.set(key, p);
      });
      const toUpsert: ProductRecord[] = [];
      importedRecords.forEach((imp) => {
        const key = imp.id || imp.PARTNO || imp.PRODUCT_SCAN;
        if (skipKeys && skipKeys.has(key)) {
          // Preserve existing record, skip updating
          return;
        }
        const existing = map.get(key);
        if (existing) {
          map.set(key, { ...existing, ...imp });
        } else {
          map.set(key, imp);
        }
        toUpsert.push(imp);
      });
      this.products = Array.from(map.values());
      api.catalogUpsert(toUpsert).catch((err) => console.error(err));
    }

    this.importReports.unshift(report);
    api.batchImportRecord(report.id, report.filename, JSON.stringify(report)).catch(() => {});
    api.prefsSet('catalog_import_history', JSON.stringify(this.importReports.slice(0, 50))).catch(() => {});
    this.notify();
  }

  public deleteProduct(id: string) {
    this.products = this.products.filter((p) => p.id !== id);
    api.catalogReplaceAll(this.products).catch((err) => console.error(err));
    this.notify();
  }

  public clearCatalog() {
    this.products = [];
    api.catalogReplaceAll([]).catch((err) => console.error(err));
    this.notify();
  }

  public getImportReports(): ImportReport[] {
    return [...this.importReports];
  }

  public exportWorkspaceJson(): string {
    const data: WorkspaceExportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      catalog: {
        products: this.products,
        importHistory: this.importReports,
      },
    };
    return JSON.stringify(data, null, 2);
  }

  public importWorkspaceJson(jsonStr: string): { success: boolean; message: string; count?: number } {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && parsed.catalog && Array.isArray(parsed.catalog.products)) {
        this.products = parsed.catalog.products;
        if (Array.isArray(parsed.catalog.importHistory)) {
          this.importReports = parsed.catalog.importHistory;
        }
        api.catalogReplaceAll(this.products).catch((err) => console.error(err));
        api.prefsSet('catalog_import_history', JSON.stringify(this.importReports.slice(0, 50))).catch(() => {});
        this.notify();
        return {
          success: true,
          message: `Espace de travail importé avec succès (${this.products.length} articles).`,
          count: this.products.length,
        };
      }
      return { success: false, message: 'Structure de fichier de sauvegarde invalide.' };
    } catch (e: any) {
      return { success: false, message: `Erreur de lecture : ${e.message || 'JSON invalide'}` };
    }
  }
}

export const catalogRepository = new CatalogRepository();
export const databaseService = catalogRepository;
