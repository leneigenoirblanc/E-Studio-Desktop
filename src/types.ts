export interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface SemanticSnapConfig {
  parent_id: string;
  anchor_edge: 'bottom' | 'top' | 'left' | 'right';
  offset_mm: number;
}

export type ItemType =
  | 'text'
  | 'rich_text'
  | 'price_block'
  | 'curved_text'
  | 'pictogram'
  | 'shape'
  | 'ellipse'
  | 'line'
  | 'image'
  | 'qrcode'
  | 'barcode'
  | 'tier_price'
  | 'restricted_area';

export type RotationHandleType =
  | 'top_stem'
  | 'corner_hover_orbit'
  | 'dual_stems'
  | 'corner_satellites'
  | 'disabled';

export interface ConditionalDisplayConfig {
  enabled: boolean;
  rule: 'always' | 'has_promo' | 'has_barcode' | 'has_tiers' | 'field_gt_zero' | 'field_not_empty';
  field_key?: string;
  compare_value?: string | number;
}

export interface UnitPriceConfig {
  enabled: boolean;
  weight_volume_key: string; // e.g. "NET_WEIGHT_KG", "VOLUME_L", "PACK_UNIT", "CASE_SIZE"
  measure_unit: 'kg' | 'g' | 'L' | 'cl' | 'ml' | 'piece' | 'carton';
  custom_multiplier?: number;
  format_pattern?: string; // e.g. "{price} / {unit}"
}

export interface SecondaryCurrencyConfig {
  enabled: boolean;
  target_currency: string; // e.g. "EUR", "FCFA", "USD", "GBP"
  exchange_rate: number; // e.g. 655.957 for FCFA -> EUR
  mode: 'divide' | 'multiply';
  format_pattern?: string; // e.g. "(~ {price} €)"
}

export interface DynamicDateConfig {
  enabled: boolean;
  date_type: 'dlc' | 'dluo' | 'fab_date' | 'today';
  offset_days: number; // e.g. +3 days, +30 days
  format: 'DD/MM/YYYY' | 'DD.MM.YY' | 'DD/MM' | 'YYYY-MM-DD';
  prefix_label?: string; // e.g. "À consommer jusqu'au :", "Emballé le :"
}

export interface BaseItemProperties {
  id: string;
  type: ItemType;
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
  rotation: number;
  z_index: number;
  locked: boolean;
  group_id?: string;
  binding_key?: string;
  conditional_display?: ConditionalDisplayConfig;
  finish_effect?: 'none' | 'die_cut' | 'spot_varnish' | 'hot_foil';
  semantic_snap?: SemanticSnapConfig;
}

export interface TextShadowConfig {
  enabled: boolean;
  color: string;
  blur_px: number;
  offset_x_px: number;
  offset_y_px: number;
}

export interface TextItemProperties extends BaseItemProperties {
  type: 'text';
  text: string;
  font_family: string;
  font_size_pt: number;
  font_weight: 'normal' | '500' | '600' | 'bold' | '800';
  font_style: 'normal' | 'italic';
  text_decoration: 'none' | 'underline' | 'line-through' | 'underline line-through';
  text_color: string;
  alignment: 'left' | 'center' | 'right' | 'justify';
  valign: 'top' | 'middle' | 'bottom';
  wrap: boolean;
  overflow: 'autofit_shrink' | 'clip' | 'overflow';
  letter_spacing_pt?: number;
  line_height_multiplier?: number;
  text_transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  prefix_text?: string;
  suffix_text?: string;
  fill_color?: string;
  border_color?: string;
  border_width?: number;
  corner_radius?: number;
  placeholder?: string;

  // Rich Typography & Advanced Styling Tools
  highlight_color?: string; // background text highlight
  text_shadow?: TextShadowConfig;
  subscript_superscript?: 'none' | 'subscript' | 'superscript';
  strikethrough_color?: string;

  // Dedicated Price & Currency separate typography & configuration
  is_price?: boolean;
  currency_symbol?: string; // e.g. "FCFA", "€", "$", "MAD", "DZD", "CHF", "£"
  currency_position?: 'after' | 'before' | 'superscript' | 'subscript';
  currency_font_family?: string;
  currency_font_size_pt?: number;
  currency_font_weight?: 'normal' | '500' | '600' | 'bold' | '800';
  currency_font_style?: 'normal' | 'italic';
  currency_color?: string;
  currency_spacing_pt?: number;

  // Business Engine & Calculation automations
  calculation_mode?: 'none' | 'unit_price' | 'discount_pct' | 'secondary_currency' | 'dynamic_date';
  unit_price_config?: UnitPriceConfig;
  secondary_currency_config?: SecondaryCurrencyConfig;
  dynamic_date_config?: DynamicDateConfig;

