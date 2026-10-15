import { TemplateItem, LabelTemplate, ElementPlacementStrategy } from '../types';

export type { ElementPlacementStrategy };

export interface PlacementParams {
  itemType: TemplateItem['type'] | string;
  w_mm: number;
  h_mm: number;
  template: LabelTemplate;
  strategy?: ElementPlacementStrategy;
  customField?: string;
}

export interface CalculatedPosition {
  x_mm: number;
  y_mm: number;
  strategyUsed: ElementPlacementStrategy;
  reason?: string;
}

/**
 * Checks AABB intersection between two rectangles (with optional safety padding)
 */
function checkOverlap(
  r1: { x: number; y: number; w: number; h: number },
  r2: { x: number; y: number; w: number; h: number },
  paddingMm: number = 1.0
): number {
  const x1 = Math.max(r1.x, r2.x - paddingMm);
  const y1 = Math.max(r1.y, r2.y - paddingMm);
  const x2 = Math.min(r1.x + r1.w, r2.x + r2.w + paddingMm);
  const y2 = Math.min(r1.y + r1.h, r2.y + r2.h + paddingMm);

  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

/**
 * Finds the optimal ergonomic & non-overlapping position on the template canvas
 */
export function calculateDynamicInstantiationPosition(params: PlacementParams): CalculatedPosition {
  const { itemType, w_mm, h_mm, template, strategy = 'ergonomic_smart', customField } = params;

  const tplW = template.width_mm || 80;
  const tplH = template.height_mm || 40;
  const margins = template.inner_margins_mm || { top: 2, right: 2, bottom: 2, left: 2 };

  const minX = margins.left;
  const minY = margins.top;
  const maxX = Math.max(minX, tplW - margins.right - w_mm);
  const maxY = Math.max(minY, tplH - margins.bottom - h_mm);

  const existingItems = template.items || [];

  // 1. FIXED CLASSIC
  if (strategy === 'fixed_classic') {
    return {
      x_mm: minX,
      y_mm: minY,
      strategyUsed: 'fixed_classic',
      reason: 'Position fixe au coin supérieur gauche.',
    };
  }

  // 2. CANVAS CENTER
  if (strategy === 'canvas_center') {
    const cx = Math.max(minX, Math.min(maxX, (tplW - w_mm) / 2));
    const cy = Math.max(minY, Math.min(maxY, (tplH - h_mm) / 2));
    return {
      x_mm: Number(cx.toFixed(2)),
      y_mm: Number(cy.toFixed(2)),
      strategyUsed: 'canvas_center',
      reason: 'Centré sur le gabarit.',
    };
  }

  // 3. SMART CASCADE
  if (strategy === 'smart_cascade') {
    if (existingItems.length === 0) {
      return {
        x_mm: minX + 2,
        y_mm: minY + 2,
        strategyUsed: 'smart_cascade',
        reason: 'Premier élément placé avec marge de sécurité.',
      };
    }

    const lastItem = existingItems[existingItems.length - 1];
    const offsetStep = 4.0; // 4mm diagonal offset
    let nextX = (lastItem.x_mm || minX) + offsetStep;
    let nextY = (lastItem.y_mm || minY) + offsetStep;

    // Wrap around if overflowing template boundary
    if (nextX > maxX) nextX = minX + 2;
    if (nextY > maxY) nextY = minY + 2;

    return {
      x_mm: Number(Math.max(minX, Math.min(maxX, nextX)).toFixed(2)),
      y_mm: Number(Math.max(minY, Math.min(maxY, nextY)).toFixed(2)),
      strategyUsed: 'smart_cascade',
      reason: `Décalage en cascade de +${offsetStep}mm après le dernier élément.`,
    };
  }

  // 4. ZONE SEMANTIC (Standard retail layout slots)
  if (strategy === 'zone_semantic') {
    if (itemType === 'barcode') {
      const x = Math.max(minX, (tplW - w_mm) / 2);
      const y = Math.max(minY, tplH - margins.bottom - h_mm - 1);
      return {
        x_mm: Number(x.toFixed(2)),
        y_mm: Number(y.toFixed(2)),
        strategyUsed: 'zone_semantic',
        reason: 'Zone standard code-barres (bas centré).',
      };
    }
    if (itemType === 'qrcode') {
      const x = Math.max(minX, tplW - margins.right - w_mm - 1);
      const y = Math.max(minY, tplH - margins.bottom - h_mm - 1);
      return {
        x_mm: Number(x.toFixed(2)),
        y_mm: Number(y.toFixed(2)),
        strategyUsed: 'zone_semantic',
        reason: 'Zone standard QR Code (bas droit).',
      };
    }
    if (itemType === 'price' || itemType === 'price_block' || itemType === 'tier_price') {
      const x = Math.max(minX, tplW - margins.right - w_mm - 2);
      const y = Math.max(minY, Math.min(maxY, tplH * 0.4));
      return {
        x_mm: Number(x.toFixed(2)),
        y_mm: Number(y.toFixed(2)),
        strategyUsed: 'zone_semantic',
        reason: 'Zone standard prix (milieu / bas droit).',
      };
    }
    if (itemType === 'text' || itemType === 'rich_text' || itemType === 'curved_text') {
      const x = minX + 1;
      const y = minY + 1;
      return {
        x_mm: Number(x.toFixed(2)),
        y_mm: Number(y.toFixed(2)),
        strategyUsed: 'zone_semantic',
        reason: 'Zone standard titre / désignation (haut gauche).',
      };
    }
  }

  // 5. ERGONOMIC SMART (Default & Most Advanced)
  // Determine ideal ergonomic target zone for the given element type & bound field
  let idealX = minX + 2;
  let idealY = minY + 2;

  const isPrice =
    itemType === 'price' ||
    itemType === 'price_block' ||
    itemType === 'tier_price' ||
    (customField && (customField.includes('PRICE') || customField.includes('PRIX') || customField.includes('TARIF')));

  const isBarcode =
    itemType === 'barcode' ||
    (customField && (customField.includes('EAN') || customField.includes('SCAN') || customField.includes('BARCODE')));

  const isQr = itemType === 'qrcode' || (customField && customField.includes('QR'));

  const isHeader =
    itemType === 'text' &&
    (!customField ||
      customField.includes('NAME') ||
      customField.includes('DESIGNATION') ||
      customField.includes('LIBELLE') ||
      customField.includes('TITRE'));

  const isPromo =
    customField &&
    (customField.includes('PROMO') || customField.includes('DISCOUNT') || customField.includes('REMISE'));

  if (isBarcode) {
    idealX = Math.max(minX, (tplW - w_mm) / 2); // Center horizontally
    idealY = Math.max(minY, tplH - margins.bottom - h_mm - 1); // Bottom zone
  } else if (isQr) {
    idealX = Math.max(minX, tplW - margins.right - w_mm - 1); // Bottom right
    idealY = Math.max(minY, tplH - margins.bottom - h_mm - 1);
  } else if (isPrice) {
    idealX = Math.max(minX, tplW - margins.right - w_mm - 2); // Prominent right side
    idealY = Math.max(minY, Math.min(maxY, tplH * 0.35)); // Mid-lower right
  } else if (isPromo) {
    idealX = Math.max(minX, tplW - margins.right - w_mm - 1); // Top right or mid right
    idealY = Math.max(minY, minY + 1);
  } else if (isHeader) {
    idealX = minX + 1.5;
    idealY = minY + 1.5; // Top left header
  } else {
    // General items, shapes, pictograms, images
    idealX = Math.max(minX, (tplW - w_mm) / 2);
    idealY = Math.max(minY, (tplH - h_mm) / 2);
  }

  // If no existing items, place directly in ideal zone
  if (existingItems.length === 0) {
    return {
      x_mm: Number(idealX.toFixed(2)),
      y_mm: Number(idealY.toFixed(2)),
      strategyUsed: 'ergonomic_smart',
      reason: 'Zone ergonomique optimale pour ce type d\'élément.',
    };
  }

  // Generate candidate grid points inside the safe gabarit boundaries
  const stepMm = 2.0; // 2mm grid steps
  let bestCandidate = { x: idealX, y: idealY, score: Infinity, overlapArea: Infinity };

  // Sample grid across gabarit
  for (let y = minY; y <= maxY; y += stepMm) {
    for (let x = minX; x <= maxX; x += stepMm) {
      const candidateRect = { x, y, w: w_mm, h: h_mm };

      let totalOverlap = 0;
      for (const item of existingItems) {
        const itemRect = { x: item.x_mm, y: item.y_mm, w: item.w_mm, h: item.h_mm };
        totalOverlap += checkOverlap(candidateRect, itemRect, 1.5);
      }

      // Distance from ideal ergonomic target
      const distFromIdeal = Math.hypot(x - idealX, y - idealY);

      // Penalty calculation
      // Overlap is penalized with highest priority (x 1000)
      const score = totalOverlap * 1000 + distFromIdeal;

      if (score < bestCandidate.score) {
        bestCandidate = { x, y, score, overlapArea: totalOverlap };
      }
    }
  }

  // If zero-overlap position found
  if (bestCandidate.overlapArea === 0) {
    return {
      x_mm: Number(bestCandidate.x.toFixed(2)),
      y_mm: Number(bestCandidate.y.toFixed(2)),
      strategyUsed: 'ergonomic_smart',
      reason: 'Emplacement libre détecté sans chevauchement avec les éléments existants.',
    };
  }

  // If canvas is densely packed, use smart staggered cascading so the element is immediately accessible
  const lastItem = existingItems[existingItems.length - 1];
  const cascadeOffset = 5.0;
  let fallbackX = (lastItem.x_mm || minX) + cascadeOffset;
  let fallbackY = (lastItem.y_mm || minY) + cascadeOffset;

  if (fallbackX > maxX) fallbackX = minX + 2;
  if (fallbackY > maxY) fallbackY = minY + 2;

  return {
    x_mm: Number(Math.max(minX, Math.min(maxX, fallbackX)).toFixed(2)),
    y_mm: Number(Math.max(minY, Math.min(maxY, fallbackY)).toFixed(2)),
    strategyUsed: 'ergonomic_smart',
    reason: 'Gabarit dense : décalage étagé dynamique appliqué pour visibilité immédiate.',
  };
}
