import { AuditLogEntry } from '../types';
import { api } from './api';

export class AuditLogService {
  private static cachedLogs: AuditLogEntry[] = [];

  public static append(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const fullEntry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      user: entry.user || '',
      ...entry,
    };
    this.cachedLogs.unshift(fullEntry);
    api.auditAppend(entry.action, entry.template_name || entry.product_id, entry.details).catch((err) => {
      console.warn('Failed to append audit in SQLite', err);
    });
    return fullEntry;
  }

  public static async fetchAll(): Promise<AuditLogEntry[]> {
    try {
      const records = await api.auditList(250);
      this.cachedLogs = records.map((r) => ({
        id: r.id,
        timestamp: r.at,
        user: r.os_user,
        action: r.action,
        template_name: r.entity_id || undefined,
        details: r.details,
      }));
      return [...this.cachedLogs];
    } catch {
      return [...this.cachedLogs];
    }
  }

  public static getAll(): AuditLogEntry[] {
    return [...this.cachedLogs];
  }

  public static clear(): void {
    this.cachedLogs = [];
  }
}