  // Promotion badge presets
  promo_badge_type?:
    | 'standard'
    | 'discount_pct'
    | 'slashed_price'
    | 'bogo'
    | 'flash_sale'
    | 'unit_price'
    | 'promo_period'
    | 'eco_tax';
}

export interface CurvedTextItemProperties extends BaseItemProperties {
  type: 'curved_text';
  text: string;
  radius_mm: number;
  start_angle_deg: number;
  sweep_angle_deg: number;
  clockwise: boolean;
  font_family: string;
  font_size_pt: number;
  font_weight: 'normal' | '500' | '600' | 'bold' | '800';
  font_style: 'normal' | 'italic';
  text_color: string;
  letter_spacing_pt?: number;
}

export type PictogramType =
  | 'nutriscore_a'
  | 'nutriscore_b'
  | 'nutriscore_c'
  | 'nutriscore_d'
  | 'nutriscore_e'
  | 'ecoscore_a'
  | 'ecoscore_b'
  | 'ecoscore_c'
  | 'ecoscore_d'
  | 'ecoscore_e'
  | 'origin_france'
  | 'origin_local'
  | 'bio_ab'
  | 'bio_europe'
  | 'triman_recycling'
  | 'allergen_gluten'
  | 'allergen_milk'
  | 'allergen_peanut'
  | 'allergen_egg'
  | 'allergen_fish'
  | 'allergen_crustacean'
  | 'symbol_danger_hazard'
  | 'symbol_cold_chain';

export interface PictogramItemProperties extends BaseItemProperties {
  type: 'pictogram';
  pictogram_type: PictogramType;
  custom_label?: string;
  style_variant?: 'color' | 'monochrome_black' | 'badge';
}

export interface ShapeItemProperties extends BaseItemProperties {
  type: 'shape';
  fill_color: string;
  border_color: string;
  border_width: number;
  corner_radius: number;
}

export interface EllipseItemProperties extends BaseItemProperties {
  type: 'ellipse';
  fill_color: string;
  border_color: string;
  border_width: number;
}

export interface LineItemProperties extends BaseItemProperties {
  type: 'line';
  color: string;
  thickness: number;
  style: 'solid' | 'dashed' | 'dotted';
}

export interface ImageItemProperties extends BaseItemProperties {
  type: 'image';
  source?: string;
  keep_aspect_ratio: boolean;
  opacity: number;
}

export interface QRCodeItemProperties extends BaseItemProperties {
  type: 'qrcode';
  content: string;
  module_color: string;
  background_color: string;
}

export interface BarcodeItemProperties extends BaseItemProperties {
  type: 'barcode';
  code: string;
  barcode_type: 'code128' | 'ean13';
  show_text: boolean;
  bar_color: string;
}

export interface PriceSubStyle {
  font_size_pt?: number;
  font_weight?: 'normal' | '500' | '600' | 'bold' | '800';
  text_color?: string;
  baseline_shift?: 'normal' | 'superscript' | 'subscript';
}

export interface PriceBlockItemProperties extends BaseItemProperties {
  type: 'price_block';
  binding_key: string; // e.g. "PROMOPRICE", "SELLING_PRICE"
  currency_symbol?: string; // e.g. "€", "FCFA", "$"
  currency_position?: 'after' | 'before' | 'superscript';
  decimal_separator?: '.' | ',';
  integer_style: PriceSubStyle;
  decimal_style: PriceSubStyle;
  currency_style?: PriceSubStyle;
  font_family?: string;
  alignment?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  fallback_price?: number | string;
}

export interface TextRun {
  id?: string;
  text?: string;
  binding_key?: string;
  font_size_pt?: number;
  font_weight?: 'normal' | '500' | '600' | 'bold' | '800';
  font_style?: 'normal' | 'italic';
  text_decoration?: 'none' | 'underline' | 'line-through';
  text_color?: string;
  highlight_color?: string;
  baseline_shift?: 'normal' | 'superscript' | 'subscript';
}

export interface RichTextItemProperties extends BaseItemProperties {
  type: 'rich_text';
  runs: TextRun[];
  font_family?: string;
  default_font_size_pt?: number;
  default_text_color?: string;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  valign?: 'top' | 'middle' | 'bottom';
  line_height_multiplier?: number;
  wrap?: boolean;
}

export interface CrossConditionalConfig {
  enabled: boolean;
  trigger_column: string; // e.g. "PARENT_BRAND_VOLUME"
  min_threshold: number; // e.g. 50
}

