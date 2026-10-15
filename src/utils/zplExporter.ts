import { LabelTemplate, ProductRecord } from '../types';
import { PricingEngine } from './pricingEngine';
import { desktopFileService } from '../services/desktopFileService';
import { LabelResolutionEngine } from './labelResolutionEngine';

export interface ZplConfig {
  dpi: 203 | 300 | 600;
  quantity: number;
  printSpeed: number; // 2 to 14
  darkness: number; // 0 to 30
  includeComments: boolean;
}

export class ZplExporter {
  /**
   * Converts mm to printer dots based on DPI
   */
  static mmToDots(mm: number, dpi: 203 | 300 | 600): number {
    const dotsPerMm = dpi === 203 ? 8 : dpi === 300 ? 11.811 : 23.622;
    return Math.round(mm * dotsPerMm);
  }

  /**
   * Escapes text for ZPL Field Hex (^FH) and prevents command injection (^, ~, _)
   */
  static escapeZplText(text: string): string {
    if (!text) return '';
    return text
      .replace(/_/g, '_5f')
      .replace(/\^/g, '_5e')
      .replace(/~/g, '_7e')
      .replace(/[\r\n]+/g, ' ');
  }

  /**
   * Generates a single ZPL string for a specific product and template
   */
  static generateLabelZpl(
    template: LabelTemplate,
    record: ProductRecord,
    config: ZplConfig = { dpi: 203, quantity: 1, printSpeed: 4, darkness: 15, includeComments: true }
  ): string {
    const lines: string[] = [];
    const { dpi, quantity, darkness, includeComments } = config;

    const labelWidthDots = ZplExporter.mmToDots(template.width_mm, dpi);
    const labelHeightDots = ZplExporter.mmToDots(template.height_mm, dpi);

    lines.push('^XA');
    // Enable UTF-8 encoding support
    lines.push('^CI28');

    if (includeComments) {
      const cleanTplName = (template.name || '').replace(/[\^~\r\n]/g, ' ');
      const cleanArtName = (record.ITEMNAME || '').replace(/[\^~\r\n]/g, ' ');
      lines.push(`^FX --- E-STUDIO GENERATED ZPL II ---`);
      lines.push(`^FX Template: ${cleanTplName} (${template.width_mm}x${template.height_mm} mm)`);
      lines.push(`^FX Article: ${cleanArtName}`);
    }

    // Label dimensions and darkness
    lines.push(`^PW${labelWidthDots}`);
    lines.push(`^LL${labelHeightDots}`);
    lines.push(`~SD${darkness}`);
    lines.push(`^LH0,0`);

    // Resolve label through unified canonical engine
    const resolvedLabel = LabelResolutionEngine.resolveLabel(template, record, 'zpl', { sample: false });

    // Render elements
    for (const item of resolvedLabel.items) {
      if (!item.visible) continue;
      const rawItem = item.rawItem;

      const x = ZplExporter.mmToDots(item.x_mm, dpi);
      const y = ZplExporter.mmToDots(item.y_mm, dpi);
      const w = ZplExporter.mmToDots(item.w_mm, dpi);
      const h = ZplExporter.mmToDots(item.h_mm, dpi);

      switch (item.type) {
        case 'text': {
          const displayText = item.resolvedText || '';
          if (!displayText) break;

          // Font height based on pt
          const fontHeightDots = Math.max(12, Math.round(item.fontSizePt * (dpi / 72) * 0.8));
          const fontWidthDots = Math.round(fontHeightDots * 0.65);
          const escapedText = ZplExporter.escapeZplText(displayText);

          // If background fill exists, draw rectangle first
          if (item.fillColor && item.fillColor !== 'transparent' && item.fillColor !== '#FFFFFF') {
            lines.push(`^FO${x},${y}^GB${w},${h},${h},B,0^FS`);
            // White text on black box
            lines.push(`^FO${x + 4},${y + 4}^A0N,${fontHeightDots},${fontWidthDots}^FR^FH^FD${escapedText}^FS`);
          } else {
            lines.push(`^FO${x},${y}^A0N,${fontHeightDots},${fontWidthDots}^FH^FD${escapedText}^FS`);
          }
          break;
        }

        case 'price_block': {
          if (!item.resolvedPrice || item.resolvedPrice.status !== 'valid') {
            break;
          }
          const priceText = item.resolvedPrice.formattedText;
          const fontHeightDots = Math.max(16, Math.round(((rawItem as any).integer_style?.font_size_pt || 24) * (dpi / 72) * 0.8));
          const fontWidthDots = Math.round(fontHeightDots * 0.65);
          const escapedPrice = ZplExporter.escapeZplText(priceText);

          lines.push(`^FO${x},${y}^A0N,${fontHeightDots},${fontWidthDots}^FH^FD${escapedPrice}^FS`);
          break;
        }

        case 'barcode': {
          const barcodeData = item.resolvedBarcode;
          if (!barcodeData || barcodeData.status !== 'valid') {
            console.warn(`[ZPL] Invalid barcode for item ${item.id} - skipped`);
            break;
          }
          const rawCode = barcodeData.value;
          const cleanCode = (rawCode || '').replace(/\D/g, '');
          const barcodeH = Math.max(20, h - (barcodeData.showText ? 20 : 0));

          if (barcodeData.barcodeType === 'ean13') {
            lines.push(`^FO${x},${y}^BEN,${barcodeH},${barcodeData.showText ? 'Y' : 'N'},N^FD${cleanCode.slice(0, 13)}^FS`);
          } else {
            // Code 128 with ^FH escaping
            const escapedCode = ZplExporter.escapeZplText(rawCode);
            lines.push(`^FO${x},${y}^BY2,3,${barcodeH}^BCN,${barcodeH},${barcodeData.showText ? 'Y' : 'N'},N,N^FH^FD>:${escapedCode}^FS`);
          }
          break;
        }

        case 'qrcode': {
          const qrData = item.resolvedQr?.value;
          if (!qrData) break;
          const mag = Math.max(2, Math.min(10, Math.round(w / 35)));
          const escapedQr = ZplExporter.escapeZplText(qrData);
          lines.push(`^FO${x},${y}^BQN,2,${mag}^FH^FDLA,${escapedQr}^FS`);
          break;
        }

        case 'shape': {
          const rawShape = item.rawItem as any;
          const borderThick = Math.max(1, ZplExporter.mmToDots(item.borderWidth || rawShape.border_width || 1, dpi));
          const radiusDots = Math.round(ZplExporter.mmToDots(rawShape.corner_radius || 0, dpi) / 2);
          const isFilled = item.fillColor && item.fillColor !== '#FFFFFF' && item.fillColor !== 'transparent';
          lines.push(`^FO${x},${y}^GB${w},${h},${isFilled ? h : borderThick},B,${Math.min(8, radiusDots)}^FS`);
          break;
        }

        case 'line': {
          const rawLine = item.rawItem as any;
          const thick = Math.max(1, ZplExporter.mmToDots(rawLine.thickness || 1, dpi));
          lines.push(`^FO${x},${y}^GB${w},${thick},${thick},B,0^FS`);
          break;
        }

        default:
          console.warn(`[ZPL] Non-representable element type "${item.type}" ignored on ZPL target (id: ${item.id})`);
          break;
      }
    }

    lines.push(`^PQ${quantity},0,1,Y`);
    lines.push('^XZ');

    return lines.join('\n');
  }

  /**
   * Generates a batch ZPL file for all records in the queue
   */
  static generateBatchZpl(
    template: LabelTemplate,
    products: ProductRecord[],
    config: ZplConfig = { dpi: 203, quantity: 1, printSpeed: 4, darkness: 15, includeComments: true }
  ): string {
    return products.map((p) => ZplExporter.generateLabelZpl(template, p, config)).join('\n\n');
  }

  /**
   * Saves the generated .zpl file to local disk
   */
  static async downloadZplFile(filename: string, content: string): Promise<string | null> {
    const finalName = filename.endsWith('.zpl') ? filename : `${filename}.zpl`;
    return await desktopFileService.saveText(finalName, content, [
      { name: 'Fichier ZPL', extensions: ['zpl', 'txt'] },
    ]);
  }
}
