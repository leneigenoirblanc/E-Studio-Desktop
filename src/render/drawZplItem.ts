import { TemplateItem, ProductRecord, TextItemProperties, PriceBlockItemProperties, TierPriceItemProperties } from '../types';
import { PricingEngine } from '../utils/pricingEngine';
import { TierEngine } from '../utils/tierEngine';

export function mmToDots(mm: number, dpi: 203 | 300 | 600): number {
  const dotsPerMm = dpi === 203 ? 8 : dpi === 300 ? 11.811 : 23.622;
  return Math.round(mm * dotsPerMm);
}

export function escapeZplText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\^/g, '_5e')
    .replace(/~/g, '_7e')
    .replace(/[\r\n]+/g, ' ');
}

/**
 * Generates ZPL II commands for a single label item.
 */
export function drawZplItem(
  item: TemplateItem,
  dpi: 203 | 300 | 600,
  record?: ProductRecord | null
): string[] {
  // Restricted areas are not physical print commands
  if (item.type === 'restricted_area') {
    return [];
  }

  // Conditional display check
  if (item.conditional_display && !PricingEngine.shouldDisplayItem(item, record)) {
    return [];
  }

  const lines: string[] = [];
  const x = mmToDots(item.x_mm, dpi);
  const y = mmToDots(item.y_mm, dpi);
  const w = mmToDots(item.w_mm, dpi);
  const h = mmToDots(item.h_mm, dpi);

  switch (item.type) {
    case 'text': {
      const textItem = item as TextItemProperties;
      const text = PricingEngine.resolveCalculatedText(textItem, record);
      if (!text) return [];

      let finalText = text;
      if (textItem.is_price && textItem.currency_symbol) {
        const pos = textItem.currency_position || 'after';
        if (pos === 'after') finalText = `${text} ${textItem.currency_symbol}`;
        else if (pos === 'before') finalText = `${textItem.currency_symbol} ${text}`;
      }

      const fontSizePt = Math.max(5, textItem.font_size_pt || 10);
      const fontHeightDots = Math.max(12, Math.round(fontSizePt * (dpi / 72) * 0.85));
      const fontWidthDots = Math.round(fontHeightDots * 0.65);
      const escaped = escapeZplText(finalText);

      lines.push(`^FO${x},${y}^A0N,${fontHeightDots},${fontWidthDots}^FH^FD${escaped}^FS`);
      return lines;
    }

    case 'price_block': {
      const priceItem = item as PriceBlockItemProperties;
      let rawPrice: any = undefined;
      if (record) {
        if (priceItem.binding_key) {
          rawPrice = PricingEngine.getProductFieldValue(record, priceItem.binding_key);
        } else {
          rawPrice = PricingEngine.getSellingPrice(record);
        }
      } else {
        rawPrice = typeof priceItem.fallback_price === 'number' ? priceItem.fallback_price : 29.99;
      }

      if (rawPrice === undefined || rawPrice === null || rawPrice === '') {
        return [];
      }

      const currencySym = priceItem.currency_symbol || '€';
      const decimals = /FCFA|CFA|GNF|XOF|XAF/i.test(currencySym) ? 0 : 2;
      const separator = priceItem.decimal_separator ?? ',';
      const { integerPart, decimalPart, hasDecimals } = PricingEngine.splitPrice(rawPrice, separator, decimals);

      let priceStr = integerPart;
      if (hasDecimals && decimalPart) {
        priceStr += `${separator}${decimalPart}`;
      }
      if (currencySym) {
        const currPos = priceItem.currency_position || 'after';
        if (currPos === 'before') {
          priceStr = `${currencySym} ${priceStr}`;
        } else {
          priceStr = `${priceStr} ${currencySym}`;
        }
      }

      const intFontSizePt = priceItem.integer_style?.font_size_pt || 24;
      const fontHeightDots = Math.max(16, Math.round(intFontSizePt * (dpi / 72) * 0.85));
      const fontWidthDots = Math.round(fontHeightDots * 0.65);
      const escaped = escapeZplText(priceStr);

      lines.push(`^FO${x},${y}^A0N,${fontHeightDots},${fontWidthDots}^FH^FD${escaped}^FS`);
      return lines;
    }

    case 'tier_price': {
      const tierItem = item as TierPriceItemProperties;
      let tierSummary = 'Tarifs Dégressifs';
      if (record) {
        const resolved = TierEngine.resolve(
          {
            primary_index: tierItem.primary_tier ? tierItem.primary_tier - 1 : 0,
            keyword_prefix: tierItem.prefix_text,
            unit_label: tierItem.unit_label,
            strict_required: tierItem.strict_required,
            pricing_strategy: tierItem.pricing_strategy,
            cross_conditional: tierItem.cross_conditional,
          },
          record
        );
        if (resolved) {
          tierSummary = `${resolved.text_qty} : ${resolved.formatted_price}`;
        }
      }

      const fontSizePt = Math.max(5, tierItem.font_size_pt || 10);
      const fontHeightDots = Math.max(12, Math.round(fontSizePt * (dpi / 72) * 0.85));
      const fontWidthDots = Math.round(fontHeightDots * 0.65);
      const escaped = escapeZplText(tierSummary);

      lines.push(`^FO${x},${y}^A0N,${fontHeightDots},${fontWidthDots}^FH^FD${escaped}^FS`);
      return lines;
    }

    case 'barcode': {
      const barcodeType = (item as any).barcode_type || 'ean13';
      const rawBarcode = PricingEngine.resolveBarcodeValue(item, record, { sample: false });
      if (!rawBarcode || rawBarcode.trim() === '') return [];

      const cleanCode = rawBarcode.replace(/\D/g, '');
      const showText = Boolean((item as any).show_text);
      const barcodeH = Math.max(20, h - (showText ? 20 : 0));

      if (barcodeType === 'ean13') {
        // Preflight already guarantees valid 12 or 13 digit EAN-13 code
        lines.push(`^FO${x},${y}^BEN,${barcodeH},${showText ? 'Y' : 'N'},N^FD${cleanCode}^FS`);
      } else {
        const escapedCode = escapeZplText(rawBarcode);
        lines.push(`^FO${x},${y}^BY2,3,${barcodeH}^BCN,${barcodeH},${showText ? 'Y' : 'N'},N,N^FH^FD>:${escapedCode}^FS`);
      }
      return lines;
    }

    case 'qrcode': {
      const qrContent = PricingEngine.resolveQrContent(item, record, { sample: false });
      if (!qrContent) return [];
      const mag = Math.max(2, Math.min(10, Math.round(w / 35)));
      const escapedQr = escapeZplText(qrContent);
      lines.push(`^FO${x},${y}^BQN,2,${mag}^FH^FDLA,${escapedQr}^FS`);
      return lines;
    }

    case 'shape': {
      const shape = item as any;
      const borderThick = Math.max(1, mmToDots(shape.border_width || 1, dpi));
      const radiusDots = Math.round(mmToDots(shape.corner_radius || 0, dpi) / 2);
      const isFilled = shape.fill_color && shape.fill_color !== '#FFFFFF' && shape.fill_color !== 'transparent';
      lines.push(`^FO${x},${y}^GB${w},${h},${isFilled ? h : borderThick},B,${Math.min(8, radiusDots)}^FS`);
      return lines;
    }

    case 'line': {
      const rawLine = item as any;
      const thick = Math.max(1, mmToDots(rawLine.thickness || 1, dpi));
      lines.push(`^FO${x},${y}^GB${w},${thick},${thick},B,0^FS`);
      return lines;
    }

    default:
      throw new Error(`[drawZplItem] Élément non représentable sur cible thermique ZPL : ${(item as any).type} (id: ${item.id})`);
  }
}