export interface TierPriceItemProperties extends BaseItemProperties {
  type: 'tier_price';
  primary_tier: number; // 1, 2, 3...
  prefix_text: string; // e.g. "À partir de", "Par carton de"
  unit_label: string; // "FCFA", "€", "$"
  strict_required: boolean;
  fallback_to_base_price?: boolean;
  pricing_strategy?: 'flat' | 'graduated';
  cross_conditional?: CrossConditionalConfig;
  styles?: {
    header_bg_color?: string;
    text_color?: string;
    border_color?: string;
  };
  // Typography & Styling (matching Text properties)
  font_family?: string;
  font_size_pt?: number;
  font_weight?: 'normal' | '500' | '600' | 'bold' | '800';
  font_style?: 'normal' | 'italic';
  text_decoration?: 'none' | 'underline' | 'line-through' | 'underline line-through';
  text_color?: string;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  valign?: 'top' | 'middle' | 'bottom';
  wrap?: boolean;
  overflow?: 'autofit_shrink' | 'clip' | 'overflow';
  letter_spacing_pt?: number;
  line_height_multiplier?: number;
  text_transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  fill_color?: string;
  border_color?: string;
  border_width?: number;
  corner_radius?: number;
  placeholder?: string;
  highlight_color?: string;
  text_shadow?: TextShadowConfig;
  subscript_superscript?: 'none' | 'subscript' | 'superscript';
  strikethrough_color?: string;
}

export interface RestrictedAreaItemProperties extends BaseItemProperties {
  type: 'restricted_area';
  label: string; // e.g. "Zone Réservée / Capteur", "Marge d'encollage"
  pattern: 'diagonal_stripes' | 'solid' | 'cross' | 'outline';
  zone_color: string; // e.g. "#ef4444"
  opacity: number; // 0.15 to 0.75
  warn_on_overlap: boolean;
}

export type TemplateItem =
  | TextItemProperties
  | RichTextItemProperties
  | PriceBlockItemProperties
  | CurvedTextItemProperties
  | PictogramItemProperties
  | ShapeItemProperties
  | EllipseItemProperties
  | LineItemProperties
  | ImageItemProperties
  | QRCodeItemProperties
  | BarcodeItemProperties
  | TierPriceItemProperties
  | RestrictedAreaItemProperties;

export interface CalibrationImageConfig {
  url: string;
  opacity: number; // 0 to 1
  offset_x_mm: number;
  offset_y_mm: number;
  scale_pct: number; // 50 to 200
  visible: boolean;
  locked: boolean;
  print_in_output: boolean; // whether to include in print/PDF output or keep as reference overlay only
}

export interface CustomFont {
  id: string;
  name: string;
  family: string;
  source: 'google' | 'system' | 'custom_upload';
  url?: string;
  category?: 'sans-serif' | 'serif' | 'display' | 'monospace' | 'handwriting';
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user?: string;
  action: string;
  product_id?: string;
  product_name?: string;
  template_name?: string;
  details: string;
  previous_snapshot?: any;
  new_snapshot?: any;
}

export interface LabelTemplate {
  id: string;
  revision: number;
  created_at: string;
  updated_at: string;
  schema_version: number;
  name: string;
  width_mm: number;
  height_mm: number;
  inner_margins_mm: Margins;
  outer_margins_mm: Margins;
  bg_color: string;
  bg_opacity: number;
  background_image_path?: string | null;
  background_image_opacity?: number;
  background_image_fit?: 'contain' | 'cover' | 'stretch';
  background_image_visible?: boolean;
  background_image_locked?: boolean;
  background_image_in_output?: boolean;
  calibration_image?: CalibrationImageConfig | null;
  default_imposition?: ImpositionConfig;
  items: TemplateItem[];
}

export const CURRENT_SCHEMA_VERSION = 1;

