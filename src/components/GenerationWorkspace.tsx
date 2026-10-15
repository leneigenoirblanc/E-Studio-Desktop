import React, { useState, useMemo } from 'react';
import { LabelTemplate, ProductRecord, ImpositionConfig, PdfExportConfig } from '../types';
import { catalogRepository as databaseService } from '../services/catalogRepository';
import { LabelRenderer } from './LabelRenderer';
import { ImpositionCalculator } from '../utils/impositionCalculator';
import { TierEngine } from '../utils/tierEngine';
import { PricingEngine } from '../utils/pricingEngine';
import { DataMappingModal } from './DataMappingModal';
import { PptxExporter } from '../utils/pptxExporter';
import { ZplExporter } from '../utils/zplExporter';
import { generateCode128Bars, generateEAN13Bars } from '../utils/barcodeGenerator';
import { generateQrMatrix } from '../utils/qrGenerator';
import { AVERY_STANDARD_CATALOG } from '../utils/averyCatalog';
import { DEFAULT_TEMPLATES } from '../defaultTemplates';
import { TierPricingStudio } from './TierPricingStudio';
import { ProductClusteringStudio } from './ProductClusteringStudio';
import { MultiSlotSignageStudio } from './MultiSlotSignageStudio';
import { ImpositionCalibrationBoard } from './ImpositionCalibrationBoard';
import { MappingDictionaryModal } from './MappingDictionaryModal';
import { ContextTooltip, useTooltip } from '../context/TooltipContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { desktopFileService } from '../services/desktopFileService';
import { api } from '../services/api';
import { AuditLogService } from '../services/auditLogService';
import { PrintJobHistoryModal } from './PrintJobHistoryModal';
import { PreFlightEngine } from '../utils/preFlightEngine';
import {
  History,
  ChevronLeft,
  ChevronRight,
  Printer,
  Download,
  Upload,
  Search,
  Plus,
  Trash2,
  FileSpreadsheet,
  Grid,
  Eye,
  CheckCircle,
  CheckCircle2,
  FileCheck,
  AlertTriangle,
  AlertCircle,
  FileText,
  Sliders,
  Presentation,
  Cpu,
  BookmarkCheck,
  Settings2,
  TrendingDown,
  Boxes,
  LayoutGrid,
  Compass,
  ChevronDown,
  Settings,
  BookOpen,
  Target,
  CheckSquare,
  Square,
  Copy,
} from 'lucide-react';

interface GenerationWorkspaceProps {
  template: LabelTemplate;
  onBack: () => void;
  initialProducts?: ProductRecord[];
  initialBatchName?: string;
}

