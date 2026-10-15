/**
 * Excel & CSV Smart Data Cleaning Utility for E-Studio
 * Automatically cleans ERP reports, strips title banners, subtotal lines, formats prices and barcodes.
 */

export interface CleaningDiagnosticReport {
  healthScore: number; // 0 to 100%
  totalRowsProcessed: number;
  validRowsCount: number;
  reportLinesRemovedCount: number;
  subtotalsRemovedCount: number;
  pricesFixedCount: number;
  barcodesFixedCount: number;
  duplicateBarcodesCount: number;
  missingPriceCount: number;
  missingEanCount: number;
  issues: Array<{ rowIdx: number; colName: string; type: 'warning' | 'error'; message: string }>;
}

export const COMMON_REPORT_BANNER_KEYWORDS = [
  'rapport',
  'societe',
  'entreprise',
  'page 1',
  'page 2',
  'edite le',
  'impression du',
  'bilan',
  'recapitulatif',
  'selection',
  'filtre',
  'periode du',
  'inventaire au',
  'extrait de compte',
];

export const COMMON_SUBTOTAL_KEYWORDS = [
  'total',
  'sous-total',
  'sous total',
  'grand total',
  'report',
  'cumul',
  'recapitulatif',
  'ensemble',
  'moyenne',
];

export const COMMON_HEADER_KEYWORDS = [
  'code',
  'ean',
  'gencod',
  'barcode',
  'article',
  'designation',
  'libelle',
  'nom',
  'product',
  'item',
  'prix',
  'tarif',
  'pu',
  'pv',
  'price',
  'selling_price',
  'promoprice',
  'famille',
  'rayon',
  'categorie',
  'dept',
];

import { PricingEngine } from './pricingEngine';

/**
 * Sanitizes dirty numeric prices ("12,50 €", "12.50€", "12 500 FCFA", "12,50", "12.50 EUR")
 * uses unified PricingEngine.parsePriceNumber logic.
 */
export function sanitizePriceValue(val: any): number {
  return PricingEngine.parsePriceNumber(val);
}

/**
 * Sanitizes barcodes / EAN codes (scientific notation "3.25039E+12", quotes, spaces)
 */
