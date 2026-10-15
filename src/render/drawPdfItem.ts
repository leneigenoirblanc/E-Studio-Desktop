import jsPDF from 'jspdf';
import { TemplateItem, ProductRecord, TextItemProperties, PriceBlockItemProperties, TierPriceItemProperties, RichTextItemProperties } from '../types';
import { PricingEngine } from '../utils/pricingEngine';
import { TierEngine } from '../utils/tierEngine';
import { generateEAN13Bars, generateCode128Bars } from '../utils/barcodeGenerator';
import { generateQrMatrix } from '../utils/qrGenerator';
import { drawPictogramPdf } from './pictograms';

export function hexToRgb(hex: string): [number, number, number] {
  if (!hex || hex === 'transparent') return [255, 255, 255];
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return [r, g, b];
  }
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return [r, g, b];
}

/**
 * Draws a single template item onto the jsPDF document.
 */
export function drawPdfItem(
  doc: jsPDF,
  item: TemplateItem,
  itemX: number,
  itemY: number,
  record?: ProductRecord | null
): void {
  // 1. Restricted areas are layout aids and must NEVER be drawn in final output
  if (item.type === 'restricted_area') {
    return;
  }

  // 2. Conditional visibility evaluation
  if (item.conditional_display && !PricingEngine.shouldDisplayItem(item, record)) {
    return;
  }

  const w = item.w_mm;
  const h = item.h_mm;

  switch (item.type) {
    case 'text': {
      const textItem = item as TextItemProperties;
      const text = PricingEngine.resolveCalculatedText(textItem, record);
      if (!text) return;

      // Fill background
      if (textItem.fill_color && textItem.fill_color !== 'transparent') {
        const [r, g, b] = hexToRgb(textItem.fill_color);
        doc.setFillColor(r, g, b);
        if (textItem.border_width && textItem.border_width > 0 && textItem.border_color) {
          const [br, bg, bb] = hexToRgb(textItem.border_color);
          doc.setDrawColor(br, bg, bb);
          doc.setLineWidth(textItem.border_width * 0.35);
          doc.rect(itemX, itemY, w, h, 'FD');
        } else {
          doc.rect(itemX, itemY, w, h, 'F');
        }
      } else if (textItem.border_width && textItem.border_width > 0 && textItem.border_color) {
        const [br, bg, bb] = hexToRgb(textItem.border_color);
        doc.setDrawColor(br, bg, bb);
        doc.setLineWidth(textItem.border_width * 0.35);
        doc.rect(itemX, itemY, w, h, 'S');
      }

      const [tr, tg, tb] = hexToRgb(textItem.text_color || '#000000');
      doc.setTextColor(tr, tg, tb);

      const isCourier = textItem.font_family?.toLowerCase().includes('mono') || textItem.font_family?.toLowerCase().includes('courier');
      const fontName = isCourier ? 'courier' : 'helvetica';
      const fontStyle = textItem.font_weight === 'bold' || textItem.font_weight === '800' ? (textItem.font_style === 'italic' ? 'bolditalic' : 'bold') : (textItem.font_style === 'italic' ? 'italic' : 'normal');

      doc.setFont(fontName, fontStyle);
      const fontSizePt = Math.max(4, textItem.font_size_pt || 10);
      doc.setFontSize(fontSizePt);

      let textX = itemX;
      if (textItem.alignment === 'center') textX = itemX + w / 2;
      else if (textItem.alignment === 'right') textX = itemX + w;

      let textY = itemY + fontSizePt * 0.35;
      if (textItem.valign === 'middle') {
        textY = itemY + h / 2 + fontSizePt * 0.12;
      } else if (textItem.valign === 'bottom') {
        textY = itemY + h - 0.5;
      }

      // Check currency symbol appending if price related
      let finalText = text;
      if (textItem.is_price && textItem.currency_symbol) {
        const pos = textItem.currency_position || 'after';
        if (pos === 'after') finalText = `${text} ${textItem.currency_symbol}`;
        else if (pos === 'before') finalText = `${textItem.currency_symbol} ${text}`;
      }

      doc.text(finalText, textX, textY, { align: textItem.alignment as any });
      break;
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
        return;
      }

      const currencySym = priceItem.currency_symbol || '€';
      const decimals = /FCFA|CFA|GNF|XOF|XAF/i.test(currencySym) ? 0 : 2;
      const separator = priceItem.decimal_separator ?? ',';
      const { integerPart, decimalPart, hasDecimals } = PricingEngine.splitPrice(rawPrice, separator, decimals);

      const intFontSizePt = priceItem.integer_style?.font_size_pt || 24;
      const decFontSizePt = priceItem.decimal_style?.font_size_pt || Math.max(8, Math.round(intFontSizePt * 0.52));
      const currFontSizePt = priceItem.currency_style?.font_size_pt || Math.max(8, Math.round(intFontSizePt * 0.48));

      const [pr, pg, pb] = hexToRgb(priceItem.integer_style?.text_color || '#000000');
      doc.setTextColor(pr, pg, pb);

      const align = priceItem.alignment || 'left';
      const isCourier = priceItem.font_family?.toLowerCase().includes('mono');
      const fontName = isCourier ? 'courier' : 'helvetica';
      doc.setFont(fontName, 'bold');
      doc.setFontSize(intFontSizePt);

      // Build complete formatted text for exact vector placement
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

      let textX = itemX;
      if (align === 'center') textX = itemX + w / 2;
      else if (align === 'right') textX = itemX + w;

      let textY = itemY + intFontSizePt * 0.35;
      if (priceItem.valign === 'middle') {
        textY = itemY + h / 2 + intFontSizePt * 0.12;
      } else if (priceItem.valign === 'bottom') {
        textY = itemY + h - 0.5;
      }

      doc.text(priceStr, textX, textY, { align: align as any });
      break;
    }

    case 'rich_text': {
      const richItem = item as RichTextItemProperties;
      if (!richItem.runs || richItem.runs.length === 0) return;

      const fullText = richItem.runs
        .map((run) => {
          if (run.binding_key && record) {
            const v = PricingEngine.getProductFieldValue(record, run.binding_key);
            return v !== undefined && v !== null ? String(v) : '';
          }
          let t = run.text || '';
          if (t.includes('{{') && record) {
            t = t.replace(/\{\{([^}]+)\}\}/g, (_, k) => {
              const v = PricingEngine.getProductFieldValue(record, k.trim());
              return v !== undefined && v !== null ? String(v) : '';
            });
          }
          return t;
        })
        .join(' ');

      const defaultPt = richItem.default_font_size_pt || 10;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(defaultPt);
      const [r, g, b] = hexToRgb(richItem.default_text_color || '#000000');
      doc.setTextColor(r, g, b);

      let textX = itemX;
      if (richItem.alignment === 'center') textX = itemX + w / 2;
      else if (richItem.alignment === 'right') textX = itemX + w;

      let textY = itemY + defaultPt * 0.35;
      if (richItem.valign === 'middle') textY = itemY + h / 2;
      else if (richItem.valign === 'bottom') textY = itemY + h - 0.5;

      doc.text(fullText, textX, textY, { align: (richItem.alignment as any) || 'left' });
      break;
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

      // Draw box
      const [bgR, bgG, bgB] = hexToRgb(tierItem.styles?.header_bg_color || '#f8fafc');
      doc.setFillColor(bgR, bgG, bgB);
      const [bdR, bdG, bdB] = hexToRgb(tierItem.styles?.border_color || '#cbd5e1');
      doc.setDrawColor(bdR, bdG, bdB);
      doc.setLineWidth(0.2);
      doc.rect(itemX, itemY, w, h, 'FD');

      // Draw text from TierEngine
      const [tR, tG, tB] = hexToRgb(tierItem.styles?.text_color || tierItem.text_color || '#1e293b');
      doc.setTextColor(tR, tG, tB);
      doc.setFont('helvetica', 'bold');
      const fontSize = Math.max(5, tierItem.font_size_pt || Math.min(8, h * 0.5));
      doc.setFontSize(fontSize);
      doc.text(tierSummary, itemX + w / 2, itemY + h / 2 + fontSize * 0.15, { align: 'center' });
      break;
    }

    case 'pictogram': {
      drawPictogramPdf(doc, item as any, itemX, itemY, w, h);
      break;
    }

    case 'barcode': {
      const barcodeType = (item as any).barcode_type || 'ean13';
      const rawBarcode = PricingEngine.resolveBarcodeValue(item, record, { sample: false });
      if (!rawBarcode || rawBarcode.trim() === '') return;

      const [barR, barG, barB] = hexToRgb((item as any).bar_color || '#000000');
      let bars: boolean[] = [];
      let textToShow = rawBarcode;

      if (barcodeType === 'ean13') {
        try {
          const res = generateEAN13Bars(rawBarcode);
          bars = res.bars;
          textToShow = res.formattedCode;
        } catch {
          bars = generateCode128Bars(rawBarcode);
        }
      } else {
        bars = generateCode128Bars(rawBarcode);
      }

      const showText = Boolean((item as any).show_text);
      const textMarginMm = showText ? 3.0 : 0;
      const barHeightMm = Math.max(2, h - textMarginMm);
      const totalBars = Math.max(1, bars.length);
      const unitWidthMm = w / totalBars;

      // Draw clean white background for high barcode contrast
      doc.setFillColor(255, 255, 255);
      doc.rect(itemX, itemY, w, h, 'F');

      doc.setFillColor(barR, barG, barB);
      let startIdx: number | null = null;
      for (let bIdx = 0; bIdx < totalBars; bIdx++) {
        if (bars[bIdx]) {
          if (startIdx === null) startIdx = bIdx;
        } else {
          if (startIdx !== null) {
            const bX = itemX + startIdx * unitWidthMm;
            const bW = (bIdx - startIdx) * unitWidthMm;
            doc.rect(bX, itemY, bW, barHeightMm, 'F');
            startIdx = null;
          }
        }
      }
      if (startIdx !== null) {
        const bX = itemX + startIdx * unitWidthMm;
        const bW = (totalBars - startIdx) * unitWidthMm;
        doc.rect(bX, itemY, bW, barHeightMm, 'F');
      }

      if (showText && textToShow) {
        doc.setFont('courier', 'normal');
        doc.setFontSize(Math.max(5, Math.min(8.5, h * 1.5)));
        doc.setTextColor(barR, barG, barB);
        doc.text(textToShow, itemX + w / 2, itemY + h - 0.4, { align: 'center' });
      }
      break;
    }

    case 'qrcode': {
      const qrContent = PricingEngine.resolveQrContent(item, record, { sample: false });
      if (!qrContent) return;

      const [modR, modG, modB] = hexToRgb((item as any).module_color || '#000000');
      const [bgR, bgG, bgB] = hexToRgb((item as any).background_color || '#FFFFFF');

      doc.setFillColor(bgR, bgG, bgB);
      doc.rect(itemX, itemY, w, h, 'F');

      const matrix = generateQrMatrix(qrContent);
      const matrixSize = matrix.length;
      const cellW = w / matrixSize;
      const cellH = h / matrixSize;

      doc.setFillColor(modR, modG, modB);
      for (let row = 0; row < matrixSize; row++) {
        let startCol: number | null = null;
        for (let col = 0; col < matrixSize; col++) {
          if (matrix[row][col]) {
            if (startCol === null) startCol = col;
          } else {
            if (startCol !== null) {
              doc.rect(itemX + startCol * cellW, itemY + row * cellH, (col - startCol) * cellW, cellH, 'F');
              startCol = null;
            }
          }
        }
        if (startCol !== null) {
          doc.rect(itemX + startCol * cellW, itemY + row * cellH, (matrixSize - startCol) * cellW, cellH, 'F');
        }
      }
      break;
    }

    case 'shape': {
      const shape = item as any;
      const isFilled = shape.fill_color && shape.fill_color !== 'transparent';
      const hasBorder = shape.border_width && shape.border_width > 0 && shape.border_color;

      if (isFilled) {
        const [r, g, b] = hexToRgb(shape.fill_color);
        doc.setFillColor(r, g, b);
      }
      if (hasBorder) {
        const [br, bg, bb] = hexToRgb(shape.border_color);
        doc.setDrawColor(br, bg, bb);
        doc.setLineWidth(shape.border_width * 0.35);
      }

      const style = isFilled && hasBorder ? 'FD' : isFilled ? 'F' : 'S';
      if (shape.corner_radius && shape.corner_radius > 0) {
        doc.roundedRect(itemX, itemY, w, h, shape.corner_radius, shape.corner_radius, style);
      } else {
        doc.rect(itemX, itemY, w, h, style);
      }
      break;
    }

    case 'ellipse': {
      const el = item as any;
      const isFilled = el.fill_color && el.fill_color !== 'transparent';
      const hasBorder = el.border_width && el.border_width > 0 && el.border_color;

      if (isFilled) {
        const [r, g, b] = hexToRgb(el.fill_color);
        doc.setFillColor(r, g, b);
      }
      if (hasBorder) {
        const [br, bg, bb] = hexToRgb(el.border_color);
        doc.setDrawColor(br, bg, bb);
        doc.setLineWidth(el.border_width * 0.35);
      }

      const style = isFilled && hasBorder ? 'FD' : isFilled ? 'F' : 'S';
      const rx = w / 2;
      const ry = h / 2;
      doc.ellipse(itemX + rx, itemY + ry, rx, ry, style);
      break;
    }

    case 'line': {
      const ln = item as any;
      const [r, g, b] = hexToRgb(ln.color || '#000000');
      doc.setDrawColor(r, g, b);
      doc.setLineWidth(Math.max(0.1, (ln.thickness || 1) * 0.35));
      doc.line(itemX, itemY, itemX + w, itemY + h);
      break;
    }

    case 'image': {
      const img = item as any;
      const src = img.source;
      if (src && typeof src === 'string' && src.startsWith('data:image/')) {
        try {
          doc.addImage(src, 'JPEG', itemX, itemY, w, h);
        } catch (e) {
          console.warn('[PDF] Failed to add image:', e);
        }
      }
      break;
    }

    case 'curved_text': {
      // Curved text placeholder on PDF
      const curved = item as any;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(Math.max(4, curved.font_size_pt || 10));
      const [r, g, b] = hexToRgb(curved.text_color || '#000000');
      doc.setTextColor(r, g, b);
      doc.text(curved.text || '', itemX + w / 2, itemY + h / 2, { align: 'center' });
      break;
    }

    default:
      throw new Error(`[drawPdfItem] Type non supporté : ${(item as any).type}`);
  }
}
