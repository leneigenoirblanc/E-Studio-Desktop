import { ProductRecord, TextItemProperties, TemplateItem } from '../types';
import { resolveCanonicalKey } from './mappingDictionary';

export type PriceParseStatus = 'valid' | 'missing' | 'invalid';

export interface PriceParseResult {
  status: PriceParseStatus;
  amount?: number;
  raw?: any;
  reason?: string;
}

/**
 * Advanced Retail & Pricing Engine for E-Studio
 * Handles automatic unit price per kg/L, discount percentage, 
 * secondary currency conversion, dynamic dates (DLC/DLUO), and conditional display rules.
 */
export class PricingEngine {
  /**
   * Helper: Resolves field value from ProductRecord, taking into account exact keys, 
   * canonical domain aliases, and case/spacing normalization.
   */
  static getProductFieldValue(record: ProductRecord | null | undefined, bindingKey: string): any {
    if (!record || !bindingKey) return undefined;

    // Check custom name override (Virtual assortment substitution)
    if (
      (bindingKey === 'ITEMNAME' || bindingKey === 'DESIGNATION' || bindingKey === 'PRODUCT_NAME') &&
      record.custom_name_override &&
      record.custom_name_override.trim() !== ''
    ) {
      return record.custom_name_override;
    }

    // 1. Special handling for Promo Price (must be evaluated before direct match so PROMOPRICE=0 doesn't bypass promo logic)
    if (bindingKey === 'PROMOPRICE') {
      return PricingEngine.getPromoPrice(record);
    }

    // 2. Special handling for Selling Price
    if (bindingKey === 'SELLING_PRICE') {
      return PricingEngine.getSellingPrice(record);
    }

    // 3. Direct property match
    if (record[bindingKey] !== undefined && record[bindingKey] !== null && record[bindingKey] !== '') {
      return record[bindingKey];
    }

    // 4. Normalized key search (e.g. "PRIX_PROMO", "PRIX PROMO", "prix_promo")
    const normTarget = bindingKey.trim().toUpperCase().replace(/[\s\.\-]+/g, '_');
    for (const k of Object.keys(record)) {
      const kNorm = k.trim().toUpperCase().replace(/[\s\.\-]+/g, '_');
      if (kNorm === normTarget && record[k] !== undefined && record[k] !== null && record[k] !== '') {
        return record[k];
      }
    }

    // 5. Check if canonical resolution matches
    for (const k of Object.keys(record)) {
      const canonical = resolveCanonicalKey(k);
      if (canonical === bindingKey && record[k] !== undefined && record[k] !== null && record[k] !== '') {
        return record[k];
      }
    }

    return undefined;
  }


  /**
   * Evaluates and parses a raw price into a structured result distinguishing:
   * - 'valid': genuine parsed number (including explicit 0 if legitimate)
   * - 'missing': undefined, null, or empty string
   * - 'invalid': non-numeric string, corrupted text or NaN
   */
  static parsePrice(val: any): PriceParseResult {
    if (val === undefined || val === null) {
      return { status: 'missing', raw: val };
    }
    if (typeof val === 'number') {
      if (isNaN(val)) return { status: 'invalid', raw: val, reason: 'Valeur NaN' };
      return { status: 'valid', amount: val, raw: val };
    }
    const s = String(val).trim();
    if (s === '') {
      return { status: 'missing', raw: val };
    }

    // Strip currency symbols and letters (Unicode aware)
    const cleaned = s.replace(/[€$£¥\p{L}]/gu, '').replace(/\s+/g, '');
    if (!cleaned) {
      return { status: 'invalid', raw: val, reason: `Contenu non numérique ("${s}")` };
    }

    let numStr = cleaned;
    const hasComma = numStr.includes(',');
    const hasDot = numStr.includes('.');
    if (hasComma && hasDot) {
      if (numStr.lastIndexOf(',') < numStr.lastIndexOf('.')) {
        numStr = numStr.replace(/,/g, '');
      } else {
        numStr = numStr.replace(/\./g, '').replace(',', '.');
      }
    } else if (hasComma) {
      numStr = numStr.replace(',', '.');
    }

    const num = parseFloat(numStr);
    if (isNaN(num)) {
      return { status: 'invalid', raw: val, reason: `Impossible de convertir "${s}" en nombre` };
    }
    return { status: 'valid', amount: num, raw: val };
  }

