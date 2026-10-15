import { ImpositionPreset } from '../types';
import { desktopFileService } from '../services/desktopFileService';

export const BUILTIN_IMPOSITION_PRESETS: ImpositionPreset[] = [
  {
    id: 'A4_6_UP_Perforated_BrandX',
    name: 'A4 6-UP Perforated BrandX (Planche Pré-Imprimée 100x70 mm)',
    description: 'Papier à en-tête perforé commercial avec micro-perforations et repères d\'impression 6 poses.',
    manufacturer: 'StationeryPro / BrandX',
    snap_grid_mm: 0.5,
    config: {
      page_size: 'A4',
      orientation: 'portrait',
      gap_mm: 0,
      gap_x_mm: 0,
      gap_y_mm: 0,
      margin_top_mm: 12.0,
      margin_bottom_mm: 12.0,
      margin_left_mm: 5.0,
      margin_right_mm: 5.0,
      show_cut_marks: true,
      start_offset_slot: 0,
      calibration_x_mm: 0.2,
      calibration_y_mm: -0.3,
      snap_grid_mm: 0.5,
    },
    blueprint: {
      image_url: null,
      opacity: 0.45,
      visible: true,
      scale_pct: 100,
      offset_x_mm: 0,
      offset_y_mm: 0,
      locked: true,
    },
    slot_nudges: {
      0: { nudge_x_mm: 0.0, nudge_y_mm: 0.0 },
      1: { nudge_x_mm: 0.2, nudge_y_mm: 0.0 },
      2: { nudge_x_mm: 0.0, nudge_y_mm: 0.1 },
      3: { nudge_x_mm: 0.2, nudge_y_mm: 0.1 },
      4: { nudge_x_mm: 0.1, nudge_y_mm: 0.2 },
      5: { nudge_x_mm: 0.3, nudge_y_mm: 0.2 },
    },
  },
  {
    id: 'A4_8_UP_A7_Shelving',
    name: 'A4 8-UP Rayon Supermarché (105 x 74 mm)',
    description: 'Format standard A7 (8 étiquettes par feuille A4 en 2 colonnes x 4 rangées) sans marge perdue.',
    manufacturer: 'Universal Retail Paper',
    snap_grid_mm: 1.0,
    config: {
      page_size: 'A4',
      orientation: 'portrait',
      gap_mm: 0,
      gap_x_mm: 0,
      gap_y_mm: 0,
      margin_top_mm: 0.5,
      margin_bottom_mm: 0.5,
      margin_left_mm: 0.0,
      margin_right_mm: 0.0,
      show_cut_marks: true,
      start_offset_slot: 0,
      calibration_x_mm: 0.0,
      calibration_y_mm: 0.0,
      snap_grid_mm: 1.0,
    },
    slot_nudges: {},
  },
  {
    id: 'A4_24_UP_Avery_L7159',
    name: 'A4 24-UP Avery L7159 (63.5 x 33.9 mm)',
    description: 'Planche autocollante classique 24 étiquettes pour rayonnages compacts et codes-barres.',
    manufacturer: 'Avery Zweckform',
    snap_grid_mm: 0.5,
    config: {
      page_size: 'A4',
      orientation: 'portrait',
      gap_mm: 0,
      gap_x_mm: 2.5,
      gap_y_mm: 0,
      margin_top_mm: 12.9,
      margin_bottom_mm: 12.9,
      margin_left_mm: 7.2,
      margin_right_mm: 7.2,
      show_cut_marks: false,
      start_offset_slot: 0,
      calibration_x_mm: 0.0,
      calibration_y_mm: 0.0,
    },
    slot_nudges: {},
  },
  {
    id: 'A3_4_UP_DumpBin_Island',
    name: 'A3 4-UP Bac Promo & Tête de Gondole (148 x 210 mm)',
    description: 'Planche grand format A3 pour affichage en îlot central ou bacs soldeurs (4 poses A5).',
    manufacturer: 'Retail Display Systems',
    snap_grid_mm: 1.0,
    config: {
      page_size: 'A3',
      orientation: 'landscape',
      gap_mm: 5.0,
      gap_x_mm: 5.0,
      gap_y_mm: 5.0,
      margin_top_mm: 10.0,
      margin_bottom_mm: 10.0,
      margin_left_mm: 10.0,
      margin_right_mm: 10.0,
      show_cut_marks: true,
      start_offset_slot: 0,
    },
    slot_nudges: {},
  },
];

export class ImpositionPresetsManager {
  /**
   * Export an imposition preset to decoupled JSON string
   */
  static exportPresetToJson(preset: ImpositionPreset): string {
    return JSON.stringify(preset, null, 2);
  }

  /**
   * Save the decoupled preset JSON file to local disk
   */
  static async downloadPresetFile(preset: ImpositionPreset) {
    const jsonStr = this.exportPresetToJson(preset);
    await desktopFileService.saveText(`${preset.id}.json`, jsonStr, [
      { name: 'Préréglage Imposition', extensions: ['json'] },
    ]);
  }

  /**
   * Parse an imported imposition preset JSON
   */
  static parsePresetJson(jsonString: string): ImpositionPreset {
    const parsed = JSON.parse(jsonString);
    if (!parsed.id || !parsed.config || !parsed.config.page_size) {
      throw new Error('Le fichier JSON ne respecte pas le schéma d\'imposition décalibrée.');
    }
    return parsed as ImpositionPreset;
  }
}
