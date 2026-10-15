import { LabelTemplate, TemplateItem, ProductRecord, ItemType } from '../types';
import { PricingEngine, PriceParseResult } from './pricingEngine';
import { validateEAN13 } from './barcodeGenerator';
import { TierEngine, ResolvedTierResult } from './tierEngine';

export interface ResolvedPriceData {
  status: 'valid' | 'missing' | 'invalid';
  rawPrice: number | null;
  integerPart: string;
  decimalPart: string;
  hasDecimals: boolean;
  currencySymbol: string;
  currencyPosition: 'before' | 'after';
  decimalsCount: number;
  separator: string;
  formattedText: string;
}

export interface ResolvedBarcodeData {
  status: 'valid' | 'missing' | 'invalid';
  value: string;
  barcodeType: 'ean13' | 'code128' | 'upca';
  showText: boolean;
  reason?: string;
}

export interface ResolvedQrData {
  status: 'valid' | 'missing' | 'invalid';
  value: string;
}

export interface ResolvedItem {
  id: string;
  type: ItemType;
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
  rotation: number;
  visible: boolean;

  // Normalized styling
  fontFamily: string;
  fontSizePt: number;
  fontWeight: string;
  fontStyle: string;
  textColor: string;
  fillColor?: string;
  borderColor?: string;
  borderWidth?: number;
  alignment: 'left' | 'center' | 'right' | 'justify';
  valign: 'top' | 'middle' | 'bottom';
  lineHeightMultiplier: number;
  textDecoration?: 'none' | 'underline' | 'line-through';

  // Resolved contents
  resolvedText?: string;
  resolvedPrice?: ResolvedPriceData;
  resolvedBarcode?: ResolvedBarcodeData;
  resolvedQr?: ResolvedQrData;
  resolvedTiers?: ResolvedTierResult | null;

  // Raw reference
  rawItem: TemplateItem;
}

export interface LabelIssue {
  id: string;
  itemId?: string;
  severity: 'error' | 'warning' | 'info';
  category: 'geometry' | 'data' | 'barcode' | 'typography' | 'compatibility';
  message: string;
  productIdentifier?: string;
}

export interface ResolvedTemplateLabel {
  templateId: string;
  templateName: string;
  width_mm: number;
  height_mm: number;
  productId?: string;
  productName?: string;
  items: ResolvedItem[];
  issues: LabelIssue[];
  passed: boolean;
}

