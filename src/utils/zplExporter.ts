import { LabelTemplate, ProductRecord } from '../types';
import { desktopFileService } from '../services/desktopFileService';
import { drawZplItem, mmToDots, escapeZplText } from '../render/drawZplItem';

export interface ZplConfig {
  dpi: 203 | 300 | 600;
  quantity: number;
  printSpeed: number; // 2 to 14
  darkness: number; // 0 to 30
  includeComments: boolean;
}

export class ZplExporter {
  static mmToDots = mmToDots;
  static escapeZplText = escapeZplText;

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

    const labelWidthDots = mmToDots(template.width_mm, dpi);
    const labelHeightDots = mmToDots(template.height_mm, dpi);

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

    // Render elements using drawZplItem
    for (const item of template.items || []) {
      const itemLines = drawZplItem(item, dpi, record);
      lines.push(...itemLines);
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
   * Saves the generated .zpl file to local disk or triggers browser download
   */
  static async downloadZplFile(filename: string, content: string): Promise<string | null> {
    const finalName = filename.endsWith('.zpl') ? filename : `${filename}.zpl`;
    return await desktopFileService.saveText(finalName, content, [
      { name: 'Fichier ZPL', extensions: ['zpl', 'txt'] },
    ]);
  }
}
