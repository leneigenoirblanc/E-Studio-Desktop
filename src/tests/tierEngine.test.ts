import { describe, it, expect } from 'vitest';
import { TierEngine } from '../utils/tierEngine';
import { PricingEngine } from '../utils/pricingEngine';
import { ProductRecord, TextItemProperties } from '../types';

describe('TierEngine Unit Tests', () => {
  const spec = {
    primary_index: 0,
    fallback_to_base_price: true,
  };

  it('gives priority to price_tiers over legacy TIERS array', () => {
    const record: ProductRecord = {
      id: 'p_tier',
      ITEMNAME: 'Papier A4',
      SELLING_PRICE: 5.0,
      price_tiers: [
        { min_qty: 5, unit_price: 4.5, label: 'Lot de 5' },
        { min_qty: 10, unit_price: 4.0, label: 'Lot de 10' },
      ],
      TIERS: [
        { qty: 2, unit_price: 4.9, label: 'Legacy Tier' },
      ],
    };

    const resolved = TierEngine.resolve(spec, record);
    expect(resolved).not.toBeNull();
    expect(resolved?.qty).toBe(5);
    expect(resolved?.unit_price).toBe(4.5);
  });

  it('falls back to TIERS when price_tiers is absent or empty', () => {
    const record: ProductRecord = {
      id: 'p_tier_legacy',
      ITEMNAME: 'Papier A4 Legacy',
      SELLING_PRICE: 5.0,
      price_tiers: [],
      TIERS: [
        { qty: 3, unit_price: 4.8, label: 'Pack 3' },
      ],
    };

    const resolved = TierEngine.resolve(spec, record);
    expect(resolved).not.toBeNull();
    expect(resolved?.qty).toBe(3);
    expect(resolved?.unit_price).toBe(4.8);
  });

  it('pricingEngine has_tiers evaluates to true if either price_tiers or TIERS is present', () => {
    const itemWithTiersCond: TextItemProperties = {
      id: 'item1',
      type: 'text',
      x_mm: 0,
      y_mm: 0,
      w_mm: 20,
      h_mm: 10,
      text: 'Tarif dégressif',
      conditional_display: {
        enabled: true,
        rule: 'has_tiers',
      },
    };

    const recPriceTiers: ProductRecord = {
      id: '1',
      ITEMNAME: 'A',
      SELLING_PRICE: 10,
      price_tiers: [{ min_qty: 2, unit_price: 9 }],
    };
    expect(PricingEngine.shouldDisplayItem(itemWithTiersCond, recPriceTiers)).toBe(true);

    const recTiers: ProductRecord = {
      id: '2',
      ITEMNAME: 'B',
      SELLING_PRICE: 10,
      TIERS: [{ qty: 2, unit_price: 9 }],
    };
    expect(PricingEngine.shouldDisplayItem(itemWithTiersCond, recTiers)).toBe(true);

    const recNoTiers: ProductRecord = {
      id: '3',
      ITEMNAME: 'C',
      SELLING_PRICE: 10,
    };
    expect(PricingEngine.shouldDisplayItem(itemWithTiersCond, recNoTiers)).toBe(false);
  });
});
