import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { LabelTemplate, TemplateItem, ProductRecord } from '../types';
import { LabelRenderer } from './LabelRenderer';
import { PropertyInspector } from './PropertyInspector';
import { SmartNavTreeSidebar } from './SmartNavTreeSidebar';
import { ContextualFloatingRibbon } from './ContextualFloatingRibbon';
import { FloatingDiagnosticCapsule } from './FloatingDiagnosticCapsule';
import { DiagnosticHeatmapOverlay } from './DiagnosticHeatmapOverlay';
import { FindReplaceModal } from './FindReplaceModal';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { CanvasRulers } from './CanvasRulers';
import { FloatingRulerHUD } from './FloatingRulerHUD';
import { catalogRepository as databaseService } from '../services/catalogRepository';
import {
  createObjectInstance,
  ElementStylePayload,
  extractElementStyle,
  applyElementStyle,
} from '../models/TemplateObjectModel';
import { sanitizeNonPriceElement } from '../utils/pricingEngine';
import { desktopFileService } from '../services/desktopFileService';
import { PreFlightEngine } from '../utils/preFlightEngine';
import {
  SmartGuideLine,
  BoxBounds,
  computeSmartGuides,
  computeResizeSmartGuides,
} from '../utils/smartGuides';
import { applySemanticSnapping } from '../utils/semanticSnapping';
import { calculateDynamicInstantiationPosition } from '../utils/dynamicPlacement';
import {
  Save,
  Download,
  Upload,
  Type,
  Square,
  Circle,
  Minus,
  QrCode,
  Barcode,
  Image as ImageIcon,
  DollarSign,
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertTriangle,
  Eye,
  ChevronLeft,
  ChevronRight,
  Printer,
  CheckCircle,
  FileCheck,
  Layers,
  MousePointer,
  RotateCcw,
  RotateCw,
  Copy,
  Trash2,
  Lock,
  Unlock,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Magnet,
  Paintbrush,
  ClipboardCheck,
  ShieldAlert,
  Sliders,
  Crosshair,
  FileImage,
  X,
  CircleDot,
  Stamp,
  Sparkles,
  Group,
  Ungroup,
  Compass,
  Search,
  Keyboard,
  Ruler,
  Grid,
  Cpu,
  Settings,
  HelpCircle,
  Hand,
} from 'lucide-react';
import { ContextTooltip, useTooltip } from '../context/TooltipContext';
import { ViewportZoomToolbar } from './ViewportZoomToolbar';