export class LabelResolutionEngine {
  /**
   * Resolves a template and single product into a deterministic canonical representation
   * consumed identically by Screen preview, PDF, ZPL, and PPTX.
   */
  static resolveLabel(
    template: LabelTemplate,
    product: ProductRecord | null | undefined,
    target: 'screen' | 'pdf' | 'zpl' | 'pptx' = 'screen',
    options: { sample?: boolean } = {}
  ): ResolvedTemplateLabel {
    const isSample = options.sample ?? (target === 'screen');
    const items: ResolvedItem[] = [];
    const issues: LabelIssue[] = [];

    const prodId = product?.id || product?.PARTNO || product?.PRODUCT_SCAN || (isSample ? 'SAMPLE' : 'NO_PROD');
    const prodName = product?.ITEMNAME || (isSample ? 'Produit Échantillon' : 'Article Inconnu');

    const templateW = template.width_mm || 100;
    const templateH = template.height_mm || 50;

    for (const rawItem of template.items || []) {
      // 1. Evaluate conditional display rule
      const isVisibleByRule = PricingEngine.shouldDisplayItem(rawItem, product);

      // Normalized base styles
      const fontFamily = (rawItem as any).font_family || 'Plus Jakarta Sans';
      const fontSizePt = (rawItem as any).font_size_pt || 12;
      const fontWeight = (rawItem as any).font_weight || 'normal';
      const fontStyle = (rawItem as any).font_style || 'normal';
      const textColor = (rawItem as any).text_color || '#000000';
      const fillColor = (rawItem as any).fill_color;
      const borderColor = (rawItem as any).border_color;
      const borderWidth = (rawItem as any).border_width;
      const alignment = (rawItem as any).alignment || 'left';
      const valign = (rawItem as any).valign || 'top';
      const lineHeightMultiplier = (rawItem as any).line_height_multiplier || 1.15;
      const textDecoration = (rawItem as any).text_decoration;

      const resolvedItem: ResolvedItem = {
        id: rawItem.id,
        type: rawItem.type,
        x_mm: rawItem.x_mm,
        y_mm: rawItem.y_mm,
        w_mm: rawItem.w_mm,
        h_mm: rawItem.h_mm,
        rotation: rawItem.rotation || 0,
        visible: isVisibleByRule,
        fontFamily,
        fontSizePt,
        fontWeight,
        fontStyle,
        textColor,
        fillColor,
        borderColor,
        borderWidth,
        alignment,
        valign,
        lineHeightMultiplier,
        textDecoration,
        rawItem,
      };

      // 2. Geometry check
      if (rawItem.x_mm < 0 || rawItem.y_mm < 0 || rawItem.x_mm + rawItem.w_mm > templateW || rawItem.y_mm + rawItem.h_mm > templateH) {
        issues.push({
          id: `boundary_overflow_${rawItem.id}`,
          itemId: rawItem.id,
          severity: 'error',
          category: 'geometry',
          message: `L'élément "${rawItem.type}" dépasse les bords physiques de l'étiquette.`,
          productIdentifier: prodId,
        });
      }

      // 3. Target Compatibility Check
      if (target === 'zpl') {
        const zplUnsupported: ItemType[] = ['image', 'rich_text', 'curved_text', 'pictogram', 'tier_price', 'ellipse', 'restricted_area'];
        if (zplUnsupported.includes(rawItem.type)) {
          issues.push({
            id: `zpl_unsupported_${rawItem.id}`,
            itemId: rawItem.id,
            severity: 'error',
            category: 'compatibility',
            message: `L'élément "${rawItem.type}" n'est pas représentable en thermique ZPL.`,
            productIdentifier: prodId,
          });
        }
      } else if (target === 'pdf') {
        const pdfUnsupported: ItemType[] = ['rich_text', 'curved_text', 'image', 'restricted_area'];
        if (pdfUnsupported.includes(rawItem.type)) {
          issues.push({
            id: `pdf_unsupported_${rawItem.id}`,
            itemId: rawItem.id,
            severity: 'error',
            category: 'compatibility',
            message: `L'élément "${rawItem.type}" n'est pas représentable en export vectoriel PDF.`,
            productIdentifier: prodId,
          });
        }
      } else if (target === 'pptx') {
        const pptxUnsupported: ItemType[] = ['rich_text', 'curved_text', 'restricted_area'];
        if (pptxUnsupported.includes(rawItem.type)) {
          issues.push({
            id: `pptx_unsupported_${rawItem.id}`,
            itemId: rawItem.id,
            severity: 'error',
            category: 'compatibility',
            message: `L'élément "${rawItem.type}" n'est pas représentable en export PowerPoint (.pptx).`,
            productIdentifier: prodId,
          });
        }
      }

      // 4. Resolve Content per Item Type
      switch (rawItem.type) {
        case 'price_block': {
          const item = rawItem as any;
          const currencySymbol = item.currency_symbol || '€';
          const currencyPosition = item.currency_position || 'after';
          const decimalsCount = /FCFA|CFA|GNF|XOF|XAF/i.test(currencySymbol) ? 0 : 2;
          const separator = item.decimal_separator ?? ',';

          let rawPriceVal: any = undefined;
          let parseRes: PriceParseResult = { status: 'missing' };

          if (product && item.binding_key) {
            rawPriceVal = PricingEngine.getProductFieldValue(product, item.binding_key);
            parseRes = PricingEngine.parsePrice(rawPriceVal);
          } else if (product && !item.binding_key) {
            parseRes = PricingEngine.resolveSellingPrice(product);
          } else if (!product) {
            // Preview placeholder
            parseRes = { status: 'valid', amount: item.fallback_price ?? 29.99 };
          }

          if (parseRes.status === 'valid') {
            const amount = parseRes.amount ?? 0;
            const { integerPart, decimalPart, hasDecimals } = PricingEngine.splitPrice(amount, separator, decimalsCount);
            const formattedPrice = decimalsCount > 0 && hasDecimals
              ? `${integerPart}${separator}${decimalPart}`
              : integerPart;
            const formattedText = currencyPosition === 'before'
              ? `${currencySymbol} ${formattedPrice}`
              : `${formattedPrice} ${currencySymbol}`;

            resolvedItem.resolvedPrice = {
              status: 'valid',
              rawPrice: amount,
              integerPart,
              decimalPart,
              hasDecimals,
              currencySymbol,
              currencyPosition,
              decimalsCount,
              separator,
              formattedText,
            };
          } else {
            // Missing or invalid price on product
            resolvedItem.resolvedPrice = {
              status: parseRes.status,
              rawPrice: null,
              integerPart: '',
              decimalPart: '',
              hasDecimals: false,
              currencySymbol,
              currencyPosition,
              decimalsCount,
              separator,
              formattedText: '',
            };

            if (product && !isSample) {
              issues.push({
                id: `price_block_${parseRes.status}_${rawItem.id}`,
                itemId: rawItem.id,
                severity: 'error',
                category: 'data',
                message: parseRes.status === 'invalid'
                  ? `Prix invalide ("${parseRes.raw}") pour l'article ${prodName}.`
                  : `Prix manquant sur le bloc de prix pour l'article ${prodName}.`,
                productIdentifier: prodId,
              });
            }
          }
          break;
        }

        case 'text': {
          const item = rawItem as any;
          let text = PricingEngine.resolveCalculatedText(item, product);

          if (item.prefix_text && text) text = `${item.prefix_text} ${text}`;
          if (item.suffix_text && text) text = `${text} ${item.suffix_text}`;

          if (item.text_transform === 'uppercase') text = text.toUpperCase();
          else if (item.text_transform === 'lowercase') text = text.toLowerCase();

          resolvedItem.resolvedText = text;

          // Check for empty required text bindings
          if (product && !isSample && item.binding_key && (!text || text.trim() === '')) {
            if (item.binding_key === 'ITEMNAME') {
              issues.push({
                id: `missing_itemname_${rawItem.id}`,
                itemId: rawItem.id,
                severity: 'error',
                category: 'data',
                message: `Désignation article vide (ITEMNAME) pour l'article ${prodId}.`,
                productIdentifier: prodId,
              });
            }
          }
          break;
        }

        case 'barcode': {
          const item = rawItem as any;
          const barcodeType: 'ean13' | 'code128' | 'upca' = item.barcode_type || 'ean13';
          const showText = item.show_text ?? true;
          const rawCode = PricingEngine.resolveBarcodeValue(item, product, { sample: isSample });

          let barcodeStatus: 'valid' | 'missing' | 'invalid' = 'valid';
          let failureReason: string | undefined = undefined;

          if (!rawCode || rawCode.trim().length === 0) {
            barcodeStatus = 'missing';
            failureReason = 'Code-barres absent';
          } else if (barcodeType === 'ean13') {
            const eanVal = validateEAN13(rawCode);
            if (!eanVal.valid) {
              barcodeStatus = 'invalid';
              failureReason = eanVal.reason;
            }
          }

          resolvedItem.resolvedBarcode = {
            status: barcodeStatus,
            value: rawCode || '',
            barcodeType,
            showText,
            reason: failureReason,
          };

          if (product && !isSample && barcodeStatus !== 'valid') {
            issues.push({
              id: `barcode_${barcodeStatus}_${rawItem.id}`,
              itemId: rawItem.id,
              severity: 'error',
              category: 'barcode',
              message: barcodeStatus === 'invalid'
                ? `Code EAN-13 invalide ("${rawCode}") pour l'article ${prodName}: ${failureReason}`
                : `Code-barres manquant pour l'article ${prodName}.`,
              productIdentifier: prodId,
            });
          }
          break;
        }

        case 'qrcode': {
          const item = rawItem as any;
          const qrVal = PricingEngine.resolveQrContent(item, product, { sample: isSample });
          resolvedItem.resolvedQr = {
            status: qrVal ? 'valid' : 'missing',
            value: qrVal || '',
          };
          break;
        }

        case 'tier_price': {
          const item = rawItem as any;
          if (product) {
            resolvedItem.resolvedTiers = TierEngine.resolve(
              {
                primary_index: Math.max(0, (item.primary_tier || 1) - 1),
                keyword_prefix: item.prefix_text,
                unit_label: item.unit_label,
                strict_required: item.strict_required,
                fallback_to_base_price: item.fallback_to_base_price ?? true,
                pricing_strategy: item.pricing_strategy,
                cross_conditional: item.cross_conditional,
              },
              product
            );
          }
          break;
        }

        default:
          break;
      }

      items.push(resolvedItem);
    }

    const hasErrors = issues.some((i) => i.severity === 'error');

    return {
      templateId: template.id,
      templateName: template.name,
      width_mm: templateW,
      height_mm: templateH,
      productId: prodId,
      productName: prodName,
      items,
      issues,
      passed: !hasErrors,
    };
  }
}
