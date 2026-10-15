import { LabelTemplate, TemplateItem, ProductRecord } from '../types';
import { PricingEngine } from './pricingEngine';
import { validateEAN13 } from './barcodeGenerator';
import { LabelResolutionEngine } from './labelResolutionEngine';

export type PreFlightSeverity = 'error' | 'warning' | 'info';
export type PreFlightCategory = 'geometry' | 'data' | 'barcode' | 'typography' | 'compatibility';
export type PreFlightTarget = 'screen' | 'pdf' | 'zpl' | 'pptx';

export interface PreFlightIssue {
  id: string;
  severity: PreFlightSeverity;
  category: PreFlightCategory;
  message: string;
  itemId?: string;
  field?: string;
}

export type ComputedTemplateStatus = 'ready' | 'warning' | 'draft';

export interface PreFlightReport {
  status: ComputedTemplateStatus;
  errorsCount: number;
  warningsCount: number;
  infosCount: number;
  issues: PreFlightIssue[];
  passed: boolean;
}

export interface BatchPreFlightReport extends PreFlightReport {
  totalProductsChecked: number;
  defectiveProductsCount: number;
}

export class PreFlightEngine {
  /**
   * Evaluates template geometric integrity, required retail bindings,
   * barcode encodability, minimum font sizing, and export target compatibility.
   */
  static analyzeTemplate(
    template: LabelTemplate,
    sampleProduct?: ProductRecord,
    target: PreFlightTarget = 'screen'
  ): PreFlightReport {
    const issues: PreFlightIssue[] = [];

    // 1. Geometric bounds validation
    const width = template.width_mm || 100;
    const height = template.height_mm || 50;
    const margins = template.inner_margins_mm || { top: 0, bottom: 0, left: 0, right: 0 };

    if (template.width_mm <= 0 || template.height_mm <= 0) {
      issues.push({
        id: 'invalid_template_dimensions',
        severity: 'error',
        category: 'geometry',
        message: 'Les dimensions du gabarit sont nulles ou négatives.',
      });
    }

    const minX = margins.left;
    const minY = margins.top;
    const maxX = width - margins.right;
    const maxY = height - margins.bottom;

    if (!template.items || template.items.length === 0) {
      issues.push({
        id: 'no_elements',
        severity: 'error',
        category: 'geometry',
        message: 'Le gabarit ne contient aucun élément graphique ou textuel.',
      });
    }

    let hasPriceElement = false;
    let hasNameElement = false;

    template.items?.forEach((item: TemplateItem) => {
      const itemRight = item.x_mm + item.w_mm;
      const itemBottom = item.y_mm + item.h_mm;
      const label = item.type;

      // Check strict outer label boundary overflow (Critical Error)
      if (item.x_mm < 0 || item.y_mm < 0 || itemRight > width || itemBottom > height) {
        issues.push({
          id: `boundary_overflow_${item.id}`,
          severity: 'error',
          category: 'geometry',
          message: `L'élément "${label}" dépasse la zone physique de l'étiquette (${itemRight.toFixed(1)}x${itemBottom.toFixed(1)} mm pour ${width}x${height} mm).`,
          itemId: item.id,
        });
      } else if (item.x_mm < minX || item.y_mm < minY || itemRight > maxX || itemBottom > maxY) {
        // Safe inner printable margin overflow (Warning)
        issues.push({
          id: `margin_overflow_${item.id}`,
          severity: 'warning',
          category: 'geometry',
          message: `L'élément "${label}" dépasse les marges intérieures sécurisées (${itemRight.toFixed(1)}x${itemBottom.toFixed(1)} mm).`,
          itemId: item.id,
        });
      }

      // Check zero or negative dimensions
      if (item.w_mm <= 0 || item.h_mm <= 0) {
        issues.push({
          id: `zero_dim_${item.id}`,
          severity: 'error',
          category: 'geometry',
          message: `L'élément "${label}" possède une dimension nulle ou négative (${item.w_mm}x${item.h_mm} mm).`,
          itemId: item.id,
        });
      }

      // Typography checks
      if (item.type === 'text') {
        const fontSize = item.font_size_pt || 12;
        if (fontSize < 5) {
          issues.push({
            id: `font_too_small_${item.id}`,
            severity: 'warning',
            category: 'typography',
            message: `Taille de police très réduite (${fontSize} pt) sur l'élément texte. Risque d'illisibilité en rayon.`,
            itemId: item.id,
          });
        }
      }

      // Target compatibility checks
      if (target === 'zpl') {
        const zplUnsupported = ['image', 'rich_text', 'curved_text', 'pictogram', 'tier_price', 'ellipse', 'restricted_area'];
        if (zplUnsupported.includes(item.type)) {
          issues.push({
            id: `zpl_unsupported_${item.id}`,
            severity: 'error',
            category: 'compatibility',
            message: `L'élément de type "${item.type}" n'est pas représentable en impression thermique ZPL.`,
            itemId: item.id,
          });
        }
      } else if (target === 'pdf') {
        const pdfUnsupported = ['rich_text', 'curved_text', 'image', 'restricted_area'];
        if (pdfUnsupported.includes(item.type)) {
          issues.push({
            id: `pdf_unsupported_${item.id}`,
            severity: 'error',
            category: 'compatibility',
            message: `L'élément de type "${item.type}" n'est pas représentable en export PDF vectoriel.`,
            itemId: item.id,
          });
        }
      } else if (target === 'pptx') {
        const pptxUnsupported = ['rich_text', 'curved_text', 'restricted_area'];
        if (pptxUnsupported.includes(item.type)) {
          issues.push({
            id: `pptx_unsupported_${item.id}`,
            severity: 'error',
            category: 'compatibility',
            message: `L'élément de type "${item.type}" n'est pas représentable en export PowerPoint (.pptx).`,
            itemId: item.id,
          });
        }
      }

      // Price field identification
      if (
        item.type === 'price_block' ||
        item.type === 'tier_price' ||
        PricingEngine.isPriceRelated(item) ||
        item.binding_key === 'SELLING_PRICE' ||
        item.binding_key === 'PROMOPRICE'
      ) {
        hasPriceElement = true;
      }

      // Designation / Item Name identification
      if (
        item.binding_key === 'ITEMNAME' ||
        (item.type === 'text' && item.text && item.text.toLowerCase().includes('designation'))
      ) {
        hasNameElement = true;
      }

      // Barcode element checks
      if (item.type === 'barcode') {
        const barcodeType = item.barcode_type || 'ean13';
        const isSample = target === 'screen';
        const rawBarcode = PricingEngine.resolveBarcodeValue(item, sampleProduct, { sample: isSample });

        if (!rawBarcode || rawBarcode.trim().length === 0) {
          if (target !== 'screen') {
            issues.push({
              id: `empty_barcode_${item.id}`,
              severity: 'error',
              category: 'barcode',
              message: `Code-barres vide sur l'élément (${item.binding_key || 'code statique'}).`,
              itemId: item.id,
            });
          }
        } else if (barcodeType === 'ean13') {
          const validation = validateEAN13(rawBarcode);
          if (!validation.valid) {
            issues.push({
              id: `ean_invalid_${item.id}`,
              severity: 'error',
              category: 'barcode',
              message: `Code EAN-13 invalide : ${validation.reason}`,
              itemId: item.id,
            });
          }
        }
      }
    });

    // Mandatory retail price field: Must be present on the label!
    if (!hasPriceElement) {
      issues.push({
        id: 'missing_price',
        severity: 'error',
        category: 'data',
        message: 'Aucun champ de prix (SELLING_PRICE, bloc prix ou palier) lié dans ce gabarit étiquette.',
      });
    }

    // Designation warning
    if (!hasNameElement) {
      issues.push({
        id: 'missing_name',
        severity: 'info',
        category: 'data',
        message: 'Aucun champ de désignation article (ITEMNAME) identifié.',
      });
    }

    // Promo date checks and price presence on product record
    if (sampleProduct) {
      if (hasPriceElement && target !== 'screen') {
        const sp = PricingEngine.getSellingPrice(sampleProduct);
        if (!sp || sp <= 0) {
          issues.push({
            id: 'product_missing_price',
            severity: 'error',
            category: 'data',
            message: `L'article "${sampleProduct.ITEMNAME || sampleProduct.PARTNO || sampleProduct.id || 'sélectionné'}" n'a aucun prix de vente valide (SELLING_PRICE).`,
          });
        }
      }

      const parseDate = (dStr: any): boolean => {
        if (!dStr) return true;
        const s = String(dStr).trim();
        return /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{2}\/\d{2}\/\d{4}/.test(s);
      };

      if (sampleProduct.PROMO_START_DATE && !parseDate(sampleProduct.PROMO_START_DATE)) {
        issues.push({
          id: 'invalid_promo_start_date',
          severity: 'warning',
          category: 'data',
          message: `Date de début de promotion non reconnue ("${sampleProduct.PROMO_START_DATE}", attendu YYYY-MM-DD ou DD/MM/YYYY).`,
        });
      }

      if (sampleProduct.PROMO_END_DATE && !parseDate(sampleProduct.PROMO_END_DATE)) {
        issues.push({
          id: 'invalid_promo_end_date',
          severity: 'warning',
          category: 'data',
          message: `Date de fin de promotion non reconnue ("${sampleProduct.PROMO_END_DATE}", attendu YYYY-MM-DD ou DD/MM/YYYY).`,
        });
      }
    }

    const errorsCount = issues.filter((i) => i.severity === 'error').length;
    const warningsCount = issues.filter((i) => i.severity === 'warning').length;
    const infosCount = issues.filter((i) => i.severity === 'info').length;

    let status: ComputedTemplateStatus = 'ready';
    if (errorsCount > 0) {
      status = 'draft';
    } else if (warningsCount > 0) {
      status = 'warning';
    }

    return {
      status,
      errorsCount,
      warningsCount,
      infosCount,
      issues,
      passed: errorsCount === 0,
    };
  }

