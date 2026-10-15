import React, { useMemo } from 'react';
import { LabelTemplate, ProductRecord, TemplateItem, RotationHandleType } from '../types';
import { TierEngine } from '../utils/tierEngine';
import { PricingEngine, isPriceRelatedElement } from '../utils/pricingEngine';
import { generateCode128Bars, generateEAN13Bars, getBarcodeSvgPath } from '../utils/barcodeGenerator';
import { generateQrMatrix, getQrSvgPath } from '../utils/qrGenerator';
import { SmartGuideLine } from '../utils/smartGuides';
import { PictogramRenderer } from './PictogramRenderer';
import { CurvedTextRenderer } from './CurvedTextRenderer';
import { RotateCw } from 'lucide-react';

import { applyBrandDeduplication } from '../utils/dataDrivenTemplateEngine';

interface LabelRendererProps {
  template: LabelTemplate;
  record?: ProductRecord;
  zoom?: number; // scale: 1 = 3.78 px per mm (approx 96 DPI)
  scale?: number; // alias for zoom
  scalePxPerMm?: number;
  showBleed?: boolean;
  showInnerMargins?: boolean;
  showHazardWarnings?: boolean;
  selectedItemId?: string | null;
  selectedItemIds?: string[];
  onSelectItem?: (id: string, e: React.MouseEvent) => void;
  onResizeStart?: (id: string, handle: string, e: React.MouseEvent) => void;
  onRotateStart?: (id: string, e: React.MouseEvent, handlePos?: string) => void;
  onRotateStep90?: (id: string, e: React.MouseEvent) => void;
  rotationHandleType?: RotationHandleType;
  isRotating?: boolean;
  activeRotatingItemId?: string | null;
  activeRotationAngle?: number | null;
  smartGuides?: SmartGuideLine[];
  interactive?: boolean;
  className?: string;
  id?: string;
}