export function sanitizeBarcodeValue(val: any): string {
  if (val === undefined || val === null) return '';

  let str = String(val).trim();
  if (!str) return '';

  // Handle Excel scientific notation (e.g. 3.25039E+12 -> 3250390000000)
  if (/^\d+(\.\d+)?e\+\d+$/i.test(str)) {
    try {
      const num = Number(str);
      if (!isNaN(num)) {
        str = BigInt(Math.round(num)).toString();
      }
    } catch {}
  }

  // Remove leading single quotes, spaces, hyphens
  str = str.replace(/^['"]+/, '').replace(/[\s-]+/g, '');

  return str;
}

/**
 * Auto-detects where actual headers start in a raw 2D array from XLSX
 */
export function detectHeaderAndDataFromMatrix(matrix: any[][]): {
  headers: string[];
  dataRows: any[][];
  skippedTopRowsCount: number;
} {
  if (!matrix || matrix.length === 0) {
    return { headers: [], dataRows: [], skippedTopRowsCount: 0 };
  }

  let bestHeaderRowIdx = 0;
  let maxMatchScore = -1;

  // Search first 12 rows for header density
  const maxSearchIdx = Math.min(12, matrix.length);
  for (let r = 0; r < maxSearchIdx; r++) {
    const row = matrix[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let matchCount = 0;
    row.forEach((cell) => {
      if (cell !== undefined && cell !== null) {
        const strCell = String(cell).toLowerCase().trim();
        if (COMMON_HEADER_KEYWORDS.some((kw) => strCell.includes(kw))) {
          matchCount++;
        }
      }
    });

    if (matchCount > maxMatchScore) {
      maxMatchScore = matchCount;
      bestHeaderRowIdx = r;
    }
  }

  const rawHeaderRow = matrix[bestHeaderRowIdx] || [];
  const headers = rawHeaderRow.map((cell, cIdx) => {
    const cleanCell = cell !== undefined && cell !== null ? String(cell).trim() : '';
    return cleanCell || `Colonne_${cIdx + 1}`;
  });

  const rawData = matrix.slice(bestHeaderRowIdx + 1);

  return {
    headers,
    dataRows: rawData,
    skippedTopRowsCount: bestHeaderRowIdx,
  };
}

/**
 * Filters out ERP subtotal rows, empty lines, and report summary footers
 */
export function isSubtotalOrReportFooterRow(row: any[] | Record<string, any>): boolean {
  const values = Array.isArray(row) ? row : Object.values(row);
  const textContent = values
    .map((v) => (v !== undefined && v !== null ? String(v).toLowerCase().trim() : ''))
    .join(' ');

  if (!textContent.trim()) return true; // Empty row

  return COMMON_SUBTOTAL_KEYWORDS.some((kw) => textContent.includes(kw));
}

/**
 * Automatically cleans raw rows and returns a structured clean object
 */
export function smartAutoCleanRawRows(
  headers: string[],
  rows: any[]
): {
  cleanHeaders: string[];
  cleanRows: Record<string, any>[];
  report: CleaningDiagnosticReport;
} {
  let subtotalsRemovedCount = 0;
  let reportLinesRemovedCount = 0;
  let pricesFixedCount = 0;
  let barcodesFixedCount = 0;
  let duplicateBarcodesCount = 0;
  let missingPriceCount = 0;
  let missingEanCount = 0;

  const seenBarcodes = new Set<string>();
  const cleanRows: Record<string, any>[] = [];
  const issues: CleaningDiagnosticReport['issues'] = [];

  // Identify column roles
  const barcodeCol = headers.find((h) =>
    COMMON_HEADER_KEYWORDS.some((kw) => ['code', 'ean', 'gencod', 'barcode'].includes(kw) && h.toLowerCase().includes(kw))
  );
  const priceCol = headers.find((h) =>
    COMMON_HEADER_KEYWORDS.some((kw) => ['prix', 'tarif', 'pu', 'pv', 'price'].includes(kw) && h.toLowerCase().includes(kw))
  );

  rows.forEach((row, rIdx) => {
    // Check if row is subtotal or report text
    if (isSubtotalOrReportFooterRow(row)) {
      subtotalsRemovedCount++;
      return;
    }

    const cleanRowObj: Record<string, any> = {};
    let isRowEmpty = true;

    headers.forEach((h) => {
      let val = row[h];
      if (val !== undefined && val !== null) {
        if (typeof val === 'string') {
          val = val.trim();
        }
        if (val !== '') isRowEmpty = false;
      }

      // Auto-sanitize barcode if this column is barcode
      if (h === barcodeCol && val) {
        const sanitized = sanitizeBarcodeValue(val);
        if (sanitized !== String(val)) barcodesFixedCount++;
        val = sanitized;
      }

      // Auto-sanitize price if this column is price
      if (h === priceCol && val) {
        const origVal = val;
        const numPrice = sanitizePriceValue(val);
        if (numPrice !== origVal && typeof origVal === 'string') pricesFixedCount++;
        val = numPrice;
      }

      cleanRowObj[h] = val;
    });

    if (isRowEmpty) {
      reportLinesRemovedCount++;
      return;
    }

    // Diagnostics checks
    const barcodeVal = barcodeCol ? cleanRowObj[barcodeCol] : null;
    const priceVal = priceCol ? cleanRowObj[priceCol] : null;

    if (!barcodeVal) {
      missingEanCount++;
      issues.push({
        rowIdx: cleanRows.length,
        colName: barcodeCol || 'EAN',
        type: 'warning',
        message: 'Code-barres ou EAN absent',
      });
    } else if (seenBarcodes.has(String(barcodeVal))) {
      duplicateBarcodesCount++;
      issues.push({
        rowIdx: cleanRows.length,
        colName: barcodeCol || 'EAN',
        type: 'warning',
        message: `Code-barres en double (${barcodeVal})`,
      });
    } else {
      seenBarcodes.add(String(barcodeVal));
    }

    if (priceVal === undefined || priceVal === null || Number(priceVal) <= 0) {
      missingPriceCount++;
      issues.push({
        rowIdx: cleanRows.length,
        colName: priceCol || 'PRIX',
        type: 'warning',
        message: 'Prix de vente nul ou manquant',
      });
    }

    cleanRows.push(cleanRowObj);
  });

  const total = cleanRows.length;
  const validRowsCount = Math.max(0, total - (missingPriceCount + missingEanCount));
  const healthScore = total > 0 ? Math.round((validRowsCount / total) * 100) : 100;

  const report: CleaningDiagnosticReport = {
    healthScore,
    totalRowsProcessed: rows.length,
    validRowsCount,
    reportLinesRemovedCount,
    subtotalsRemovedCount,
    pricesFixedCount,
    barcodesFixedCount,
    duplicateBarcodesCount,
    missingPriceCount,
    missingEanCount,
    issues,
  };

  return {
    cleanHeaders: headers,
    cleanRows,
    report,
  };
}
