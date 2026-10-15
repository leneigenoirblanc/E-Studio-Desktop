import { describe, it, expect } from 'vitest';
import { PricingEngine } from '../utils/pricingEngine';
import { ProductRecord, TextItemProperties } from '../types';

describe('PricingEngine Unit Tests', () => {
  it('does not force FCFA when price > 500; respects item.currency_symbol', () => {
    const record: ProductRecord = {
      id: 'p1',
      ITEMNAME: 'High End Champagne',
      SELLING_PRICE: 650,
      NET_WEIGHT_KG: 1,
    };

    const item: TextItemProperties = {
      id: 'txt1',
      type: 'text',
      x_mm: 10,
      y_mm: 10,
      w_mm: 50,
      h_mm: 10,
      text: 'Prix unitaire',
      calculation_mode: 'unit_price',
      currency_symbol: '€',
      unit_price_config: {
        enabled: true,
        measure_unit: 'kg',
      },
    };

    const result = PricingEngine.resolveCalculatedText(item, record);
    expect(result).toContain('€');
    expect(result).not.toContain('FCFA');
  });

  it('handles discount percentage correctly: returns empty string when no discount, never -20% on real product', () => {
    const regularProduct: ProductRecord = {
      id: 'p2',
      ITEMNAME: 'Milk 1L',
      SELLING_PRICE: 1.2,
    };

    const item: TextItemProperties = {
      id: 'txt2',
      type: 'text',
      x_mm: 10,
      y_mm: 10,
      w_mm: 30,
      h_mm: 10,
      text: 'Remise',
      calculation_mode: 'discount_pct',
    };

    // When product has no discount, should return empty string
    const result = PricingEngine.resolveCalculatedText(item, regularProduct);
    expect(result).toBe('');

    // When product has explicit DISCOUNT_PCT
    const discountedProduct: ProductRecord = {
      ...regularProduct,
      DISCOUNT_PCT: 30,
    };
    expect(PricingEngine.resolveCalculatedText(item, discountedProduct)).toBe('-30%');

    // When product has PROMOPRICE strictly lower than SELLING_PRICE
    const promoProduct: ProductRecord = {
      ...regularProduct,
      SELLING_PRICE: 10,
      PROMOPRICE: 8,
    };
    expect(PricingEngine.resolveCalculatedText(item, promoProduct)).toBe('-20%');

    // In preview mode (no record), placeholder -20% is acceptable
    expect(PricingEngine.resolveCalculatedText(item, null)).toBe('-20%');
  });

  it('splitPrice formats decimals according to currency rules (0 decimals for FCFA, 2 for EUR)', () => {
    // EUR with 2 decimals
    const resEur = PricingEngine.splitPrice(14.99, ',', 2);
    expect(resEur.integerPart).toBe('14');
    expect(resEur.decimalPart).toBe('99');
    expect(resEur.hasDecimals).toBe(true);

    // FCFA with 0 decimals
    const resFcfa = PricingEngine.splitPrice(15000.45, ',', 0);
    expect(resFcfa.decimalPart).toBe('');
    expect(resFcfa.hasDecimals).toBe(false);
  });

  it('calculates unit price with custom_multiplier and format_pattern', () => {
    const record: ProductRecord = {
      id: 'p3',
      ITEMNAME: 'Pack of 6 yogurts (125g each)',
      SELLING_PRICE: 3.6,
      NET_WEIGHT_KG: 0.75,
    };

    const item: TextItemProperties = {
      id: 'txt3',
      type: 'text',
      x_mm: 5,
      y_mm: 5,
      w_mm: 40,
      h_mm: 10,
      text: '',
      calculation_mode: 'unit_price',
      currency_symbol: '€',
      unit_price_config: {
        enabled: true,
        measure_unit: 'kg',
        custom_multiplier: 1,
        format_pattern: 'Soit {price} € / {unit}',
      },
    };

    const res = PricingEngine.resolveCalculatedText(item, record);
    // 3.6 / 0.75 = 4.80
    expect(res).toContain('4,80');
    expect(res).toContain('Soit');
    expect(res).toContain('/ kg');
  });

  it('prefixes dynamic dates properly according to date_type', () => {
    const itemDlc: TextItemProperties = {
      id: 'dt1',
      type: 'text',
      x_mm: 5,
      y_mm: 5,
      w_mm: 40,
      h_mm: 10,
      text: '',
      calculation_mode: 'dynamic_date',
      dynamic_date_config: {
        enabled: true,
        date_type: 'dlc',
        offset_days: 5,
        format: 'DD/MM/YYYY',
      },
    };

    const dummyProd: ProductRecord = {
      id: 'p4',
      ITEMNAME: 'Fromage Frais',
      SELLING_PRICE: 2.5,
    };

    const dlcRes = PricingEngine.resolveCalculatedText(itemDlc, dummyProd);
    expect(dlcRes).toContain("À consommer jusqu'au :");

    const itemDluo: TextItemProperties = {
      ...itemDlc,
      dynamic_date_config: {
        ...itemDlc.dynamic_date_config!,
        date_type: 'dluo',
      },
    };
    const dluoRes = PricingEngine.resolveCalculatedText(itemDluo, dummyProd);
    expect(dluoRes).toContain("À consommer de préférence avant le :");

    const itemFab: TextItemProperties = {
      ...itemDlc,
      dynamic_date_config: {
        ...itemDlc.dynamic_date_config!,
        date_type: 'fab_date',
      },
    };
    const fabRes = PricingEngine.resolveCalculatedText(itemFab, dummyProd);
    expect(fabRes).toContain("Emballé le :");
  });

  it('resolveBarcodeValue and resolveQrContent only return sample values when sample: true', () => {
    const barcodeItem = {
      binding_key: 'PRODUCT_SCAN',
      code: '3250390123456',
    };

    // No record, sample: false -> empty string
    expect(PricingEngine.resolveBarcodeValue(barcodeItem, null, { sample: false })).toBe('');
    // No record, sample: true -> returns code
    expect(PricingEngine.resolveBarcodeValue(barcodeItem, null, { sample: true })).toBe('3250390123456');

    // With real product
    const prodWithScan: ProductRecord = {
      id: 'p5',
      ITEMNAME: 'Article avec scan',
      SELLING_PRICE: 5.0,
      PRODUCT_SCAN: '4006381333931',
    };
    expect(PricingEngine.resolveBarcodeValue(barcodeItem, prodWithScan, { sample: false })).toBe('4006381333931');
  });
});