  /**
   * Robust parser for raw prices in French/European or English notation:
   * "12,50 €", "12.50€", "12 500 FCFA", "1,250.50", "1.250,50", "29.99"
   */
  static parsePriceNumber(val: any): number {
    const res = PricingEngine.parsePrice(val);
    return res.status === 'valid' ? (res.amount ?? 0) : 0;
  }

  /**
   * Helper: Resolves promo price from record with fallback matching
   */
  static resolvePromoPrice(record: ProductRecord | null | undefined): PriceParseResult {
    if (!record) return { status: 'missing' };

    if (record.PROMOPRICE !== undefined && record.PROMOPRICE !== null && (record.PROMOPRICE as any) !== '') {
      const res = PricingEngine.parsePrice(record.PROMOPRICE);
      if (res.status === 'valid') {
        if ((res.amount ?? 0) > 0) return res;
        // PROMOPRICE = 0 means no active promotional discount
        return { status: 'missing', raw: 0 };
      }
      return res;
    }

    // Search record keys for canonical PROMOPRICE
    for (const k of Object.keys(record)) {
      const canonical = resolveCanonicalKey(k);
      if (canonical === 'PROMOPRICE') {
        const val = record[k];
        if (val !== undefined && val !== null && val !== '') {
          const res = PricingEngine.parsePrice(val);
          if (res.status === 'valid') {
            if ((res.amount ?? 0) > 0) return res;
            return { status: 'missing', raw: val };
          }
          return res;
        }
      }
    }

    return { status: 'missing' };
  }

  static getPromoPrice(record: ProductRecord | null | undefined): number | undefined {
    const res = PricingEngine.resolvePromoPrice(record);
    return res.status === 'valid' ? res.amount : undefined;
  }

  /**
   * Helper: Resolves standard selling price from record with fallback matching
   */
  static resolveSellingPrice(record: ProductRecord | null | undefined): PriceParseResult {
    if (!record) return { status: 'missing' };

    if (record.SELLING_PRICE !== undefined && record.SELLING_PRICE !== null && (record.SELLING_PRICE as any) !== '') {
      return PricingEngine.parsePrice(record.SELLING_PRICE);
    }

    for (const k of Object.keys(record)) {
      const canonical = resolveCanonicalKey(k);
      if (canonical === 'SELLING_PRICE') {
        const val = record[k];
        if (val !== undefined && val !== null && val !== '') {
          return PricingEngine.parsePrice(val);
        }
      }
    }

    return { status: 'missing' };
  }

  static getSellingPrice(record: ProductRecord | null | undefined): number {
    const res = PricingEngine.resolveSellingPrice(record);
    return res.status === 'valid' ? (res.amount ?? 0) : 0;
  }

  /**
   * Evaluates whether an item should be rendered based on its conditional display configuration
   */
  static shouldDisplayItem(item: TemplateItem, record?: ProductRecord | null): boolean {
    if (!item.conditional_display || !item.conditional_display.enabled) {
      return true;
    }

    if (!record) return true;

    const { rule, field_key, compare_value } = item.conditional_display;

    switch (rule) {
      case 'has_promo': {
        const promo = PricingEngine.getPromoPrice(record);
        const base = PricingEngine.getSellingPrice(record);
        const priceValid = promo !== undefined && promo > 0 && (base === 0 || promo < base);
        if (!priceValid) return false;

        const parseDate = (dStr: any): Date | null => {
          if (!dStr) return null;
          const s = String(dStr).trim();
          if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            const parts = s.split('-');
            return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          }
          if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
            const parts = s.split('/');
            return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
          }
          return null;
        };

        const startDateStr = PricingEngine.getProductFieldValue(record, 'PROMO_START_DATE');
        const endDateStr = PricingEngine.getProductFieldValue(record, 'PROMO_END_DATE');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const startDate = parseDate(startDateStr);
        const endDate = parseDate(endDateStr);

        if (startDate && today < startDate) return false;
        if (endDate && today > endDate) return false;

        return true;
      }

      case 'has_barcode': {
        const scan = PricingEngine.resolveBarcodeValue(item, record, { sample: false });
        return Boolean(scan && String(scan).trim().length > 0);
      }