export const GenerationWorkspace: React.FC<GenerationWorkspaceProps> = ({
  template,
  onBack,
  initialProducts,
  initialBatchName,
}) => {
  const [products, setProducts] = useState<ProductRecord[]>(() => {
    if (initialProducts && initialProducts.length > 0) return initialProducts;
    return databaseService.getProducts();
  });

  React.useEffect(() => {
    if (!initialProducts || initialProducts.length === 0) {
      const unsub = databaseService.subscribe((dbItems) => {
        setProducts(dbItems);
      });
      return () => unsub();
    }
  }, [initialProducts]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<
    'preview' | 'data' | 'imposition' | 'tiers' | 'clustering' | 'multislot' | 'blueprint'
  >('preview');
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [isDictionaryModalOpen, setIsDictionaryModalOpen] = useState(false);
  const [showJobHistory, setShowJobHistory] = useState(false);
  const [exportConfirmTarget, setExportConfirmTarget] = useState<'pdf' | 'zpl' | null>(null);

  const handleUpdateSingleProduct = (updated: ProductRecord) => {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  // Excel Mapping Modal State
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);

  // Imposition sheet configuration (defaults to template.default_imposition or landscape A4)
  const [impositionConfig, setImpositionConfig] = useState<ImpositionConfig>(() => {
    if (template.default_imposition) {
      return template.default_imposition;
    }
    return {
      page_size: 'A4',
      orientation: 'landscape',
      gap_mm: 2.0,
      gap_x_mm: 2.0,
      gap_y_mm: 2.0,
      show_cut_marks: true,
      start_offset_slot: 0,
    };
  });

  // PDF Export Config
  const [pdfConfig, setPdfConfig] = useState<PdfExportConfig>({
    dpi: 300,
    bleed_mm: 2.0,
    show_crop_marks: true,
    show_registration_marks: false,
    include_calibration_layer: false,
    color_mode: 'cmyk_sim',
  });

  // ZPL Config Modal
  const [zplDpi, setZplDpi] = useState<203 | 300 | 600>(203);
  const [showZplModal, setShowZplModal] = useState(false);

  // Filtered products
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.ITEMNAME.toLowerCase().includes(term) ||
        (p.PRODUCT_SCAN && p.PRODUCT_SCAN.includes(term)) ||
        (p.PARTNO && p.PARTNO.toLowerCase().includes(term)) ||
        (p.CATEGORY_NAME && p.CATEGORY_NAME.toLowerCase().includes(term))
    );
  }, [products, searchTerm]);

  const currentProduct = filteredProducts[currentIndex] || filteredProducts[0] || null;

  // Print & Preview Scope Mode (Defaults to Selected Item Only to avoid entire catalog overhauls!)
  const [printScope, setPrintScope] = useState<'selected_only' | 'checked_only' | 'all'>('selected_only');
  const [selectedCopies, setSelectedCopies] = useState<number>(1);
  const [fillSheetWithSelected, setFillSheetWithSelected] = useState<boolean>(false);
  const [checkedProductIds, setCheckedProductIds] = useState<Set<string>>(new Set());
  const [itemCopies, setItemCopies] = useState<Record<string, number>>({});

  // Imposition calculation
  const imposition = useMemo(() => {
    try {
      return ImpositionCalculator.calculate(
        template.width_mm,
        template.height_mm,
        template.outer_margins_mm,
        impositionConfig
      );
    } catch {
      return null;
    }
  }, [template, impositionConfig]);

  // Effective print & preview items calculated strictly according to active scope
  const effectivePrintItems = useMemo<ProductRecord[]>(() => {
    if (printScope === 'selected_only') {
      if (!currentProduct) return [];
      const forced = typeof currentProduct.forced_copies === 'number' && currentProduct.forced_copies > 0 ? currentProduct.forced_copies : undefined;
      const count = fillSheetWithSelected && imposition
        ? imposition.total_per_page
        : Math.max(1, forced ?? selectedCopies);
      return Array.from({ length: count }, () => currentProduct);
    }
    if (printScope === 'checked_only') {
      const checked = products.filter((p) => checkedProductIds.has(p.id));
      if (checked.length === 0) {
        return currentProduct ? [currentProduct] : [];
      }
      return checked.flatMap((p) => {
        const forced = typeof p.forced_copies === 'number' && p.forced_copies > 0 ? p.forced_copies : undefined;
        const qty = Math.max(1, forced ?? itemCopies[p.id] ?? 1);
        return Array.from({ length: qty }, () => p);
      });
    }
    // 'all'
    return filteredProducts.flatMap((p) => {
      const forced = typeof p.forced_copies === 'number' && p.forced_copies > 0 ? p.forced_copies : undefined;
      const qty = Math.max(1, forced ?? itemCopies[p.id] ?? 1);
      return Array.from({ length: qty }, () => p);
    });
  }, [printScope, currentProduct, fillSheetWithSelected, imposition, selectedCopies, products, checkedProductIds, itemCopies, filteredProducts]);

  // Preflight diagnostics for rows
  const preFlightReport = useMemo(() => {
    return PreFlightEngine.analyzeTemplate(template, effectivePrintItems[0], exportConfirmTarget || 'screen');
  }, [template, effectivePrintItems, exportConfirmTarget]);

  const diagnostics = useMemo(() => {
    return products.map((record) => {
      const issues: { type: 'warning' | 'error'; message: string }[] = [];

      // Check for barcodes if template has barcode items
      const barcodeItem = template.items.find((i) => i.type === 'barcode');
      if (barcodeItem && (!record.PRODUCT_SCAN || record.PRODUCT_SCAN.trim() === '')) {
        issues.push({ type: 'warning', message: 'Code-barres manquant' });
      }

      // Check strict tier items
      const strictTierItem = template.items.find((i) => i.type === 'tier_price' && i.strict_required);
      if (strictTierItem && strictTierItem.type === 'tier_price') {
        const res = TierEngine.resolve(
          {
            primary_index: Math.max(0, strictTierItem.primary_tier - 1),
            strict_required: true,
          },
          record
        );
        if (res?.error) {
          issues.push({ type: 'error', message: res.error });
        }
      }

      return {
        id: record.id,
        issues,
        status: issues.some((i) => i.type === 'error')
          ? 'error'
          : issues.length > 0
          ? 'warning'
          : 'valid',
      };
    });
  }, [products, template]);

  // Excel / CSV File Import with Data Mapping Tool
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const data = new Uint8Array(loadEvent.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet);

        if (rawJson.length > 0) {
          // Extract column headers dynamically
          const headers = Object.keys(rawJson[0]);
          setRawHeaders(headers);
          setRawRows(rawJson);
          setMappingModalOpen(true);
        }
      } catch (err) {
        console.error("Erreur lors de l'importation du fichier Excel/CSV :", err);
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset file input so user can reload same file
    e.target.value = '';
  };

  const handleApplyMapping = (mappedProducts: ProductRecord[]) => {
    setProducts(mappedProducts);
    setCurrentIndex(0);
    setMappingModalOpen(false);
  };

  // Export Excel template of current records
  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      products.map((p) => ({
        STORE_NAME: p.STORE_NAME,
        PRODUCT_SCAN: p.PRODUCT_SCAN,
        PARTNO: p.PARTNO,
        ITEMNAME: p.ITEMNAME,
        CATEGORY_NAME: p.CATEGORY_NAME,
        BRAND_INFO: p.BRAND_INFO,
        SELLING_UNIT: p.SELLING_UNIT,
        SELLING_PRICE: p.SELLING_PRICE,
        PROMOPRICE: p.PROMOPRICE || '',
        CASE_SIZE: p.CASE_SIZE || '',
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Articles");
    XLSX.writeFile(wb, "catalogue_articles_estudio.xlsx");
  };

  // PowerPoint (.pptx) Export
  const handleExportPptx = async () => {
    if (!imposition) return;
    try {
      await PptxExporter.exportToPptx(template, effectivePrintItems, imposition, impositionConfig);
    } catch (err) {
      console.error("Erreur lors de l'export PowerPoint :", err);
    }
  };

  // ZPL Direct Thermal Export
  const handleExportZpl = async () => {
    const targetReport = PreFlightEngine.analyzeTemplate(template, effectivePrintItems[0], 'zpl');
    if (!targetReport.passed) {
      console.error("Export ZPL refusé : le gabarit contient des erreurs bloquantes.", targetReport.issues);
      return;
    }
    try {
      const zplContent = ZplExporter.generateBatchZpl(template, effectivePrintItems, {
        dpi: zplDpi,
        quantity: 1,
        printSpeed: 4,
        darkness: 15,
        includeComments: true,
      });
      const filename = `thermique_${template.name.toLowerCase().replace(/\s+/g, '_')}_${zplDpi}dpi.zpl`;
      const savedPath = await ZplExporter.downloadZplFile(filename, zplContent);
      if (savedPath) {
        await api.jobInsert({
          id: `job_zpl_${Date.now()}`,
          template_id: template.id || '',
          template_revision: template.revision || 1,
          product_ids: effectivePrintItems.map((p) => p.id || ''),
          format: 'zpl',
          imposition_json: JSON.stringify(impositionConfig),
          target: savedPath,
          status: 'ready',
          error: null,
          created_at: new Date().toISOString(),
          template_snapshot: template,
          printed_products: effectivePrintItems.map((p) => ({
            id: p.id,
            ITEMNAME: p.ITEMNAME,
            SELLING_PRICE: p.SELLING_PRICE,
            PROMOPRICE: p.PROMOPRICE,
            PRODUCT_SCAN: p.PRODUCT_SCAN,
            PARTNO: p.PARTNO,
          })),
        });
        AuditLogService.append({
          action: 'EXPORT_ZPL',
          template_name: template.name,
          details: `Fichier ZPL enregistré : ${savedPath} (${effectivePrintItems.length} étiquettes, ${zplDpi} DPI)`,
        });
      }
      setShowZplModal(false);
    } catch (err) {
      console.error("Erreur lors de la génération ZPL :", err);
    }
  };

  // Helper: Build the printable PDF document
  const buildPdfDocument = () => {
    if (!imposition) return null;
    const isLandscape = impositionConfig.orientation === 'landscape';
    const pdfFormat =
      impositionConfig.page_size === 'CUSTOM' && impositionConfig.custom_page_w_mm && impositionConfig.custom_page_h_mm
        ? [impositionConfig.custom_page_w_mm, impositionConfig.custom_page_h_mm]
        : impositionConfig.page_size.toLowerCase();

    const doc = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: pdfFormat as any,
    });

    const labelsPerPage = imposition.total_per_page;
    const startOffset = Math.max(0, Math.min(labelsPerPage - 1, impositionConfig.start_offset_slot || 0));
    
    // Calculate total pages considering start offset and effective scope items
    const totalItemsToPlace = effectivePrintItems.length + startOffset;
    const totalPages = Math.max(1, Math.ceil(totalItemsToPlace / labelsPerPage));

    const gapX = Math.max(0, impositionConfig.gap_x_mm ?? impositionConfig.gap_mm ?? 2.0);
    const gapY = Math.max(0, impositionConfig.gap_y_mm ?? impositionConfig.gap_mm ?? 2.0);

    let productCursor = 0;

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) doc.addPage();

      // Draw labels on page
      for (let slot = 0; slot < labelsPerPage; slot++) {
        // If on page 0 and slot is before start offset, skip this slot (reuse partially printed sheets)
        if (page === 0 && slot < startOffset) {
          continue;
        }

        if (productCursor >= effectivePrintItems.length) break;
        const prod = effectivePrintItems[productCursor];
        productCursor++;

        const col = slot % imposition.cols;
        const row = Math.floor(slot / imposition.cols);

        const nudge = impositionConfig.slot_nudges?.[slot] || { dx_mm: 0, dy_mm: 0 };
        const nudgeX = typeof nudge.dx_mm === 'number' ? nudge.dx_mm : 0;
        const nudgeY = typeof nudge.dy_mm === 'number' ? nudge.dy_mm : 0;

        const x = imposition.horizontal_offset_mm + col * (imposition.label_total_w_mm + gapX) + nudgeX;
        const y = imposition.vertical_offset_mm + row * (imposition.label_total_h_mm + gapY) + nudgeY;

        // Label background & border
        if (template.bg_color && template.bg_color !== 'transparent') {
          const hex = template.bg_color.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16) || 255;
          const g = parseInt(hex.substring(2, 4), 16) || 255;
          const b = parseInt(hex.substring(4, 6), 16) || 255;
          doc.setFillColor(r, g, b);
          doc.rect(x, y, template.width_mm, template.height_mm, 'F');
        }

        // Render background reference image if configured for output
        if (template.background_image_path && template.background_image_in_output) {
          try {
            doc.addImage(template.background_image_path, 'JPEG', x, y, template.width_mm, template.height_mm);
          } catch (err) {
            console.warn("Échec d'insertion image de fond dans le PDF :", err);
          }
        }

        doc.setDrawColor(220, 226, 235);
        doc.setLineWidth(0.15);
        doc.rect(x, y, template.width_mm, template.height_mm, 'S');

        // Inner printable margins guide / crop marks
        if (impositionConfig.show_cut_marks) {
          doc.setDrawColor(180, 180, 180);
          doc.line(x - 1.5, y, x + 1.5, y);
          doc.line(x, y - 1.5, x, y + 1.5);
          doc.line(x + template.width_mm - 1.5, y + template.height_mm, x + template.width_mm + 1.5, y + template.height_mm);
          doc.line(x + template.width_mm, y + template.height_mm - 1.5, x + template.width_mm, y + template.height_mm + 1.5);
        }

        // Dynamically render all template items for this product
        template.items.forEach((item) => {
          if (!PricingEngine.shouldDisplayItem(item, prod)) return;

          const itemX = x + item.x_mm;
          const itemY = y + item.y_mm;

          if (item.type === 'text') {
            let textVal = PricingEngine.resolveCalculatedText(item, prod);
            if (!textVal) return;

            if (item.prefix_text) textVal = `${item.prefix_text} ${textVal}`;
            if (item.suffix_text) textVal = `${textVal} ${item.suffix_text}`;
            if (item.text_transform === 'uppercase') textVal = textVal.toUpperCase();
            else if (item.text_transform === 'lowercase') textVal = textVal.toLowerCase();

            const hex = (item.text_color || '#000000').replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16) || 0;
            const g = parseInt(hex.substring(2, 4), 16) || 0;
            const b = parseInt(hex.substring(4, 6), 16) || 0;

            doc.setTextColor(r, g, b);

            const isBold = item.font_weight === 'bold' || item.font_weight === '800' || item.font_weight === '600';
            const isItalic = item.font_style === 'italic';

            let fontStyle = 'normal';
            if (isBold && isItalic) fontStyle = 'bolditalic';
            else if (isBold) fontStyle = 'bold';
            else if (isItalic) fontStyle = 'italic';

            const familyNorm = (item.font_family || '').toLowerCase();
            const fontFamily = familyNorm.includes('serif') ? 'times' : familyNorm.includes('mono') ? 'courier' : 'helvetica';

            doc.setFont(fontFamily, fontStyle);

            const fontSizePt = item.font_size_pt || 10;
            doc.setFontSize(fontSizePt);

            const align = item.alignment || 'left';
            let textX = itemX;
            if (align === 'center') textX = itemX + item.w_mm / 2;
            else if (align === 'right') textX = itemX + item.w_mm;

            let textY = itemY + fontSizePt * 0.32;
            if (item.valign === 'middle') {
              textY = itemY + item.h_mm / 2 + fontSizePt * 0.12;
            } else if (item.valign === 'bottom') {
              textY = itemY + item.h_mm - 0.5;
            }

            doc.text(textVal, textX, textY, { align: align as any });

            // Render strikethrough line for promo standard price comparisons
            const isStrikethrough = item.text_decoration?.includes('line-through');
            if (isStrikethrough) {
              doc.setDrawColor(r, g, b);
              doc.setLineWidth(0.3);
              const approxCharWidthMm = fontSizePt * 0.28;
              const textWidthMm = Math.min(item.w_mm, textVal.length * approxCharWidthMm);
              let lineX1 = itemX;
              if (align === 'center') lineX1 = itemX + (item.w_mm - textWidthMm) / 2;
              else if (align === 'right') lineX1 = itemX + item.w_mm - textWidthMm;
              doc.line(lineX1, textY - fontSizePt * 0.1, lineX1 + textWidthMm, textY - fontSizePt * 0.1);
            }
          } else if (item.type === 'shape' || item.type === 'ellipse' || item.type === 'line') {
            const fillColor = (item as any).fill_color || 'transparent';
            const borderColor = (item as any).border_color || (item as any).color || '#000000';
            const borderWidth = (item as any).border_width || (item as any).thickness || 0.2;

            const bgHex = fillColor.replace('#', '');
            const bgR = parseInt(bgHex.substring(0, 2), 16) || 255;
            const bgG = parseInt(bgHex.substring(2, 4), 16) || 255;
            const bgB = parseInt(bgHex.substring(4, 6), 16) || 255;

            const strokeHex = borderColor.replace('#', '');
            const stR = parseInt(strokeHex.substring(0, 2), 16) || 0;
            const stG = parseInt(strokeHex.substring(2, 4), 16) || 0;
            const stB = parseInt(strokeHex.substring(4, 6), 16) || 0;

            doc.setFillColor(bgR, bgG, bgB);
            doc.setDrawColor(stR, stG, stB);
            doc.setLineWidth(borderWidth);

            const hasFill = fillColor && fillColor !== 'transparent';
            const hasStroke = borderWidth > 0;
            const style = hasFill && hasStroke ? 'FD' : hasFill ? 'F' : 'S';

            if (item.type === 'ellipse') {
              doc.ellipse(itemX + item.w_mm / 2, itemY + item.h_mm / 2, item.w_mm / 2, item.h_mm / 2, style);
            } else if (item.type === 'line') {
              doc.line(itemX, itemY, itemX + item.w_mm, itemY + item.h_mm);
            } else {
              doc.rect(itemX, itemY, item.w_mm, item.h_mm, style);
            }
          } else if (item.type === 'barcode') {
            const rawCode = PricingEngine.resolveBarcodeValue(item as any, prod);
            const isEan13 = (item as any).barcode_type === 'ean13';
            const barColorHex = ((item as any).bar_color || '#000000').replace('#', '');
            const barR = parseInt(barColorHex.substring(0, 2), 16) || 0;
            const barG = parseInt(barColorHex.substring(2, 4), 16) || 0;
            const barB = parseInt(barColorHex.substring(4, 6), 16) || 0;

            let bars: boolean[] = [];
            let textToShow = rawCode;

            if (isEan13) {
              try {
                const res = generateEAN13Bars(rawCode);
                bars = res.bars;
                textToShow = res.formattedCode;
              } catch {
                bars = generateCode128Bars(rawCode);
              }
            } else {
              bars = generateCode128Bars(rawCode);
            }

            const showText = Boolean((item as any).show_text);
            const textMarginMm = showText ? 3.0 : 0;
            const barHeightMm = Math.max(2, item.h_mm - textMarginMm);
            const totalBars = Math.max(1, bars.length);
            const unitWidthMm = item.w_mm / totalBars;

            // Draw clean white background for high barcode contrast
            doc.setFillColor(255, 255, 255);
            doc.rect(itemX, itemY, item.w_mm, item.h_mm, 'F');

            // Draw crisp barcode bars by grouping contiguous true bits
            doc.setFillColor(barR, barG, barB);
            let startIdx: number | null = null;
            for (let bIdx = 0; bIdx < totalBars; bIdx++) {
              if (bars[bIdx]) {
                if (startIdx === null) startIdx = bIdx;
              } else {
                if (startIdx !== null) {
                  const bX = itemX + startIdx * unitWidthMm;
                  const bW = (bIdx - startIdx) * unitWidthMm;
                  doc.rect(bX, itemY, bW, barHeightMm, 'F');
                  startIdx = null;
                }
              }
            }
            if (startIdx !== null) {
              const bX = itemX + startIdx * unitWidthMm;
              const bW = (totalBars - startIdx) * unitWidthMm;
              doc.rect(bX, itemY, bW, barHeightMm, 'F');
            }

            // Draw text under barcode if requested
            if (showText && textToShow) {
              doc.setFont('courier', 'normal');
              doc.setFontSize(Math.max(5, Math.min(8.5, item.h_mm * 1.5)));
              doc.setTextColor(barR, barG, barB);
              doc.text(textToShow, itemX + item.w_mm / 2, itemY + item.h_mm - 0.4, { align: 'center' });
            }
          } else if (item.type === 'qrcode') {
            const qrContent = PricingEngine.resolveQrContent(item as any, prod);
            const modColorHex = ((item as any).module_color || '#000000').replace('#', '');
            const modR = parseInt(modColorHex.substring(0, 2), 16) || 0;
            const modG = parseInt(modColorHex.substring(2, 4), 16) || 0;
            const modB = parseInt(modColorHex.substring(4, 6), 16) || 0;

            const bgColorHex = ((item as any).background_color || '#FFFFFF').replace('#', '');
            const bgR = parseInt(bgColorHex.substring(0, 2), 16) || 255;
            const bgG = parseInt(bgColorHex.substring(2, 4), 16) || 255;
            const bgB = parseInt(bgColorHex.substring(4, 6), 16) || 255;

            // Draw QR Code background
            doc.setFillColor(bgR, bgG, bgB);
            doc.rect(itemX, itemY, item.w_mm, item.h_mm, 'F');

            const matrix = generateQrMatrix(qrContent);
            const matrixSize = matrix.length;
            const cellW = item.w_mm / matrixSize;
            const cellH = item.h_mm / matrixSize;

            doc.setFillColor(modR, modG, modB);
            for (let row = 0; row < matrixSize; row++) {
              let startCol: number | null = null;
              for (let col = 0; col < matrixSize; col++) {
                if (matrix[row][col]) {
                  if (startCol === null) startCol = col;
                } else {
                  if (startCol !== null) {
                    doc.rect(itemX + startCol * cellW, itemY + row * cellH, (col - startCol) * cellW, cellH, 'F');
                    startCol = null;
                  }
                }
              }
              if (startCol !== null) {
                doc.rect(itemX + startCol * cellW, itemY + row * cellH, (matrixSize - startCol) * cellW, cellH, 'F');
              }
            }
          } else if (item.type === 'price_block') {
            let rawPrice: any = undefined;
            if (prod) {
              if (item.binding_key) {
                rawPrice = PricingEngine.getProductFieldValue(prod, item.binding_key);
              } else {
                rawPrice = PricingEngine.getSellingPrice(prod);
              }
            } else {
              rawPrice = (item as any).fallback_price ?? 0;
            }
            if (rawPrice === undefined || rawPrice === null || rawPrice === '') {
              return;
            }
            const currencySym = item.currency_symbol || '€';
            const decimals = /FCFA|CFA|GNF|XOF|XAF/i.test(currencySym) ? 0 : 2;
            const separator = item.decimal_separator ?? ',';
            const { integerPart, decimalPart } = PricingEngine.splitPrice(rawPrice, separator, decimals);

            const intFontSizePt = item.integer_style?.font_size_pt || 24;
            const intHex = (item.integer_style?.text_color || '#000000').replace('#', '');
            const r = parseInt(intHex.substring(0, 2), 16) || 0;
            const g = parseInt(intHex.substring(2, 4), 16) || 0;
            const b = parseInt(intHex.substring(4, 6), 16) || 0;

            doc.setTextColor(r, g, b);
            doc.setFont('helvetica', 'bold');

            const align = item.alignment || 'left';
            const currPos = item.currency_position || 'after';

            let priceStr = `${integerPart}${decimals > 0 ? `${separator}${decimalPart}` : ''}`;
            if (currPos === 'before') {
              priceStr = `${currencySym} ${priceStr}`;
            } else {
              priceStr = `${priceStr} ${currencySym}`;
            }

            doc.setFontSize(intFontSizePt);
            let textX = itemX;
            if (align === 'center') textX = itemX + item.w_mm / 2;
            else if (align === 'right') textX = itemX + item.w_mm;

            let textY = itemY + intFontSizePt * 0.35;
            if (item.valign === 'middle') {
              textY = itemY + item.h_mm / 2 + intFontSizePt * 0.12;
            } else if (item.valign === 'bottom') {
              textY = itemY + item.h_mm - 0.5;
            }

            doc.text(priceStr, textX, textY, { align: align as any });
          } else if (item.type === 'tier_price') {
            doc.setDrawColor(203, 213, 225);
            doc.setFillColor(248, 250, 252);
            doc.rect(itemX, itemY, item.w_mm, item.h_mm, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.5);
            doc.setTextColor(51, 65, 85);
            doc.text('PALIERS DE PRIX', itemX + item.w_mm / 2, itemY + 3, { align: 'center' });
          } else if (item.type === 'pictogram') {
            doc.setFillColor(220, 38, 38);
            doc.rect(itemX, itemY, item.w_mm, item.h_mm, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.text('!', itemX + item.w_mm / 2, itemY + item.h_mm / 2 + 1, { align: 'center' });
          }
        });
      }
    }
    return doc;
  };

  // Generate and save Imposed PDF via native OS dialog
  const handleGeneratePdf = async () => {
    const targetReport = PreFlightEngine.analyzeTemplate(template, effectivePrintItems[0], 'pdf');
    if (!targetReport.passed) {
      console.error("Export PDF refusé : le gabarit contient des erreurs bloquantes.", targetReport.issues);
      return;
    }
    const doc = buildPdfDocument();
    if (!doc) return;
    const arrayBuffer = doc.output('arraybuffer');
    const filename = `etiquettes_imposees_${template.name.toLowerCase().replace(/\s+/g, '_')}.pdf`;
    const savedPath = await desktopFileService.saveBinary(
      filename,
      new Uint8Array(arrayBuffer),
      [{ name: 'Document PDF', extensions: ['pdf'] }]
    );
    if (savedPath) {
      await api.jobInsert({
        id: `job_pdf_${Date.now()}`,
        template_id: template.id || '',
        template_revision: template.revision || 1,
        product_ids: effectivePrintItems.map((p) => p.id || ''),
        format: 'pdf',
        imposition_json: JSON.stringify(impositionConfig),
        target: savedPath,
        status: 'ready',
        error: null,
        created_at: new Date().toISOString(),
        template_snapshot: template,
        printed_products: effectivePrintItems.map((p) => ({
          id: p.id,
          ITEMNAME: p.ITEMNAME,
          SELLING_PRICE: p.SELLING_PRICE,
          PROMOPRICE: p.PROMOPRICE,
          PRODUCT_SCAN: p.PRODUCT_SCAN,
          PARTNO: p.PARTNO,
        })),
      });
      AuditLogService.append({
        action: 'EXPORT_PDF_IMPOSITION',
        template_name: template.name,
        details: `Planche PDF enregistrée : ${savedPath} (${effectivePrintItems.length} étiquettes)`,
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 overflow-hidden select-none">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 shrink-0 shadow-xs z-30">
        {/* Tier 1: Master Action Bar */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg flex items-center gap-1 transition shrink-0"
              title="Revenir à l'accueil des gabarits"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Gabarits</span>
            </button>
            <div className="h-5 w-px bg-slate-200 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-900 truncate">
                  {template.name}
                </span>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-full border border-blue-200 shrink-0">
                  {template.width_mm} × {template.height_mm} mm
                </span>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] font-semibold rounded-full shrink-0">
                  {products.length} articles
                </span>
              </div>
            </div>
          </div>

          {/* Master Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <ContextTooltip
              title="Dictionnaire de Mapping & Alias"
              content="Gérer les alias de colonnes, mots-clés de détection automatique et champs personnalisés"
              category="Données"
            >
              <button
                onClick={() => setIsDictionaryModalOpen(true)}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition"
              >
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                <span>Mapping & Alias</span>
              </button>
            </ContextTooltip>

            <ContextTooltip
              title="Importer Données (Excel/CSV)"
              content="Charger un catalogue d'articles, codes EAN, désignations et grilles tarifaires dégressives"
              category="Données"
            >
              <label className="cursor-pointer px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition">
                <Upload className="w-3.5 h-3.5 text-slate-600" />
                <span>Importer Données</span>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </ContextTooltip>

            {/* Exporter Dropdown Menu */}
            <div className="relative">
              <ContextTooltip
                title="Options d'Exportation"
                content="Générer des fichiers Excel, commandes ZPL directes pour imprimantes Zebra, ou fiches PowerPoint"
                category="Export"
              >
                <button
                  onClick={() => setExportDropdownOpen((prev) => !prev)}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Exporter</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </ContextTooltip>

              {exportDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setExportDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1.5 animate-in fade-in-50 duration-100">
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                      Formats d'Exportation
                    </div>
                    <button
                      onClick={() => {
                        setExportDropdownOpen(false);
                        handleExportExcel();
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 rounded-lg flex items-center gap-2.5 transition"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <div className="font-semibold">Tableur Excel (.xlsx)</div>
                        <div className="text-[10px] text-slate-400">Catalogue articles & paliers</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setExportDropdownOpen(false);
                        setShowZplModal(true);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg flex items-center gap-2.5 transition"
                    >
                      <Cpu className="w-4 h-4 text-slate-800 shrink-0" />
                      <div>
                        <div className="font-semibold">Zebra / TSC (.zpl)</div>
                        <div className="text-[10px] text-slate-400">Flux thermique direct industriel</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setExportDropdownOpen(false);
                        handleExportPptx();
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-amber-50 hover:text-amber-900 rounded-lg flex items-center gap-2.5 transition"
                    >
                      <Presentation className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <div className="font-semibold">PowerPoint (.pptx)</div>
                        <div className="text-[10px] text-slate-400">Diaporama & fiches de rayon</div>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setShowJobHistory(true)}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition"
              title="Consulter l'historique des travaux d'impression et le spooler SQLite"
            >
              <History className="w-3.5 h-3.5 text-purple-600" />
              <span>Spooler SQLite</span>
            </button>

            <ContextTooltip
              title="Télécharger Planche PDF HD"
              content="Générer un PDF vectoriel haute définition 300 DPI avec traits de coupe et repères de pose"
              category="Production"
            >
              <button
                onClick={() => setExportConfirmTarget('pdf')}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Télécharger PDF Planche</span>
              </button>
            </ContextTooltip>
          </div>
        </div>

        {/* Tier 2: Ergonomic 3-Phase Workflow Ribbon */}
        <div className="px-4 py-2 bg-slate-50 flex items-center justify-between gap-4 overflow-x-auto text-xs">
          <div className="flex items-center gap-6">
            {/* Phase 1: Données & Paliers */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:inline">
                1. Données :
              </span>
              <ContextTooltip
                title="Catalogue Données"
                content="Gestion du catalogue de produits et des colonnes de données dynamiques"
                category="Données"
              >
                <button
                  onClick={() => setActiveTab('data')}
                  className={`px-2.5 py-1 font-semibold rounded-lg flex items-center gap-1.5 transition ${
                    activeTab === 'data'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Catalogue ({products.length})</span>
                </button>
              </ContextTooltip>
              <ContextTooltip
                title="Tarification Dégressive & Paliers"
                content="Configurer les remises sur quantité (ex: 2e à -50%, lot de 3) et prix unitaire au litre/kg"
                category="Tarification"
              >
                <button
                  onClick={() => setActiveTab('tiers')}
                  className={`px-2.5 py-1 font-semibold rounded-lg flex items-center gap-1.5 transition ${
                    activeTab === 'tiers'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  <TrendingDown className="w-3.5 h-3.5 text-blue-500" />
                  <span>Paliers & Dégressif</span>
                </button>
              </ContextTooltip>
              <ContextTooltip
                title="Clustering Root Tool"
                content="Moteur sémantique d'assortiments : regroupe automatiquement les variantes d'un produit (parfums, teintes, formats) pour une étiquette unifiée"
                category="Clustering Sémantique"
              >
                <button
                  onClick={() => setActiveTab('clustering')}
                  className={`px-2.5 py-1 font-semibold rounded-lg flex items-center gap-1.5 transition ${
                    activeTab === 'clustering'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  <Boxes className="w-3.5 h-3.5 text-purple-500" />
                  <span>Assortiments & Variantes</span>
                </button>
              </ContextTooltip>
            </div>

            <div className="h-4 w-px bg-slate-300 hidden md:block" />

            {/* Phase 2: Signalétique & Imposition */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:inline">
                2. Mise en Page :
              </span>
              <ContextTooltip
                title="Panneaux Multi-Slots & Règles"
                content="Banderoles et bacs soldeurs multi-produits avec affectation conditionnelle intelligente"
                category="Mise en Page"
              >
                <button
                  onClick={() => setActiveTab('multislot')}
                  className={`px-2.5 py-1 font-semibold rounded-lg flex items-center gap-1.5 transition ${
                    activeTab === 'multislot'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Multi-Slots & Règles</span>
                </button>
              </ContextTooltip>
              <ContextTooltip
                title="Imposition Planche & Gabarits Avery"
                content="Calcul automatique du nombre d'étiquettes par feuille A4/A3, marges, caniveaux et repères"
                category="Imposition"
              >
                <button
                  onClick={() => setActiveTab('imposition')}
                  className={`px-2.5 py-1 font-semibold rounded-lg flex items-center gap-1.5 transition ${
                    activeTab === 'imposition'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" />
                  <span>Imposition Planche</span>
                </button>
              </ContextTooltip>
              <ContextTooltip
                title="Calibration Blueprint & Repérage"
                content="Ajustement fin au millimètre par rapport aux supports pré-imprimés physiques"
                category="Calibration"
              >
                <button
                  onClick={() => setActiveTab('blueprint')}
                  className={`px-2.5 py-1 font-semibold rounded-lg flex items-center gap-1.5 transition ${
                    activeTab === 'blueprint'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5 text-amber-500" />
                  <span>Calibration Blueprint</span>
                </button>
              </ContextTooltip>
            </div>

            <div className="h-4 w-px bg-slate-300 hidden md:block" />

            {/* Phase 3: BÀT & Validation */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:inline">
                3. BÀT :
              </span>
              <ContextTooltip
                title="Aperçu BÀT Unitaire"
                content="Bon à Tirer unitaire avec carrousel de défilement article par article et validation visuelle"
                category="Contrôle Qualité"
              >
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`px-2.5 py-1 font-semibold rounded-lg flex items-center gap-1.5 transition ${
                    activeTab === 'preview'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Aperçu BÀT Unitaire</span>
                </button>
              </ContextTooltip>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border bg-white shadow-2xs">
              <span className="text-slate-400">Pré-presse :</span>
              {preFlightReport.status === 'ready' ? (
                <span className="text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Conforme (300 DPI)</span>
                </span>
              ) : preFlightReport.status === 'warning' ? (
                <span className="text-amber-600 flex items-center gap-1" title={preFlightReport.issues.map((i) => i.message).join('\n')}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{preFlightReport.warningsCount} avertissement(s)</span>
                </span>
              ) : (
                <span className="text-red-600 flex items-center gap-1" title={preFlightReport.issues.map((i) => i.message).join('\n')}>
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{preFlightReport.errorsCount} erreur(s)</span>
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 font-mono hidden lg:block">
              Workflow E-Studio • Planche {template.name}
            </div>
          </div>
        </div>
      </header>

      {/* Global Print & Preview Scope Control Bar */}
      <div className="bg-slate-900 text-white border-b border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 z-20 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-slate-300">
            <Target className="w-4 h-4 text-blue-400 shrink-0" />
            <span>Périmètre d'Aperçu & Impression :</span>
          </div>

          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setPrintScope('selected_only')}
              className={`px-3 py-1 rounded-md font-semibold text-xs transition flex items-center gap-1.5 ${
                printScope === 'selected_only'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Générer et prévisualiser uniquement pour l'article sélectionné"
            >
              <span>🎯 Article sélectionné seul</span>
            </button>

            <button
              onClick={() => setPrintScope('checked_only')}
              className={`px-3 py-1 rounded-md font-semibold text-xs transition flex items-center gap-1.5 ${
                printScope === 'checked_only'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Générer pour les articles cochés avec leurs quantités respectives"
            >
              <span>☑️ Articles cochés ({checkedProductIds.size})</span>
            </button>

            <button
              onClick={() => setPrintScope('all')}
              className={`px-3 py-1 rounded-md font-semibold text-xs transition flex items-center gap-1.5 ${
                printScope === 'all'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Générer pour la totalité du catalogue ou du lot filtré"
            >
              <span>📦 Tout le catalogue ({filteredProducts.length})</span>
            </button>
          </div>

          {printScope === 'selected_only' && (
            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-800">
              <label className="flex items-center gap-1.5 text-slate-300 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={fillSheetWithSelected}
                  onChange={(e) => setFillSheetWithSelected(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                />
                <span>Remplir planche ({imposition?.total_per_page || 1} ex.)</span>
              </label>

              {!fillSheetWithSelected && (
                <div className="flex items-center gap-1 text-slate-300 text-xs">
                  <span className="text-slate-400">Exemplaires :</span>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={selectedCopies}
                    onChange={(e) => setSelectedCopies(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-14 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-center font-mono text-xs text-white"
                  />
                </div>
              )}
            </div>
          )}

          {printScope === 'checked_only' && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-800 text-xs">
              <button
                onClick={() => setCheckedProductIds(new Set(filteredProducts.map((p) => p.id)))}
                className="text-blue-400 hover:underline font-medium"
              >
                Tout cocher
              </button>
              <span className="text-slate-600">•</span>
              <button
                onClick={() => setCheckedProductIds(new Set())}
                className="text-slate-400 hover:underline"
              >
                Tout décocher
              </button>
            </div>
          )}
        </div>

        {/* Live Calculation Output Indicator */}
        <div className="flex items-center gap-2 text-slate-400 text-xs">
          <span>Sortie prévue :</span>
          <span className="px-2 py-0.5 rounded font-mono font-bold bg-slate-800 text-blue-300 border border-slate-700">
            {effectivePrintItems.length} étiquette{effectivePrintItems.length > 1 ? 's' : ''} • {Math.ceil((effectivePrintItems.length + (impositionConfig.start_offset_slot || 0)) / (imposition?.total_per_page || 1))} feuille{Math.ceil((effectivePrintItems.length + (impositionConfig.start_offset_slot || 0)) / (imposition?.total_per_page || 1)) > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Tab 1: Single Label Live Preview with Next/Prev Carousel */}
      {activeTab === 'preview' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: Articles List */}
          <div className="w-84 bg-white border-r border-slate-200 flex flex-col shrink-0">
            <div className="p-3 border-b border-slate-200 bg-slate-50/70">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher article, EAN, SKU..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentIndex(0);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  <p className="font-semibold text-slate-600 mb-1">Aucun article dans la file</p>
                  <p>Importez un fichier Excel/CSV ou liez des données depuis le catalogue pour générer des planches.</p>
                </div>
              ) : (
                filteredProducts.map((p, idx) => {
                const diag = diagnostics.find((d) => d.id === p.id);
                const isSelected = idx === currentIndex;
                const isChecked = checkedProductIds.has(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`p-3 cursor-pointer transition flex items-start gap-2.5 ${
                      isSelected ? 'bg-blue-50/80 border-l-3 border-blue-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        e.stopPropagation();
                        setCheckedProductIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          return next;
                        });
                      }}
                      className="mt-1 rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 shrink-0 cursor-pointer"
                      title="Cocher pour impression par lot"
                    />
                    <div className="pt-0.5">
                      {diag?.status === 'error' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                      ) : diag?.status === 'warning' ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-slate-400 font-bold">{p.PARTNO}</span>
                        <span className="font-bold text-xs text-slate-900">
                          {(Number(p.SELLING_PRICE) || 0).toLocaleString('fr-FR')} F
                        </span>
                      </div>
                      <p className="font-semibold text-xs text-slate-800 truncate mt-0.5">{p.ITEMNAME}</p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-0.5">
                        <span className="font-mono">{p.PRODUCT_SCAN || 'Sans code-barres'}</span>
                        {isChecked && (
                          <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded text-[9px] font-bold">
                            Coché
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }))}
            </div>
          </div>

          {/* Right Main Stage: Preview & Controls */}
          <div className="flex-1 flex flex-col bg-slate-100 overflow-hidden">
            {/* Carousel Navigation Bar */}
            <div className="h-11 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentIndex((c) => Math.max(0, c - 1))}
                  disabled={currentIndex === 0}
                  className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 text-slate-700"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono text-xs font-bold text-slate-700">
                  Article {currentIndex + 1} sur {filteredProducts.length}
                </span>
                <button
                  onClick={() => setCurrentIndex((c) => Math.min(filteredProducts.length - 1, c + 1))}
                  disabled={currentIndex === filteredProducts.length - 1}
                  className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 text-slate-700"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {currentProduct && (
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-3 text-xs text-slate-600">
                    <span>
                      Marque: <strong className="text-slate-800">{currentProduct.BRAND_INFO || '—'}</strong>
                    </span>
                    <span>
                      Rayon: <strong className="text-slate-800">{currentProduct.CATEGORY_NAME || '—'}</strong>
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setPrintScope('selected_only');
                      handleGeneratePdf();
                    }}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition"
                    title="Générer le PDF pour cet article sélectionné"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>PDF cet article</span>
                  </button>
                </div>
              )}
            </div>

            {/* Centered Preview Canvas */}
            <div
              className="flex-1 flex items-center justify-center p-8 overflow-auto"
              style={{
                backgroundColor: '#e2e8f0',
                backgroundImage:
                  'radial-gradient(#cbd5e1 1.5px, transparent 1.5px), radial-gradient(#cbd5e1 1.5px, #e2e8f0 1.5px)',
                backgroundSize: '24px 24px',
                backgroundPosition: '0 0, 12px 12px',
              }}
            >
              {currentProduct ? (
                <div className="shadow-2xl ring-1 ring-slate-300">
                  <LabelRenderer
                    template={template}
                    record={currentProduct}
                    zoom={1.6}
                    showBleed={false}
                    showInnerMargins={false}
                    showHazardWarnings={false}
                    interactive={false}
                  />
                </div>
              ) : (
                <div className="text-center p-8 bg-white border border-slate-200 rounded-2xl shadow-sm max-w-sm">
                  <p className="font-bold text-slate-800 text-sm mb-1">Aperçu en attente de données</p>
                  <p className="text-slate-500 text-xs">Chargez un catalogue ou ajoutez des articles pour prévisualiser ce gabarit avec des données réelles.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Imposition Planche Sheet Layout */}
      {activeTab === 'imposition' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Settings Panel */}
          <div className="w-80 bg-white border-r border-slate-200 p-5 flex flex-col gap-4 text-xs shrink-0 overflow-y-auto">
            <h3 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider text-slate-400">
              Paramètres d'Imposition Planche
            </h3>

            {/* Avery / Standard Formats Preset Quick Picker */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700 flex items-center gap-1">
                  <BookmarkCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>Modèle Planche / Avery</span>
                </label>
              </div>
              <select
                onChange={(e) => {
                  const preset = AVERY_STANDARD_CATALOG.find((p) => p.id === e.target.value);
                  if (preset) {
                    setImpositionConfig({
                      ...impositionConfig,
                      page_size: preset.pageSize === 'ROLL' ? 'CUSTOM' : preset.pageSize,
                      gap_mm: 0,
                    });
                  }
                }}
                defaultValue=""
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
              >
                <option value="" disabled>Sélectionner un format standard...</option>
                {AVERY_STANDARD_CATALOG.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.labelsPerPage}/page)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Format Papier Physique</label>
              <select
                value={impositionConfig.page_size}
                onChange={(e) =>
                  setImpositionConfig({ ...impositionConfig, page_size: e.target.value as any })
                }
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
              >
                <option value="A4">A4 (210 × 297 mm)</option>
                <option value="A3">A3 (297 × 420 mm)</option>
                <option value="A5">A5 (148 × 210 mm)</option>
                <option value="A6">A6 (105 × 148 mm)</option>
                <option value="LETTER">US Letter (215.9 × 279.4 mm)</option>
                <option value="CUSTOM">Personnalisé (Custom mm)</option>
              </select>
            </div>

            {impositionConfig.page_size === 'CUSTOM' && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-2">
                <span className="font-semibold text-slate-700 text-[11px]">Dimensions Page Personnalisée</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-500 font-medium block mb-0.5">Largeur (mm)</span>
                    <input
                      type="number"
                      min="20"
                      max="1000"
                      value={impositionConfig.custom_page_w_mm || 210}
                      onChange={(e) =>
                        setImpositionConfig({
                          ...impositionConfig,
                          custom_page_w_mm: parseFloat(e.target.value) || 210,
                        })
                      }
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-medium block mb-0.5">Hauteur (mm)</span>
                    <input
                      type="number"
                      min="20"
                      max="1000"
                      value={impositionConfig.custom_page_h_mm || 297}
                      onChange={(e) =>
                        setImpositionConfig({
                          ...impositionConfig,
                          custom_page_h_mm: parseFloat(e.target.value) || 297,
                        })
                      }
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Orientation</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setImpositionConfig({ ...impositionConfig, orientation: 'portrait' })}
                  className={`py-1.5 px-3 rounded-lg border text-center font-medium transition ${
                    impositionConfig.orientation === 'portrait'
                      ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  Portrait
                </button>
                <button
                  type="button"
                  onClick={() => setImpositionConfig({ ...impositionConfig, orientation: 'landscape' })}
                  className={`py-1.5 px-3 rounded-lg border text-center font-medium transition ${
                    impositionConfig.orientation === 'landscape'
                      ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  Paysage
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block font-semibold text-slate-700 text-xs">Espacement des Étiquettes sur la Planche (mm)</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-500 font-medium block mb-0.5">Espacement Horiz. X (mm)</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="50"
                    value={impositionConfig.gap_x_mm ?? impositionConfig.gap_mm ?? 2.0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setImpositionConfig({ ...impositionConfig, gap_x_mm: val, gap_mm: val });
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-medium block mb-0.5">Espacement Vert. Y (mm)</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="50"
                    value={impositionConfig.gap_y_mm ?? impositionConfig.gap_mm ?? 2.0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setImpositionConfig({ ...impositionConfig, gap_y_mm: val });
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  template.default_imposition = impositionConfig;
                  await api.templateSave(template);
                }}
                className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <BookmarkCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>Enregistrer cette disposition dans le gabarit</span>
              </button>
            </div>

            {/* Start Offset / Re-use partially used sheet */}
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-amber-900 text-xs flex items-center gap-1.5">
                  <span>Réutilisation de Planche (Décalage)</span>
                </label>
                <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                  Sauter: {impositionConfig.start_offset_slot || 0}
                </span>
              </div>
              <p className="text-[10px] text-amber-700 leading-tight">
                Pour réutiliser une feuille entamée sans gâcher de papier, indiquez le nombre d'étiquettes déjà décollées.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, (imposition?.total_per_page || 24) - 1)}
                  value={impositionConfig.start_offset_slot || 0}
                  onChange={(e) =>
                    setImpositionConfig({
                      ...impositionConfig,
                      start_offset_slot: parseInt(e.target.value) || 0,
                    })
                  }
                  className="flex-1 accent-amber-600 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setImpositionConfig({ ...impositionConfig, start_offset_slot: 0 })}
                  className="px-2 py-0.5 text-[10px] font-semibold bg-white border border-amber-300 hover:bg-amber-100 text-amber-800 rounded"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="font-semibold text-slate-700">Repères de coupe (Crop marks)</label>
              <input
                type="checkbox"
                checked={impositionConfig.show_cut_marks}
                onChange={(e) =>
                  setImpositionConfig({ ...impositionConfig, show_cut_marks: e.target.checked })
                }
                className="rounded text-blue-600"
              />
            </div>

            {/* Advanced PDF Export Config */}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-700 text-xs flex items-center gap-1">
                  <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Résolution & Finition PDF</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-500 font-medium block mb-0.5">Résolution (DPI)</span>
                  <select
                    value={pdfConfig.dpi}
                    onChange={(e) => setPdfConfig({ ...pdfConfig, dpi: parseInt(e.target.value) as any })}
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs"
                  >
                    <option value={150}>150 DPI (Brouillon)</option>
                    <option value={300}>300 DPI (HD Print)</option>
                    <option value={600}>600 DPI (Ultra Pro)</option>
                  </select>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-medium block mb-0.5">Fond Perdu (Bleed)</span>
                  <select
                    value={pdfConfig.bleed_mm}
                    onChange={(e) => setPdfConfig({ ...pdfConfig, bleed_mm: parseFloat(e.target.value) })}
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-mono"
                  >
                    <option value={0}>0 mm</option>
                    <option value={1}>1.0 mm</option>
                    <option value={2}>2.0 mm</option>
                    <option value={3}>3.0 mm</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Print Calibration Offset Controls */}
            <div className="pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-slate-700 text-xs">Calibration Imprimante (Décalage)</label>
                <span className="text-[10px] text-slate-400 font-mono">± 0.1 mm</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-500 font-medium block mb-0.5">Axe X (mm)</span>
                  <input
                    type="number"
                    step="0.1"
                    min="-25"
                    max="25"
                    value={impositionConfig.calibration_x_mm || 0}
                    onChange={(e) =>
                      setImpositionConfig({
                        ...impositionConfig,
                        calibration_x_mm: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-mono"
                    placeholder="0.0"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-medium block mb-0.5">Axe Y (mm)</span>
                  <input
                    type="number"
                    step="0.1"
                    min="-25"
                    max="25"
                    value={impositionConfig.calibration_y_mm || 0}
                    onChange={(e) =>
                      setImpositionConfig({
                        ...impositionConfig,
                        calibration_y_mm: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-mono"
                    placeholder="0.0"
                  />
                </div>
              </div>
            </div>

            {/* Imposition Results Summary */}
            {imposition && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 mt-2">
                <span className="font-bold text-slate-900 block text-xs">Calcul de Grille Physique</span>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <div>
                    Colonnes: <strong className="text-slate-900">{imposition.cols}</strong>
                  </div>
                  <div>
                    Lignes: <strong className="text-slate-900">{imposition.rows}</strong>
                  </div>
                  <div>
                    Par feuille: <strong className="text-blue-700">{imposition.total_per_page} étiquettes</strong>
                  </div>
                  <div>
                    Feuilles requises: <strong className="text-slate-900">{Math.ceil((effectivePrintItems.length + (impositionConfig.start_offset_slot || 0)) / imposition.total_per_page)} ({effectivePrintItems.length} étiquette{effectivePrintItems.length > 1 ? 's' : ''})</strong>
                  </div>
                  <div>
                    Marge Horiz.: <strong className="text-slate-900">{imposition.horizontal_offset_mm.toFixed(1)} mm</strong>
                  </div>
                  <div>
                    Marge Vert.: <strong className="text-slate-900">{imposition.vertical_offset_mm.toFixed(1)} mm</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Visual Imposition Sheet Preview */}
          <div className="flex-1 bg-slate-200 p-8 flex flex-col items-center justify-center overflow-auto">
            <div className="mb-2 text-xs font-medium text-slate-600 flex items-center gap-2">
              <span>Feuille #1 — Cliquez sur un emplacement pour définir l'étiquette de départ</span>
            </div>
            {imposition && (
              <div
                className="bg-white shadow-2xl relative border border-slate-300"
                style={{
                  width: `${imposition.page_w_mm * 1.5}px`,
                  height: `${imposition.page_h_mm * 1.5}px`,
                }}
              >
                {/* Visual grid of labels */}
                {Array.from({ length: imposition.total_per_page }).map((_, slotIdx) => {
                  const col = slotIdx % imposition.cols;
                  const row = Math.floor(slotIdx / imposition.cols);
                  const startOffset = impositionConfig.start_offset_slot || 0;
                  const isSkipped = slotIdx < startOffset;
                  const prodIndex = slotIdx - startOffset;
                  const prod = prodIndex >= 0 ? effectivePrintItems[prodIndex] : undefined;

                  const x = imposition.horizontal_offset_mm + col * (imposition.label_total_w_mm + impositionConfig.gap_mm);
                  const y = imposition.vertical_offset_mm + row * (imposition.label_total_h_mm + impositionConfig.gap_mm);

                  return (
                    <div
                      key={slotIdx}
                      onClick={() => {
                        setImpositionConfig({
                          ...impositionConfig,
                          start_offset_slot: isSkipped ? 0 : slotIdx,
                        });
                      }}
                      className={`absolute border flex flex-col justify-between p-1 overflow-hidden cursor-pointer transition ${
                        isSkipped
                          ? 'border-dashed border-amber-300 bg-amber-50/40 text-amber-500 opacity-60 hover:opacity-100'
                          : 'border-slate-300 bg-slate-50/50 hover:bg-blue-50/50 hover:border-blue-300'
                      }`}
                      style={{
                        left: `${x * 1.5}px`,
                        top: `${y * 1.5}px`,
                        width: `${template.width_mm * 1.5}px`,
                        height: `${template.height_mm * 1.5}px`,
                      }}
                      title={isSkipped ? `Emplacement #${slotIdx + 1} sauté (déjà utilisé). Cliquer pour réactiver.` : `Cliquer pour démarrer à l'emplacement #${slotIdx + 1}`}
                    >
                      {isSkipped ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                          <span className="text-[8px] font-bold text-amber-700">Déjà Utilisé (#{slotIdx + 1})</span>
                          <span className="text-[7px] text-amber-600/80">Sauté</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between text-[8px] font-bold text-slate-700">
                            <span className="truncate">{prod ? prod.ITEMNAME : `Emplacement #${slotIdx + 1}`}</span>
                            {prod && (
                              <span className="text-blue-600">
                                {prod.SELLING_PRICE} {(template.items?.find((i: any) => (i as any).currency_symbol) as any)?.currency_symbol || '€'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[7px] text-slate-400 font-mono">
                            <span>{prod?.PRODUCT_SCAN || '—'}</span>
                            <span>{template.width_mm}x{template.height_mm}mm</span>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Data Table */}
      {activeTab === 'data' && (
        <div className="flex-1 bg-white flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-slate-700">Données Articles ({products.length} lignes)</span>
            </div>
            <button
              onClick={() => {
                const newRow: ProductRecord = {
                  id: `ROW-${Date.now()}`,
                  STORE_NAME: 'SUPERMARCHÉ CENTRAL',
                  ITEMNAME: 'Nouvel Article',
                  SELLING_PRICE: 1000,
                  PRODUCT_SCAN: '3250390000000',
                  PARTNO: `ART-${products.length + 1}`,
                  CATEGORY_NAME: 'ÉPICERIE',
                  SELLING_UNIT: 'pièce',
                };
                setProducts([...products, newRow]);
              }}
              className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ajouter une ligne</span>
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-500 font-semibold z-10">
                <tr>
                  <th className="p-2.5">Réf / SKU</th>
                  <th className="p-2.5">Nom de l'Article</th>
                  <th className="p-2.5">Code-barres (EAN)</th>
                  <th className="p-2.5">Prix Vente</th>
                  <th className="p-2.5">Prix Promo</th>
                  <th className="p-2.5">Rayon / Catégorie</th>
                  <th className="p-2.5">Paliers (Cash&Carry)</th>
                  <th className="p-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-mono text-[11px] text-slate-700 font-bold">{p.PARTNO}</td>
                    <td className="p-2.5">
                      <input
                        type="text"
                        value={p.ITEMNAME}
                        onChange={(e) => {
                          const updated = [...products];
                          updated[idx] = { ...p, ITEMNAME: e.target.value };
                          setProducts(updated);
                        }}
                        className="w-full px-2 py-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded font-semibold text-slate-800"
                      />
                    </td>
                    <td className="p-2.5 font-mono text-slate-600">
                      <input
                        type="text"
                        value={p.PRODUCT_SCAN || ''}
                        onChange={(e) => {
                          const updated = [...products];
                          updated[idx] = { ...p, PRODUCT_SCAN: e.target.value };
                          setProducts(updated);
                        }}
                        className="w-full px-2 py-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded font-mono"
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        value={p.SELLING_PRICE}
                        onChange={(e) => {
                          const updated = [...products];
                          updated[idx] = { ...p, SELLING_PRICE: parseFloat(e.target.value) || 0 };
                          setProducts(updated);
                        }}
                        className="w-24 px-2 py-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded font-bold text-slate-900"
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        placeholder="—"
                        value={p.PROMOPRICE ?? ''}
                        onChange={(e) => {
                          const updated = [...products];
                          updated[idx] = {
                            ...p,
                            PROMOPRICE: e.target.value ? parseFloat(e.target.value) : undefined,
                          };
                          setProducts(updated);
                        }}
                        className="w-24 px-2 py-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded text-rose-600 font-bold"
                      />
                    </td>
                    <td className="p-2.5 text-slate-600">{p.CATEGORY_NAME || '—'}</td>
                    <td className="p-2.5">
                      {p.price_tiers && p.price_tiers.length > 0 ? (
                        <span className="text-[11px] text-sky-700 font-medium">
                          {p.price_tiers.map((t) => `${t.min_qty}+ : ${t.unit_price}`).join(' | ')}
                        </span>
                      ) : p.TIERS && p.TIERS.length > 0 ? (
                        <span className="text-[11px] text-sky-700 font-medium">
                          {p.TIERS.map((t) => `${t.qty}+ : ${t.unit_price}`).join(' | ')}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-2.5 text-right">
                      <button
                        onClick={() => setProducts(products.filter((_, i) => i !== idx))}
                        className="p-1 hover:bg-rose-50 text-rose-500 rounded"
                        title="Supprimer la ligne"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Paliers Tarifaires & Ingestion Dégressive Studio */}
      {activeTab === 'tiers' && (
        <TierPricingStudio
          products={products}
          onUpdateProduct={handleUpdateSingleProduct}
          onBatchUpdateProducts={setProducts}
        />
      )}

      {/* Tab 5: Regroupement & Assortiments Studio */}
      {activeTab === 'clustering' && (
        <ProductClusteringStudio
          products={products}
          onAddVirtualAssortment={(virtualItem) => setProducts([virtualItem, ...products])}
          onRemoveProduct={(id) => setProducts(products.filter((p) => p.id !== id))}
          onUpdateProduct={handleUpdateSingleProduct}
        />
      )}

      {/* Tab 6: Signalétique Multi-Slots & Attribution par Règles */}
      {activeTab === 'multislot' && (
        <MultiSlotSignageStudio
          products={products}
          templates={DEFAULT_TEMPLATES}
          onUpdateProduct={handleUpdateSingleProduct}
          onSelectTemplateForCanvas={() => {}}
        />
      )}

      {/* Tab 7: Calibration d'Imposition Blueprint Stock */}
      {activeTab === 'blueprint' && (
        <ImpositionCalibrationBoard
          template={template}
          products={products}
          impositionConfig={impositionConfig}
          onUpdateImpositionConfig={setImpositionConfig}
        />
      )}

      {/* Excel / CSV Built-in Data Mapping Modal */}
      {mappingModalOpen && (
        <DataMappingModal
          rawHeaders={rawHeaders}
          rawRows={rawRows}
          onApplyMapping={handleApplyMapping}
          onCancel={() => setMappingModalOpen(false)}
        />
      )}

      {/* Mapping Dictionary Modal */}
      <MappingDictionaryModal
        isOpen={isDictionaryModalOpen}
        onClose={() => setIsDictionaryModalOpen(false)}
      />

      {/* ZPL Thermal Printer Modal */}
      {showZplModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Export ZPL II (Thermique Direct)</h3>
                  <p className="text-[11px] text-slate-500">Imprimantes Zebra, TSC, Honeywell, Godex</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Résolution de la tête thermique</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setZplDpi(203)}
                    className={`py-2 px-3 rounded-lg border text-center font-medium transition ${
                      zplDpi === 203
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-bold shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    203 DPI
                    <span className="block text-[9px] font-normal text-slate-400">8 dots/mm (Standard)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setZplDpi(300)}
                    className={`py-2 px-3 rounded-lg border text-center font-medium transition ${
                      zplDpi === 300
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-bold shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    300 DPI
                    <span className="block text-[9px] font-normal text-slate-400">12 dots/mm (Haute Définition)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setZplDpi(600)}
                    className={`py-2 px-3 rounded-lg border text-center font-medium transition ${
                      zplDpi === 600
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-bold shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    600 DPI
                    <span className="block text-[9px] font-normal text-slate-400">24 dots/mm (Micro texte)</span>
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600 space-y-1">
                <p className="text-[11px] font-semibold text-slate-800">Prêt pour le flux d'impression :</p>
                <p className="text-[10px]">• {products.length} étiquettes prêtes à envoyer en lot</p>
                <p className="text-[10px]">• Format : {template.width_mm} × {template.height_mm} mm</p>
                <p className="text-[10px]">• Codes-barres natifs haute vitesse (^BC, ^BE, ^BQ)</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowZplModal(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowZplModal(false);
                  setExportConfirmTarget('zpl');
                }}
                className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Télécharger fichier .ZPL</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-Tier Pre-Export Quality Verification & Confirmation Summary Modal */}
      {exportConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full flex flex-col max-h-[85vh] overflow-hidden text-slate-100 font-sans">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    preFlightReport.status === 'ready'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : preFlightReport.status === 'warning'
                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                      : 'bg-rose-950 text-rose-400 border border-rose-800'
                  }`}
                >
                  <FileCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Vérification Pré-Vol & Confirmation d'Export</h3>
                  <p className="text-[11px] text-slate-400">Contrôle qualité avant génération du fichier</p>
                </div>
              </div>
              <button
                onClick={() => setExportConfirmTarget(null)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Export Parameters Summary */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Format d'exportation :</span>
                  <span className="font-bold text-white uppercase font-mono">
                    {exportConfirmTarget === 'pdf' ? 'PDF (Planches multi-poses HD)' : 'ZPL (Thermique direct)'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Nombre d'étiquettes :</span>
                  <span className="font-bold text-white font-mono">{effectivePrintItems.length} article(s)</span>
                </div>
                {exportConfirmTarget === 'pdf' && imposition && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Nombre de planches / feuilles :</span>
                    <span className="font-bold text-white font-mono">
                      {Math.ceil(effectivePrintItems.length / Math.max(1, imposition.total_per_page))} feuille(s) ({imposition.cols}×{imposition.rows} poses)
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Nom de fichier cible :</span>
                  <span className="font-mono text-blue-400 text-[11px] truncate max-w-xs">
                    {exportConfirmTarget === 'pdf'
                      ? `etiquettes_imposees_${template.name.toLowerCase().replace(/\s+/g, '_')}.pdf`
                      : `thermique_${template.name.toLowerCase().replace(/\s+/g, '_')}_${zplDpi}dpi.zpl`}
                  </span>
                </div>
              </div>

              {/* Quality Verification Status */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 block uppercase font-mono">
                  Résultats des Contrôles Pré-Vol
                </span>
                {preFlightReport.status === 'ready' ? (
                  <div className="bg-emerald-950/30 border border-emerald-800/50 p-3.5 rounded-xl flex items-center gap-2.5 text-emerald-300">
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <p className="font-bold text-xs text-white">Gabarit 100% Conforme</p>
                      <p className="text-[11px] text-emerald-200/80">
                        Marges sécurisées respectées, champs de prix conformes et codes-barres valides.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div
                      className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
                        preFlightReport.status === 'warning'
                          ? 'bg-amber-950/40 border-amber-800 text-amber-300'
                          : 'bg-rose-950/40 border-rose-800 text-rose-300'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>
                        {preFlightReport.errorsCount > 0
                          ? `${preFlightReport.errorsCount} erreur(s) et ${preFlightReport.warningsCount} avertissement(s) détecté(s)`
                          : `${preFlightReport.warningsCount} avertissement(s) de mise en page détecté(s)`}
                      </span>
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1.5 bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
                      {preFlightReport.issues.map((issue) => (
                        <div key={issue.id} className="text-[11px] flex items-start gap-2 text-slate-300">
                          <span
                            className={`px-1 py-0.2 rounded text-[9px] font-mono font-bold uppercase shrink-0 mt-0.5 ${
                              issue.severity === 'error' ? 'bg-rose-900 text-rose-200' : 'bg-amber-900 text-amber-200'
                            }`}
                          >
                            {issue.severity}
                          </span>
                          <span className="leading-tight">{issue.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setExportConfirmTarget(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!preFlightReport.passed}
                onClick={() => {
                  if (!preFlightReport.passed) return;
                  const target = exportConfirmTarget;
                  setExportConfirmTarget(null);
                  if (target === 'pdf') {
                    handleGeneratePdf();
                  } else if (target === 'zpl') {
                    handleExportZpl();
                  }
                }}
                className={`px-5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition ${
                  preFlightReport.passed
                    ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                }`}
                title={!preFlightReport.passed ? 'Export bloqué : corrigez les erreurs pré-vol' : 'Confirmer et enregistrer'}
              >
                <Download className="w-3.5 h-3.5" />
                <span>{preFlightReport.passed ? 'Confirmer et Enregistrer' : 'Export Bloqué (Erreurs pré-vol)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <PrintJobHistoryModal
        isOpen={showJobHistory}
        onClose={() => setShowJobHistory(false)}
      />
    </div>
  );
};