export function migrateTemplateSchema(raw: any): LabelTemplate {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Gabarit invalide : objet attendu.');
  }
  const now = new Date().toISOString();
  const schema_version = typeof raw.schema_version === 'number' && raw.schema_version >= 1 ? raw.schema_version : CURRENT_SCHEMA_VERSION;
  
  return {
    id: String(raw.id || `tpl_${Date.now()}`),
    revision: typeof raw.revision === 'number' ? raw.revision : 1,
    created_at: raw.created_at || now,
    updated_at: raw.updated_at || now,
    schema_version,
    name: String(raw.name || 'Gabarit sans titre').trim(),
    width_mm: typeof raw.width_mm === 'number' && raw.width_mm > 0 ? raw.width_mm : 100,
    height_mm: typeof raw.height_mm === 'number' && raw.height_mm > 0 ? raw.height_mm : 50,
    inner_margins_mm: raw.inner_margins_mm || { top: 0, right: 0, bottom: 0, left: 0 },
    outer_margins_mm: raw.outer_margins_mm || { top: 0, right: 0, bottom: 0, left: 0 },
    bg_color: raw.bg_color || '#FFFFFF',
    bg_opacity: typeof raw.bg_opacity === 'number' ? raw.bg_opacity : 1.0,
    background_image_path: raw.background_image_path ?? null,
    background_image_opacity: raw.background_image_opacity ?? 0.5,
    background_image_fit: raw.background_image_fit ?? 'contain',
    background_image_visible: raw.background_image_visible ?? false,
    background_image_locked: raw.background_image_locked ?? true,
    background_image_in_output: raw.background_image_in_output ?? false,
    calibration_image: raw.calibration_image ?? null,
    default_imposition: raw.default_imposition,
    items: Array.isArray(raw.items) ? raw.items : [],
  };
}

export type PrintJobStatus = 'draft' | 'ready' | 'sent' | 'failed';

export interface PrintJob {
  id: string;
  template_id: string;
  template_revision: number;
  product_ids: string[];
  format: 'pdf' | 'zpl' | 'pptx' | 'esl';
  imposition_json: string;
  target: string;
  status: PrintJobStatus;
  error: string | null;
  created_at: string;
  template_snapshot?: LabelTemplate;
  printed_products?: Partial<ProductRecord>[];
}

export type AppView = 'home' | 'editor' | 'generation' | 'catalog';

export interface TemplateSummary {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  revision: number;
  updated_at: string;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  rejected: number;
}

export interface AuditRecord {
  id: string;
  at: string;
  os_user: string;
  action: string;
  entity_id: string | null;
  details: string;
}

export interface DomainField {
  key: string;
  label: string;
  value_type: 'text' | 'currency' | 'barcode' | 'number' | 'date' | 'promo';
  aliases: string[];
  numeric?: boolean;
}

export interface PriceTier {
  qty: number;
  unit_price: number;
  label?: string;
}

export interface PriceTierBreak {
  min_qty: number;
  unit_price: number;
  label?: string;
  is_base?: boolean;
  error?: string;
}

export interface StructureValidationError {
  has_error: boolean;
  issues: string[];
}

export interface ProductRecord {
  id: string;
  STORE_NAME?: string;
  PRODUCT_SCAN?: string;
  PARTNO?: string;
  ITEMNAME: string;
  ITEMDESCRIPTION?: string;
  HSCOD?: string;
  DIV_NAME?: string;
  DEPT_NAME?: string;
  CATEGORY_NAME?: string;
  SUB_CATEGORY_NAME?: string;
  BRAND_INFO?: string;
  PACK_UNIT?: string;
  VENDOR_NAME?: string;
  SELLING_UNIT?: string;
  SELLING_PRICE: number;
  PROMOPRICE?: number;
  LAST_SELLING_PRICE?: number;
  SUPPLIER?: string;
  ITEM_TYPE?: string;
  CASE_SIZE?: number;
  CASE_UNIT?: string;
  TAX?: string;
  TAX_RATE?: number;
  TAX_TYPE?: string;
  ITEM_CREATED_DATE?: string;
  ITEM_CREATED_BY?: string;
  ITEM_UPDATED_BY?: string;
  SOH?: number;
  LAST_GRN_DATE?: string;
  LAST_GRN_QTY?: number;
  SALE_QTY_AFTER_LAST_GRN?: number;
  LAST_PO_DATE?: string;
  LAST_RECEIVE_NOTE_DATE?: string;
  ON_ORDER_QTY?: number;
  STOCK_JOURNAL_CONSUMPTION?: number;
  GOODS_IN_TRANSIT?: number;
  QTY_SOLD?: number;
  QTY_SALES_RETURN?: number;
  LAST_SOLD_DATE?: string;
  QTYSOLDINLAST30DAYS?: number;
  QTYSOLDINLAST60DAYS?: number;
  QTYSOLDINLAST90DAYS?: number;
  WAC_COST?: number;
  AGING_STATUS?: string;
  ITEM_LOC_STATUS?: string;
  TOTAL_STOCK_RETAIL_INCL_TAX?: number;
  DMS?: number;
  TOTAL_STOCK_COST_EXCL_TAX?: number;
  LAST_COST_EXCL_TAX?: number;
  ITEM_SOURCE?: string;
  PRODUCTION_ITEM?: string;
  MARGIN?: number;