      case 'has_tiers':
        return Boolean(
          (record.price_tiers && record.price_tiers.length > 0) ||
          (record.TIERS && record.TIERS.length > 0)
        );

      case 'field_gt_zero': {
        const key = field_key || item.binding_key;
        if (!key) return true;
        const val = PricingEngine.getProductFieldValue(record, key);
        const num = typeof val === 'number' ? val : parseFloat(String(val || 0));
        const threshold =
          compare_value !== undefined && compare_value !== ''
            ? typeof compare_value === 'number'
              ? compare_value
              : parseFloat(String(compare_value)) || 0
            : 0;
        return !isNaN(num) && num > threshold;
      }

      case 'field_not_empty': {
        const key = field_key || item.binding_key;
        if (!key) return true;
        const val = PricingEngine.getProductFieldValue(record, key);
        if (compare_value !== undefined && compare_value !== '') {
          return String(val ?? '').trim() === String(compare_value).trim();
        }
        return val !== undefined && val !== null && String(val).trim() !== '';
      }

      case 'always':
      default:
        return true;
    }
  }

  /**
   * Dynamically resolves the barcode data from the ProductRecord with intelligent
   * alias matching, case-insensitivity, and fallback cascade (binding_key -> PRODUCT_SCAN -> PARTNO/SKU -> id).
   */
  static resolveBarcodeValue(
    item: { binding_key?: string; code?: string; barcode_type?: string } | TemplateItem,
    record?: ProductRecord | null,
    options?: { sample?: boolean }
  ): string {
    if (record) {
      // 1. Explicit binding key defined on element
      if (item.binding_key) {
        const val = PricingEngine.getProductFieldValue(record, item.binding_key);
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
      }

      // 2. Automatic canonical barcode domain resolution (EAN / GTIN / PRODUCT_SCAN)
      const scan = PricingEngine.getProductFieldValue(record, 'PRODUCT_SCAN');
      if (scan !== undefined && scan !== null && String(scan).trim() !== '') {
        return String(scan).trim();
      }

      // 3. Fallback to SKU / Reference / PARTNO - strictly restricted to Code 128 (alphanumeric symbology).
      // EAN-13 strictly requires 12 or 13 digits and MUST NOT fall back to arbitrary alphanumeric SKU/id strings.
      const barcodeType = (item as any).barcode_type || 'ean13';
      if (barcodeType === 'code128') {
        const partNo = PricingEngine.getProductFieldValue(record, 'PARTNO');
        if (partNo !== undefined && partNo !== null && String(partNo).trim() !== '') {
          return String(partNo).trim();
        }
        if (record.id) {
          return String(record.id).trim();
        }
      }
    }

    if (options?.sample) {
      return (item as any).code || '';
    }

    return '';
  }

  /**
   * Dynamically resolves QR Code payload/URL from the ProductRecord,
   * supporting template tags (e.g. {{PARTNO}}), explicit binding keys, or static configured URL.
   */
  static resolveQrContent(
    item: { binding_key?: string; content?: string } | TemplateItem,
    record?: ProductRecord | null,
    options?: { sample?: boolean }
  ): string {
    if (record) {
      // 1. Explicit binding key
      if (item.binding_key) {
        const val = PricingEngine.getProductFieldValue(record, item.binding_key);
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
      }

      // 2. Interpolate template variables in content (e.g. "https://store.com/item/{{PARTNO}}")
      const rawContent = (item as any).content;
      if (rawContent && typeof rawContent === 'string' && rawContent.includes('{{')) {
        return rawContent.replace(/\{\{([^}]+)\}\}/g, (_: string, key: string) => {
          const val = PricingEngine.getProductFieldValue(record, key.trim());
          return val !== undefined && val !== null ? String(val) : '';
        });
      }

      // 3. Keep configured URL / content without mutating URLs into barcodes
      if (rawContent && typeof rawContent === 'string' && rawContent.trim() !== '') {
        return rawContent.trim();
      }
    }

    if (options?.sample) {
      return (item as any).content || 'https://example.com';
    }

    return (item as any).content || '';
  }

  /**
   * Injects non-breaking spaces (\u00A0) between numbers and units or currencies
   * to guarantee professional typography and prevent line-wrapping detachment.
   */
  static injectNonBreakingSpaces(input: string): string {
    if (!input) return input;
    return input
      .replace(/(\d[\d\s.,]*)\s+([€$£¥]|FCFA|CFA|F|USD|EUR)\b/gi, '$1\u00A0$2')
      .replace(/(\d[\d.,]*)\s+(%|‰)/g, '$1\u00A0$2')
      .replace(/(\d[\d.,]*)\s+(kg|g|mg|L|l|cl|ml|pièce|pièces|pcs|carton|cartons|ctn|cm|mm|m)\b/gi, '$1\u00A0$2');
  }

  /**
   * Splits a raw price into integer part and decimal part for smart floating decimal styling
   */
  static splitPrice(
    val: number | string | undefined | null,
    separator: string = ',',
    decimals?: number
  ): { integerPart: string; decimalPart: string; hasDecimals: boolean } {
    const numDecimals = decimals !== undefined ? decimals : 2;
    if (val === undefined || val === null || val === '') {
      return {
        integerPart: '0',
        decimalPart: numDecimals > 0 ? ''.padStart(numDecimals, '0') : '',
        hasDecimals: false,
      };
    }

    const numVal = PricingEngine.parsePriceNumber(val);

    if (numDecimals === 0) {
      const rounded = Math.round(numVal);
      return {
        integerPart: rounded.toLocaleString('fr-FR'),
        decimalPart: '',
        hasDecimals: false,
      };
    }

    const formatted = numVal.toFixed(numDecimals);
    const [intPart, decPart] = formatted.split('.');

    const integerGrouped = parseInt(intPart, 10).toLocaleString('fr-FR');
    const hasDecimals = decPart !== undefined && decPart !== ''.padStart(numDecimals, '0');

    return {
      integerPart: integerGrouped,
      decimalPart: decPart || ''.padStart(numDecimals, '0'),
      hasDecimals,
    };
  }

  /**
   * Resolves dynamic calculated text values for text items (Unit price / Discount % / Secondary currency / Dynamic dates)
   */
  static resolveCalculatedText(item: TextItemProperties, record?: ProductRecord | null): string {
    const rawResult = PricingEngine._computeCalculatedText(item, record);
    return PricingEngine.injectNonBreakingSpaces(rawResult);
  }

  private static _computeCalculatedText(item: TextItemProperties, record?: ProductRecord | null): string {
    // If no record is provided, return preview placeholders
    if (!record) {
      if (item.calculation_mode === 'unit_price') return '7,80 € / kg';
      if (item.calculation_mode === 'discount_pct') return '-20%';
      if (item.calculation_mode === 'secondary_currency') return '(~ 3,73 €)';
      if (item.calculation_mode === 'dynamic_date') return `DLC : ${PricingEngine.formatDateOffset(3, 'DD/MM/YYYY')}`;
      return item.text;
    }

    const promoPrice = PricingEngine.getPromoPrice(record);
    const sellingPrice = PricingEngine.getSellingPrice(record);

    // 1. Unit Price Calculation (Prix au kilo / litre / pièce)
    if (item.calculation_mode === 'unit_price' && item.unit_price_config?.enabled) {
      const cfg = item.unit_price_config;
      const basePrice = (promoPrice && promoPrice > 0) ? promoPrice : sellingPrice;
      
      // Determine quantity / weight from explicit record fields or fallback heuristics
      let quantity = 1.0;
      if (cfg.weight_volume_key) {
        const raw = PricingEngine.getProductFieldValue(record, cfg.weight_volume_key);
        if (raw !== undefined) {
          quantity = typeof raw === 'number' ? raw : parseFloat(String(raw)) || 1.0;
        }
      } else if (record.NET_WEIGHT_KG) {
        quantity = record.NET_WEIGHT_KG;
      } else if (record.VOLUME_L) {
        quantity = record.VOLUME_L;
      } else if (record.CASE_SIZE) {
        quantity = record.CASE_SIZE;
      } else {
        // Try parsing numbers from pack unit or item name (e.g. "250g" -> 0.25kg, "1L" -> 1.0)
        quantity = PricingEngine.extractQuantityFromText(record.PACK_UNIT || record.ITEMNAME, cfg.measure_unit);
      }

      if (quantity <= 0) quantity = 1.0;
      const rawQty = quantity;
      const qty = rawQty * (cfg.custom_multiplier && cfg.custom_multiplier > 0 ? cfg.custom_multiplier : 1);

      const unitPrice = basePrice / (qty > 0 ? qty : 1.0);
      const formattedUnitPrice = unitPrice >= 100 
        ? Math.round(unitPrice).toLocaleString('fr-FR')
        : unitPrice.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      const currency = item.currency_symbol ?? '';
      const body = `${formattedUnitPrice} ${currency} / ${cfg.measure_unit}`;
      return cfg.format_pattern
        ? cfg.format_pattern.replace('{price}', formattedUnitPrice).replace('{unit}', cfg.measure_unit)
        : body;
    }

    // 2. Discount Percentage (-25%)
    if (item.calculation_mode === 'discount_pct' || item.promo_badge_type === 'discount_pct') {
      if (record.DISCOUNT_PCT !== undefined && record.DISCOUNT_PCT > 0) {
        return `-${Math.round(record.DISCOUNT_PCT)}%`;
      }
      if (promoPrice && promoPrice > 0 && sellingPrice > promoPrice) {
        const pct = Math.round(((sellingPrice - promoPrice) / sellingPrice) * 100);
        return `-${pct}%`;
      }
      return '';
    }

    // 3. Secondary Currency Conversion (e.g. FCFA -> EUR)
    if (item.calculation_mode === 'secondary_currency' && item.secondary_currency_config?.enabled) {
      const cfg = item.secondary_currency_config;
      const basePrice = (promoPrice && promoPrice > 0) ? promoPrice : sellingPrice;
      const rate = cfg.exchange_rate > 0 ? cfg.exchange_rate : 655.957;

      const converted = cfg.mode === 'multiply' ? basePrice * rate : basePrice / rate;
      const formattedConverted = converted >= 100
        ? Math.round(converted).toLocaleString('fr-FR')
        : converted.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      return `(~ ${formattedConverted} ${cfg.target_currency})`;
    }

    // 4. Dynamic Date (DLC / DLUO / Fabrication)
    if (item.calculation_mode === 'dynamic_date' && item.dynamic_date_config?.enabled) {
      const cfg = item.dynamic_date_config;
      // date_type: 'today' | 'dlc' | 'dluo' | 'fab_date'
      const formattedDate = PricingEngine.formatDateOffset(cfg.offset_days || 0, cfg.format || 'DD/MM/YYYY');
      let prefix = cfg.prefix_label ? `${cfg.prefix_label} ` : '';
      if (!prefix) {
        if (cfg.date_type === 'dlc') prefix = "À consommer jusqu'au : ";
        else if (cfg.date_type === 'dluo') prefix = "À consommer de préférence avant le : ";
        else if (cfg.date_type === 'fab_date') prefix = "Emballé le : ";
        else prefix = '';
      }
      return `${prefix}${formattedDate}`;
    }

    // Fallback: standard binding key or static text
    if (item.binding_key) {
      const val = PricingEngine.getProductFieldValue(record, item.binding_key);
      if (val !== undefined && val !== null && val !== '') {
        if (typeof val === 'number') {
          return val.toLocaleString('fr-FR');
        }
        return String(val);
      }
    }

    return item.text;
  }

  /**
   * Helper: formats a date offset from today (e.g. +3 days)
   */
  static formatDateOffset(offsetDays: number, format: string): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const shortYear = String(year).slice(-2);

    switch (format) {
      case 'DD.MM.YY':
        return `${day}.${month}.${shortYear}`;
      case 'DD/MM':
        return `${day}/${month}`;
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      case 'DD/MM/YYYY':
      default:
        return `${day}/${month}/${year}`;
    }
  }

  /**
   * Helper: heuristic parser for weight/volume (e.g. "250g" -> 0.25 kg, "500ml" -> 0.5 L)
   */
  static extractQuantityFromText(text: string, targetUnit: string): number {
    if (!text) return 1.0;
    const clean = text.toLowerCase();

    // Check grams (e.g. "250g", "250 g")
    const matchG = clean.match(/(\d+(?:[.,]\d+)?)\s*g\b/);
    if (matchG && targetUnit === 'kg') {
      const g = parseFloat(matchG[1].replace(',', '.'));
      return g / 1000;
    }

    // Check kg
    const matchKg = clean.match(/(\d+(?:[.,]\d+)?)\s*kg\b/);
    if (matchKg && targetUnit === 'kg') {
      return parseFloat(matchKg[1].replace(',', '.'));
    }

    // Check ml / cl / L
    const matchMl = clean.match(/(\d+(?:[.,]\d+)?)\s*ml\b/);
    if (matchMl && targetUnit === 'L') {
      return parseFloat(matchMl[1].replace(',', '.')) / 1000;
    }

    const matchCl = clean.match(/(\d+(?:[.,]\d+)?)\s*cl\b/);
    if (matchCl && targetUnit === 'L') {
      return parseFloat(matchCl[1].replace(',', '.')) / 100;
    }

    const matchL = clean.match(/(\d+(?:[.,]\d+)?)\s*l\b/);
    if (matchL && targetUnit === 'L') {
      return parseFloat(matchL[1].replace(',', '.'));
    }

    return 1.0;
  }

  /**
   * Checks whether an element is price-related.
   * Only price_block, tier_price, and text elements bound to price keys are price-related.
   */
  static isPriceRelated(item: TemplateItem | undefined | null): boolean {
    return isPriceRelatedElement(item);
  }

  /**
   * Completely strips price and currency attributes from non-price elements.
   */
  static sanitizeNonPriceElement<T extends TemplateItem>(item: T): T {
    return sanitizeNonPriceElement(item);
  }
}

