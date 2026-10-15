import { describe, it, expect } from 'vitest';
import { api } from '../services/api';
import { LabelTemplate, ProductRecord } from '../types';

describe('API Services & In-Memory Store Unit Tests', () => {
  it('saves and retrieves templates accurately with revision increment', async () => {
    const tpl: LabelTemplate = {
      id: 'tpl_unit_test',
      name: 'Test Template API',
      revision: 1,
      schema_version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      width_mm: 80,
      height_mm: 40,
      inner_margins_mm: { top: 1, bottom: 1, left: 1, right: 1 },
      outer_margins_mm: { top: 0, bottom: 0, left: 0, right: 0 },
      bg_color: '#ffffff',
      bg_opacity: 1,
      items: [],
    };

    const saved1 = await api.templateSave(tpl);
    expect(saved1.revision).toBe(1);

    const saved2 = await api.templateSave(saved1);
    expect(saved2.revision).toBe(2);

    const fetched = await api.templateGet(tpl.id);
    expect(fetched.name).toBe('Test Template API');
    expect(fetched.revision).toBe(2);
  });

  it('catalogUpsert returns structured UpsertResult with inserted, updated, and rejections', async () => {
    const rows: ProductRecord[] = [
      {
        id: 'p_valid_1',
        ITEMNAME: 'Article Valide 1',
        SELLING_PRICE: 12.5,
      },
      {
        id: '',
        ITEMNAME: 'Article Sans ID',
        SELLING_PRICE: 5.0,
      },
    ];

    const result = await api.catalogUpsert(rows);
    expect(result.inserted).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.rejections.length).toBe(1);
    expect(result.rejections[0].reason).toBe('missing_id');
  });

  it('exports and restores database accurately', async () => {
    const dump = await api.exportDatabase();
    expect(dump).toBeDefined();
    const parsed = JSON.parse(dump);
    expect(parsed.version).toBe(1);
    expect(Array.isArray(parsed.templates)).toBe(true);

    const restoreRes = await api.importDatabase(dump);
    expect(restoreRes).toBeDefined();
    expect(typeof restoreRes.templates).toBe('number');
  });
});
