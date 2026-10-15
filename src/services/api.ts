import { invoke } from '@tauri-apps/api/core';
import {
  LabelTemplate,
  ProductRecord,
  PrintJob,
  TemplateSummary,
  UpsertResult,
  AuditRecord,
} from '../types';

export const isTauriEnvironment = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

// In-memory fallback for browser preview mode (zero localStorage usage)
const inMemoryStore = {
  templates: new Map<string, LabelTemplate>(),
  templateRevisions: new Map<string, LabelTemplate>(),
  products: new Map<string, ProductRecord>(),
  jobs: new Map<string, PrintJob>(),
  audit: [] as AuditRecord[],
  kv: new Map<string, string>(),
  importBatches: [] as any[],
};

let auditIdCounter = 0;

export const api = {
  async templateList(): Promise<TemplateSummary[]> {
    if (isTauriEnvironment()) {
      return await invoke<TemplateSummary[]>('template_list');
    }
    return Array.from(inMemoryStore.templates.values()).map((t) => ({
      id: t.id,
      name: t.name,
      width_mm: t.width_mm,
      height_mm: t.height_mm,
      revision: t.revision,
      updated_at: t.updated_at,
    }));
  },

  async templateGet(id: string): Promise<LabelTemplate> {
    if (isTauriEnvironment()) {
      return await invoke<LabelTemplate>('template_get', { id });
    }
    const t = inMemoryStore.templates.get(id);
    if (!t) throw new Error(`Template not found: ${id}`);
    return t;
  },

  async templateGetRevision(id: string, revision: number): Promise<LabelTemplate> {
    if (isTauriEnvironment()) {
      return await invoke<LabelTemplate>('template_get_revision', { id, revision });
    }
    const revKey = `${id}_v${revision}`;
    const t = inMemoryStore.templateRevisions.get(revKey) || inMemoryStore.templates.get(id);
    if (!t) throw new Error(`Template not found: ${id} (rev ${revision})`);
    return t;
  },

  async templateSave(doc: LabelTemplate): Promise<LabelTemplate> {
    if (isTauriEnvironment()) {
      return await invoke<LabelTemplate>('template_save', { doc });
    }
    const existing = inMemoryStore.templates.get(doc.id);
    const revision = existing ? existing.revision + 1 : 1;
    const now = new Date().toISOString();
    const saved: LabelTemplate = {
      ...doc,
      revision,
      updated_at: now,
      created_at: doc.created_at || now,
    };
    inMemoryStore.templates.set(doc.id, saved);
    inMemoryStore.templateRevisions.set(`${saved.id}_v${saved.revision}`, saved);
    return saved;
  },

  async templateDelete(id: string): Promise<void> {
    if (isTauriEnvironment()) {
      await invoke('template_delete', { id });
      return;
    }
    inMemoryStore.templates.delete(id);
  },

  async catalogSearch(q: string, limit?: number): Promise<ProductRecord[]> {
    if (isTauriEnvironment()) {
      return await invoke<ProductRecord[]>('catalog_search', { q, limit });
    }
    const lower = q.toLowerCase();
    const all = Array.from(inMemoryStore.products.values()).filter((p) => {
      if (!lower) return true;
      const name = (p.ITEMNAME || '').toLowerCase();
      const scan = (p.PRODUCT_SCAN || p.scan || '').toLowerCase();
      const partno = (p.PARTNO || p.partno || '').toLowerCase();
      return name.includes(lower) || scan.includes(lower) || partno.includes(lower);
    });
    return limit ? all.slice(0, limit) : all;
  },

  async catalogUpsert(rows: ProductRecord[]): Promise<UpsertResult> {
    if (isTauriEnvironment()) {
      return await invoke<UpsertResult>('catalog_upsert', { rows });
    }
    let inserted = 0;
    let updated = 0;
    let rejected = 0;
    for (const r of rows) {
      const id = String(r.id || r.PARTNO || r.PRODUCT_SCAN || '').trim();
      if (!id) {
        rejected++;
        continue;
      }
      if (inMemoryStore.products.has(id)) {
        updated++;
      } else {
        inserted++;
      }
      inMemoryStore.products.set(id, { ...r, id });
    }
    return { inserted, updated, rejected };
  },

  async catalogReplaceAll(rows: ProductRecord[]): Promise<number> {
    if (isTauriEnvironment()) {
      return await invoke<number>('catalog_replace_all', { rows });
    }
    inMemoryStore.products.clear();
    let count = 0;
    for (const r of rows) {
      const id = String(r.id || r.PARTNO || r.PRODUCT_SCAN || '').trim();
      if (!id) continue;
      inMemoryStore.products.set(id, { ...r, id });
      count++;
    }
    return count;
  },

  async jobInsert(job: PrintJob): Promise<void> {
    if (isTauriEnvironment()) {
      await invoke('job_insert', { job });
      return;
    }
    inMemoryStore.jobs.set(job.id, job);
  },

  async jobList(): Promise<PrintJob[]> {
    if (isTauriEnvironment()) {
      return await invoke<PrintJob[]>('job_list');
    }
    return Array.from(inMemoryStore.jobs.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  },

  async jobSetStatus(id: string, status: string, error?: string | null): Promise<void> {
    if (isTauriEnvironment()) {
      await invoke('job_set_status', { id, status, error: error ?? null });
      return;
    }
    const job = inMemoryStore.jobs.get(id);
    if (job) {
      job.status = status as any;
      job.error = error ?? null;
    }
  },

  async auditAppend(action: string, entityId: string | undefined, details: string): Promise<void> {
    if (isTauriEnvironment()) {
      await invoke('audit_append', {
        action,
        entityId: entityId ?? null,
        entity_id: entityId ?? null,
        details,
      });
      return;
    }
    auditIdCounter++;
    inMemoryStore.audit.unshift({
      id: `aud_${Date.now()}_${auditIdCounter}`,
      at: new Date().toISOString(),
      os_user: 'system',
      action,
      entity_id: entityId ?? null,
      details,
    });
  },

  async auditList(limit?: number): Promise<AuditRecord[]> {
    if (isTauriEnvironment()) {
      return await invoke<AuditRecord[]>('audit_list', { limit });
    }
    return inMemoryStore.audit.slice(0, limit || 200);
  },

  async prefsGet(key: string): Promise<string | null> {
    if (isTauriEnvironment()) {
      return await invoke<string | null>('prefs_get', { key });
    }
    return inMemoryStore.kv.get(key) ?? null;
  },

  async prefsSet(key: string, value: string): Promise<void> {
    if (isTauriEnvironment()) {
      await invoke('prefs_set', { key, value });
      return;
    }
    inMemoryStore.kv.set(key, value);
  },

  async batchImportRecord(id: string, filename: string, reportJson: string): Promise<void> {
    if (isTauriEnvironment()) {
      await invoke('batch_import_record', {
        id,
        filename,
        reportJson,
        report_json: reportJson,
      });
      return;
    }
    try {
      const parsed = JSON.parse(reportJson);
      inMemoryStore.importBatches.unshift({
        id,
        filename,
        report_json: reportJson,
        created_at: new Date().toISOString(),
        ...parsed,
      });
    } catch {
      inMemoryStore.importBatches.unshift({
        id,
        filename,
        report_json: reportJson,
        created_at: new Date().toISOString(),
      });
    }
  },

  async batchImportList(): Promise<any[]> {
    if (isTauriEnvironment()) {
      return await invoke<any[]>('batch_import_list');
    }
    return [...inMemoryStore.importBatches];
  },
};