/**
 * Checks whether an element is price-related.
 * An element is price-related IF AND ONLY IF:
 * - Its type is 'price_block' or 'tier_price'
 * - Or its type is 'text' AND its binding_key is explicitly tied to a price/currency field
 */
export function isPriceRelatedElement(item: TemplateItem | undefined | null): boolean {
  if (!item) return false;
  if (item.type === 'price_block' || item.type === 'tier_price') return true;
  const anyItem = item as any;
  if (anyItem.is_price === true || anyItem.role === 'price') return true;
  if (anyItem.unit_price_config || anyItem.secondary_currency_config) return true;
  if (anyItem.calculation_mode === 'unit_price' || anyItem.calculation_mode === 'secondary_currency') return true;
  if (item.type === 'text') {
    if (!item.binding_key) return false;
    const bk = item.binding_key.trim().toUpperCase().replace(/[\s\.\-]+/g, '_');
    return (
      bk === 'SELLING_PRICE' ||
      bk === 'PROMOPRICE' ||
      bk === 'PROMO_PRICE' ||
      bk === 'LAST_SELLING_PRICE' ||
      bk === 'DISCPRICE' ||
      bk === 'UNIT_PRICE_BASE' ||
      bk === 'UNIT_PRICE_MEASURE' ||
      bk === 'UNIT_PRICE_TEXT' ||
      bk === 'ECO_TAX' ||
      bk === 'PRIX' ||
      bk === 'PRIX_VENTE' ||
      bk === 'PRIX_PROMO' ||
      bk === 'PRIX_STD' ||
      bk.includes('PRICE') ||
      bk.includes('PRIX') ||
      bk.includes('TARIF')
    );
  }
  return false;
}

/**
 * Completely strips all price and currency attributes from an element if it is not price-related.
 */
export function sanitizeNonPriceElement<T extends TemplateItem>(item: T): T {
  if (!item || isPriceRelatedElement(item)) {
    return item;
  }
  const clean: any = { ...item };
  delete clean.is_price;
  delete clean.currency_symbol;
  delete clean.currency_position;
  delete clean.currency_font_family;
  delete clean.currency_font_size_pt;
  delete clean.currency_font_weight;
  delete clean.currency_font_style;
  delete clean.currency_color;
  delete clean.currency_spacing_pt;
  delete clean.currency_scale;
  delete clean.currency_offset_y;
  delete clean.currency_style;
  delete clean.integer_style;
  delete clean.decimal_style;
  delete clean.cents_fraction_scale;
  delete clean.cents_offset_y;
  delete clean.cents_style;
  delete clean.decimal_separator;
  delete clean.thousand_separator;
  delete clean.unit_price_config;
  delete clean.secondary_currency_config;
  if (clean.calculation_mode === 'unit_price' || clean.calculation_mode === 'secondary_currency') {
    delete clean.calculation_mode;
  }
  return clean as T;
}
