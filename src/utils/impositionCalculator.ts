import { ImpositionCalculation, ImpositionConfig, Margins } from '../types';

export const PAGE_DIMENSIONS_MM: Record<string, [number, number]> = {
  A4: [210.0, 297.0],
  A3: [297.0, 420.0],
  A5: [148.0, 210.0],
  A6: [105.0, 148.0],
  LETTER: [215.9, 279.4],
};

export class ImpositionCalculator {
  static calculate(
    template_w_mm: number,
    template_h_mm: number,
    outer_margins: Margins,
    config: ImpositionConfig
  ): ImpositionCalculation {
    let page_w: number;
    let page_h: number;

    if (config.page_size === 'CUSTOM') {
      if (config.custom_page_w_mm && config.custom_page_h_mm && config.custom_page_w_mm > 0 && config.custom_page_h_mm > 0) {
        page_w = config.custom_page_w_mm;
        page_h = config.custom_page_h_mm;
      } else {
        throw new Error('Format personnalisé (CUSTOM) sélectionné : largeur et hauteur de feuille obligatoires.');
      }
    } else {
      const rawDim = PAGE_DIMENSIONS_MM[config.page_size] || PAGE_DIMENSIONS_MM.A4;
      page_w = rawDim[0];
      page_h = rawDim[1];
    }

    if (config.orientation === 'landscape') {
      [page_w, page_h] = [page_h, page_w];
    }

    const gap_x = Math.max(0, config.gap_x_mm ?? config.gap_mm ?? 0);
    const gap_y = Math.max(0, config.gap_y_mm ?? config.gap_mm ?? 0);

    const marginLeft = Math.max(0, config.margin_left_mm ?? 0);
    const marginRight = Math.max(0, config.margin_right_mm ?? 0);
    const marginTop = Math.max(0, config.margin_top_mm ?? 0);
    const marginBottom = Math.max(0, config.margin_bottom_mm ?? 0);

    const available_w = Math.max(1, page_w - marginLeft - marginRight);
    const available_h = Math.max(1, page_h - marginTop - marginBottom);

    const label_total_w_mm = template_w_mm + (outer_margins?.left || 0) + (outer_margins?.right || 0);
    const label_total_h_mm = template_h_mm + (outer_margins?.top || 0) + (outer_margins?.bottom || 0);

    if (label_total_w_mm <= 0 || label_total_h_mm <= 0) {
      throw new Error('Les dimensions de gabarit doivent être strictement positives.');
    }

    const fits_on_page = label_total_w_mm <= available_w && label_total_h_mm <= available_h;
    let overflow_warning: string | undefined = undefined;
    if (!fits_on_page) {
      overflow_warning = `L'étiquette (${template_w_mm.toFixed(1)}×${template_h_mm.toFixed(1)} mm) dépasse l'espace imprimable utile de la planche (${available_w.toFixed(1)}×${available_h.toFixed(1)} mm).`;
    }

    // Number of columns & rows that fit in available printable space
    const cols = Math.max(1, Math.floor((available_w + gap_x) / (label_total_w_mm + gap_x)));
    const rows = Math.max(1, Math.floor((available_h + gap_y) / (label_total_h_mm + gap_y)));

    const used_w = cols * label_total_w_mm + Math.max(0, cols - 1) * gap_x;
    const used_h = rows * label_total_h_mm + Math.max(0, rows - 1) * gap_y;

    const calibX = config.calibration_x_mm || 0;
    const calibY = config.calibration_y_mm || 0;

    // Center within available margins or whole page
    const horizontal_offset_mm = Math.max(0, marginLeft + (available_w - used_w) / 2 + calibX);
    const vertical_offset_mm = Math.max(0, marginTop + (available_h - used_h) / 2 + calibY);

    return {
      page_w_mm: page_w,
      page_h_mm: page_h,
      cols,
      rows,
      total_per_page: cols * rows,
      horizontal_offset_mm,
      vertical_offset_mm,
      label_total_w_mm,
      label_total_h_mm,
      fits_on_page,
      overflow_warning,
    };
  }
}
