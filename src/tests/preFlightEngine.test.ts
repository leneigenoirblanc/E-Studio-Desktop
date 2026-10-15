import { describe, it, expect } from 'vitest';
import { PreFlightEngine } from '../utils/preFlightEngine';
import { LabelTemplate, ProductRecord, TemplateItem } from '../types';

describe('PreFlightEngine Unit Tests', () => {
  const baseTemplate: LabelTemplate = {
    id: 'test_tpl',
    name: 'Gabarit Test',
    revision: 1,
    schema_version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    width_mm: 100,
    height_mm: 50,
    inner_margins_mm: { top: 2, bottom: 2, left: 2, right: 2 },
    outer_margins_mm: { top: 1, bottom: 1, left: 1, right: 1 },
    bg_color: '#ffffff',
    bg_opacity: 1,
    items: [
      {
        id: 'price1',
        type: 'text',
        x_mm: 10,
        y_mm: 10,
        w_mm: 40,
        h_mm: 15,
        text: '9,99 €',
        font_family: 'Arial',
        font_size_pt: 14,
        font_weight: 'bold',
        font_style: 'normal',
        text_decoration: 'none',
        alignment: 'left',
        valign: 'middle',
        line_height: 1.2,
        letter_spacing_pt: 0,
        word_wrap: true,
        text_color: '#000000',
        rotation: 0,
        is_price: true,
        binding_key: 'SELLING_PRICE',
      } as unknown as TemplateItem,
      {
        id: 'name1',
        type: 'text',
        x_mm: 10,
        y_mm: 30,
        w_mm: 80,
        h_mm: 10,
        text: 'Article Test',
        font_family: 'Arial',
        font_size_pt: 10,
        font_weight: 'normal',
        font_style: 'normal',
        text_decoration: 'none',
        alignment: 'left',
        valign: 'middle',
        line_height: 1.2,
        letter_spacing_pt: 0,
        word_wrap: true,
        text_color: '#000000',
        rotation: 0,
        binding_key: 'ITEMNAME',
      } as unknown as TemplateItem,
    ],
  };

  const sampleProduct: ProductRecord = {
    id: 'prod1',
    ITEMNAME: 'Chocolat Noir',
    SELLING_PRICE: 2.5,
  };

  it('valid template passes preflight with 0 errors (passed === true)', () => {
    const report = PreFlightEngine.analyzeTemplate(baseTemplate, sampleProduct, 'pdf');
    expect(report.passed).toBe(true);
    expect(report.errorsCount).toBe(0);
    expect(report.status).toBe('ready');
  });

  it('fails if width_mm or height_mm <= 0', () => {
    const invalidTemplate: LabelTemplate = {
      ...baseTemplate,
      width_mm: 0,
    };
    const report = PreFlightEngine.analyzeTemplate(invalidTemplate, sampleProduct, 'screen');
    expect(report.passed).toBe(false);
    expect(report.errorsCount).toBeGreaterThan(0);
    expect(report.issues.some((i) => i.id === 'invalid_template_dimensions')).toBe(true);
  });

  it('fails if an item dimension w_mm <= 0 or h_mm <= 0', () => {
    const invalidItemTemplate: LabelTemplate = {
      ...baseTemplate,
      items: [
        {
          id: 'bad_item',
          type: 'text',
          x_mm: 10,
          y_mm: 10,
          w_mm: 0,
          h_mm: 10,
          text: 'Zero width',
          is_price: true,
        } as unknown as TemplateItem,
      ],
    };
    const report = PreFlightEngine.analyzeTemplate(invalidItemTemplate, sampleProduct, 'screen');
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.id.startsWith('zero_dim_'))).toBe(true);
  });

  it('fails if no price element is bound when target is pdf or zpl', () => {
    const noPriceTemplate: LabelTemplate = {
      ...baseTemplate,
      items: [
        {
          id: 'text_only',
          type: 'text',
          x_mm: 10,
          y_mm: 10,
          w_mm: 50,
          h_mm: 10,
          text: 'Seulement du texte',
          binding_key: 'ITEMNAME',
        } as unknown as TemplateItem,
      ],
    };
    const reportScreen = PreFlightEngine.analyzeTemplate(noPriceTemplate, sampleProduct, 'screen');
    expect(reportScreen.passed).toBe(true);
    expect(reportScreen.status).toBe('warning');

    const reportPdf = PreFlightEngine.analyzeTemplate(noPriceTemplate, sampleProduct, 'pdf');
    expect(reportPdf.passed).toBe(false);
    expect(reportPdf.errorsCount).toBeGreaterThan(0);
    expect(reportPdf.issues.some((i) => i.id === 'missing_price')).toBe(true);
  });

  it('fails if element exceeds label outer boundary', () => {
    const overflowTemplate: LabelTemplate = {
      ...baseTemplate,
      items: [
        {
          id: 'price1',
          type: 'text',
          x_mm: 10,
          y_mm: 10,
          w_mm: 40,
          h_mm: 15,
          text: '9,99 €',
          is_price: true,
        } as unknown as TemplateItem,
        {
          id: 'overflow_item',
          type: 'text',
          x_mm: 90,
          y_mm: 40,
          w_mm: 30,
          h_mm: 10,
          text: 'Depassement',
        } as unknown as TemplateItem,
      ],
    };
    const report = PreFlightEngine.analyzeTemplate(overflowTemplate, sampleProduct, 'screen');
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.id.startsWith('boundary_overflow_'))).toBe(true);
  });

  it('fails for unrepresentable elements on ZPL target', () => {
    const zplTemplateWithRichText: LabelTemplate = {
      ...baseTemplate,
      items: [
        ...baseTemplate.items,
        {
          id: 'rt1',
          type: 'rich_text',
          x_mm: 10,
          y_mm: 35,
          w_mm: 40,
          h_mm: 10,
          default_font_family: 'Arial',
          default_font_size_pt: 10,
          runs: [{ text: 'Texte enrichi', font_size_pt: 10 }],
        } as unknown as TemplateItem,
      ],
    };
    const report = PreFlightEngine.analyzeTemplate(zplTemplateWithRichText, sampleProduct, 'zpl');
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.id.startsWith('zpl_unsupported_'))).toBe(true);
  });
});