export const LabelRenderer: React.FC<LabelRendererProps> = ({
  template,
  record,
  zoom,
  scale,
  scalePxPerMm = 3.78, // 3.78 px per mm is standard screen DPI
  showBleed = true,
  showInnerMargins = true,
  showHazardWarnings = false,
  selectedItemId = null,
  selectedItemIds,
  onSelectItem,
  onResizeStart,
  onRotateStart,
  onRotateStep90,
  rotationHandleType = 'top_stem',
  isRotating = false,
  activeRotatingItemId = null,
  activeRotationAngle = null,
  smartGuides = [],
  interactive = false,
  className = '',
  id,
}) => {
  const zoomVal = zoom ?? scale ?? 1.0;
  const pxPerMm = scalePxPerMm * zoomVal;

  const widthPx = template.width_mm * pxPerMm;
  const heightPx = template.height_mm * pxPerMm;

  // Printable bounds in mm
  const printableArea = useMemo(() => {
    return {
      left: template.inner_margins_mm.left,
      top: template.inner_margins_mm.top,
      right: template.width_mm - template.inner_margins_mm.right,
      bottom: template.height_mm - template.inner_margins_mm.bottom,
    };
  }, [template]);

  // Check if item exceeds printable area
  const checkHazard = (item: TemplateItem): boolean => {
    return (
      item.x_mm < printableArea.left - 0.1 ||
      item.y_mm < printableArea.top - 0.1 ||
      item.x_mm + item.w_mm > printableArea.right + 0.1 ||
      item.y_mm + item.h_mm > printableArea.bottom + 0.1
    );
  };

  // Check if item overlaps any active restricted area
  const checkRestrictedOverlap = (item: TemplateItem): { isOverlapping: boolean; label: string } => {
    if (item.type === 'restricted_area') return { isOverlapping: false, label: '' };
    const restrictedItems = template.items.filter(
      (it) => it.type === 'restricted_area' && (it as any).warn_on_overlap !== false
    );
    for (const r of restrictedItems) {
      const overlap =
        item.x_mm < r.x_mm + r.w_mm &&
        item.x_mm + item.w_mm > r.x_mm &&
        item.y_mm < r.y_mm + r.h_mm &&
        item.y_mm + item.h_mm > r.y_mm;
      if (overlap) {
        return { isOverlapping: true, label: (r as any).label || 'Zone Restreinte' };
      }
    }
    return { isOverlapping: false, label: '' };
  };

  // Render individual item
  const renderItemContent = (item: TemplateItem) => {
    const itemW = item.w_mm * pxPerMm;
    const itemH = item.h_mm * pxPerMm;

    switch (item.type) {
      case 'text': {
        let displayVal = PricingEngine.resolveCalculatedText(item, record);

        // Check if item is price or bound to a price domain field (ONLY price-related elements can get price/currency attributes)
        const isPriceField = isPriceRelatedElement(item);

        // Alignments
        const textAlignClass =
          item.alignment === 'center'
            ? 'text-center'
            : item.alignment === 'right'
            ? 'text-right'
            : item.alignment === 'justify'
            ? 'text-justify'
            : 'text-left';

        const vAlignClass =
          item.valign === 'middle'
            ? 'justify-center'
            : item.valign === 'bottom'
            ? 'justify-end'
            : 'justify-start';

        // Scale font size proportionally
        const baseFontSizePx = Math.max(7, item.font_size_pt * 1.333 * zoom);

        let mainText = displayVal || item.placeholder || '';
        if (record && record.BRAND_INFO && (item.binding_key === 'ITEMNAME' || item.binding_key === 'ITEMDESCRIPTION')) {
          mainText = applyBrandDeduplication(mainText, record.BRAND_INFO, true);
        }
        if (item.prefix_text) mainText = `${item.prefix_text} ${mainText}`;
        if (item.suffix_text) mainText = `${mainText} ${item.suffix_text}`;
        mainText = PricingEngine.injectNonBreakingSpaces(mainText);

        const letterSpacingPx = item.letter_spacing_pt ? `${item.letter_spacing_pt * 1.333 * zoom}px` : undefined;
        const lineHeightStyle = item.line_height_multiplier ? item.line_height_multiplier : 1.25;
        const textTransform = item.text_transform && item.text_transform !== 'none' ? item.text_transform : undefined;

        // Auto-scale to prevent text box overflow and neighboring element overlap
        const availableBoxWidth = Math.max(16, itemW - 4);
        const estCharWidth = baseFontSizePx * 0.52;
        const approxLines = Math.max(1, Math.ceil((mainText.length * estCharWidth) / availableBoxWidth));
        const estTextHeight = approxLines * (baseFontSizePx * (typeof lineHeightStyle === 'number' ? lineHeightStyle : 1.25));

        let fontSizePx = baseFontSizePx;
        if (estTextHeight > itemH && itemH > 8) {
          const autoShrink = Math.max(0.65, (itemH - 2) / estTextHeight);
          fontSizePx = Math.max(6, Math.round(baseFontSizePx * autoShrink));
        }

        // Shadow styling
        let textShadowStyle: string | undefined = undefined;
        if (item.text_shadow && item.text_shadow.enabled) {
          const s = item.text_shadow;
          textShadowStyle = `${(s.offset_x_px || 1) * zoom}px ${(s.offset_y_px || 1) * zoom}px ${(s.blur_px || 2) * zoom}px ${s.color || '#000000'}`;
        }

        // Currency separate styling (only valid for price-related elements)
        const hasCurrency = isPriceField && Boolean(item.currency_symbol);
        const currencySym = item.currency_symbol || 'FCFA';
        const currFontSizePx = item.currency_font_size_pt
          ? Math.max(5, item.currency_font_size_pt * 1.333 * zoom)
          : Math.max(5, fontSizePx * 0.6);
        const currFontFamily = item.currency_font_family || item.font_family;
        const currFontWeight = item.currency_font_weight || item.font_weight || 'normal';
        const currFontStyle = item.currency_font_style || 'normal';
        const currColor = item.currency_color || item.text_color || '#000000';
        const currSpacingPx = item.currency_spacing_pt ? `${item.currency_spacing_pt * 1.333 * zoom}px` : '4px';
        const currPosition = item.currency_position || 'after';

        const renderCurrencySpan = () => (
          <span
            className="inline-block select-none align-baseline tracking-normal"
            style={{
              fontFamily: currFontFamily,
              fontSize: `${currFontSizePx}px`,
              fontWeight: currFontWeight,
              fontStyle: currFontStyle,
              color: currColor,
              marginLeft: currPosition === 'after' ? currSpacingPx : undefined,
              marginRight: currPosition === 'before' ? currSpacingPx : undefined,
              verticalAlign:
                currPosition === 'superscript'
                  ? 'super'
                  : currPosition === 'subscript'
                  ? 'sub'
                  : 'baseline',
              transform:
                currPosition === 'superscript'
                  ? 'translateY(-20%)'
                  : currPosition === 'subscript'
                  ? 'translateY(15%)'
                  : undefined,
            }}
          >
            {currencySym}
          </span>
        );

        const isSub = item.subscript_superscript === 'subscript';
        const isSuper = item.subscript_superscript === 'superscript';

        return (
          <div
            className={`w-full h-full flex flex-col ${vAlignClass} overflow-hidden p-0.5`}
            style={{
              backgroundColor: item.fill_color || 'transparent',
              border: item.border_width && item.border_width > 0 ? `${item.border_width * zoom}px solid ${item.border_color || '#000'}` : 'none',
              borderRadius: item.corner_radius ? `${item.corner_radius * pxPerMm}px` : undefined,
            }}
          >
            <div
              className={`${textAlignClass} w-full whitespace-pre-wrap break-words leading-tight`}
              style={{
                fontFamily: item.font_family,
                fontSize: `${isSub || isSuper ? fontSizePx * 0.75 : fontSizePx}px`,
                fontWeight: item.font_weight || 'normal',
                fontStyle: item.font_style || 'normal',
                textDecoration: item.text_decoration || 'none',
                textDecorationColor: item.strikethrough_color || item.text_color || '#000000',
                color: item.text_color || '#000000',
                letterSpacing: letterSpacingPx,
                lineHeight: lineHeightStyle,
                textTransform: textTransform as any,
                textShadow: textShadowStyle,
                verticalAlign: isSub ? 'sub' : isSuper ? 'super' : 'baseline',
                transform: isSub ? 'translateY(10%)' : isSuper ? 'translateY(-15%)' : undefined,
              }}
            >
              {hasCurrency && currPosition === 'before' && renderCurrencySpan()}
              <span
                style={{
                  backgroundColor: item.highlight_color && item.highlight_color !== 'transparent' ? item.highlight_color : undefined,
                  padding: item.highlight_color && item.highlight_color !== 'transparent' ? '0 2px' : undefined,
                  borderRadius: '2px',
                }}
              >
                {mainText}
              </span>
              {hasCurrency && (currPosition === 'after' || currPosition === 'superscript' || currPosition === 'subscript') && renderCurrencySpan()}
            </div>
          </div>
        );
      }

      case 'rich_text': {
        const vAlignClass =
          item.valign === 'bottom'
            ? 'justify-end'
            : item.valign === 'middle'
            ? 'justify-center'
            : 'justify-start';

        const textAlignClass =
          item.alignment === 'center'
            ? 'text-center'
            : item.alignment === 'right'
            ? 'text-right'
            : item.alignment === 'justify'
            ? 'text-justify'
            : 'text-left';

        const defaultFontSizePx = Math.max(7, (item.default_font_size_pt || 11) * 1.333 * zoom);
        const runs = Array.isArray(item.runs) ? item.runs : [];

        return (
          <div className={`w-full h-full flex flex-col ${vAlignClass} overflow-hidden p-0.5 select-none`}>
            <div
              className={`${textAlignClass} w-full leading-tight`}
              style={{
                fontFamily: item.font_family || 'Plus Jakarta Sans',
                lineHeight: item.line_height_multiplier ? `${item.line_height_multiplier}` : '1.25',
                whiteSpace: item.wrap !== false ? 'normal' : 'nowrap',
                wordBreak: 'break-word',
              }}
            >
              {runs.map((run, idx) => {
                let runText = run.text || '';
                if (run.binding_key) {
                  const resolvedVal = record
                    ? PricingEngine.getProductFieldValue(record, run.binding_key)
                    : `[${run.binding_key}]`;
                  runText = resolvedVal !== undefined && resolvedVal !== null ? String(resolvedVal) : '';
                }
                runText = PricingEngine.injectNonBreakingSpaces(runText);

                const runSizePx = run.font_size_pt
                  ? Math.max(6, run.font_size_pt * 1.333 * zoom)
                  : defaultFontSizePx;

                const isSuper = run.baseline_shift === 'superscript';
                const isSub = run.baseline_shift === 'subscript';

                return (
                  <span
                    key={run.id || idx}
                    style={{
                      fontSize: `${isSuper || isSub ? runSizePx * 0.75 : runSizePx}px`,
                      fontWeight: run.font_weight || 'normal',
                      fontStyle: run.font_style || 'normal',
                      textDecoration: run.text_decoration || 'none',
                      color: run.text_color || item.default_text_color || '#000000',
                      backgroundColor: run.highlight_color || undefined,
                      padding: run.highlight_color ? '0 2px' : undefined,
                      borderRadius: run.highlight_color ? '2px' : undefined,
                      verticalAlign: isSuper ? 'super' : isSub ? 'sub' : 'baseline',
                    }}
                  >
                    {runText}
                  </span>
                );
              })}
            </div>
          </div>
        );
      }

      case 'price_block': {
        const vAlignClass =
          item.valign === 'bottom'
            ? 'justify-end'
            : item.valign === 'middle'
            ? 'justify-center'
            : 'justify-start';

        const textAlignClass =
          item.alignment === 'center'
            ? 'justify-center text-center'
            : item.alignment === 'right'
            ? 'justify-end text-right'
            : 'justify-start text-left';

        // Resolve raw price: do not invent fallback_price when a real product record is passed
        let rawPrice: any = !record ? (item.fallback_price ?? 29.99) : undefined;
        if (record) {
          if (item.binding_key) {
            const val = PricingEngine.getProductFieldValue(record, item.binding_key);
            if (val !== undefined && val !== null && val !== '') {
              rawPrice = val;
            }
          } else {
            rawPrice = PricingEngine.getSellingPrice(record);
          }
        }

        // If product record exists but has no price bound or price is empty, do not display fake 0,00
        if (record && (rawPrice === undefined || rawPrice === null || rawPrice === '')) {
          return null;
        }

        const currencySym = item.currency_symbol || '€';
        const decimals = /FCFA|CFA|GNF|XOF|XAF/i.test(currencySym) ? 0 : 2;
        const separator = item.decimal_separator ?? ',';
        const { integerPart, decimalPart } = PricingEngine.splitPrice(rawPrice, separator, decimals);

        const intSizePt = item.integer_style?.font_size_pt || 28;
        const decSizePt = item.decimal_style?.font_size_pt || Math.max(9, Math.round(intSizePt * 0.52));
        const currSizePt = item.currency_style?.font_size_pt || Math.max(9, Math.round(intSizePt * 0.48));

        const baseIntSizePx = Math.max(10, intSizePt * 1.333 * zoom);
        const baseDecSizePx = Math.max(7, decSizePt * 1.333 * zoom);
        const baseCurrSizePx = Math.max(7, currSizePt * 1.333 * zoom);
        const currPos = item.currency_position || 'after';
        const decShift = item.decimal_style?.baseline_shift || 'superscript';

        // Auto-scale to guarantee price never wraps or overflows
        const estIntWidth = String(integerPart).length * (baseIntSizePx * 0.60);
        const estDecWidth = decimalPart ? (String(decimalPart).length * (baseDecSizePx * 0.60)) + 6 : 0;
        const estCurrWidth = currencySym ? (baseCurrSizePx * 0.70 * currencySym.length) + 6 : 0;
        const totalEstPriceWidth = estIntWidth + estDecWidth + estCurrWidth;
        const availableW = Math.max(16, itemW - 4);

        const priceScale = totalEstPriceWidth > availableW ? Math.max(0.55, availableW / totalEstPriceWidth) : 1;
        const intSizePx = Math.max(8, Math.round(baseIntSizePx * priceScale));
        const decSizePx = Math.max(6, Math.round(baseDecSizePx * priceScale));
        const currSizePx = Math.max(6, Math.round(baseCurrSizePx * priceScale));

        return (
          <div className={`w-full h-full flex flex-col ${vAlignClass} overflow-hidden p-0.5 select-none`}>
            <div
              className={`w-full flex items-baseline leading-none flex-nowrap whitespace-nowrap ${textAlignClass}`}
              style={{ fontFamily: item.font_family || 'Plus Jakarta Sans' }}
            >
              {/* Currency Before */}
              {currencySym && currPos === 'before' && (
                <span
                  className="mr-1 inline-block"
                  style={{
                    fontSize: `${currSizePx}px`,
                    fontWeight: item.currency_style?.font_weight || 'bold',
                    color: item.currency_style?.text_color || item.integer_style?.text_color || '#000000',
                  }}
                >
                  {currencySym}
                </span>
              )}

              {/* Integer Part */}
              <span
                className="font-mono tracking-tight"
                style={{
                  fontSize: `${intSizePx}px`,
                  fontWeight: item.integer_style?.font_weight || 'bold',
                  color: item.integer_style?.text_color || '#000000',
                  letterSpacing: '-0.03em',
                }}
              >
                {integerPart}
              </span>

              {/* Centimes / Decimal Part with Floating Shift */}
              <div
                className="inline-flex items-baseline font-mono ml-0.5"
                style={{
                  alignSelf: decShift === 'superscript' ? 'flex-start' : 'baseline',
                  transform: decShift === 'superscript' ? 'translateY(12%)' : undefined,
                }}
              >
                <span
                  style={{
                    fontSize: `${decSizePx}px`,
                    fontWeight: item.decimal_style?.font_weight || 'bold',
                    color: item.decimal_style?.text_color || item.integer_style?.text_color || '#000000',
                  }}
                >
                  {separator}
                </span>
                <span
                  style={{
                    fontSize: `${decSizePx}px`,
                    fontWeight: item.decimal_style?.font_weight || 'bold',
                    color: item.decimal_style?.text_color || item.integer_style?.text_color || '#000000',
                  }}
                >
                  {decimalPart}
                </span>
              </div>

              {/* Currency After / Superscript */}
              {currencySym && (currPos === 'after' || currPos === 'superscript') && (
                <span
                  className="ml-1 inline-block"
                  style={{
                    fontSize: `${currSizePx}px`,
                    fontWeight: item.currency_style?.font_weight || 'bold',
                    color: item.currency_style?.text_color || item.integer_style?.text_color || '#000000',
                    alignSelf: currPos === 'superscript' ? 'flex-start' : 'baseline',
                    transform: currPos === 'superscript' ? 'translateY(8%)' : undefined,
                  }}
                >
                  {currencySym}
                </span>
              )}
            </div>
          </div>
        );
      }

      case 'restricted_area': {
        const zoneColor = item.zone_color || '#ef4444';
        const opacity = item.opacity ?? 0.25;
        const pattern = item.pattern || 'diagonal_stripes';

        let backgroundPattern = 'transparent';
        if (pattern === 'diagonal_stripes') {
          backgroundPattern = `repeating-linear-gradient(45deg, ${zoneColor} 0, ${zoneColor} 6px, transparent 6px, transparent 12px)`;
        } else if (pattern === 'cross') {
          backgroundPattern = `repeating-linear-gradient(45deg, ${zoneColor} 0, ${zoneColor} 2px, transparent 2px, transparent 8px), repeating-linear-gradient(-45deg, ${zoneColor} 0, ${zoneColor} 2px, transparent 2px, transparent 8px)`;
        } else if (pattern === 'solid') {
          backgroundPattern = zoneColor;
        }

        return (
          <div
            className="w-full h-full relative border border-dashed flex flex-col items-center justify-center p-1 select-none overflow-hidden"
            style={{
              borderColor: zoneColor,
              backgroundColor: pattern === 'solid' ? zoneColor : `${zoneColor}15`,
              opacity: opacity,
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: backgroundPattern,
                opacity: 0.8,
              }}
            />
            <div
              className="relative z-10 bg-slate-900/80 text-white px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase shadow-xs text-center truncate max-w-full"
              style={{ fontSize: `${Math.max(7, 7.5 * zoom)}px` }}
            >
              🚫 {item.label || 'Zone Restreinte'}
            </div>
          </div>
        );
      }

      case 'shape': {
        return (
          <div
            className="w-full h-full"
            style={{
              backgroundColor: item.fill_color || '#FFFFFF',
              border: `${Math.max(1, (item.border_width || 1) * zoom)}px solid ${item.border_color || '#000000'}`,
              borderRadius: item.corner_radius ? `${item.corner_radius * pxPerMm}px` : '0px',
            }}
          />
        );
      }

      case 'ellipse': {
        return (
          <div
            className="w-full h-full rounded-full"
            style={{
              backgroundColor: item.fill_color || 'transparent',
              border: `${Math.max(1, (item.border_width || 1) * zoom)}px solid ${item.border_color || '#000000'}`,
            }}
          />
        );
      }

      case 'line': {
        const strokeW = Math.max(1, (item.thickness || 1) * zoom);
        return (
          <div className="w-full h-full flex items-center">
            <div
              className="w-full"
              style={{
                height: `${strokeW}px`,
                backgroundColor: item.style === 'solid' ? item.color : 'transparent',
                borderTop: item.style !== 'solid' ? `${strokeW}px ${item.style} ${item.color}` : 'none',
              }}
            />
          </div>
        );
      }

      case 'barcode': {
        const code = PricingEngine.resolveBarcodeValue(item, record, { sample: !record });
        const isEan13 = item.barcode_type === 'ean13';
        let barElements: React.ReactNode = null;

        try {
          if (isEan13) {
            let res;
            try {
              res = generateEAN13Bars(code);
            } catch {
              res = { bars: generateCode128Bars(code), formattedCode: code };
            }
            const { bars, formattedCode } = res;
            const totalBars = bars.length;
            const barW = itemW / totalBars;
            const barH = item.show_text ? Math.max(10, itemH - 12 * zoom) : itemH;

            barElements = (
              <div className="w-full h-full flex flex-col items-center justify-center bg-white px-1 py-0.5 select-none">
                <svg
                  width={itemW}
                  height={barH}
                  viewBox={`0 0 ${totalBars} 100`}
                  preserveAspectRatio="none"
                  className="w-full"
                  shapeRendering="crispEdges"
                >
                  <path d={getBarcodeSvgPath(bars, 100)} fill={item.bar_color || '#000000'} />
                </svg>
                {item.show_text && (
                  <span
                    className="font-mono tracking-widest text-slate-800 leading-none pt-0.5"
                    style={{ fontSize: `${Math.max(8, 8.5 * zoom)}px` }}
                  >
                    {formattedCode}
                  </span>
                )}
              </div>
            );
          } else {
            const bars = generateCode128Bars(code);
            const totalBars = bars.length;
            const barH = item.show_text ? Math.max(10, itemH - 12 * zoom) : itemH;

            barElements = (
              <div className="w-full h-full flex flex-col items-center justify-center bg-white px-1 py-0.5 select-none">
                <svg
                  width={itemW}
                  height={barH}
                  viewBox={`0 0 ${totalBars} 100`}
                  preserveAspectRatio="none"
                  className="w-full"
                  shapeRendering="crispEdges"
                >
                  <path d={getBarcodeSvgPath(bars, 100)} fill={item.bar_color || '#000000'} />
                </svg>
                {item.show_text && (
                  <span
                    className="font-mono tracking-wider text-slate-800 leading-none pt-0.5"
                    style={{ fontSize: `${Math.max(8, 8.5 * zoom)}px` }}
                  >
                    {code}
                  </span>
                )}
              </div>
            );
          }
        } catch {
          barElements = (
            <div className="w-full h-full flex items-center justify-center bg-amber-50 text-amber-800 border border-amber-300 text-xs text-center p-1">
              [Code-barres: {code}]
            </div>
          );
        }

        return barElements;
      }

      case 'qrcode': {
        const content = PricingEngine.resolveQrContent(item, record, { sample: !record });
        const matrix = generateQrMatrix(content);

        return (
          <div
            className="w-full h-full flex items-center justify-center p-1"
            style={{ backgroundColor: item.background_color || '#FFFFFF' }}
          >
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full"
              shapeRendering="crispEdges"
            >
              <path d={getQrSvgPath(matrix)} fill={item.module_color || '#000000'} />
            </svg>
          </div>
        );
      }

      case 'image': {
        let src = item.source;
        if (record && item.binding_key && record[item.binding_key]) {
          src = String(record[item.binding_key]);
        }

        if (src) {
          return (
            <img
              src={src}
              alt=""
              className="w-full h-full"
              style={{
                objectFit: item.keep_aspect_ratio ? 'contain' : 'fill',
                opacity: item.opacity ?? 1,
              }}
              referrerPolicy="no-referrer"
            />
          );
        }

        return (
          <div className="w-full h-full border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400 text-xs p-1 select-none">
            [ Image ]
          </div>
        );
      }

      case 'tier_price': {
        // Resolve tier price block using TierEngine
        let tierText = `[${item.prefix_text}] Palier #${item.primary_tier} (${item.unit_label})`;
        let isFallback = false;
        let isError = false;
        let strategy = item.pricing_strategy || 'flat';
        let crossConditionMet = true;

        if (record) {
          const resolved = TierEngine.resolve(
            {
              primary_index: Math.max(0, item.primary_tier - 1),
              keyword_prefix: item.prefix_text,
              unit_label: item.unit_label,
              strict_required: item.strict_required,
              fallback_to_base_price: item.fallback_to_base_price ?? true,
              pricing_strategy: item.pricing_strategy,
              cross_conditional: item.cross_conditional,
            },
            record
          );

          if (resolved) {
            strategy = resolved.strategy || strategy;
            if (resolved.cross_conditional_met !== undefined) {
              crossConditionMet = resolved.cross_conditional_met;
            }
            if (resolved.error) {
              tierText = resolved.text_qty;
              isError = true;
            } else {
              isFallback = resolved.is_fallback;
              tierText = `${resolved.text_qty} : ${resolved.formatted_price}${isFallback ? ' (base)' : ''}`;
            }
          }
        }

        // Default fallbacks based on status
        const defaultBg = isError || !crossConditionMet
          ? '#fef2f2' // rose-50
          : isFallback
          ? '#fffbeb' // amber-50
          : '#f0f9ff'; // sky-50

        const defaultBorderColor = isError || !crossConditionMet
          ? '#fca5a5' // rose-300
          : isFallback
          ? '#fcd34d' // amber-300
          : '#bae6fd'; // sky-300

        const defaultTextColor = isError || !crossConditionMet
          ? '#991b1b' // rose-800
          : isFallback
          ? '#78350f' // amber-900
          : '#082f49'; // sky-950

        const bgColor = item.fill_color || defaultBg;
        const borderColor = item.border_color || defaultBorderColor;
        const borderStyle = item.border_width && item.border_width > 0 
          ? `${item.border_width * zoom}px solid ${borderColor}`
          : `1px solid ${borderColor}`;
        const textColor = item.text_color || defaultTextColor;
        const borderRadius = item.corner_radius !== undefined 
          ? `${item.corner_radius * pxPerMm}px` 
          : '4px';

        // Scale font size proportionally
        const baseFontSizePx = item.font_size_pt 
          ? Math.max(7, item.font_size_pt * 1.333 * zoom) 
          : Math.max(7.5, 8.5 * zoom);

        const letterSpacingPx = item.letter_spacing_pt ? `${item.letter_spacing_pt * 1.333 * zoom}px` : undefined;
        const lineHeightStyle = item.line_height_multiplier ? item.line_height_multiplier : 1.2;
        const textTransform = item.text_transform && item.text_transform !== 'none' ? item.text_transform : undefined;

        // Shadow styling
        let textShadowStyle: string | undefined = undefined;
        if (item.text_shadow && item.text_shadow.enabled) {
          const s = item.text_shadow;
          textShadowStyle = `${(s.offset_x_px || 1) * zoom}px ${(s.offset_y_px || 1) * zoom}px ${(s.blur_px || 2) * zoom}px ${s.color || '#000000'}`;
        }

        const justifyClass = item.alignment === 'center'
          ? 'justify-center'
          : item.alignment === 'right'
          ? 'justify-end'
          : 'justify-between';

        const alignSelfClass = item.valign === 'middle'
          ? 'items-center'
          : item.valign === 'bottom'
          ? 'items-end'
          : 'items-start';

        return (
          <div
            className={`w-full h-full flex ${alignSelfClass} ${justifyClass} px-2 py-1 transition-colors overflow-hidden`}
            style={{
              backgroundColor: bgColor,
              border: borderStyle,
              borderRadius: borderRadius,
            }}
          >
            <div className={`flex items-center gap-1.5 truncate ${item.alignment === 'center' ? 'justify-center w-full' : item.alignment === 'right' ? 'justify-end w-full' : ''}`}>
              <span
                style={{
                  fontFamily: item.font_family,
                  fontSize: `${baseFontSizePx}px`,
                  fontWeight: item.font_weight || 'bold',
                  fontStyle: item.font_style || 'normal',
                  textDecoration: item.text_decoration || 'none',
                  textDecorationColor: item.strikethrough_color || textColor,
                  color: textColor,
                  letterSpacing: letterSpacingPx,
                  lineHeight: lineHeightStyle,
                  textTransform: textTransform as any,
                  textShadow: textShadowStyle,
                  backgroundColor: item.highlight_color && item.highlight_color !== 'transparent' ? item.highlight_color : undefined,
                  padding: item.highlight_color && item.highlight_color !== 'transparent' ? '0 2px' : undefined,
                  borderRadius: '2px',
                }}
                className="truncate tracking-tight"
              >
                {tierText}
              </span>
              <span
                className={`text-[9px] px-1 py-0.2 rounded font-semibold uppercase tracking-wider shrink-0 ${
                  strategy === 'graduated'
                    ? 'bg-indigo-100/80 text-indigo-700'
                    : 'bg-sky-100/80 text-sky-700'
                }`}
              >
                {strategy === 'graduated' ? 'Cumulatif' : 'Volume'}
              </span>
            </div>
            {item.strict_required && !record && (
              <span className="text-rose-500 font-bold ml-1 text-xs shrink-0">*</span>
            )}
          </div>
        );
      }

      case 'curved_text':
        return <CurvedTextRenderer item={item} pxPerMm={pxPerMm} />;

      case 'pictogram':
        return <PictogramRenderer item={item} pxPerMm={pxPerMm} />;

      default:
        return null;
    }
  };

  return (
    <div
      id={id}
      className={`relative select-none shadow-sm transition-shadow ${className}`}
      style={{
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        backgroundColor: template.bg_color || '#FFFFFF',
        opacity: template.bg_opacity ?? 1.0,
      }}
    >
      {/* Background Reference Image (Non-printing guide) */}
      {template.background_image_path && template.background_image_visible && (
        <img
          src={template.background_image_path}
          alt="Reference Background"
          className="absolute inset-0 w-full h-full pointer-events-none z-0 select-none"
          style={{
            objectFit: template.background_image_fit === 'stretch' ? 'fill' : template.background_image_fit || 'contain',
            opacity: template.background_image_opacity ?? 0.35,
          }}
          referrerPolicy="no-referrer"
        />
      )}

      {/* Calibration Reference Image (Adjust disposition relative to real print zone) */}
      {template.calibration_image && template.calibration_image.visible && template.calibration_image.url && (
        <div
          className="absolute inset-0 pointer-events-none z-5 overflow-hidden select-none"
          style={{
            opacity: template.calibration_image.opacity ?? 0.5,
          }}
        >
          <img
            src={template.calibration_image.url}
            alt="Calibration Overlay"
            className="absolute pointer-events-none"
            style={{
              left: `${(template.calibration_image.offset_x_mm || 0) * pxPerMm}px`,
              top: `${(template.calibration_image.offset_y_mm || 0) * pxPerMm}px`,
              width: `${(template.width_mm * ((template.calibration_image.scale_pct || 100) / 100)) * pxPerMm}px`,
              height: 'auto',
              transformOrigin: 'top left',
            }}
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      {/* Inner Printable Margins boundary guide */}
      {showInnerMargins && (
        <div
          className="absolute pointer-events-none border border-dashed border-sky-400/50 z-10"
          style={{
            top: `${template.inner_margins_mm.top * pxPerMm}px`,
            left: `${template.inner_margins_mm.left * pxPerMm}px`,
            right: `${template.inner_margins_mm.right * pxPerMm}px`,
            bottom: `${template.inner_margins_mm.bottom * pxPerMm}px`,
          }}
        />
      )}

      {/* Outer Bleed Margins (if enabled) */}
      {showBleed && (
        <div
          className="absolute pointer-events-none border border-dotted border-rose-300/40 -inset-[1px] z-10"
        />
      )}

      {/* Template Items */}
      {template.items
        .slice()
        .filter((item) => !record || PricingEngine.shouldDisplayItem(item, record))
        .sort((a, b) => (a.z_index || 0) - (b.z_index || 0))
        .map((item) => {
          const isSelected =
            (selectedItemIds && selectedItemIds.includes(item.id)) ||
            selectedItemId === item.id;
          const isHazard = showHazardWarnings && checkHazard(item);
          const restrictedOverlap = checkRestrictedOverlap(item);

          // Finish effects
          const isDieCut = item.finish_effect === 'die_cut';
          const isSpotVarnish = item.finish_effect === 'spot_varnish';
          const isHotFoil = item.finish_effect === 'hot_foil';

          return (
            <div
              key={item.id}
              id={`canvas-item-${item.id}`}
              data-item-id={item.id}
              onMouseDown={(e) => {
                if (interactive && onSelectItem) {
                  e.stopPropagation();
                  onSelectItem(item.id, e);
                }
              }}
              className={`absolute cursor-pointer transition-transform ${
                interactive ? 'hover:outline hover:outline-1 hover:outline-sky-400' : ''
              } ${
                isSelected
                  ? 'outline-2 outline-blue-600 outline-dashed ring-2 ring-blue-500/20 z-40'
                  : ''
              } ${restrictedOverlap.isOverlapping ? 'ring-2 ring-rose-500/60' : ''} ${
                isDieCut ? 'border-2 border-dashed border-fuchsia-500 shadow-xs' : ''
              } ${
                isSpotVarnish ? 'ring-2 ring-amber-400/80 shadow-[inset_0_0_12px_rgba(251,191,36,0.35)]' : ''
              } ${
                isHotFoil ? 'ring-2 ring-yellow-500 bg-gradient-to-tr from-amber-100/10 via-yellow-200/20 to-amber-100/10' : ''
              }`}
              style={{
                left: `${item.x_mm * pxPerMm}px`,
                top: `${item.y_mm * pxPerMm}px`,
                width: `${item.w_mm * pxPerMm}px`,
                height: `${item.h_mm * pxPerMm}px`,
                transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
                transformOrigin: 'center center',
                zIndex: isSelected ? 50 : item.z_index || 1,
              }}
            >
              {renderItemContent(item)}

              {/* Hazard Warning Overlay when outside printable area */}
              {isHazard && (
                <div
                  className="absolute inset-0 pointer-events-none border-2 border-rose-500 bg-rose-500/20 flex items-center justify-center animate-pulse z-30"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.3) 0, rgba(239, 68, 68, 0.3) 8px, transparent 8px, transparent 16px)',
                  }}
                  title="Attention: cet élément déborde de la zone imprimable !"
                />
              )}

              {/* Restricted Area Collision Alert Badge */}
              {restrictedOverlap.isOverlapping && (
                <div
                  className="absolute -top-3.5 left-0 z-40 bg-rose-600 text-white text-[8px] font-bold px-1.5 py-0.2 rounded shadow pointer-events-none whitespace-nowrap animate-bounce"
                  title={`Collision avec: ${restrictedOverlap.label}`}
                >
                  ⚠️ Zone Restreinte
                </div>
              )}

              {/* Selection resize handles - Geometric Plus '+' with longer faded extremities & thin circle at intersection */}
              {isSelected && interactive && !item.locked && (
                <>
                  {/* Top-Left NW */}
                  <div
                    onMouseDown={(e) => {
                      if (onResizeStart) {
                        e.stopPropagation();
                        onResizeStart(item.id, 'nw', e);
                      }
                    }}
                    className="absolute -top-3 -left-3 w-6 h-6 flex items-center justify-center cursor-nwse-resize z-50 group pointer-events-auto select-none"
                    title="Redimensionner NO (Haut-Gauche)"
                  >
                    <svg className="w-6 h-6 overflow-visible transition-transform duration-100 group-hover:scale-125" viewBox="0 0 24 24">
                      <defs>
                        <linearGradient id="fade-h-nw" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#2563eb" stopOpacity="0" />
                          <stop offset="50%" stopColor="#2563eb" stopOpacity="1" />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="fade-v-nw" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#2563eb" stopOpacity="0" />
                          <stop offset="50%" stopColor="#2563eb" stopOpacity="1" />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <line x1="2" y1="12" x2="22" y2="12" stroke="url(#fade-h-nw)" strokeWidth="1.75" strokeLinecap="round" />
                      <line x1="12" y1="2" x2="12" y2="22" stroke="url(#fade-v-nw)" strokeWidth="1.75" strokeLinecap="round" />
                      <circle cx="12" cy="12" r="3.2" fill="#ffffff" stroke="#2563eb" strokeWidth="1.5" className="group-hover:fill-blue-50" />
                      <circle cx="12" cy="12" r="1.2" fill="#2563eb" />
                    </svg>
                  </div>

                  {/* Top-Right NE */}
                  <div
                    onMouseDown={(e) => {
                      if (onResizeStart) {
                        e.stopPropagation();
                        onResizeStart(item.id, 'ne', e);
                      }
                    }}
                    className="absolute -top-3 -right-3 w-6 h-6 flex items-center justify-center cursor-nesw-resize z-50 group pointer-events-auto select-none"
                    title="Redimensionner NE (Haut-Droite)"
                  >
                    <svg className="w-6 h-6 overflow-visible transition-transform duration-100 group-hover:scale-125" viewBox="0 0 24 24">
                      <line x1="2" y1="12" x2="22" y2="12" stroke="url(#fade-h-nw)" strokeWidth="1.75" strokeLinecap="round" />
                      <line x1="12" y1="2" x2="12" y2="22" stroke="url(#fade-v-nw)" strokeWidth="1.75" strokeLinecap="round" />
                      <circle cx="12" cy="12" r="3.2" fill="#ffffff" stroke="#2563eb" strokeWidth="1.5" className="group-hover:fill-blue-50" />
                      <circle cx="12" cy="12" r="1.2" fill="#2563eb" />
                    </svg>
                  </div>

                  {/* Bottom-Left SW */}
                  <div
                    onMouseDown={(e) => {
                      if (onResizeStart) {
                        e.stopPropagation();
                        onResizeStart(item.id, 'sw', e);
                      }
                    }}
                    className="absolute -bottom-3 -left-3 w-6 h-6 flex items-center justify-center cursor-nesw-resize z-50 group pointer-events-auto select-none"
                    title="Redimensionner SO (Bas-Gauche)"
                  >
                    <svg className="w-6 h-6 overflow-visible transition-transform duration-100 group-hover:scale-125" viewBox="0 0 24 24">
                      <line x1="2" y1="12" x2="22" y2="12" stroke="url(#fade-h-nw)" strokeWidth="1.75" strokeLinecap="round" />
                      <line x1="12" y1="2" x2="12" y2="22" stroke="url(#fade-v-nw)" strokeWidth="1.75" strokeLinecap="round" />
                      <circle cx="12" cy="12" r="3.2" fill="#ffffff" stroke="#2563eb" strokeWidth="1.5" className="group-hover:fill-blue-50" />
                      <circle cx="12" cy="12" r="1.2" fill="#2563eb" />
                    </svg>
                  </div>

                  {/* Bottom-Right SE */}
                  <div
                    onMouseDown={(e) => {
                      if (onResizeStart) {
                        e.stopPropagation();
                        onResizeStart(item.id, 'se', e);
                      }
                    }}
                    className="absolute -bottom-3 -right-3 w-6 h-6 flex items-center justify-center cursor-nwse-resize z-50 group pointer-events-auto select-none"
                    title="Redimensionner SE (Bas-Droite)"
                  >
                    <svg className="w-6 h-6 overflow-visible transition-transform duration-100 group-hover:scale-125" viewBox="0 0 24 24">
                      <line x1="2" y1="12" x2="22" y2="12" stroke="url(#fade-h-nw)" strokeWidth="1.75" strokeLinecap="round" />
                      <line x1="12" y1="2" x2="12" y2="22" stroke="url(#fade-v-nw)" strokeWidth="1.75" strokeLinecap="round" />
                      <circle cx="12" cy="12" r="3.2" fill="#ffffff" stroke="#2563eb" strokeWidth="1.5" className="group-hover:fill-blue-50" />
                      <circle cx="12" cy="12" r="1.2" fill="#2563eb" />
                    </svg>
                  </div>

                  {/* Middle-Top N */}
                  <div
                    onMouseDown={(e) => {
                      if (onResizeStart) {
                        e.stopPropagation();
                        onResizeStart(item.id, 'n', e);
                      }
                    }}
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 flex items-center justify-center cursor-ns-resize z-50 group pointer-events-auto select-none"
                    title="Redimensionner Hauteur (Haut)"
                  >
                    <svg className="w-5 h-5 overflow-visible transition-transform duration-100 group-hover:scale-125" viewBox="0 0 20 20">
                      <line x1="2" y1="10" x2="18" y2="10" stroke="url(#fade-h-nw)" strokeWidth="1.5" strokeLinecap="round" />
                      <line x1="10" y1="2" x2="10" y2="18" stroke="url(#fade-v-nw)" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="10" cy="10" r="2.8" fill="#ffffff" stroke="#2563eb" strokeWidth="1.3" />
                      <circle cx="10" cy="10" r="1" fill="#2563eb" />
                    </svg>
                  </div>

                  {/* Middle-Right E */}
                  <div
                    onMouseDown={(e) => {
                      if (onResizeStart) {
                        e.stopPropagation();
                        onResizeStart(item.id, 'e', e);
                      }
                    }}
                    className="absolute top-1/2 -right-2.5 -translate-y-1/2 w-5 h-5 flex items-center justify-center cursor-ew-resize z-50 group pointer-events-auto select-none"
                    title="Redimensionner Largeur (Droite)"
                  >
                    <svg className="w-5 h-5 overflow-visible transition-transform duration-100 group-hover:scale-125" viewBox="0 0 20 20">
                      <line x1="2" y1="10" x2="18" y2="10" stroke="url(#fade-h-nw)" strokeWidth="1.5" strokeLinecap="round" />
                      <line x1="10" y1="2" x2="10" y2="18" stroke="url(#fade-v-nw)" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="10" cy="10" r="2.8" fill="#ffffff" stroke="#2563eb" strokeWidth="1.3" />
                      <circle cx="10" cy="10" r="1" fill="#2563eb" />
                    </svg>
                  </div>

                  {/* Middle-Bottom S */}
                  <div
                    onMouseDown={(e) => {
                      if (onResizeStart) {
                        e.stopPropagation();
                        onResizeStart(item.id, 's', e);
                      }
                    }}
                    className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-5 h-5 flex items-center justify-center cursor-ns-resize z-50 group pointer-events-auto select-none"
                    title="Redimensionner Hauteur (Bas)"
                  >
                    <svg className="w-5 h-5 overflow-visible transition-transform duration-100 group-hover:scale-125" viewBox="0 0 20 20">
                      <line x1="2" y1="10" x2="18" y2="10" stroke="url(#fade-h-nw)" strokeWidth="1.5" strokeLinecap="round" />
                      <line x1="10" y1="2" x2="10" y2="18" stroke="url(#fade-v-nw)" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="10" cy="10" r="2.8" fill="#ffffff" stroke="#2563eb" strokeWidth="1.3" />
                      <circle cx="10" cy="10" r="1" fill="#2563eb" />
                    </svg>
                  </div>

                  {/* Middle-Left W */}
                  <div
                    onMouseDown={(e) => {
                      if (onResizeStart) {
                        e.stopPropagation();
                        onResizeStart(item.id, 'w', e);
                      }
                    }}
                    className="absolute top-1/2 -left-2.5 -translate-y-1/2 w-5 h-5 flex items-center justify-center cursor-ew-resize z-50 group pointer-events-auto select-none"
                    title="Redimensionner Largeur (Gauche)"
                  >
                    <svg className="w-5 h-5 overflow-visible transition-transform duration-100 group-hover:scale-125" viewBox="0 0 20 20">
                      <line x1="2" y1="10" x2="18" y2="10" stroke="url(#fade-h-nw)" strokeWidth="1.5" strokeLinecap="round" />
                      <line x1="10" y1="2" x2="10" y2="18" stroke="url(#fade-v-nw)" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="10" cy="10" r="2.8" fill="#ffffff" stroke="#2563eb" strokeWidth="1.3" />
                      <circle cx="10" cy="10" r="1" fill="#2563eb" />
                    </svg>
                  </div>

                  {/* ========================================================================= */}
                  {/* ROTATION HANDLES: 4 USER PREFERENCE OPTIONS                             */}
                  {/* ========================================================================= */}
                  {rotationHandleType !== 'disabled' && (
                    <>
                      {/* OPTION 1: Top-Center Stem Handle ("Lollipop" Figma/Illustrator style) */}
                      {rotationHandleType === 'top_stem' && (() => {
                        const isCloseToTop = (item.y_mm * pxPerMm) < 28;
                        const isItemRotating = isRotating && activeRotatingItemId === item.id;
                        const currentDeg = Math.round(isItemRotating && activeRotationAngle !== null ? activeRotationAngle : (item.rotation || 0));

                        return (
                          <div
                            className={`absolute left-1/2 -translate-x-1/2 z-50 flex flex-col items-center select-none pointer-events-auto group ${
                              isCloseToTop ? 'top-full' : 'bottom-full'
                            }`}
                          >
                            {!isCloseToTop && (
                              <>
                                {/* Angle HUD pill */}
                                <div className="px-1.5 py-0.5 mb-1 bg-slate-900/90 backdrop-blur-xs text-white text-[9px] font-mono font-bold rounded shadow-md pointer-events-none whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                  {currentDeg}°
                                </div>
                                <div
                                  onMouseDown={(e) => {
                                    if (onRotateStart) {
                                      e.stopPropagation();
                                      onRotateStart(item.id, e, 'top_stem');
                                    }
                                  }}
                                  onDoubleClick={(e) => {
                                    if (onRotateStep90) {
                                      e.stopPropagation();
                                      onRotateStep90(item.id, e);
                                    }
                                  }}
                                  className="w-5 h-5 rounded-full bg-white border-2 border-blue-600 shadow-md flex items-center justify-center text-blue-600 hover:bg-blue-600 hover:text-white hover:scale-115 active:scale-95 transition-all cursor-grab active:cursor-grabbing"
                                  title="Pivoter l'élément (Glisser: rotation libre / Double-clic: +90°)"
                                >
                                  <RotateCw className="w-2.5 h-2.5 pointer-events-none" />
                                </div>
                                <div className="w-0.5 h-3.5 bg-blue-600" />
                              </>
                            )}

                            {isCloseToTop && (
                              <>
                                <div className="w-0.5 h-3.5 bg-blue-600" />
                                <div
                                  onMouseDown={(e) => {
                                    if (onRotateStart) {
                                      e.stopPropagation();
                                      onRotateStart(item.id, e, 'bottom_stem');
                                    }
                                  }}
                                  onDoubleClick={(e) => {
                                    if (onRotateStep90) {
                                      e.stopPropagation();
                                      onRotateStep90(item.id, e);
                                    }
                                  }}
                                  className="w-5 h-5 rounded-full bg-white border-2 border-blue-600 shadow-md flex items-center justify-center text-blue-600 hover:bg-blue-600 hover:text-white hover:scale-115 active:scale-95 transition-all cursor-grab active:cursor-grabbing"
                                  title="Pivoter l'élément (Glisser: rotation libre / Double-clic: +90°)"
                                >
                                  <RotateCw className="w-2.5 h-2.5 pointer-events-none" />
                                </div>
                                <div className="px-1.5 py-0.5 mt-1 bg-slate-900/90 backdrop-blur-xs text-white text-[9px] font-mono font-bold rounded shadow-md pointer-events-none whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                  {currentDeg}°
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}

                      {/* OPTION 2: Corner Hover Orbit (Photoshop/InDesign outer-corner perimeter) */}
                      {rotationHandleType === 'corner_hover_orbit' && (() => {
                        const cornerOrbits = [
                          { pos: 'nw', class: '-top-6 -left-6', arcClass: 'border-t-2 border-l-2 rounded-tl-full' },
                          { pos: 'ne', class: '-top-6 -right-6', arcClass: 'border-t-2 border-r-2 rounded-tr-full' },
                          { pos: 'sw', class: '-bottom-6 -left-6', arcClass: 'border-b-2 border-l-2 rounded-bl-full' },
                          { pos: 'se', class: '-bottom-6 -right-6', arcClass: 'border-b-2 border-r-2 rounded-br-full' },
                        ];

                        return (
                          <>
                            {cornerOrbits.map((co) => (
                              <div
                                key={co.pos}
                                onMouseDown={(e) => {
                                  if (onRotateStart) {
                                    e.stopPropagation();
                                    onRotateStart(item.id, e, `orbit_${co.pos}`);
                                  }
                                }}
                                onDoubleClick={(e) => {
                                  if (onRotateStep90) {
                                    e.stopPropagation();
                                    onRotateStep90(item.id, e);
                                  }
                                }}
                                className={`absolute ${co.class} w-8 h-8 z-40 flex items-center justify-center group pointer-events-auto cursor-grab active:cursor-grabbing select-none`}
                                title="Orbite de rotation (Glisser pour faire tourner, Double-clic: +90°)"
                              >
                                {/* Subtle curved arc indicator on hover */}
                                <div
                                  className={`w-6 h-6 ${co.arcClass} border-blue-500/80 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center bg-blue-50/20`}
                                >
                                  <RotateCw className="w-2.5 h-2.5 text-blue-600 opacity-80" />
                                </div>
                              </div>
                            ))}
                          </>
                        );
                      })()}

                      {/* OPTION 3: Dual-End Floating Stems (Top & Bottom Bi-Directional) */}
                      {rotationHandleType === 'dual_stems' && (() => {
                        const isItemRotating = isRotating && activeRotatingItemId === item.id;
                        const currentDeg = Math.round(isItemRotating && activeRotationAngle !== null ? activeRotationAngle : (item.rotation || 0));

                        return (
                          <>
                            {/* Top Stem */}
                            <div className="absolute -top-6.5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center select-none pointer-events-auto group">
                              <div
                                onMouseDown={(e) => {
                                  if (onRotateStart) {
                                    e.stopPropagation();
                                    onRotateStart(item.id, e, 'dual_top');
                                  }
                                }}
                                onDoubleClick={(e) => {
                                  if (onRotateStep90) {
                                    e.stopPropagation();
                                    onRotateStep90(item.id, e);
                                  }
                                }}
                                className="w-5 h-5 rounded-full bg-white border-2 border-indigo-600 shadow-md flex items-center justify-center text-indigo-600 hover:bg-indigo-600 hover:text-white hover:scale-115 active:scale-95 transition-all cursor-grab active:cursor-grabbing"
                                title="Pivoter depuis le haut (Glisser: rotation, Double-clic: +90°)"
                              >
                                <RotateCw className="w-2.5 h-2.5 pointer-events-none" />
                              </div>
                              <div className="w-0.5 h-2.5 bg-indigo-600" />
                            </div>

                            {/* Bottom Stem */}
                            <div className="absolute -bottom-6.5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center select-none pointer-events-auto group">
                              <div className="w-0.5 h-2.5 bg-indigo-600" />
                              <div
                                onMouseDown={(e) => {
                                  if (onRotateStart) {
                                    e.stopPropagation();
                                    onRotateStart(item.id, e, 'dual_bottom');
                                  }
                                }}
                                onDoubleClick={(e) => {
                                  if (onRotateStep90) {
                                    e.stopPropagation();
                                    onRotateStep90(item.id, e);
                                  }
                                }}
                                className="w-5 h-5 rounded-full bg-white border-2 border-indigo-600 shadow-md flex items-center justify-center text-indigo-600 hover:bg-indigo-600 hover:text-white hover:scale-115 active:scale-95 transition-all cursor-grab active:cursor-grabbing"
                                title="Pivoter depuis le bas (Glisser: rotation, Double-clic: +90°)"
                              >
                                <RotateCw className="w-2.5 h-2.5 pointer-events-none" />
                              </div>
                            </div>
                          </>
                        );
                      })()}

                      {/* OPTION 4: Floating Corner Ring / Satellite Arc Dots (4 satellite handles with protractor overlay) */}
                      {rotationHandleType === 'corner_satellites' && (() => {
                        const satellites = [
                          { pos: 'nw', class: '-top-5 -left-5' },
                          { pos: 'ne', class: '-top-5 -right-5' },
                          { pos: 'sw', class: '-bottom-5 -left-5' },
                          { pos: 'se', class: '-bottom-5 -right-5' },
                        ];

                        return (
                          <>
                            {satellites.map((sat) => (
                              <div
                                key={sat.pos}
                                onMouseDown={(e) => {
                                  if (onRotateStart) {
                                    e.stopPropagation();
                                    onRotateStart(item.id, e, `sat_${sat.pos}`);
                                  }
                                }}
                                onDoubleClick={(e) => {
                                  if (onRotateStep90) {
                                    e.stopPropagation();
                                    onRotateStep90(item.id, e);
                                  }
                                }}
                                className={`absolute ${sat.class} w-4.5 h-4.5 rounded-full bg-white border-2 border-violet-600 shadow-md flex items-center justify-center text-violet-600 hover:bg-violet-600 hover:text-white hover:scale-125 active:scale-95 transition-all cursor-grab active:cursor-grabbing z-50 group pointer-events-auto select-none`}
                                title="Satellite de rotation (Glisser: orienter, Double-clic: +90°)"
                              >
                                <div className="w-1.5 h-1.5 rounded-full bg-violet-600 group-hover:bg-white transition-colors" />
                              </div>
                            ))}
                          </>
                        );
                      })()}
                    </>
                  )}

                  {/* ACTIVE ROTATION PROTRACTOR & ANGLE BADGE OVERLAY */}
                  {isRotating && activeRotatingItemId === item.id && (() => {
                    const currentDeg = Math.round(activeRotationAngle !== null ? activeRotationAngle : (item.rotation || 0));
                    const diagRadius = Math.hypot(item.w_mm * pxPerMm, item.h_mm * pxPerMm) / 2 + 18;

                    return (
                      <div className="absolute inset-0 pointer-events-none z-50 flex items-center justify-center">
                        {/* Protractor Circular Ring */}
                        <div
                          style={{
                            width: `${diagRadius * 2}px`,
                            height: `${diagRadius * 2}px`,
                          }}
                          className="absolute rounded-full border border-dashed border-blue-500/70 bg-blue-500/5 animate-in fade-in duration-100 flex items-center justify-center"
                        >
                          {/* Crosshair Cardinal Guides */}
                          <div className="absolute inset-x-0 top-1/2 h-px bg-blue-400/50" />
                          <div className="absolute inset-y-0 left-1/2 w-px bg-blue-400/50" />
                          
                          {/* 0° / 90° / 180° / 270° Labels */}
                          <span className="absolute top-1 text-[8px] font-mono text-blue-700 font-bold bg-white/90 px-1 rounded">0°</span>
                          <span className="absolute right-1 text-[8px] font-mono text-blue-700 font-bold bg-white/90 px-1 rounded">90°</span>
                          <span className="absolute bottom-1 text-[8px] font-mono text-blue-700 font-bold bg-white/90 px-1 rounded">180°</span>
                          <span className="absolute left-1 text-[8px] font-mono text-blue-700 font-bold bg-white/90 px-1 rounded">270°</span>

                          {/* Center Pivot Point */}
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-600 border border-white shadow-sm z-10" />
                        </div>

                        {/* High-visibility Floating Angle Pill */}
                        <div className="absolute -top-10 px-2.5 py-1 bg-slate-950 text-white text-xs font-mono font-bold rounded-lg shadow-xl border border-blue-500/40 flex items-center gap-1.5 z-50 animate-in zoom-in-90">
                          <RotateCw className="w-3 h-3 text-blue-400" />
                          <span>{currentDeg}°</span>
                          {(currentDeg % 15 === 0) && (
                            <span className="text-[9px] text-emerald-400 bg-emerald-950/80 px-1 rounded">Aimant</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          );
        })}

      {/* Dynamic Smart Guides Overlay (Magenta Alignment Guidelines) */}
      {smartGuides && smartGuides.length > 0 && (
        <div className="absolute inset-0 pointer-events-none z-50 overflow-visible">
          {smartGuides.map((guide) => {
            if (guide.orientation === 'vertical') {
              const leftPx = guide.position_mm * pxPerMm;
              const topPx = guide.start_mm * pxPerMm;
              const heightPx = (guide.end_mm - guide.start_mm) * pxPerMm;

              return (
                <React.Fragment key={guide.id}>
                  {/* Vertical Guideline */}
                  <div
                    className="absolute w-[1.5px] bg-rose-500 shadow-xs pointer-events-none"
                    style={{
                      left: `${leftPx}px`,
                      top: `${topPx}px`,
                      height: `${Math.max(4, heightPx)}px`,
                      borderLeft: '1.5px dashed #f43f5e',
                    }}
                  />
                  {/* Guide Alignment Badge / Marker */}
                  <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 px-1 py-0.5 bg-rose-600 text-[9px] font-mono text-white font-bold rounded shadow-xs pointer-events-none z-50 whitespace-nowrap"
                    style={{
                      left: `${leftPx}px`,
                      top: `${topPx + Math.min(20, heightPx / 2)}px`,
                    }}
                  >
                    {guide.label || `${guide.position_mm.toFixed(1)} mm`}
                  </div>
                </React.Fragment>
              );
            } else {
              const topPx = guide.position_mm * pxPerMm;
              const leftPx = guide.start_mm * pxPerMm;
              const widthPx = (guide.end_mm - guide.start_mm) * pxPerMm;

              return (
                <React.Fragment key={guide.id}>
                  {/* Horizontal Guideline */}
                  <div
                    className="absolute h-[1.5px] bg-rose-500 shadow-xs pointer-events-none"
                    style={{
                      top: `${topPx}px`,
                      left: `${leftPx}px`,
                      width: `${Math.max(4, widthPx)}px`,
                      borderTop: '1.5px dashed #f43f5e',
                    }}
                  />
                  {/* Guide Alignment Badge / Marker */}
                  <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 px-1 py-0.5 bg-rose-600 text-[9px] font-mono text-white font-bold rounded shadow-xs pointer-events-none z-50 whitespace-nowrap"
                    style={{
                      left: `${leftPx + Math.min(24, widthPx / 2)}px`,
                      top: `${topPx}px`,
                    }}
                  >
                    {guide.label || `${guide.position_mm.toFixed(1)} mm`}
                  </div>
                </React.Fragment>
              );
            }
          })}
        </div>
      )}
    </div>
  );
};