  /**
   * Exhaustively evaluates every single product in the batch against the template and target,
   * guaranteeing that product #257 with an absent price or product #1200 with an invalid EAN
   * is detected and blocks the export before any physical job is created.
   */
  static analyzeBatch(
    template: LabelTemplate,
    products: ProductRecord[],
    target: PreFlightTarget = 'screen'
  ): BatchPreFlightReport {
    // 1. Base template structure analysis
    const baseReport = PreFlightEngine.analyzeTemplate(template, products[0], target);
    const issues = [...baseReport.issues];
    let defectiveProductsCount = 0;

    if (!products || products.length === 0) {
      return {
        ...baseReport,
        totalProductsChecked: 0,
        defectiveProductsCount: 0,
      };
    }

    // 2. Iterate through every product in the batch using LabelResolutionEngine
    const maxProductIssuesToReport = 25;
    let productIssuesRecorded = 0;

    for (let idx = 0; idx < products.length; idx++) {
      const p = products[idx];
      const resolved = LabelResolutionEngine.resolveLabel(template, p, target, { sample: false });
      const productErrors = resolved.issues.filter((i) => i.severity === 'error');

      if (productErrors.length > 0) {
        defectiveProductsCount++;
        if (productIssuesRecorded < maxProductIssuesToReport) {
          for (const err of productErrors) {
            const issueId = `${err.id}_p${idx}`;
            if (!issues.some((i) => i.id === issueId)) {
              issues.push({
                id: issueId,
                severity: err.severity,
                category: err.category,
                message: `[Ligne #${idx + 1} - ${p.ITEMNAME || p.PARTNO || p.PRODUCT_SCAN || p.id}] ${err.message}`,
                itemId: err.itemId,
                field: err.productIdentifier,
              });
              productIssuesRecorded++;
            }
          }
        }
      }
    }

    if (defectiveProductsCount > maxProductIssuesToReport) {
      issues.push({
        id: 'overflow_batch_errors',
        severity: 'error',
        category: 'data',
        message: `+ ${defectiveProductsCount - maxProductIssuesToReport} autre(s) article(s) présentant des erreurs bloquantes dans le lot.`,
      });
    }

    const errorsCount = issues.filter((i) => i.severity === 'error').length;
    const warningsCount = issues.filter((i) => i.severity === 'warning').length;
    const infosCount = issues.filter((i) => i.severity === 'info').length;

    let status: ComputedTemplateStatus = 'ready';
    if (errorsCount > 0) {
      status = 'draft';
    } else if (warningsCount > 0) {
      status = 'warning';
    }

    return {
      status,
      errorsCount,
      warningsCount,
      infosCount,
      issues,
      passed: errorsCount === 0,
      totalProductsChecked: products.length,
      defectiveProductsCount,
    };
  }

  /**
   * Fast computed status getter without full report overhead
   */
  static computeTemplateStatus(
    template: LabelTemplate,
    sampleProduct?: ProductRecord,
    target: PreFlightTarget = 'screen'
  ): ComputedTemplateStatus {
    const report = PreFlightEngine.analyzeTemplate(template, sampleProduct, target);
    return report.status;
  }
}