interface TemplateEditorProps {
  initialTemplate: LabelTemplate;
  onSaveTemplate: (updated: LabelTemplate) => void;
  onBackToHome: () => void;
  onOpenGeneration: (template: LabelTemplate) => void;
  onOpenRulesModal?: () => void;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  initialTemplate,
  onSaveTemplate,
  onBackToHome,
  onOpenGeneration,
  onOpenRulesModal,
}) => {
  const [template, setTemplate] = useState<LabelTemplate>(() => ({
    ...initialTemplate,
    items: initialTemplate.items.map((it) => sanitizeNonPriceElement(it)),
  }));
  // Multi-selection state
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(
    template.items.length > 0 ? [template.items[0].id] : []
  );
  const [history, setHistory] = useState<LabelTemplate[]>([initialTemplate]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const { uiPreferences, updateUIPreferences, openPreferencesModal, rulerSettings } = useTooltip();
  const [zoom, setZoom] = useState(uiPreferences?.defaultZoom || 1.25);
  const [activeTool, setActiveTool] = useState<'select' | 'marquee' | 'pan'>('select');

  // Marquee Drag-to-Zoom State
  const [isZoomMarquee, setIsZoomMarquee] = useState(false);
  const [zoomMarqueeStart, setZoomMarqueeStart] = useState<{ x_mm: number; y_mm: number } | null>(null);
  const [zoomMarqueeRect, setZoomMarqueeRect] = useState<{ x_mm: number; y_mm: number; w_mm: number; h_mm: number } | null>(null);

  // Hand Pan Tool State
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  const [showBleed, setShowBleed] = useState(true);
  const [showInnerMargins, setShowInnerMargins] = useState(true);
  const [showHazardWarnings, setShowHazardWarnings] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSizeMm, setGridSizeMm] = useState(0.5);
  const [showRulers, setShowRulers] = useState(true);
  const [smartGuidesEnabled, setSmartGuidesEnabled] = useState(true);
  const [activeSmartGuides, setActiveSmartGuides] = useState<SmartGuideLine[]>([]);
  const [previewDataIndex, setPreviewDataIndex] = useState<number | null>(null);
  const [savedNotification, setSavedNotification] = useState(false);

  // Context-Driven Adaptive Workspace & Diagnostic States
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const [isInspectorDrawerOpen, setIsInspectorDrawerOpen] = useState(true);
  const [isHeatmapActive, setIsHeatmapActive] = useState(false);

  // Modals state
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isPreFlightModalOpen, setIsPreFlightModalOpen] = useState(false);

  // Live computed pre-flight quality verification report
  const preFlightReport = useMemo(() => {
    return PreFlightEngine.analyzeTemplate(template);
  }, [template]);

  // Mouse live position (mm) for bottom status bar
  const [mousePosMm, setMousePosMm] = useState<{ x_mm: number; y_mm: number } | null>(null);

  // Copy / Paste Style Clipboard
  const [copiedStyle, setCopiedStyle] = useState<ElementStylePayload | null>(null);
  const [styleToast, setStyleToast] = useState<string | null>(null);

  // Dragging & Marquee selection states
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const labelCanvasRef = useRef<HTMLDivElement>(null);

  const [canvasOffsetPx, setCanvasOffsetPx] = useState({ left: 0, top: 0 });

  useEffect(() => {
    const updateOffset = () => {
      if (labelCanvasRef.current && canvasContainerRef.current) {
        const labelRect = labelCanvasRef.current.getBoundingClientRect();
        const containerRect = canvasContainerRef.current.getBoundingClientRect();
        setCanvasOffsetPx({
          left: labelRect.left - containerRect.left,
          top: labelRect.top - containerRect.top,
        });
      }
    };
    updateOffset();
    window.addEventListener('resize', updateOffset);
    return () => window.removeEventListener('resize', updateOffset);
  }, [zoom, template.width_mm, template.height_mm]);

  // Pointer-Centric & Anchor Zoom Engine
  const handleZoomWithAnchor = useCallback(
    (nextZoom: number, anchorPoint?: { clientX: number; clientY: number }) => {
      const clampedZoom = Math.min(8.0, Math.max(0.1, Number(nextZoom.toFixed(3))));
      if (clampedZoom === zoom) return;

      if (!canvasContainerRef.current || !labelCanvasRef.current) {
        setZoom(clampedZoom);
        return;
      }

      const container = canvasContainerRef.current;
      const canvas = labelCanvasRef.current;
      const canvasRect = canvas.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      let clientX: number;
      let clientY: number;

      if (anchorPoint) {
        clientX = anchorPoint.clientX;
        clientY = anchorPoint.clientY;
      } else {
        // Center of the visible viewport container
        clientX = containerRect.left + container.clientWidth / 2;
        clientY = containerRect.top + container.clientHeight / 2;
      }

      const pointMmX = (clientX - canvasRect.left) / (3.78 * zoom);
      const pointMmY = (clientY - canvasRect.top) / (3.78 * zoom);

      const deltaScrollX = pointMmX * 3.78 * (clampedZoom - zoom);
      const deltaScrollY = pointMmY * 3.78 * (clampedZoom - zoom);

      setZoom(clampedZoom);

      container.scrollLeft += deltaScrollX;
      container.scrollTop += deltaScrollY;
    },
    [zoom]
  );

  // Preset zoom methods: Fit to Sheet & Fit to Width
  const handleFitToSheet = useCallback(() => {
    if (!canvasContainerRef.current) return;
    const container = canvasContainerRef.current;
    const availW = Math.max(100, container.clientWidth - 120);
    const availH = Math.max(100, container.clientHeight - 120);
    const scaleW = availW / (template.width_mm * 3.78);
    const scaleH = availH / (template.height_mm * 3.78);
    const fitZoom = Math.min(8.0, Math.max(0.1, Number(Math.min(scaleW, scaleH).toFixed(2))));
    setZoom(fitZoom);

    requestAnimationFrame(() => {
      if (!canvasContainerRef.current || !labelCanvasRef.current) return;
      const cont = canvasContainerRef.current;
      const canvas = labelCanvasRef.current;
      cont.scrollLeft = Math.max(0, (canvas.offsetWidth - cont.clientWidth) / 2);
      cont.scrollTop = Math.max(0, (canvas.offsetHeight - cont.clientHeight) / 2);
    });
  }, [template.width_mm, template.height_mm]);

  const handleFitToWidth = useCallback(() => {
    if (!canvasContainerRef.current) return;
    const container = canvasContainerRef.current;
    const availW = Math.max(100, container.clientWidth - 120);
    const scaleW = availW / (template.width_mm * 3.78);
    const fitZoom = Math.min(8.0, Math.max(0.1, Number(scaleW.toFixed(2))));
    setZoom(fitZoom);
  }, [template.width_mm]);

  // Non-passive wheel event listener for Pointer-Centric zoom
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const isPointerCentric = uiPreferences?.zoomMethod === 'pointer';
      const isCtrlKey = e.ctrlKey || e.metaKey;

      if (isPointerCentric || isCtrlKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const targetZoom = zoom * factor;
        handleZoomWithAnchor(targetZoom, { clientX: e.clientX, clientY: e.clientY });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [zoom, uiPreferences?.zoomMethod, handleZoomWithAnchor]);

  const [isDragging, setIsDragging] = useState(false);
  const [hasMovedDuringDrag, setHasMovedDuringDrag] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{
    x: number;
    y: number;
    itemsOrigPos: Map<string, { x: number; y: number }>;
  } | null>(null);

  // Resizing state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeState, setResizeState] = useState<{
    itemId: string;
    handle: string;
    startX: number;
    startY: number;
    origBox: { x: number; y: number; w: number; h: number };
  } | null>(null);

  // Rotation state
  const [isRotating, setIsRotating] = useState(false);
  const [rotateState, setRotateState] = useState<{
    itemId: string;
    centerScreenX: number;
    centerScreenY: number;
    initialMouseAngleRad: number;
    origRotation: number;
  } | null>(null);
  const [activeRotationAngle, setActiveRotationAngle] = useState<number | null>(null);

  // Marquee Selection Box State (for bulk / rectangle free selection)
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<{ x_mm: number; y_mm: number } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x_mm: number; y_mm: number; w_mm: number; h_mm: number } | null>(null);

  const dbProducts = databaseService.getProducts();
  const availablePreviewProducts: ProductRecord[] =
    dbProducts.length > 0
      ? dbProducts
      : [
          {
            id: 'PREVIEW-001',
            STORE_NAME: 'EXEMPLE MAGASIN',
            PRODUCT_SCAN: '3250390123456',
            PARTNO: 'REF-001',
            ITEMNAME: 'Désignation Produit Exemple',
            ITEMDESCRIPTION: 'Description détaillée pour aperçu du gabarit',
            DIV_NAME: 'ÉPICERIE',
            DEPT_NAME: 'BOISSONS',
            CATEGORY_NAME: 'CAFÉ & THÉ',
            BRAND_INFO: 'Marque Exemple',
            PACK_UNIT: 'Paquet 250g',
            SELLING_PRICE: 2450,
            PROMOPRICE: 1950,
            DISCOUNT_PCT: 20,
            PROMO_LABEL: '-20% IMMÉDIAT',
            UNIT_PRICE_TEXT: '9.80 € / kg',
            TAX: 'TVA 18%',
            SOH: 120,
          },
        ];

  const selectedItems = template.items.filter((i) => selectedItemIds.includes(i.id));
  const currentPreviewRecord: ProductRecord | undefined =
    previewDataIndex !== null ? availablePreviewProducts[previewDataIndex] || availablePreviewProducts[0] : undefined;

  // History / Undo / Redo
  const pushState = (newTemplate: LabelTemplate) => {
    const newHist = history.slice(0, historyIndex + 1);
    newHist.push(newTemplate);
    if (newHist.length > 25) newHist.shift();
    setHistory(newHist);
    setHistoryIndex(newHist.length - 1);
    setTemplate(newTemplate);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const target = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setTemplate(target);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const target = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setTemplate(target);
    }
  };

  const handleUpdateItem = (updated: TemplateItem) => {
    const sanitized = sanitizeNonPriceElement(updated);
    const rawItems = template.items.map((it) => (it.id === sanitized.id ? sanitized : it));
    const next = {
      ...template,
      items: applySemanticSnapping(rawItems),
    };
    pushState(next);
  };

  const handleUpdateMultipleItems = (updatedItems: TemplateItem[]) => {
    const updateMap = new Map(updatedItems.map((u) => [u.id, sanitizeNonPriceElement(u)]));
    const rawItems = template.items.map((it) => (updateMap.has(it.id) ? updateMap.get(it.id)! : it));
    const next = {
      ...template,
      items: applySemanticSnapping(rawItems),
    };
    pushState(next);
  };

  // Copy / Paste Style handlers
  const handleCopyStyle = (styleToCopy?: ElementStylePayload) => {
    let payload = styleToCopy;
    if (!payload) {
      if (selectedItems.length === 0) return;
      payload = extractElementStyle(selectedItems[0]);
    }
    setCopiedStyle(payload);
    setStyleToast('Style copié dans le presse-papiers');
    setTimeout(() => setStyleToast(null), 2500);
  };

  const handlePasteStyle = () => {
    if (!copiedStyle || selectedItems.length === 0) return;

    const updated = selectedItems.map((item) => applyElementStyle(item, copiedStyle));
    handleUpdateMultipleItems(updated);
    setStyleToast(`Style appliqué à ${selectedItems.length} élément(s)`);
    setTimeout(() => setStyleToast(null), 2500);
  };

  const handleDeleteItem = (id: string) => {
    const next = {
      ...template,
      items: template.items.filter((it) => it.id !== id),
    };
    setSelectedItemIds((prev) => prev.filter((i) => i !== id));
    pushState(next);
  };

  const handleDeleteMultipleItems = (ids: string[]) => {
    const set = new Set(ids);
    const next = {
      ...template,
      items: template.items.filter((it) => !set.has(it.id)),
    };
    setSelectedItemIds([]);
    pushState(next);
  };

  const handleDuplicateItem = (id: string) => {
    const orig = template.items.find((it) => it.id === id);
    if (!orig) return;
    const obj = createObjectInstance(orig);
    const newItem = obj.clone();
    const next = {
      ...template,
      items: [...template.items, newItem],
    };
    setSelectedItemIds([newItem.id]);
    pushState(next);
  };

  const handleDuplicateMultipleItems = (ids: string[]) => {
    const toDup = template.items.filter((it) => ids.includes(it.id));
    const newItems = toDup.map((orig) => {
      const obj = createObjectInstance(orig);
      return obj.clone();
    });
    const next = {
      ...template,
      items: [...template.items, ...newItems],
    };
    setSelectedItemIds(newItems.map((n) => n.id));
    pushState(next);
  };

  const handleReorderItem = (id: string, delta: number) => {
    const idx = template.items.findIndex((it) => it.id === id);
    if (idx === -1) return;
    const target = template.items[idx];
    const newItems = [...template.items];
    target.z_index = Math.max(1, (target.z_index || 1) + delta);
    const next = { ...template, items: newItems };
    pushState(next);
  };

  // Alignment & Distribution helpers for multi-selection
  const handleAlign = (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (selectedItems.length < 2) return;

    let targetVal = 0;
    if (type === 'left') {
      targetVal = Math.min(...selectedItems.map((i) => i.x_mm));
    } else if (type === 'right') {
      targetVal = Math.max(...selectedItems.map((i) => i.x_mm + i.w_mm));
    } else if (type === 'center') {
      const minX = Math.min(...selectedItems.map((i) => i.x_mm));
      const maxX = Math.max(...selectedItems.map((i) => i.x_mm + i.w_mm));
      targetVal = (minX + maxX) / 2;
    } else if (type === 'top') {
      targetVal = Math.min(...selectedItems.map((i) => i.y_mm));
    } else if (type === 'bottom') {
      targetVal = Math.max(...selectedItems.map((i) => i.y_mm + i.h_mm));
    } else if (type === 'middle') {
      const minY = Math.min(...selectedItems.map((i) => i.y_mm));
      const maxY = Math.max(...selectedItems.map((i) => i.y_mm + i.h_mm));
      targetVal = (minY + maxY) / 2;
    }

    const updated = selectedItems.map((item) => {
      if (type === 'left') return { ...item, x_mm: targetVal };
      if (type === 'right') return { ...item, x_mm: targetVal - item.w_mm };
      if (type === 'center') return { ...item, x_mm: targetVal - item.w_mm / 2 };
      if (type === 'top') return { ...item, y_mm: targetVal };
      if (type === 'bottom') return { ...item, y_mm: targetVal - item.h_mm };
      if (type === 'middle') return { ...item, y_mm: targetVal - item.h_mm / 2 };
      return item;
    });

    handleUpdateMultipleItems(updated);
  };

  const handleDistribute = (direction: 'horizontal' | 'vertical') => {
    if (selectedItems.length < 3) return;

    if (direction === 'horizontal') {
      const sorted = [...selectedItems].sort((a, b) => a.x_mm - b.x_mm);
      const minX = sorted[0].x_mm;
      const last = sorted[sorted.length - 1];
      const maxX = last.x_mm + last.w_mm;
      const totalItemW = sorted.reduce((sum, item) => sum + item.w_mm, 0);
      const totalGap = maxX - minX - totalItemW;
      const gap = totalGap / (sorted.length - 1);

      let currentX = minX;
      const updated = sorted.map((item) => {
        const res = { ...item, x_mm: currentX };
        currentX += item.w_mm + gap;
        return res;
      });
      handleUpdateMultipleItems(updated);
    } else {
      const sorted = [...selectedItems].sort((a, b) => a.y_mm - b.y_mm);
      const minY = sorted[0].y_mm;
      const last = sorted[sorted.length - 1];
      const maxY = last.y_mm + last.h_mm;
      const totalItemH = sorted.reduce((sum, item) => sum + item.h_mm, 0);
      const totalGap = maxY - minY - totalItemH;
      const gap = totalGap / (sorted.length - 1);

      let currentY = minY;
      const updated = sorted.map((item) => {
        const res = { ...item, y_mm: currentY };
        currentY += item.h_mm + gap;
        return res;
      });
      handleUpdateMultipleItems(updated);
    }
  };

  const addItem = (type: TemplateItem['type'] | string, customField?: string) => {
    const id = `item_${Date.now()}`;
    let newItem: TemplateItem;

    // Determine default dimensions for the element type
    let defaultW = 45.0;
    let defaultH = 12.0;

    if (customField) {
      if (type === 'barcode') {
        defaultW = 48.0;
        defaultH = 16.0;
      } else if (type === 'qrcode') {
        defaultW = 20.0;
        defaultH = 20.0;
      } else if (type === 'price' || type === 'price_block') {
        defaultW = 36.0;
        defaultH = 14.0;
      } else {
        defaultW = 45.0;
        defaultH = 12.0;
      }
    } else {
      switch (type) {
        case 'text':
          defaultW = 45.0;
          defaultH = 12.0;
          break;
        case 'rich_text':
          defaultW = 50.0;
          defaultH = 16.0;
          break;
        case 'shape':
          defaultW = 35.0;
          defaultH = 20.0;
          break;
        case 'ellipse':
          defaultW = 25.0;
          defaultH = 25.0;
          break;
        case 'line':
          defaultW = Math.max(10, template.width_mm - (template.inner_margins_mm?.left || 2) - (template.inner_margins_mm?.right || 2));
          defaultH = 1.0;
          break;
        case 'barcode':
          defaultW = 48.0;
          defaultH = 16.0;
          break;
        case 'qrcode':
          defaultW = 20.0;
          defaultH = 20.0;
          break;
        case 'image':
          defaultW = 30.0;
          defaultH = 25.0;
          break;
        case 'tier_price':
          defaultW = 45.0;
          defaultH = 8.0;
          break;
        case 'restricted_area':
          defaultW = 30.0;
          defaultH = 20.0;
          break;
        case 'curved_text':
          defaultW = 35.0;
          defaultH = 35.0;
          break;
        case 'pictogram':
          defaultW = 22.0;
          defaultH = 12.0;
          break;
        case 'price_block':
          defaultW = 38.0;
          defaultH = 14.0;
          break;
      }
    }

    // Dynamic ergonomic placement calculation based on gabarit geometry and existing items
    const pos = calculateDynamicInstantiationPosition({
      itemType: type,
      w_mm: defaultW,
      h_mm: defaultH,
      template,
      strategy: uiPreferences?.elementPlacementStrategy || 'ergonomic_smart',
      customField,
    });

    const posX = pos.x_mm;
    const posY = pos.y_mm;

    if (customField) {
      if (type === 'barcode') {
        newItem = {
          id,
          type: 'barcode',
          x_mm: posX,
          y_mm: posY,
          w_mm: 48.0,
          h_mm: 16.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          code: '3250390123456',
          barcode_type: 'ean13',
          show_text: true,
          bar_color: '#000000',
          binding_key: customField,
        };
      } else if (type === 'qrcode') {
        newItem = {
          id,
          type: 'qrcode',
          x_mm: posX,
          y_mm: posY,
          w_mm: 20.0,
          h_mm: 20.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          content: 'https://monmagasin.fr',
          module_color: '#000000',
          background_color: '#ffffff',
          binding_key: customField,
        };
      } else if (type === 'price' || type === 'price_block') {
        newItem = {
          id,
          type: 'price_block',
          x_mm: posX,
          y_mm: posY,
          w_mm: 36.0,
          h_mm: 14.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          binding_key: customField,
          currency_symbol: '€',
          currency_position: 'after',
          integer_style: {
            font_size_pt: 24.0,
            font_weight: 'bold',
            text_color: customField === 'DISCPRICE' ? '#dc2626' : '#0f172a',
          },
          decimal_style: {
            font_size_pt: 12.0,
            font_weight: 'bold',
            text_color: customField === 'DISCPRICE' ? '#dc2626' : '#0f172a',
          },
          currency_style: {
            font_size_pt: 10.0,
            font_weight: 'bold',
            text_color: customField === 'DISCPRICE' ? '#dc2626' : '#0f172a',
          },
          alignment: 'right',
          valign: 'middle',
        };
      } else {
        newItem = {
          id,
          type: 'text',
          x_mm: posX,
          y_mm: posY,
          w_mm: 45.0,
          h_mm: 12.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          text: `{{${customField}}}`,
          font_family: 'Plus Jakarta Sans',
          font_size_pt: 12.0,
          font_weight: 'bold',
          font_style: 'normal',
          text_decoration: 'none',
          text_color: '#0f172a',
          alignment: 'left',
          valign: 'top',
          wrap: true,
          overflow: 'autofit_shrink',
          letter_spacing_pt: 0,
          line_height_multiplier: 1.25,
          text_transform: 'none',
          binding_key: customField,
        };
      }
      const next = { ...template, items: [...template.items, newItem] };
      setSelectedItemIds([id]);
      setIsInspectorDrawerOpen(true);
      pushState(next);
      return;
    }

    switch (type) {
      case 'text':
        newItem = {
          id,
          type: 'text',
          x_mm: posX,
          y_mm: posY,
          w_mm: 45.0,
          h_mm: 12.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          text: 'Nouveau Texte',
          font_family: 'Plus Jakarta Sans',
          font_size_pt: 12.0,
          font_weight: 'bold',
          font_style: 'normal',
          text_decoration: 'none',
          text_color: '#0f172a',
          alignment: 'left',
          valign: 'top',
          wrap: true,
          overflow: 'autofit_shrink',
          letter_spacing_pt: 0,
          line_height_multiplier: 1.25,
          text_transform: 'none',
        };
        break;
      case 'shape':
        newItem = {
          id,
          type: 'shape',
          x_mm: posX,
          y_mm: posY,
          w_mm: 35.0,
          h_mm: 20.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          fill_color: '#f8fafc',
          border_color: '#0284c7',
          border_width: 1.0,
          corner_radius: 2.0,
        };
        break;
      case 'ellipse':
        newItem = {
          id,
          type: 'ellipse',
          x_mm: posX,
          y_mm: posY,
          w_mm: 25.0,
          h_mm: 25.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          fill_color: '#fee2e2',
          border_color: '#ef4444',
          border_width: 1.0,
        };
        break;
      case 'line':
        newItem = {
          id,
          type: 'line',
          x_mm: template.inner_margins_mm?.left || 2,
          y_mm: posY,
          w_mm: template.width_mm - (template.inner_margins_mm?.left || 2) - (template.inner_margins_mm?.right || 2),
          h_mm: 1.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          color: '#cbd5e1',
          thickness: 1.0,
          style: 'solid',
        };
        break;
      case 'barcode':
        newItem = {
          id,
          type: 'barcode',
          x_mm: posX,
          y_mm: posY,
          w_mm: 48.0,
          h_mm: 16.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          code: '3250390123456',
          barcode_type: 'ean13',
          show_text: true,
          bar_color: '#000000',
          binding_key: 'PRODUCT_SCAN',
        };
        break;
      case 'qrcode':
        newItem = {
          id,
          type: 'qrcode',
          x_mm: posX,
          y_mm: posY,
          w_mm: 20.0,
          h_mm: 20.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          content: 'https://example.com',
          module_color: '#000000',
          background_color: '#FFFFFF',
        };
        break;
      case 'image':
        newItem = {
          id,
          type: 'image',
          x_mm: posX,
          y_mm: posY,
          w_mm: 30.0,
          h_mm: 25.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          keep_aspect_ratio: true,
          opacity: 1.0,
          binding_key: 'IMAGE_PATH',
        };
        break;
      case 'tier_price':
        newItem = {
          id,
          type: 'tier_price',
          x_mm: posX,
          y_mm: posY,
          w_mm: 45.0,
          h_mm: 8.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          primary_tier: 1,
          prefix_text: 'À partir de',
          unit_label: 'FCFA',
          strict_required: false,
          fallback_to_base_price: true,
        };
        break;
      case 'restricted_area':
        newItem = {
          id,
          type: 'restricted_area',
          x_mm: posX,
          y_mm: posY,
          w_mm: 30.0,
          h_mm: 20.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          zone_color: '#ef4444',
          pattern: 'diagonal_stripes',
          opacity: 0.25,
          warn_on_overlap: true,
          label: 'Zone Réservée / Encoche',
        };
        break;
      case 'curved_text':
        newItem = {
          id,
          type: 'curved_text',
          x_mm: posX,
          y_mm: posY,
          w_mm: 35.0,
          h_mm: 35.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          text: 'QUALITÉ SUPÉRIEURE • ARTISANAL',
          font_family: 'Plus Jakarta Sans',
          font_size_pt: 9.0,
          font_weight: 'bold',
          font_style: 'normal',
          text_color: '#0f172a',
          radius_mm: 15.0,
          start_angle_deg: 180,
          sweep_angle_deg: 180,
          clockwise: true,
          letter_spacing_pt: 1.0,
        };
        break;
      case 'pictogram':
        newItem = {
          id,
          type: 'pictogram',
          x_mm: posX,
          y_mm: posY,
          w_mm: 22.0,
          h_mm: 12.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          pictogram_type: 'nutriscore_a',
          style_variant: 'color',
        };
        break;
      case 'price_block':
        newItem = {
          id,
          type: 'price_block',
          x_mm: posX,
          y_mm: posY,
          w_mm: 38.0,
          h_mm: 14.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          binding_key: 'PROMOPRICE',
          fallback_price: 29.99,
          decimal_separator: ',',
          currency_symbol: '€',
          currency_position: 'after',
          integer_style: {
            font_size_pt: 28,
            font_weight: 'bold',
            text_color: '#0f172a',
          },
          decimal_style: {
            font_size_pt: 14,
            font_weight: 'bold',
            text_color: '#0f172a',
            baseline_shift: 'superscript',
          },
          currency_style: {
            font_size_pt: 13,
            font_weight: 'bold',
            text_color: '#0f172a',
          },
        };
        break;
      case 'rich_text':
        newItem = {
          id,
          type: 'rich_text',
          x_mm: posX,
          y_mm: posY,
          w_mm: 50.0,
          h_mm: 16.0,
          rotation: 0,
          z_index: template.items.length + 1,
          locked: false,
          font_family: 'Plus Jakarta Sans',
          default_font_size_pt: 11,
          default_text_color: '#0f172a',
          alignment: 'left',
          valign: 'top',
          runs: [
            { id: `run_1`, text: 'Offre Spéciale : ', font_weight: 'bold', text_color: '#dc2626' },
            { id: `run_2`, binding_key: 'DESCRIPTION_FR', font_weight: 'normal', text_color: '#0f172a' },
          ],
        };
        break;
    }

    const next = { ...template, items: [...template.items, newItem] };
    setSelectedItemIds([id]);
    pushState(next);
  };

  const handleSave = () => {
    onSaveTemplate(template);
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 2500);
  };

  const exportJson = async () => {
    const dataStr = JSON.stringify(template, null, 2);
    const filename = `${template.name.toLowerCase().replace(/\s+/g, '_')}.json`;
    await desktopFileService.saveText(filename, dataStr, [
      { name: 'Gabarit E-Studio', extensions: ['json'] },
    ]);
  };

  // Keyboard Shortcuts (Undo, Redo, Copy/Paste Style, Duplicate, Nudge, Delete, Select All)
  const handleKeyDown = (e: KeyboardEvent) => {
    if (
      document.activeElement?.tagName === 'INPUT' ||
      document.activeElement?.tagName === 'TEXTAREA' ||
      document.activeElement?.tagName === 'SELECT'
    ) {
      return;
    }

    // Copy Style: Ctrl+Alt+C
    if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'c' || e.key === 'C')) {
      if (selectedItems.length > 0) {
        handleCopyStyle();
        e.preventDefault();
      }
      return;
    }

    // Find & Replace: Ctrl+F
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      setIsFindReplaceOpen(true);
      e.preventDefault();
      return;
    }

    // Paste Style: Ctrl+Alt+V
    if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'v' || e.key === 'V')) {
      if (selectedItems.length > 0 && copiedStyle) {
        handlePasteStyle();
        e.preventDefault();
      }
      return;
    }

    // Zoom In: Ctrl/Cmd + Plus or Equal
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd')) {
      e.preventDefault();
      handleZoomWithAnchor(zoom + 0.1);
      return;
    }

    // Zoom Out: Ctrl/Cmd + Minus
    if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.code === 'NumpadSubtract')) {
      e.preventDefault();
      handleZoomWithAnchor(Math.max(0.1, zoom - 0.1));
      return;
    }

    // Reset Zoom: Ctrl/Cmd + 0
    if ((e.ctrlKey || e.metaKey) && (e.key === '0' || e.code === 'Numpad0')) {
      e.preventDefault();
      handleZoomWithAnchor(1.0);
      return;
    }

    // Alt + A: Open Accessibility & UI Preferences Modal
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      openPreferencesModal();
      return;
    }

    // Tool switching hotkeys (when not editing an input)
    const isTextInput =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target as HTMLElement)?.isContentEditable;

    if (!isTextInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key.toLowerCase() === 'v') {
        setActiveTool('select');
      } else if (e.key.toLowerCase() === 'z') {
        setActiveTool('marquee');
      } else if (e.key.toLowerCase() === 'h') {
        setActiveTool('pan');
      } else if (e.key.toLowerCase() === 'm') {
        setIsHeatmapActive((prev) => !prev);
      } else if (e.key === '[' || e.key === ']') {
        if (e.key === '[') setIsNavCollapsed((prev) => !prev);
        if (e.key === ']') setIsInspectorDrawerOpen((prev) => !prev);
      }
    }

    // Undo: Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      e.preventDefault();
      return;
    }

    // Redo: Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      handleRedo();
      e.preventDefault();
      return;
    }

    // Duplicate: Ctrl+D
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedItemIds.length > 0) {
      handleDuplicateMultipleItems(selectedItemIds);
      e.preventDefault();
      return;
    }

    // Select All: Ctrl+A
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      setSelectedItemIds(template.items.map((it) => it.id));
      e.preventDefault();
      return;
    }

    // Toggle Lock / Group shortcut: Ctrl+G
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
      if (e.shiftKey) {
        // Unlock all selected items
        const updated = selectedItems.map((i) => ({ ...i, locked: false }));
        handleUpdateMultipleItems(updated);
      } else {
        // Toggle lock on selected items
        const anyUnlocked = selectedItems.some((i) => !i.locked);
        const updated = selectedItems.map((i) => ({ ...i, locked: anyUnlocked }));
        handleUpdateMultipleItems(updated);
      }
      e.preventDefault();
      return;
    }

    if (selectedItems.length === 0) return;

    // Standard 96 DPI: 1px = 1 / 3.78 ≈ 0.26458 mm, 10px = 10 / 3.78 ≈ 2.6458 mm
    // Nudge step: Arrow keys = 1px (0.265mm), Shift+Arrow = 10px (2.646mm), Alt+Arrow = 0.1mm
    let step = 1 / 3.78; // 1px
    if (e.altKey && e.shiftKey) {
      step = 0.05;
    } else if (e.altKey) {
      step = 0.1;
    } else if (e.shiftKey) {
      step = 10 / 3.78; // 10px
    }

    if (e.key === 'ArrowLeft') {
      const updated = selectedItems.map((i) => ({ ...i, x_mm: Math.max(0, Number((i.x_mm - step).toFixed(2))) }));
      handleUpdateMultipleItems(updated);
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      const updated = selectedItems.map((i) => ({ ...i, x_mm: Number((i.x_mm + step).toFixed(2)) }));
      handleUpdateMultipleItems(updated);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      const updated = selectedItems.map((i) => ({ ...i, y_mm: Math.max(0, Number((i.y_mm - step).toFixed(2))) }));
      handleUpdateMultipleItems(updated);
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      const updated = selectedItems.map((i) => ({ ...i, y_mm: Number((i.y_mm + step).toFixed(2)) }));
      handleUpdateMultipleItems(updated);
      e.preventDefault();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      handleDeleteMultipleItems(selectedItemIds);
      e.preventDefault();
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItemIds, template, historyIndex, copiedStyle, selectedItems]);

  // Object selection on mouse down
  const handleItemMouseDown = (itemId: string, e: React.MouseEvent) => {
    // If using Pan or Marquee Zoom tools, delegate directly to canvas handler
    if (activeTool === 'pan' || activeTool === 'marquee') {
      handleCanvasMouseDown(e);
      return;
    }

    e.stopPropagation();

    let newSelected: string[];
    if (e.shiftKey) {
      newSelected = selectedItemIds.includes(itemId)
        ? selectedItemIds.filter((id) => id !== itemId)
        : [...selectedItemIds, itemId];
    } else {
      newSelected = selectedItemIds.includes(itemId) && selectedItemIds.length > 1
        ? selectedItemIds
        : [itemId];
    }
    setSelectedItemIds(newSelected);

    const itemsOrigPos = new Map<string, { x: number; y: number }>();
    newSelected.forEach((id) => {
      const it = template.items.find((i) => i.id === id);
      if (it && !it.locked) {
        itemsOrigPos.set(id, { x: it.x_mm, y: it.y_mm });
      }
    });

    if (itemsOrigPos.size > 0) {
      setIsDragging(true);
      setHasMovedDuringDrag(false);
      setDragStartPos({
        x: e.clientX,
        y: e.clientY,
        itemsOrigPos,
      });
    }
  };

  const handleResizeStart = (itemId: string, handle: string, e: React.MouseEvent) => {
    const it = template.items.find((i) => i.id === itemId);
    if (!it || it.locked) return;

    setIsResizing(true);
    setResizeState({
      itemId,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origBox: { x: it.x_mm, y: it.y_mm, w: it.w_mm, h: it.h_mm },
    });
  };

  const handleRotateStart = (itemId: string, e: React.MouseEvent, _handlePos?: string) => {
    const it = template.items.find((i) => i.id === itemId);
    if (!it || it.locked || !labelCanvasRef.current) return;

    const canvasRect = labelCanvasRef.current.getBoundingClientRect();
    const scalePxPerMm = 3.78 * zoom;
    const centerMmX = it.x_mm + it.w_mm / 2;
    const centerMmY = it.y_mm + it.h_mm / 2;
    const centerScreenX = canvasRect.left + centerMmX * scalePxPerMm;
    const centerScreenY = canvasRect.top + centerMmY * scalePxPerMm;

    const initialMouseAngleRad = Math.atan2(e.clientY - centerScreenY, e.clientX - centerScreenX);
    setIsRotating(true);
    setRotateState({
      itemId,
      centerScreenX,
      centerScreenY,
      initialMouseAngleRad,
      origRotation: it.rotation || 0,
    });
    setActiveRotationAngle(it.rotation || 0);
  };

  const handleRotateStep90 = (itemId: string, _e: React.MouseEvent) => {
    const it = template.items.find((i) => i.id === itemId);
    if (!it || it.locked) return;
    const nextRot = Math.round(((it.rotation || 0) + 90) % 360);
    const updated = template.items.map((item) =>
      item.id === itemId ? { ...item, rotation: nextRot } : item
    );
    const nextTemplate = { ...template, items: updated };
    setTemplate(nextTemplate);
    pushState(nextTemplate);
  };

  // Canvas background mouse down -> Start bulk selection, marquee zoom or hand pan
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // only left click

    // If clicking on an interactive control or item, don't hijack
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, [role="button"], [data-item-id], [data-no-deselect]')) {
      return;
    }

    // 1. Hand Pan Tool
    if (activeTool === 'pan' && canvasContainerRef.current) {
      setIsPanning(true);
      setPanStart({
        x: e.clientX,
        y: e.clientY,
        scrollLeft: canvasContainerRef.current.scrollLeft,
        scrollTop: canvasContainerRef.current.scrollTop,
      });
      return;
    }

    // Always clear selection immediately when clicking in empty viewport/canvas without shift key
    if (!e.shiftKey) {
      setSelectedItemIds([]);
    }

    if (!labelCanvasRef.current) return;

    const rect = labelCanvasRef.current.getBoundingClientRect();
    const scalePxPerMm = 3.78 * zoom;
    const clickX_mm = (e.clientX - rect.left) / scalePxPerMm;
    const clickY_mm = (e.clientY - rect.top) / scalePxPerMm;

    // 2. Marquee Drag-to-Zoom Tool
    if (activeTool === 'marquee') {
      setIsZoomMarquee(true);
      setZoomMarqueeStart({ x_mm: clickX_mm, y_mm: clickY_mm });
      setZoomMarqueeRect({ x_mm: clickX_mm, y_mm: clickY_mm, w_mm: 0, h_mm: 0 });
      return;
    }

    // 3. Normal Object Selection Marquee
    setIsMarqueeSelecting(true);
    setMarqueeStart({ x_mm: clickX_mm, y_mm: clickY_mm });
    setMarqueeRect({ x_mm: clickX_mm, y_mm: clickY_mm, w_mm: 0, h_mm: 0 });
  };

  // Global Pointer / Mouse Move
  const handleMouseMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    // 0. Hand Panning
    if (isPanning && panStart && canvasContainerRef.current) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      canvasContainerRef.current.scrollLeft = panStart.scrollLeft - dx;
      canvasContainerRef.current.scrollTop = panStart.scrollTop - dy;
      return;
    }

    const scalePxPerMm = 3.78 * zoom;

    // 0.05 Rotation in Progress
    if (isRotating && rotateState) {
      const currentMouseAngleRad = Math.atan2(
        e.clientY - rotateState.centerScreenY,
        e.clientX - rotateState.centerScreenX
      );
      const deltaRad = currentMouseAngleRad - rotateState.initialMouseAngleRad;
      const deltaDeg = deltaRad * (180 / Math.PI);
      let rawRot = (rotateState.origRotation + deltaDeg) % 360;
      if (rawRot < 0) rawRot += 360;

      const snapEnabled = uiPreferences?.rotationSnapEnabled !== false;
      const snapAngle = uiPreferences?.rotationSnapAngle || 15;
      const shouldSnap = e.shiftKey || snapEnabled;

      let finalRot = rawRot;
      if (shouldSnap) {
        const nearestSnap = Math.round(rawRot / snapAngle) * snapAngle;
        if (e.shiftKey || Math.abs(rawRot - nearestSnap) <= 4.5) {
          finalRot = (nearestSnap % 360 + 360) % 360;
        }
      }
      finalRot = Math.round(finalRot * 10) / 10;
      setActiveRotationAngle(finalRot);

      setTemplate((prev) => ({
        ...prev,
        items: prev.items.map((it) =>
          it.id === rotateState.itemId ? { ...it, rotation: finalRot } : it
        ),
      }));
      return;
    }

    // 0.1 Marquee Drag-to-Zoom
    if (isZoomMarquee && zoomMarqueeStart && labelCanvasRef.current) {
      const rect = labelCanvasRef.current.getBoundingClientRect();
      const currentX_mm = (e.clientX - rect.left) / scalePxPerMm;
      const currentY_mm = (e.clientY - rect.top) / scalePxPerMm;

      const x_mm = Math.min(zoomMarqueeStart.x_mm, currentX_mm);
      const y_mm = Math.min(zoomMarqueeStart.y_mm, currentY_mm);
      const w_mm = Math.abs(currentX_mm - zoomMarqueeStart.x_mm);
      const h_mm = Math.abs(currentY_mm - zoomMarqueeStart.y_mm);

      setZoomMarqueeRect({ x_mm, y_mm, w_mm, h_mm });
      return;
    }

    // 1. Resizing with Smart Guides
    if (isResizing && resizeState) {
      const deltaX = (e.clientX - resizeState.startX) / scalePxPerMm;
      const deltaY = (e.clientY - resizeState.startY) / scalePxPerMm;

      let rawX = resizeState.origBox.x;
      let rawY = resizeState.origBox.y;
      let rawW = resizeState.origBox.w;
      let rawH = resizeState.origBox.h;

      if (resizeState.handle.includes('e')) rawW = Math.max(1.0, resizeState.origBox.w + deltaX);
      if (resizeState.handle.includes('s')) rawH = Math.max(1.0, resizeState.origBox.h + deltaY);
      if (resizeState.handle.includes('w')) {
        const potentialW = resizeState.origBox.w - deltaX;
        if (potentialW >= 1.0) {
          rawX = resizeState.origBox.x + deltaX;
          rawW = potentialW;
        }
      }
      if (resizeState.handle.includes('n')) {
        const potentialH = resizeState.origBox.h - deltaY;
        if (potentialH >= 1.0) {
          rawY = resizeState.origBox.y + deltaY;
          rawH = potentialH;
        }
      }

      // Collect other boxes for smart guides
      const otherBoxes: BoxBounds[] = template.items
        .filter((i) => i.id !== resizeState.itemId)
        .map((i) => ({
          id: i.id,
          left: i.x_mm,
          right: i.x_mm + i.w_mm,
          top: i.y_mm,
          bottom: i.y_mm + i.h_mm,
          centerX: i.x_mm + i.w_mm / 2,
          centerY: i.y_mm + i.h_mm / 2,
          width: i.w_mm,
          height: i.h_mm,
        }));

      const { snappedBox, guides } = computeResizeSmartGuides(
        resizeState.itemId,
        resizeState.handle,
        { x: rawX, y: rawY, w: rawW, h: rawH },
        otherBoxes,
        template.width_mm,
        template.height_mm,
        showInnerMargins ? template.inner_margins_mm : undefined,
        smartGuidesEnabled
      );

      setActiveSmartGuides(guides);

      const updated = template.items.map((it) => {
        if (it.id === resizeState.itemId) {
          return {
            ...it,
            x_mm: Number(snappedBox.x.toFixed(2)),
            y_mm: Number(snappedBox.y.toFixed(2)),
            w_mm: Number(snappedBox.w.toFixed(2)),
            h_mm: Number(snappedBox.h.toFixed(2)),
          };
        }
        return it;
      });

      const snappedItems = applySemanticSnapping(updated);
      setTemplate((prev) => ({ ...prev, items: snappedItems }));
      return;
    }

    // 2. Dragging Elements with Dynamic Smart Guides
    if (isDragging && dragStartPos) {
      const deltaScreenX = e.clientX - dragStartPos.x;
      const deltaScreenY = e.clientY - dragStartPos.y;

      if (Math.abs(deltaScreenX) > 2 || Math.abs(deltaScreenY) > 2) {
        setHasMovedDuringDrag(true);
      }

      const deltaX = deltaScreenX / scalePxPerMm;
      const deltaY = deltaScreenY / scalePxPerMm;

      // Determine primary item or bounding box of moved selection
      const movingItemIds = Array.from(dragStartPos.itemsOrigPos.keys());
      const primaryId = selectedItemIds[0] || movingItemIds[0];
      const primaryOrig = dragStartPos.itemsOrigPos.get(primaryId);
      const primaryItem = template.items.find((i) => i.id === primaryId);

      if (primaryOrig && primaryItem) {
        const rawX = primaryOrig.x + deltaX;
        const rawY = primaryOrig.y + deltaY;

        // Other static boxes on canvas
        const otherBoxes: BoxBounds[] = template.items
          .filter((i) => !dragStartPos.itemsOrigPos.has(i.id))
          .map((i) => ({
            id: i.id,
            left: i.x_mm,
            right: i.x_mm + i.w_mm,
            top: i.y_mm,
            bottom: i.y_mm + i.h_mm,
            centerX: i.x_mm + i.w_mm / 2,
            centerY: i.y_mm + i.h_mm / 2,
            width: i.w_mm,
            height: i.h_mm,
          }));

        const movingBounds: BoxBounds = {
          id: primaryItem.id,
          left: rawX,
          right: rawX + primaryItem.w_mm,
          top: rawY,
          bottom: rawY + primaryItem.h_mm,
          centerX: rawX + primaryItem.w_mm / 2,
          centerY: rawY + primaryItem.h_mm / 2,
          width: primaryItem.w_mm,
          height: primaryItem.h_mm,
        };

        const snapRes = computeSmartGuides(
          movingBounds,
          otherBoxes,
          template.width_mm,
          template.height_mm,
          showInnerMargins ? template.inner_margins_mm : undefined,
          smartGuidesEnabled
        );

        setActiveSmartGuides(snapRes.guides);

        // Calculate effective delta from snap
        let effectiveDeltaX = deltaX;
        let effectiveDeltaY = deltaY;

        if (snapRes.guides.length > 0) {
          effectiveDeltaX = snapRes.snappedX - primaryOrig.x;
          effectiveDeltaY = snapRes.snappedY - primaryOrig.y;
        } else if (snapToGrid) {
          const snap = gridSizeMm;
          effectiveDeltaX = Math.round((primaryOrig.x + deltaX) / snap) * snap - primaryOrig.x;
          effectiveDeltaY = Math.round((primaryOrig.y + deltaY) / snap) * snap - primaryOrig.y;
        }

        const updatedItems = template.items.map((it) => {
          const orig = dragStartPos.itemsOrigPos.get(it.id);
          if (!orig) return it;
          return {
            ...it,
            x_mm: Math.max(0, Number((orig.x + effectiveDeltaX).toFixed(2))),
            y_mm: Math.max(0, Number((orig.y + effectiveDeltaY).toFixed(2))),
          };
        });

        const snappedItems = applySemanticSnapping(updatedItems);
        setTemplate((prev) => ({ ...prev, items: snappedItems }));
        return;
      }
    }

    // 3. Marquee Selection in Progress
    if (isMarqueeSelecting && marqueeStart && labelCanvasRef.current) {
      const rect = labelCanvasRef.current.getBoundingClientRect();
      const currentX_mm = (e.clientX - rect.left) / scalePxPerMm;
      const currentY_mm = (e.clientY - rect.top) / scalePxPerMm;

      const x_mm = Math.min(marqueeStart.x_mm, currentX_mm);
      const y_mm = Math.min(marqueeStart.y_mm, currentY_mm);
      const w_mm = Math.abs(currentX_mm - marqueeStart.x_mm);
      const h_mm = Math.abs(currentY_mm - marqueeStart.y_mm);

      setMarqueeRect({ x_mm, y_mm, w_mm, h_mm });

      // Hit-test elements intersecting or enclosed in marquee rectangle only if dragged >= 2mm
      if (w_mm >= 2 || h_mm >= 2) {
        const enclosedIds = template.items
          .filter((it) => {
            const itX2 = it.x_mm + it.w_mm;
            const itY2 = it.y_mm + it.h_mm;
            const mX2 = x_mm + w_mm;
            const mY2 = y_mm + h_mm;

            // Check AABB rectangle overlap
            return !(it.x_mm > mX2 || itX2 < x_mm || it.y_mm > mY2 || itY2 < y_mm);
          })
          .map((it) => it.id);

        setSelectedItemIds(enclosedIds);
      }
    }
  }, [isRotating, rotateState, uiPreferences, isResizing, resizeState, isDragging, dragStartPos, isMarqueeSelecting, marqueeStart, isPanning, panStart, isZoomMarquee, zoomMarqueeStart, zoom, template, smartGuidesEnabled, snapToGrid, showInnerMargins, selectedItemIds]);

  // Global Mouse Up -> Clean release of all dragging / resizing / marquee / pan / rotation
  const handleMouseUp = useCallback(() => {
    setActiveSmartGuides([]);

    if (isRotating) {
      setIsRotating(false);
      setRotateState(null);
      setActiveRotationAngle(null);
      pushState(template);
    }

    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
    }

    if (isZoomMarquee && zoomMarqueeRect) {
      setIsZoomMarquee(false);
      const { x_mm, y_mm, w_mm, h_mm } = zoomMarqueeRect;
      setZoomMarqueeRect(null);
      setZoomMarqueeStart(null);

      if (w_mm >= 3 && h_mm >= 3 && canvasContainerRef.current && labelCanvasRef.current) {
        const container = canvasContainerRef.current;
        const availW = Math.max(100, container.clientWidth - 100);
        const availH = Math.max(100, container.clientHeight - 100);
        const scaleX = availW / (w_mm * 3.78);
        const scaleY = availH / (h_mm * 3.78);
        const targetZoom = Math.min(8.0, Math.max(0.1, Number(Math.min(scaleX, scaleY).toFixed(3))));

        const centerMmX = x_mm + w_mm / 2;
        const centerMmY = y_mm + h_mm / 2;

        setZoom(targetZoom);

        requestAnimationFrame(() => {
          if (!canvasContainerRef.current || !labelCanvasRef.current) return;
          const cont = canvasContainerRef.current;
          const canvas = labelCanvasRef.current;
          const targetPxX = centerMmX * 3.78 * targetZoom;
          const targetPxY = centerMmY * 3.78 * targetZoom;

          cont.scrollLeft = canvas.offsetLeft + targetPxX - cont.clientWidth / 2;
          cont.scrollTop = canvas.offsetTop + targetPxY - cont.clientHeight / 2;
        });
      }
    }

    if (isResizing) {
      setIsResizing(false);
      setResizeState(null);
      const snapped = applySemanticSnapping(template.items);
      const next = { ...template, items: snapped };
      setTemplate(next);
      pushState(next);
    }

    if (isDragging) {
      setIsDragging(false);
      setDragStartPos(null);
      if (hasMovedDuringDrag) {
        const snapped = applySemanticSnapping(template.items);
        const next = { ...template, items: snapped };
        setTemplate(next);
        pushState(next);
      }
      setHasMovedDuringDrag(false);
    }

    if (isMarqueeSelecting) {
      setIsMarqueeSelecting(false);
      setMarqueeStart(null);
      setMarqueeRect(null);
    }
  }, [isResizing, isDragging, isMarqueeSelecting, isPanning, isZoomMarquee, zoomMarqueeRect, hasMovedDuringDrag, template]);

  // Attach global window listeners to guarantee that releasing the mouse anywhere ends dragging cleanly
  useEffect(() => {
    const onWinMouseMove = (e: MouseEvent) => {
      if (isRotating || isDragging || isResizing || isMarqueeSelecting || isPanning || isZoomMarquee) {
        handleMouseMove(e);
      }
    };
    const onWinMouseUp = () => {
      if (isRotating || isDragging || isResizing || isMarqueeSelecting || isPanning || isZoomMarquee) {
        handleMouseUp();
      }
    };

    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);

    return () => {
      window.removeEventListener('mousemove', onWinMouseMove);
      window.removeEventListener('mouseup', onWinMouseUp);
    };
  }, [isDragging, isResizing, isMarqueeSelecting, isPanning, isZoomMarquee, handleMouseMove, handleMouseUp]);

  return (
    <div className="flex flex-col h-full bg-slate-100 overflow-hidden select-none">
      {/* Top Application Bar */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between z-30 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <ContextTooltip
            title="Gabarits d'Étiquettes"
            content="Revenir au tableau de bord des modèles et étiquettes"
            shortcut="Esc"
            category="Navigation"
          >
            <button
              onClick={onBackToHome}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg flex items-center gap-1 transition"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Gabarits</span>
            </button>
          </ContextTooltip>
          <div className="h-5 w-px bg-slate-200" />
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-none truncate max-w-md">{template.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-slate-500 font-mono">
                {template.width_mm} × {template.height_mm} mm • {template.items.length} éléments
              </span>
              <button
                type="button"
                onClick={() => setIsPreFlightModalOpen(true)}
                className={`text-[10px] font-semibold flex items-center gap-1 px-1.5 py-0.5 rounded transition ${
                  preFlightReport.status === 'ready'
                    ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                    : preFlightReport.status === 'warning'
                    ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200'
                    : 'text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200'
                }`}
                title="Cliquer pour afficher l'analyse pré-vol de conformité"
              >
                <span>● {preFlightReport.status === 'ready' ? 'Prêt' : preFlightReport.status === 'warning' ? `À vérifier (${preFlightReport.warningsCount})` : `Non conforme (${preFlightReport.errorsCount})`}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons & Undo/Redo/Search/Shortcuts/Preferences */}
        <div className="flex items-center gap-2">
          {/* History Stack Controls */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 mr-1">
            <ContextTooltip
              title="Annuler (Undo)"
              content="Annuler la dernière modification effectuée sur le gabarit"
              shortcut="Ctrl+Z"
              category="Historique"
            >
              <button
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                className="p-1.5 rounded hover:bg-white text-slate-700 disabled:opacity-30 transition flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </ContextTooltip>
            <span className="text-[10px] font-mono text-slate-500 font-bold px-1.5 border-x border-slate-200">
              {historyIndex + 1}/{history.length}
            </span>
            <ContextTooltip
              title="Rétablir (Redo)"
              content="Rétablir la dernière action annulée"
              shortcut="Ctrl+Y"
              category="Historique"
            >
              <button
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                className="p-1.5 rounded hover:bg-white text-slate-700 disabled:opacity-30 transition flex items-center gap-1"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </ContextTooltip>
          </div>

          {/* Find & Replace Global Trigger */}
          <ContextTooltip
            title="Rechercher & Remplacer"
            content="Chercher des mentions textuelles ou variables et les remplacer dans tous les calques"
            shortcut="Ctrl+F"
            category="Édition"
          >
            <button
              onClick={() => setIsFindReplaceOpen(true)}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
            >
              <Search className="w-3.5 h-3.5 text-blue-600" />
              <span>Rechercher...</span>
              <kbd className="hidden sm:inline-block px-1 py-0.2 bg-white border border-slate-300 rounded font-mono text-[9px] text-slate-500">
                Ctrl+F
              </kbd>
            </button>
          </ContextTooltip>

          {/* Keyboard Shortcuts Trigger */}
          <ContextTooltip
            title="Raccourcis Clavier Pro"
            content="Afficher l'aide-mémoire et les combinaisons touches professionnelles"
            shortcut="?"
            category="Aide"
          >
            <button
              onClick={() => setIsShortcutsOpen(true)}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-lg transition"
            >
              <Keyboard className="w-4 h-4 text-slate-600" />
            </button>
          </ContextTooltip>

          {/* Accessibility & UI Preferences Trigger */}
          <ContextTooltip
            title="Accessibilité & Préférences UI"
            content="Configurer le système d'info-bulles contextuelles (délai, opacité) et le mode de zoom du viewport"
            shortcut="Alt+A"
            category="Préférences"
          >
            <button
              onClick={openPreferencesModal}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-lg transition flex items-center justify-center text-amber-700 hover:text-amber-800"
            >
              <Settings className="w-4 h-4 text-slate-700" />
            </button>
          </ContextTooltip>

          {onOpenRulesModal && (
            <ContextTooltip
              title="Moteur de Règles Omni-Canal"
              content="Configurer les règles dynamiques et simuler l'affichage sur ESL (encre électronique), étiquette papier ou écran LCD"
              category="Automatisation"
            >
              <button
                onClick={onOpenRulesModal}
                className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
              >
                <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                <span>Règles Omni-Canal</span>
              </button>
            </ContextTooltip>
          )}

          <div className="h-4 w-px bg-slate-200 mx-1" />

          {savedNotification && (
            <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 animate-in fade-in">
              <CheckCircle className="w-4 h-4" />
              Sauvegardé !
            </span>
          )}
          <ContextTooltip
            title="Enregistrer le Gabarit"
            content="Sauvegarder immédiatement les dimensions, calques et règles dans la mémoire du studio"
            shortcut="Ctrl+S"
            category="Fichier"
          >
            <button
              onClick={handleSave}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition shadow-2xs"
            >
              <Save className="w-3.5 h-3.5 text-slate-600" />
              <span>Enregistrer</span>
            </button>
          </ContextTooltip>
          <ContextTooltip
            title="Exporter Gabarit JSON"
            content="Télécharger l'intégralité du gabarit et des éléments vectoriels au format standard JSON"
            category="Export"
          >
            <button
              onClick={exportJson}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export JSON</span>
            </button>
          </ContextTooltip>
          <ContextTooltip
            title="Atelier d'Imposition & Impression"
            content="Basculer vers l'espace de génération par lots, imposition de planches A4/A3/Rouleau et exports ZPL/PDF"
            category="Production"
          >
            <button
              onClick={() => onOpenGeneration(template)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Générer étiquettes</span>
            </button>
          </ContextTooltip>
        </div>
      </header>

      {/* Ergonomic Tools Ribbon Toolbar */}
      <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 flex items-center justify-between shrink-0 overflow-x-auto text-xs gap-3 whitespace-nowrap scrollbar-thin">
        {/* Insert Palette Clusters */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Cluster 1: Typographie & Prix */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 mr-0.5 tracking-wider select-none shrink-0">
              Textes & Prix
            </span>
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs gap-0.5 shrink-0">
              <button
                onClick={() => addItem('text')}
                className="px-2 py-1 rounded hover:bg-slate-100 font-medium text-slate-700 flex items-center gap-1 transition whitespace-nowrap shrink-0"
                title="Ajouter un champ texte standard"
              >
                <Type className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Texte</span>
              </button>
              <button
                onClick={() => addItem('rich_text')}
                className="px-2 py-1 rounded hover:bg-slate-100 font-medium text-slate-700 flex items-center gap-1 transition whitespace-nowrap shrink-0"
                title="Ajouter un texte riche avec multi-segments"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Texte Riche</span>
              </button>
              <button
                onClick={() => addItem('price_block')}
                className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 font-semibold text-emerald-800 flex items-center gap-1 transition whitespace-nowrap shrink-0"
                title="Ajouter un bloc de prix avec centimes flottants"
              >
                <DollarSign className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>Prix Centimes</span>
              </button>
              <button
                onClick={() => addItem('tier_price')}
                className="px-2 py-1 rounded bg-sky-50 hover:bg-sky-100 font-semibold text-sky-800 flex items-center gap-1 transition whitespace-nowrap shrink-0"
                title="Ajouter un tableau de prix par volume/palier"
              >
                <DollarSign className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                <span>Paliers Prix</span>
              </button>
              <button
                onClick={() => addItem('curved_text')}
                className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 font-semibold text-indigo-700 flex items-center gap-1 transition whitespace-nowrap shrink-0"
                title="Ajouter un texte circulaire / courbé"
              >
                <CircleDot className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Courbe</span>
              </button>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-300 shrink-0" />

          {/* Cluster 2: Formes & Codes */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 mr-0.5 tracking-wider select-none shrink-0">
              Formes & Codes
            </span>
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs gap-0.5 shrink-0">
              <button
                onClick={() => addItem('shape')}
                className="px-2 py-1 rounded hover:bg-slate-100 font-medium text-slate-700 flex items-center gap-1 transition whitespace-nowrap shrink-0"
                title="Ajouter un rectangle"
              >
                <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span>Rectangle</span>
              </button>
              <button
                onClick={() => addItem('ellipse')}
                className="px-2 py-1 rounded hover:bg-slate-100 font-medium text-slate-700 flex items-center gap-1 transition whitespace-nowrap shrink-0"
                title="Ajouter une ellipse"
              >
                <Circle className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span>Ellipse</span>
              </button>
              <button
                onClick={() => addItem('line')}
                className="px-2 py-1 rounded hover:bg-slate-100 font-medium text-slate-700 flex items-center gap-1 transition whitespace-nowrap shrink-0"
                title="Ajouter une ligne"
              >
                <Minus className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span>Ligne</span>
              </button>
              <button
                onClick={() => addItem('barcode')}
                className="px-2 py-1 rounded hover:bg-slate-100 font-medium text-slate-700 flex items-center gap-1 transition whitespace-nowrap shrink-0"
                title="Ajouter un code-barres EAN/Code128"
              >
                <Barcode className="w-3.5 h-3.5 text-slate-800 shrink-0" />
                <span>Code-barres</span>
              </button>
              <button
                onClick={() => addItem('qrcode')}
                className="px-2 py-1 rounded hover:bg-slate-100 font-medium text-slate-700 flex items-center gap-1 transition whitespace-nowrap shrink-0"
                title="Ajouter un QR Code"
              >
                <QrCode className="w-3.5 h-3.5 text-slate-800 shrink-0" />
                <span>QR Code</span>
              </button>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-300 shrink-0" />

          {/* Cluster 3: Médias & Sécurité */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 mr-0.5 tracking-wider select-none shrink-0">
              Médias & Normes
            </span>
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs gap-0.5 shrink-0">
              <button
                onClick={() => addItem('image')}
                className="px-2 py-1 rounded hover:bg-slate-100 font-medium text-slate-700 flex items-center gap-1 transition whitespace-nowrap shrink-0"
                title="Ajouter une image"
              >
                <ImageIcon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span>Image</span>
              </button>
              <button
                onClick={() => addItem('pictogram')}
                className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 font-semibold text-emerald-700 flex items-center gap-1 transition whitespace-nowrap shrink-0"
                title="Ajouter un pictogramme réglementaire (Nutri-score, Bio, Eco, etc.)"
              >
                <Stamp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Pictogramme</span>
              </button>
              <button
                onClick={() => addItem('restricted_area')}
                className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 font-semibold text-rose-700 flex items-center gap-1 transition whitespace-nowrap shrink-0"
                title="Ajouter une zone restreinte non imprimable"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>Zone Restreinte</span>
              </button>
            </div>
          </div>
        </div>

        {/* Alignment & Style Clipboard Group */}
        {selectedItems.length > 0 && (
          <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 mr-1 tracking-wider select-none">
              Agencer
            </span>
            <div className="flex items-center bg-white border border-slate-200/80 rounded-lg p-0.5 shadow-2xs gap-0.5">
              {selectedItems.length > 1 && (
                <>
                  <button
                    onClick={() => handleAlign('left')}
                    className="p-1 hover:bg-slate-100 rounded text-slate-700"
                    title="Aligner à gauche"
                  >
                    <AlignLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleAlign('center')}
                    className="p-1 hover:bg-slate-100 rounded text-slate-700"
                    title="Centrer horizontalement"
                  >
                    <AlignCenter className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleAlign('right')}
                    className="p-1 hover:bg-slate-100 rounded text-slate-700"
                    title="Aligner à droite"
                  >
                    <AlignRight className="w-3.5 h-3.5" />
                  </button>
                  <div className="h-3 w-px bg-slate-200 mx-0.5" />
                  <button
                    onClick={() => handleAlign('top')}
                    className="px-1.5 py-0.5 hover:bg-slate-100 rounded text-[10px] font-bold text-slate-700"
                    title="Aligner en haut"
                  >
                    Haut
                  </button>
                  <button
                    onClick={() => handleAlign('middle')}
                    className="px-1.5 py-0.5 hover:bg-slate-100 rounded text-[10px] font-bold text-slate-700"
                    title="Centrer au milieu"
                  >
                    Milieu
                  </button>
                  <button
                    onClick={() => handleAlign('bottom')}
                    className="px-1.5 py-0.5 hover:bg-slate-100 rounded text-[10px] font-bold text-slate-700"
                    title="Aligner en bas"
                  >
                    Bas
                  </button>
                  {selectedItems.length >= 3 && (
                    <>
                      <div className="h-3 w-px bg-slate-200 mx-0.5" />
                      <button
                        onClick={() => handleDistribute('horizontal')}
                        className="px-1.5 py-0.5 hover:bg-slate-100 rounded text-[10px] font-semibold text-slate-700"
                        title="Répartir horizontalement"
                      >
                        Répartir H
                      </button>
                      <button
                        onClick={() => handleDistribute('vertical')}
                        className="px-1.5 py-0.5 hover:bg-slate-100 rounded text-[10px] font-semibold text-slate-700"
                        title="Répartir verticalement"
                      >
                        Répartir V
                      </button>
                    </>
                  )}
                  <div className="h-3 w-px bg-slate-200 mx-0.5" />
                </>
              )}

              <button
                onClick={() => handleCopyStyle()}
                className="px-2 py-0.5 rounded hover:bg-slate-100 text-slate-700 text-[11px] font-medium flex items-center gap-1 transition"
                title="Copier style (Ctrl+Alt+C)"
              >
                <Paintbrush className="w-3 h-3 text-indigo-600" />
                <span>Copier Style</span>
              </button>
              <button
                onClick={handlePasteStyle}
                disabled={!copiedStyle}
                className="px-2 py-0.5 rounded hover:bg-slate-100 text-slate-700 disabled:opacity-30 text-[11px] font-medium flex items-center gap-1 transition"
                title="Coller style (Ctrl+Alt+V)"
              >
                <ClipboardCheck className="w-3 h-3 text-emerald-600" />
                <span>Coller Style</span>
              </button>
            </div>
          </div>
        )}

        {/* Repères & Grille Options */}
        <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 mr-1 tracking-wider select-none">
            Repères
          </span>
          <div className="flex items-center bg-white border border-slate-200/80 rounded-lg p-0.5 shadow-2xs gap-1">
            {/* Smart Guides */}
            <button
              onClick={() => setSmartGuidesEnabled(!smartGuidesEnabled)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition ${
                smartGuidesEnabled
                  ? 'bg-rose-50 text-rose-700 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Magnétisme dynamique entre éléments"
            >
              <Magnet className="w-3 h-3" />
              <span>Guides</span>
            </button>

            {/* Grid Snap & Grid Size */}
            <div className="flex items-center gap-0.5 bg-slate-50 px-1 py-0.5 rounded border border-slate-200">
              <button
                onClick={() => setSnapToGrid(!snapToGrid)}
                className={`text-[11px] font-semibold flex items-center gap-1 ${
                  snapToGrid ? 'text-blue-700 font-bold' : 'text-slate-400'
                }`}
                title="Activer/désactiver la grille"
              >
                <Grid className="w-3 h-3" />
                <span>Grille</span>
              </button>
              {snapToGrid && (
                <select
                  value={gridSizeMm}
                  onChange={(e) => setGridSizeMm(parseFloat(e.target.value))}
                  className="text-[10px] font-mono bg-white border border-slate-300 rounded px-1 py-0.2 font-bold text-slate-700 outline-none"
                >
                  <option value={0.5}>0.5mm</option>
                  <option value={1}>1mm</option>
                  <option value={2}>2mm</option>
                  <option value={5}>5mm</option>
                  <option value={10}>10mm</option>
                </select>
              )}
            </div>

            {/* Rulers Toggle */}
            <button
              onClick={() => setShowRulers(!showRulers)}
              className={`p-1 rounded text-[11px] font-medium transition ${
                showRulers ? 'bg-amber-50 text-amber-800 font-bold' : 'text-slate-400 hover:text-slate-800'
              }`}
              title="Afficher / Masquer les règles millimétrées"
            >
              <Ruler className="w-3.5 h-3.5" />
            </button>

            {/* Calibration Modal Trigger */}
            <button
              onClick={() => setShowCalibrationModal(true)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition ${
                template.calibration_image?.visible
                  ? 'bg-amber-100 text-amber-800 font-bold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Calibrer une image de fond réelle"
            >
              <Crosshair className="w-3 h-3 text-amber-600" />
              <span>Calibrer</span>
            </button>

            {/* Diagnostic Heatmap Direct Toggle */}
            <button
              onClick={() => setIsHeatmapActive(!isHeatmapActive)}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 transition ${
                isHeatmapActive
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Activer/Désactiver le calque Heatmap de diagnostic visuel (Touche M)"
            >
              <span className={`w-2 h-2 rounded-full ${isHeatmapActive ? 'bg-slate-950' : 'bg-amber-500'}`} />
              <span>Heatmap</span>
            </button>
          </div>
        </div>

        {/* Data Simulator & Zoom */}
        <div className="flex items-center gap-2">
          {/* Toggle Inspector Drawer */}
          <button
            onClick={() => setIsInspectorDrawerOpen(!isInspectorDrawerOpen)}
            className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border ${
              isInspectorDrawerOpen && selectedItems.length > 0
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title="Afficher/Masquer le tiroir d'inspection contextuel"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Inspecteur</span>
          </button>
          {/* Data Binding Simulator */}
          <div className="flex items-center gap-1 bg-white border border-slate-200/80 rounded-lg px-2 py-1 shadow-2xs">
            <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
              <Eye className="w-3 h-3 text-slate-400" />
              Données:
            </span>
            {previewDataIndex === null ? (
              <button
                onClick={() => setPreviewDataIndex(0)}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Activer
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setPreviewDataIndex((prev) =>
                      prev !== null ? (prev > 0 ? prev - 1 : availablePreviewProducts.length - 1) : 0
                    )
                  }
                  className="p-0.5 hover:bg-slate-100 rounded text-slate-600"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <span className="font-mono text-[10px] text-slate-700 font-bold px-0.5">
                  #{previewDataIndex + 1}/{availablePreviewProducts.length}
                </span>
                <button
                  onClick={() =>
                    setPreviewDataIndex((prev) =>
                      prev !== null ? (prev < availablePreviewProducts.length - 1 ? prev + 1 : 0) : 0
                    )
                  }
                  className="p-0.5 hover:bg-slate-100 rounded text-slate-600"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setPreviewDataIndex(null)}
                  className="text-[10px] text-slate-400 hover:text-slate-600 ml-0.5"
                >
                  (Off)
                </button>
              </div>
            )}
          </div>

          {/* Zoom Widget */}
          <div className="flex items-center gap-1 bg-white border border-slate-200/80 rounded-lg p-0.5 shadow-2xs">
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
              className="p-1 hover:bg-slate-100 rounded text-slate-600"
              title="Zoom arrière"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="font-mono text-[11px] px-1 font-bold text-slate-700">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(3.0, z + 0.25))}
              className="p-1 hover:bg-slate-100 rounded text-slate-600"
              title="Zoom avant"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              onClick={() => setZoom(1.0)}
              className="px-1 py-0.5 hover:bg-slate-100 rounded text-slate-600 text-[10px] font-bold"
              title="Taille réelle (100%)"
            >
              1:1
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Area: Context-Adaptive 2-Pane Layout + Unified Diagnostic Layer */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Toast feedback for Copy/Paste style */}
        {styleToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white text-xs px-3.5 py-1.5 rounded-full shadow-lg flex items-center gap-2 backdrop-blur-xs animate-in fade-in slide-in-from-top-2">
            <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{styleToast}</span>
          </div>
        )}

        {/* 1. Left Smart Navigation & Structural Tree (Collapsible Dock) */}
        <SmartNavTreeSidebar
          template={template}
          selectedItemIds={selectedItemIds}
          onSelectItem={(id, multi) => {
            if (multi) {
              setSelectedItemIds((prev) =>
                prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
              );
            } else {
              setSelectedItemIds([id]);
            }
            setIsInspectorDrawerOpen(true);
          }}
          onUpdateItem={(id, patch) => {
            const item = template.items.find((i) => i.id === id);
            if (item) handleUpdateItem({ ...item, ...patch } as TemplateItem);
          }}
          onDeleteItem={handleDeleteItem}
          onDuplicateItem={handleDuplicateItem}
          onReorderItem={(id, dir) => handleReorderItem(id, dir === 'up' ? 1 : -1)}
          onAddNewItem={(type, customField) => addItem(type as any, customField)}
          isCollapsed={uiPreferences?.lockLeftSidebar ? false : isNavCollapsed}
          onToggleCollapse={() => {
            if (uiPreferences?.lockLeftSidebar) return;
            setIsNavCollapsed(!isNavCollapsed);
          }}
        />

        {/* 2. Central Responsive Canvas Stage (The Hero Zone - up to 85% width) */}
        <div
          ref={canvasContainerRef}
          onMouseDown={handleCanvasMouseDown}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (!target.closest('[data-item-id], button, input, select, textarea, [role="button"], [data-no-deselect]')) {
              if (!e.shiftKey) {
                setSelectedItemIds([]);
              }
            }
          }}
          className="flex-1 overflow-auto p-12 flex items-center justify-center relative cursor-default"
          style={{
            backgroundColor: isHeatmapActive ? '#090d16' : '#e2e8f0',
            backgroundImage: isHeatmapActive
              ? 'radial-gradient(#1e293b 1.5px, transparent 1.5px), radial-gradient(#1e293b 1.5px, #090d16 1.5px)'
              : 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px), radial-gradient(#cbd5e1 1.5px, #e2e8f0 1.5px)',
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0, 12px 12px',
          }}
        >
          {/* Independent Draggable Floating Ruler HUD */}
          <FloatingRulerHUD
            width_mm={template.width_mm}
            height_mm={template.height_mm}
            mousePosMm={mousePosMm}
          />

          {/* Floating On-Canvas Diagnostic Capsule (HUD Top Center) */}
          <FloatingDiagnosticCapsule
            template={template}
            onApplyTemplateFix={(updated) => pushState(updated)}
            onSelectItem={(id) => {
              setSelectedItemIds([id]);
              setIsInspectorDrawerOpen(true);
            }}
            isHeatmapActive={isHeatmapActive}
            onToggleHeatmap={() => setIsHeatmapActive(!isHeatmapActive)}
          />

          {/* Viewport Frame Rulers (Anchored to top and left of viewport container) */}
          {showRulers && uiPreferences?.rulerMode === 'window_frame' && (
            <CanvasRulers
              width_mm={template.width_mm}
              height_mm={template.height_mm}
              zoom={zoom}
              mousePosMm={mousePosMm}
              rulerMode="window_frame"
              canvasOffsetPx={canvasOffsetPx}
              showTopRuler={rulerSettings.showHorizontal}
              showLeftRuler={rulerSettings.showVertical}
            />
          )}

          {/* Label Canvas Frame */}
          <div
            ref={labelCanvasRef}
            className="relative shadow-2xl rounded-xs transition-transform"
            onMouseMove={(e) => {
              if (labelCanvasRef.current) {
                const rect = labelCanvasRef.current.getBoundingClientRect();
                const scalePxPerMm = 3.78 * zoom;
                const x_mm = Number(((e.clientX - rect.left) / scalePxPerMm).toFixed(2));
                const y_mm = Number(((e.clientY - rect.top) / scalePxPerMm).toFixed(2));
                setMousePosMm({ x_mm, y_mm });
              }
            }}
            onMouseLeave={() => setMousePosMm(null)}
            onMouseDown={(e) => {
              // If click didn't land directly on an item, it starts marquee
              if ((e.target as HTMLElement).closest('[data-item-id]')) return;
              handleCanvasMouseDown(e);
            }}
          >
            {/* Sheet Margins Workspace Rulers */}
            {showRulers && uiPreferences?.rulerMode === 'sheet_margins' && rulerSettings.showSheet !== false && (
              <CanvasRulers
                width_mm={template.width_mm}
                height_mm={template.height_mm}
                zoom={zoom}
                mousePosMm={mousePosMm}
                rulerMode="sheet_margins"
                rulerOffsetPx={uiPreferences?.rulerOffsetPx || 40}
                showTopRuler={rulerSettings.showHorizontal}
                showLeftRuler={rulerSettings.showVertical}
              />
            )}

            <LabelRenderer
              template={template}
              record={currentPreviewRecord}
              zoom={zoom}
              showBleed={showBleed}
              showInnerMargins={showInnerMargins}
              showHazardWarnings={showHazardWarnings}
              selectedItemIds={selectedItemIds}
              onSelectItem={(id, e) => handleItemMouseDown(id, e)}
              onResizeStart={handleResizeStart}
              onRotateStart={handleRotateStart}
              onRotateStep90={handleRotateStep90}
              rotationHandleType={uiPreferences?.rotationHandleType || 'top_stem'}
              isRotating={isRotating}
              activeRotatingItemId={rotateState?.itemId}
              activeRotationAngle={activeRotationAngle}
              smartGuides={activeSmartGuides}
              interactive={true}
              className="ring-1 ring-slate-300"
            />

            {/* Diagnostic Heatmap Canvas Overlay */}
            {isHeatmapActive && (
              <DiagnosticHeatmapOverlay
                template={template}
                zoom={zoom}
              />
            )}

            {/* Marquee Selection Rectangle Overlay */}
            {isMarqueeSelecting && marqueeRect && (
              <div
                className="absolute border border-blue-500 bg-blue-500/15 pointer-events-none z-50 rounded-2xs"
                style={{
                  left: `${marqueeRect.x_mm * 3.78 * zoom}px`,
                  top: `${marqueeRect.y_mm * 3.78 * zoom}px`,
                  width: `${marqueeRect.w_mm * 3.78 * zoom}px`,
                  height: `${marqueeRect.h_mm * 3.78 * zoom}px`,
                }}
              />
            )}

            {/* Zoom Marquee Region Box Overlay */}
            {isZoomMarquee && zoomMarqueeRect && (
              <div
                className="absolute border-2 border-dashed border-blue-600 bg-blue-500/20 pointer-events-none z-50 rounded-xs shadow-lg"
                style={{
                  left: `${zoomMarqueeRect.x_mm * 3.78 * zoom}px`,
                  top: `${zoomMarqueeRect.y_mm * 3.78 * zoom}px`,
                  width: `${zoomMarqueeRect.w_mm * 3.78 * zoom}px`,
                  height: `${zoomMarqueeRect.h_mm * 3.78 * zoom}px`,
                }}
              >
                <div className="absolute top-1 left-1 bg-blue-600 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow-xs">
                  Zoom: {Math.round(zoomMarqueeRect.w_mm)} × {Math.round(zoomMarqueeRect.h_mm)} mm
                </div>
              </div>
            )}
          </div>

          {/* Non-Intrusive Floating Action Ribbon (anchored top center in viewport, never overlaps Property Inspector) */}
          {selectedItems.length > 0 && selectedItems[0] && (
            <ContextualFloatingRibbon
              selectedItem={selectedItems[0]}
              selectedItemsCount={selectedItems.length}
              template={template}
              zoom={zoom}
              onUpdateItem={handleUpdateItem}
              onDuplicateItem={handleDuplicateItem}
              onDeleteItem={handleDeleteItem}
              onReorderItem={(id, dir) => handleReorderItem(id, dir === 'up' ? 1 : -1)}
              onOpenInspectorDrawer={() => setIsInspectorDrawerOpen(true)}
            />
          )}

          {/* Floating Viewport Zoom & Navigation Toolbar (docked bottom center) */}
          <ViewportZoomToolbar
            zoom={zoom}
            onZoomChange={(newZoom, anchorPoint) => handleZoomWithAnchor(newZoom, anchorPoint)}
            onFitToSheet={handleFitToSheet}
            onFitToWidth={handleFitToWidth}
            activeTool={activeTool}
            onToolChange={setActiveTool}
            zoomMethod={uiPreferences?.zoomMethod || 'pointer'}
          />
        </div>

        {/* 3. Right Adaptive Contextual Inspector Drawer (Always visible by default) */}
        {isInspectorDrawerOpen && (
          <div className="h-full z-20 shrink-0 animate-in slide-in-from-right-4 duration-200 shadow-2xl">
            <PropertyInspector
              selectedItems={selectedItems}
              allItems={template.items}
              onUpdateItem={handleUpdateItem}
              onUpdateMultipleItems={handleUpdateMultipleItems}
              onDeleteItem={handleDeleteItem}
              onDeleteMultipleItems={handleDeleteMultipleItems}
              onDuplicateItem={handleDuplicateItem}
              onDuplicateMultipleItems={handleDuplicateMultipleItems}
              onReorderItem={handleReorderItem}
              copiedStyle={copiedStyle}
              onCopyStyle={handleCopyStyle}
              onPasteStyle={handlePasteStyle}
              onClose={() => setIsInspectorDrawerOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Editor Status Bar */}
      <footer className="h-7 bg-white border-t border-slate-200 px-3 flex items-center justify-between text-[11px] text-slate-600 shrink-0 font-mono z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span className="font-sans font-medium text-slate-700">
              {template.name} ({template.width_mm} × {template.height_mm} mm)
            </span>
          </div>

          <div className="h-3.5 w-px bg-slate-200" />

          {selectedItems.length === 1 ? (
            <div className="flex items-center gap-3 text-slate-700">
              <span className="font-sans font-semibold text-blue-600">
                {selectedItems[0].type.toUpperCase()} #{selectedItems[0].id.slice(0, 6)}
              </span>
              <span>
                X: <strong className="font-bold">{selectedItems[0].x_mm}</strong> mm ({Math.round(selectedItems[0].x_mm * 3.78)} px)
              </span>
              <span>
                Y: <strong className="font-bold">{selectedItems[0].y_mm}</strong> mm ({Math.round(selectedItems[0].y_mm * 3.78)} px)
              </span>
              <span>
                L: <strong className="font-bold">{selectedItems[0].w_mm}</strong> mm
              </span>
              <span>
                H: <strong className="font-bold">{selectedItems[0].h_mm}</strong> mm
              </span>
              {selectedItems[0].rotation ? (
                <span>Rot: <strong className="font-bold">{selectedItems[0].rotation}°</strong></span>
              ) : null}
            </div>
          ) : selectedItems.length > 1 ? (
            <div className="flex items-center gap-2 text-indigo-700 font-semibold font-sans">
              <span>{selectedItems.length} éléments sélectionnés</span>
            </div>
          ) : (
            <span className="text-slate-400 font-sans italic">Aucun élément sélectionné</span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {mousePosMm && (
            <div className="flex items-center gap-2 text-slate-600">
              <Crosshair className="w-3 h-3 text-slate-400" />
              <span>
                Curseur: <strong>{mousePosMm.x_mm}</strong>, <strong>{mousePosMm.y_mm}</strong> mm
              </span>
            </div>
          )}

          <div className="h-3.5 w-px bg-slate-200" />

          <div className="text-[10px] text-slate-400 font-sans hidden md:flex items-center gap-1.5">
            <span className="font-medium text-slate-600">Nudge:</span>
            <span>Flèches = 1px</span>
            <span>•</span>
            <span>Maj+Flèches = 10px</span>
            <span>•</span>
            <span>Alt = 0.1mm</span>
          </div>

          <div className="h-3.5 w-px bg-slate-200" />

          <span className="text-slate-500 font-semibold">{Math.round(zoom * 100)}%</span>
        </div>
      </footer>

      {/* Calibration Image Settings Modal */}
      {showCalibrationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Crosshair className="w-5 h-5 text-amber-600" />
                <h2 className="font-bold text-slate-900 text-sm">Image de Calibration & Repérage</h2>
              </div>
              <button
                onClick={() => setShowCalibrationModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                Superposez une image ou un scan du support réel (étiquette physique, zone de découpe, emballage) pour ajuster au millimètre près l'emplacement de vos éléments.
              </p>

              {/* Toggle Enable */}
              <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100/70 cursor-pointer">
                <div className="flex items-center gap-2">
                  <FileImage className="w-4 h-4 text-amber-600" />
                  <span className="font-bold text-slate-800">Afficher le calque de calibration</span>
                </div>
                <input
                  type="checkbox"
                  checked={template.calibration_image?.visible || false}
                  onChange={(e) => {
                    const current = template.calibration_image || {
                      url: '',
                      opacity: 0.35,
                      offset_x_mm: 0,
                      offset_y_mm: 0,
                      scale_pct: 100,
                      visible: false,
                      locked: false,
                      print_in_output: false,
                    };
                    const updated = {
                      ...template,
                      calibration_image: { ...current, visible: e.target.checked },
                    };
                    pushState(updated);
                  }}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
              </label>

              {/* Image URL or File Upload */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Source de l'image (URL ou Fichier local)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={template.calibration_image?.url || ''}
                    onChange={(e) => {
                      const current = template.calibration_image || {
                        url: '',
                        opacity: 0.35,
                        offset_x_mm: 0,
                        offset_y_mm: 0,
                        scale_pct: 100,
                        visible: true,
                        locked: false,
                        print_in_output: false,
                      };
                      pushState({
                        ...template,
                        calibration_image: { ...current, url: e.target.value, visible: true },
                      });
                    }}
                    placeholder="https://... ou glissez un fichier"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                  <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold rounded-lg cursor-pointer flex items-center gap-1">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Parcourir</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            const res = evt.target?.result as string;
                            const current = template.calibration_image || {
                              url: '',
                              opacity: 0.35,
                              offset_x_mm: 0,
                              offset_y_mm: 0,
                              scale_pct: 100,
                              visible: true,
                              locked: false,
                              print_in_output: false,
                            };
                            pushState({
                              ...template,
                              calibration_image: { ...current, url: res, visible: true },
                            });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Opacity Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-slate-700 font-medium">
                  <span>Transparence du calque</span>
                  <span className="font-mono font-bold">
                    {Math.round((template.calibration_image?.opacity ?? 0.35) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.05"
                  value={template.calibration_image?.opacity ?? 0.35}
                  onChange={(e) => {
                    const current = template.calibration_image || {
                      url: '',
                      opacity: 0.35,
                      offset_x_mm: 0,
                      offset_y_mm: 0,
                      scale_pct: 100,
                      visible: true,
                      locked: false,
                      print_in_output: false,
                    };
                    pushState({
                      ...template,
                      calibration_image: { ...current, opacity: parseFloat(e.target.value) },
                    });
                  }}
                  className="w-full"
                />
              </div>

              {/* Offset and Scale Controls */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 font-medium mb-1">Décalage X (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={template.calibration_image?.offset_x_mm ?? 0}
                    onChange={(e) => {
                      const current = template.calibration_image || {
                        url: '',
                        opacity: 0.35,
                        offset_x_mm: 0,
                        offset_y_mm: 0,
                        scale_pct: 100,
                        visible: true,
                        locked: false,
                        print_in_output: false,
                      };
                      pushState({
                        ...template,
                        calibration_image: { ...current, offset_x_mm: parseFloat(e.target.value) || 0 },
                      });
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 font-medium mb-1">Décalage Y (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={template.calibration_image?.offset_y_mm ?? 0}
                    onChange={(e) => {
                      const current = template.calibration_image || {
                        url: '',
                        opacity: 0.35,
                        offset_x_mm: 0,
                        offset_y_mm: 0,
                        scale_pct: 100,
                        visible: true,
                        locked: false,
                        print_in_output: false,
                      };
                      pushState({
                        ...template,
                        calibration_image: { ...current, offset_y_mm: parseFloat(e.target.value) || 0 },
                      });
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 font-medium mb-1">Échelle (%)</label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    step="5"
                    value={template.calibration_image?.scale_pct ?? 100}
                    onChange={(e) => {
                      const current = template.calibration_image || {
                        url: '',
                        opacity: 0.35,
                        offset_x_mm: 0,
                        offset_y_mm: 0,
                        scale_pct: 100,
                        visible: true,
                        locked: false,
                        print_in_output: false,
                      };
                      pushState({
                        ...template,
                        calibration_image: { ...current, scale_pct: parseFloat(e.target.value) || 100 },
                      });
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              {/* Sample Presets */}
              <div className="pt-2 border-t border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1.5">Exemples rapides :</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const current = template.calibration_image || {
                        url: '',
                        opacity: 0.35,
                        offset_x_mm: 0,
                        offset_y_mm: 0,
                        scale_pct: 100,
                        visible: true,
                        locked: false,
                        print_in_output: false,
                      };
                      pushState({
                        ...template,
                        calibration_image: {
                          ...current,
                          visible: true,
                          url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80',
                          opacity: 0.3,
                        },
                      });
                    }}
                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium"
                  >
                    Exemple Emballage Boîte
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const current = template.calibration_image || {
                        url: '',
                        opacity: 0.35,
                        offset_x_mm: 0,
                        offset_y_mm: 0,
                        scale_pct: 100,
                        visible: true,
                        locked: false,
                        print_in_output: false,
                      };
                      pushState({
                        ...template,
                        calibration_image: {
                          ...current,
                          visible: true,
                          url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80',
                          opacity: 0.3,
                        },
                      });
                    }}
                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium"
                  >
                    Exemple Bouteille / Flacon
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const current = template.calibration_image || {
                        url: '',
                        opacity: 0.35,
                        offset_x_mm: 0,
                        offset_y_mm: 0,
                        scale_pct: 100,
                        visible: false,
                        locked: false,
                        print_in_output: false,
                      };
                      pushState({
                        ...template,
                        calibration_image: { ...current, visible: false, url: '' },
                      });
                    }}
                    className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-medium"
                  >
                    Réinitialiser
                  </button>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowCalibrationModal(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs shadow-xs"
              >
                Appliquer et Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Find and Replace Modal */}
      <FindReplaceModal
        isOpen={isFindReplaceOpen}
        onClose={() => setIsFindReplaceOpen(false)}
        items={template.items}
        selectedItemIds={selectedItemIds}
        onSelectItems={setSelectedItemIds}
        onUpdateMultipleItems={handleUpdateMultipleItems}
      />

      {/* Keyboard Shortcuts Cheatsheet Modal */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Pre-Flight Quality & Regulatory Inspection Modal */}
      {isPreFlightModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full flex flex-col max-h-[80vh] overflow-hidden text-slate-100 font-sans">
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
                  <h3 className="text-sm font-bold text-white">Contrôle Pré-Vol Qualité</h3>
                  <p className="text-[11px] text-slate-400">Vérification géométrique et réglementaire en temps réel</p>
                </div>
              </div>
              <button
                onClick={() => setIsPreFlightModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl text-center">
                  <span className="text-[10px] text-slate-500 uppercase font-mono block">Statut</span>
                  <span
                    className={`font-bold ${
                      preFlightReport.status === 'ready'
                        ? 'text-emerald-400'
                        : preFlightReport.status === 'warning'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {preFlightReport.status === 'ready'
                      ? 'Conforme'
                      : preFlightReport.status === 'warning'
                      ? 'Avertissement'
                      : 'Non conforme'}
                  </span>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl text-center">
                  <span className="text-[10px] text-slate-500 uppercase font-mono block">Erreurs</span>
                  <span className="font-bold text-rose-400">{preFlightReport.errorsCount}</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl text-center">
                  <span className="text-[10px] text-slate-500 uppercase font-mono block">Alertes</span>
                  <span className="font-bold text-amber-400">{preFlightReport.warningsCount}</span>
                </div>
              </div>

              {preFlightReport.issues.length === 0 ? (
                <div className="p-6 text-center text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <p className="text-emerald-400 font-semibold mb-1">Aucune anomalie détectée</p>
                  <p className="text-[11px] text-slate-500">
                    Toutes les marges, liaisons de données et contraintes d'impression sont respectées.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 block uppercase font-mono">
                    Points de contrôle analysés
                  </span>
                  {preFlightReport.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase font-mono ${
                              issue.severity === 'error'
                                ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                : issue.severity === 'warning'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                : 'bg-blue-950 text-blue-400 border border-blue-800'
                            }`}
                          >
                            {issue.severity}
                          </span>
                          <span className="text-slate-500 text-[10px] font-mono capitalize">
                            {issue.category}
                          </span>
                        </div>
                        <p className="text-slate-300 text-xs leading-relaxed">{issue.message}</p>
                      </div>

                      {issue.itemId && (
                        <button
                          onClick={() => {
                            setSelectedItemIds([issue.itemId!]);
                            setIsPreFlightModalOpen(false);
                          }}
                          className="shrink-0 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/40 rounded-lg text-[11px] font-semibold transition"
                          title="Sélectionner l'élément sur le canevas"
                        >
                          Localiser
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => setIsPreFlightModalOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
