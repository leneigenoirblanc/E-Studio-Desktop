import jsPDF from 'jspdf';
import { PictogramItemProperties, PictogramType } from '../types';

export interface PictogramColors {
  primary: string;
  secondary?: string;
}

export const NUTRISCORE_COLORS: Record<string, string> = {
  A: '#038141',
  B: '#85bb2f',
  C: '#fecb02',
  D: '#ee8100',
  E: '#e63e11',
};

export const ECOSCORE_COLORS: Record<string, string> = {
  A: '#1e824c',
  B: '#2ecc71',
  C: '#f39c12',
  D: '#e67e22',
  E: '#d35400',
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return [r, g, b];
}

/**
 * Renders a vector pictogram directly onto a jsPDF document instance.
 */
export function drawPictogramPdf(
  doc: jsPDF,
  item: PictogramItemProperties,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const type = item.pictogram_type;

  // Background card
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, w, h, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, 'S');

  if (type.startsWith('nutriscore_')) {
    const activeLetter = type.replace('nutriscore_', '').toUpperCase();
    const letters = ['A', 'B', 'C', 'D', 'E'];

    // Header label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Math.max(4, h * 0.8));
    doc.setTextColor(30, 41, 59);
    doc.text('NUTRI-SCORE', x + w / 2, y + h * 0.28, { align: 'center' });

    // Segment bars
    const barAreaY = y + h * 0.38;
    const barAreaH = h * 0.52;
    const totalBars = 5;
    const barW = w / (totalBars + 0.5);

    letters.forEach((lettr, idx) => {
      const isActive = lettr === activeLetter;
      const [r, g, b] = hexToRgb(NUTRISCORE_COLORS[lettr] || '#94a3b8');
      doc.setFillColor(r, g, b);

      const bH = isActive ? barAreaH : barAreaH * 0.75;
      const bY = barAreaY + (barAreaH - bH);
      const bX = x + (w - barW * totalBars) / 2 + idx * barW;

      doc.rect(bX, bY, barW * 0.9, bH, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isActive ? Math.max(5, bH * 1.8) : Math.max(4, bH * 1.3));
      doc.setTextColor(255, 255, 255);
      doc.text(lettr, bX + (barW * 0.9) / 2, bY + bH * 0.72, { align: 'center' });
    });
    return;
  }

  if (type.startsWith('ecoscore_')) {
    const activeLetter = type.replace('ecoscore_', '').toUpperCase();
    const letters = ['A', 'B', 'C', 'D', 'E'];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Math.max(4, h * 0.75));
    doc.setTextColor(6, 95, 70);
    doc.text('ÉCO-SCORE', x + w / 2, y + h * 0.28, { align: 'center' });

    const barAreaY = y + h * 0.38;
    const barAreaH = h * 0.52;
    const totalBars = 5;
    const barW = w / (totalBars + 0.5);

    letters.forEach((lettr, idx) => {
      const isActive = lettr === activeLetter;
      const [r, g, b] = hexToRgb(ECOSCORE_COLORS[lettr] || '#94a3b8');
      doc.setFillColor(r, g, b);

      const bH = isActive ? barAreaH : barAreaH * 0.75;
      const bY = barAreaY + (barAreaH - bH);
      const bX = x + (w - barW * totalBars) / 2 + idx * barW;

      doc.rect(bX, bY, barW * 0.9, bH, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isActive ? Math.max(5, bH * 1.8) : Math.max(4, bH * 1.3));
      doc.setTextColor(255, 255, 255);
      doc.text(lettr, bX + (barW * 0.9) / 2, bY + bH * 0.72, { align: 'center' });
    });
    return;
  }

  if (type === 'origin_france' || type === 'origin_local') {
    // Flag colors
    const flagW = Math.min(w * 0.35, h * 0.7);
    const flagH = flagW * 0.7;
    const flagX = x + 1;
    const flagY = y + (h - flagH) / 2;
    const colW = flagW / 3;

    // Blue
    doc.setFillColor(0, 35, 149);
    doc.rect(flagX, flagY, colW, flagH, 'F');
    // White
    doc.setFillColor(255, 255, 255);
    doc.rect(flagX + colW, flagY, colW, flagH, 'F');
    // Red
    doc.setFillColor(237, 41, 57);
    doc.rect(flagX + colW * 2, flagY, colW, flagH, 'F');

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.1);
    doc.rect(flagX, flagY, flagW, flagH, 'S');

    // Text label
    const textX = flagX + flagW + 1.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Math.max(4, h * 0.45));
    doc.setTextColor(15, 23, 42);
    doc.text(type === 'origin_france' ? 'FRANCE' : 'LOCALE', textX, y + h * 0.65);
    return;
  }

  if (type === 'bio_ab') {
    doc.setFillColor(21, 128, 61);
    doc.rect(x, y, w, h, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Math.max(6, h * 1.2));
    doc.text('AB', x + w / 2, y + h * 0.65, { align: 'center' });
    return;
  }

  if (type === 'bio_europe') {
    doc.setFillColor(22, 163, 74);
    doc.rect(x, y, w, h, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Math.max(5, h * 0.8));
    doc.text('BIO', x + w / 2, y + h * 0.65, { align: 'center' });
    return;
  }

  if (type === 'triman_recycling') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Math.max(4, h * 0.45));
    doc.setTextColor(15, 23, 42);
    doc.text('TRI BAC JAUNE', x + w / 2, y + h * 0.65, { align: 'center' });
    return;
  }

  if (type.startsWith('allergen_')) {
    const allergenName = type.replace('allergen_', '').toUpperCase();
    doc.setFillColor(254, 243, 199);
    doc.rect(x, y, w, h, 'F');
    doc.setDrawColor(245, 158, 11);
    doc.rect(x, y, w, h, 'S');
    doc.setTextColor(146, 64, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Math.max(4, h * 0.45));
    doc.text(allergenName, x + w / 2, y + h * 0.65, { align: 'center' });
    return;
  }

  // Generic fallback badge
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(Math.max(4, h * 0.45));
  doc.setTextColor(51, 65, 85);
  doc.text(item.custom_label || type, x + w / 2, y + h * 0.65, { align: 'center' });
}