  DISCOUNT_PCT?: number; // e.g. 20 for -20%
  PROMO_LABEL?: string; // e.g. "1 ACHETÉ = 1 OFFERT", "VENTE FLASH"
  PROMO_START_DATE?: string;
  PROMO_END_DATE?: string;
  PROMO_PERIOD?: string; // e.g. "Du 15 au 30 Mai"
  UNIT_PRICE_TEXT?: string; // e.g. "12.50 € / kg"
  ECO_TAX?: string; // e.g. "Dont 0,15 € d'éco-part"
  ORIGIN_COUNTRY?: string; // e.g. "Origine France"
  NET_WEIGHT_KG?: number; // e.g. 0.25 for 250g
  VOLUME_L?: number; // e.g. 1.0 for 1L
  IMAGE_PATH?: string;
  TIERS?: PriceTier[];
  price_tiers?: PriceTierBreak[];
  tier_anomaly?: StructureValidationError;

  // Clustering / Assortment metadata
  is_virtual_assortment?: boolean;
  assortment_id?: string;
  assortment_tag?: string;
  cluster_root_name?: string;
  cluster_discriminators?: string[];
  cluster_type?: 'flavor' | 'size' | 'mixed';
  cluster_count?: number;
  cluster_member_ids?: string[];
  custom_name_override?: string;

  // Data-driven template & print overrides
  assigned_template?: string;
  forced_copies?: number;

  [custom_key: string]: any;
}

export interface BlueprintOverlayConfig {
  image_url?: string | null;
  opacity: number; // 0 to 1
  visible: boolean;
  scale_pct: number; // 50 to 200
  offset_x_mm: number;
  offset_y_mm: number;
  locked: boolean;
}

export interface SlotNudgeOffset {
  [slot_index: number]: {
    nudge_x_mm: number;
    nudge_y_mm: number;
  };
}

export interface ImpositionPreset {
  id: string;
  name: string;
  description: string;
  manufacturer?: string;
  config: ImpositionConfig;
  blueprint?: BlueprintOverlayConfig;
  slot_nudges?: SlotNudgeOffset;
  snap_grid_mm?: number;
}

export interface MultiSlotDefinition {
  id: string;
  name: string;
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
  assigned_product_id?: string | null;
  assigned_product?: ProductRecord | null;
  highlight_color?: string;
}

export interface MultiSlotTemplate {
  id: string;
  name: string;
  page_size: 'A4' | 'A3' | 'A5' | 'LETTER';
  orientation: 'portrait' | 'landscape';
  width_mm: number;
  height_mm: number;
  banner_title?: string;
  banner_bg?: string;
  slots: MultiSlotDefinition[];
}

export interface ImpositionConfig {
  page_size: 'A4' | 'A3' | 'A5' | 'A6' | 'LETTER' | 'CUSTOM';
  orientation: 'portrait' | 'landscape';
  gap_mm: number;
  gap_x_mm?: number;
  gap_y_mm?: number;
  margin_top_mm?: number;
  margin_bottom_mm?: number;
  margin_left_mm?: number;
  margin_right_mm?: number;
  show_cut_marks: boolean;
  start_offset_slot?: number; // Start from slot N (skip already printed labels on sheet)
  calibration_x_mm?: number;
  calibration_y_mm?: number;
  custom_page_w_mm?: number;
  custom_page_h_mm?: number;
  blueprint_overlay?: BlueprintOverlayConfig;
  slot_nudges?: SlotNudgeOffset;
  snap_grid_mm?: number; // 0.1, 0.5, 1.0, 5.0 mm
}

export interface PdfExportConfig {
  dpi: 72 | 150 | 300 | 600;
  bleed_mm: number;
  show_crop_marks: boolean;
  show_registration_marks: boolean;
  include_calibration_layer: boolean;
  color_mode: 'rgb' | 'cmyk_sim';
}

export interface ImpositionCalculation {
  page_w_mm: number;
  page_h_mm: number;
  cols: number;
  rows: number;
  total_per_page: number;
  horizontal_offset_mm: number;
  vertical_offset_mm: number;
  label_total_w_mm: number;
  label_total_h_mm: number;
  fits_on_page?: boolean;
  overflow_warning?: string;
}

export interface TooltipSettings {
  enabled: boolean;
  hoverDelayMs: number; // 100ms - 2000ms (default 400ms)
  opacityPercent: number; // 50% - 100% (default 95%)
  autoDismissSec: number; // 0 = Infinite, or 2 - 15 seconds (default 6s)
}

export type ZoomMethod = 'pointer' | 'keyboard' | 'slider' | 'marquee';

export type ElementPlacementStrategy =
  | 'ergonomic_smart'
  | 'smart_cascade'
  | 'zone_semantic'
  | 'canvas_center'
  | 'fixed_classic';

