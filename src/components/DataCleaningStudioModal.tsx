import React, { useState, useMemo } from 'react';
import { ProductRecord } from '../types';
import { useMappingDictionary } from '../context/MappingDictionaryContext';
import {
  smartAutoCleanRawRows,
  sanitizePriceValue,
  sanitizeBarcodeValue,
  CleaningDiagnosticReport,
} from '../utils/excelCleaner';
import { catalogRepository as databaseService } from '../services/catalogRepository';
import {
  FileSpreadsheet,
  Check,
  Plus,
  Trash2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Filter,
  RefreshCw,
  Zap,
  HelpCircle,
  Database,
  ArrowRight,
  Sliders,
  Type,
  Coins,
  Layers,
  X,
  Edit2,
  Download,
} from 'lucide-react';

interface DataCleaningStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawHeaders?: string[];
  rawRows?: any[];
  onDatabaseUpdated?: () => void;
}

export const DataCleaningStudioModal: React.FC<DataCleaningStudioModalProps> = ({
  isOpen,
  onClose,
  rawHeaders: initialHeaders = [],
  rawRows: initialRows = [],
  onDatabaseUpdated,
}) => {
  const { detectField } = useMappingDictionary();

  // State for working grid
  const [headers, setHeaders] = useState<string[]>(initialHeaders);
  const [rows, setRows] = useState<Record<string, any>[]>(initialRows);

  // Selected row indices for bulk deletion
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());

  // Filter mode
  const [filterMode, setFilterMode] = useState<'all' | 'price_issues' | 'duplicates' | 'incomplete'>('all');

  // Save Mode to Master Database
  const [saveMode, setSaveMode] = useState<'update_upsert' | 'overwrite' | 'append'>('update_upsert');

  // Diagnostic report state
  const [diagnosticReport, setDiagnosticReport] = useState<CleaningDiagnosticReport | null>(null);

  // Column renaming popup
  const [editingColName, setEditingColName] = useState<string | null>(null);
  const [newColNameInput, setNewColNameInput] = useState('');

  // Column addition
  const [newColTitle, setNewColTitle] = useState('');
  const [showAddColModal, setShowAddColModal] = useState(false);

  // Mapping state: header -> canonical field
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  // Active step: 'cleaning' or 'mapping'
  const [activeStep, setActiveStep] = useState<'clean_grid' | 'mapping_confirm'>('clean_grid');

  // Feedback banner
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'info'; text: string } | null>(null);

  // When raw headers or rows arrive, auto-clean and initialize
  React.useEffect(() => {
    if (initialHeaders.length > 0 && initialRows.length > 0) {
      const { cleanHeaders, cleanRows, report } = smartAutoCleanRawRows(initialHeaders, initialRows);
      setHeaders(cleanHeaders);
      setRows(cleanRows);
      setDiagnosticReport(report);

      // Auto-detect mapping for canonical fields
      const autoMap: Record<string, string> = {};
      cleanHeaders.forEach((h) => {
        const sampleVals = cleanRows.slice(0, 5).map((r) => r[h]);
        const match = detectField(h, sampleVals);
        autoMap[h] = match ? match.canonical_key : '__custom__';
      });
      setFieldMapping(autoMap);
    }
  }, [initialHeaders, initialRows, detectField]);

  // Smart Auto-Clean Action (1-Click)
  const handleAutoCleanAll = () => {
    const { cleanHeaders, cleanRows, report } = smartAutoCleanRawRows(headers, rows);
    setHeaders(cleanHeaders);
    setRows(cleanRows);
    setDiagnosticReport(report);
    setBannerMessage({
      type: 'success',
      text: `Nettoyage automatique terminé : ${report.subtotalsRemovedCount} sous-totaux supprimés, ${report.pricesFixedCount} prix corrigés !`,
    });
    setTimeout(() => setBannerMessage(null), 4000);
  };

  // Action: Normalize all prices
  const handleNormalizeAllPrices = () => {
    let count = 0;
    const updated = rows.map((r) => {
      const copy = { ...r };
      Object.keys(copy).forEach((k) => {
        if (k.toLowerCase().includes('prix') || k.toLowerCase().includes('price') || k.toLowerCase().includes('pu') || k.toLowerCase().includes('tarif')) {
          const orig = copy[k];
          const sanitized = sanitizePriceValue(orig);
          if (sanitized !== orig) count++;
          copy[k] = sanitized;
        }
      });
      return copy;
    });
    setRows(updated);
    setBannerMessage({ type: 'success', text: `Normalisation effectuée : ${count} valeurs de prix nettoyées.` });
    setTimeout(() => setBannerMessage(null), 3000);
  };

  // Action: Deduplicate by barcode / EAN
  const handleDeduplicate = () => {
    const eanHeader = headers.find((h) =>
      ['code', 'ean', 'gencod', 'barcode'].some((k) => h.toLowerCase().includes(k))
    );
    if (!eanHeader) {
      console.warn("Avertissement : Aucune colonne de code-barres (EAN/Gencod) identifiée pour la déduplication.");
      return;
    }

    const seen = new Set<string>();
    const deduplicatedRows: Record<string, any>[] = [];
    let removedCount = 0;

    rows.forEach((r) => {
      const key = String(r[eanHeader] || '').trim().toLowerCase();
      if (!key || !seen.has(key)) {
        if (key) seen.add(key);
        deduplicatedRows.push(r);
      } else {
        removedCount++;
      }
    });

    setRows(deduplicatedRows);
    setSelectedRowIndices(new Set());
    setBannerMessage({ type: 'success', text: `Déduplication terminée : ${removedCount} lignes en doublon supprimées.` });
    setTimeout(() => setBannerMessage(null), 3000);
  };

  // Action: Uppercase designation / titles
  const handleUppercaseTitles = () => {
    const updated = rows.map((r) => {
      const copy = { ...r };
      Object.keys(copy).forEach((k) => {
        if (k.toLowerCase().includes('article') || k.toLowerCase().includes('designation') || k.toLowerCase().includes('libelle') || k.toLowerCase().includes('nom')) {
          if (typeof copy[k] === 'string') {
            copy[k] = copy[k].toUpperCase().trim();
          }
        }
      });
      return copy;
    });
    setRows(updated);
    setBannerMessage({ type: 'success', text: "Libellés et désignations formatés en MAJUSCULES." });
    setTimeout(() => setBannerMessage(null), 3000);
  };

  // Action: Remove incomplete rows (missing price or barcode)
  const handleRemoveIncompleteRows = () => {
    const eanHeader = headers.find((h) =>
      ['code', 'ean', 'gencod', 'barcode'].some((k) => h.toLowerCase().includes(k))
    );
    const priceHeader = headers.find((h) =>
      ['prix', 'tarif', 'pu', 'price'].some((k) => h.toLowerCase().includes(k))
    );

    const filtered = rows.filter((r) => {
      const eanVal = eanHeader ? r[eanHeader] : true;
      const priceVal = priceHeader ? r[priceHeader] : true;
      const hasEan = eanVal !== undefined && eanVal !== null && String(eanVal).trim() !== '';
      const hasPrice = priceVal !== undefined && priceVal !== null && Number(priceVal) > 0;
      return hasEan && hasPrice;
    });

    const removed = rows.length - filtered.length;
    setRows(filtered);
    setSelectedRowIndices(new Set());
    setBannerMessage({ type: 'success', text: `Incomplétudes nettoyées : ${removed} lignes supprimées.` });
    setTimeout(() => setBannerMessage(null), 3000);
  };

  // Table row editing
  const handleCellChange = (rIdx: number, header: string, val: any) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[rIdx] = { ...copy[rIdx], [header]: val };
      return copy;
    });
  };

  // Row selection toggle
  const toggleRowSelect = (rIdx: number) => {
    setSelectedRowIndices((prev) => {
      const copy = new Set(prev);
      if (copy.has(rIdx)) copy.delete(rIdx);
      else copy.add(rIdx);
      return copy;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRowIndices.size === rows.length) {
      setSelectedRowIndices(new Set());
    } else {
      setSelectedRowIndices(new Set(rows.map((_, i) => i)));
    }
  };

  const handleDeleteSelectedRows = () => {
    if (selectedRowIndices.size === 0) return;
    const remaining = rows.filter((_, i) => !selectedRowIndices.has(i));
    setRows(remaining);
    setSelectedRowIndices(new Set());
    setBannerMessage({ type: 'info', text: `${selectedRowIndices.size} lignes supprimées.` });
    setTimeout(() => setBannerMessage(null), 2500);
  };

  const handleAddRow = () => {
    const newRow: Record<string, any> = {};
    headers.forEach((h) => (newRow[h] = ''));
    setRows((prev) => [newRow, ...prev]);
  };

  // Column operations
  const handleRenameColumn = (oldName: string) => {
    if (!newColNameInput.trim() || newColNameInput.trim() === oldName) {
      setEditingColName(null);
      return;
    }
    const cleanNewName = newColNameInput.trim();
    setHeaders((prev) => prev.map((h) => (h === oldName ? cleanNewName : h)));
    setRows((prev) =>
      prev.map((r) => {
        const copy = { ...r };
        copy[cleanNewName] = copy[oldName];
        delete copy[oldName];
        return copy;
      })
    );
    setFieldMapping((prev) => {
      const copy = { ...prev };
      copy[cleanNewName] = copy[oldName] || '__custom__';
      delete copy[oldName];
      return copy;
    });
    setEditingColName(null);
  };

  const handleDeleteColumn = (colName: string) => {
    if (headers.length <= 1) {
      return;
    }
    setHeaders((prev) => prev.filter((h) => h !== colName));
    setRows((prev) =>
      prev.map((r) => {
        const copy = { ...r };
        delete copy[colName];
        return copy;
      })
    );
  };

  const handleAddColumn = () => {
    const name = newColTitle.trim();
    if (!name) return;
    if (headers.includes(name)) {
      return;
    }
    setHeaders((prev) => [...prev, name]);
    setRows((prev) => prev.map((r) => ({ ...r, [name]: '' })));
    setNewColTitle('');
    setShowAddColModal(false);
  };

  // Filtered rows calculation for view
  const filteredDisplayRows = useMemo(() => {
    if (filterMode === 'all') return rows;

    const eanHeader = headers.find((h) =>
      ['code', 'ean', 'gencod', 'barcode'].some((k) => h.toLowerCase().includes(k))
    );
    const priceHeader = headers.find((h) =>
      ['prix', 'tarif', 'pu', 'price'].some((k) => h.toLowerCase().includes(k))
    );

    if (filterMode === 'price_issues') {
      return rows.filter((r) => {
        const p = priceHeader ? sanitizePriceValue(r[priceHeader]) : 0;
        return p <= 0;
      });
    }

    if (filterMode === 'incomplete') {
      return rows.filter((r) => {
        const ean = eanHeader ? r[eanHeader] : '';
        const price = priceHeader ? sanitizePriceValue(r[priceHeader]) : 0;
        return !ean || price <= 0;
      });
    }

    if (filterMode === 'duplicates') {
      const counts = new Map<string, number>();
      if (eanHeader) {
        rows.forEach((r) => {
          const k = String(r[eanHeader] || '').trim().toLowerCase();
          if (k) counts.set(k, (counts.get(k) || 0) + 1);
        });
      }
      return rows.filter((r) => {
        const k = eanHeader ? String(r[eanHeader] || '').trim().toLowerCase() : '';
        return k && (counts.get(k) || 0) > 1;
      });
    }

    return rows;
  }, [rows, filterMode, headers]);

  // Final Commit to Master Database
  const handleCommitToMasterDatabase = () => {
    // Convert rows to ProductRecord
    const canonicalProducts: ProductRecord[] = rows.map((r, rIdx) => {
      const prod: ProductRecord = {
        id: r.id || `PROD_IMP_${Date.now()}_${rIdx}`,
        ITEMNAME: 'Article Sans Nom',
        SELLING_PRICE: 0,
      };

      headers.forEach((h) => {
        const mappedCanonical = fieldMapping[h];
        const val = r[h];

        if (mappedCanonical && mappedCanonical !== '__ignore__' && mappedCanonical !== '__custom__') {
          if (mappedCanonical === 'SELLING_PRICE' || mappedCanonical === 'PROMOPRICE') {
            prod[mappedCanonical] = sanitizePriceValue(val);
          } else if (mappedCanonical === 'PRODUCT_SCAN') {
            prod[mappedCanonical] = sanitizeBarcodeValue(val);
          } else {
            prod[mappedCanonical] = val !== undefined && val !== null ? String(val) : '';
          }
        } else {
          // Custom attribute
          prod[h] = val;
        }
      });

      // Ensure fallback designation & barcode
      if (!prod.ITEMNAME || prod.ITEMNAME === 'Article Sans Nom') {
        prod.ITEMNAME = prod.designation || prod.name || prod.libelle || `Article ${prod.PRODUCT_SCAN || rIdx + 1}`;
      }

      return prod;
    });

    const res = databaseService.saveToMasterDatabase(canonicalProducts, saveMode);

    if (onDatabaseUpdated) onDatabaseUpdated();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl flex flex-col overflow-hidden my-auto max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Studio de Nettoyage Excel & Base de Données</h2>
                <span className="bg-blue-500/30 text-blue-200 border border-blue-400/40 text-[10px] font-mono px-2 py-0.5 rounded-full">
                  {rows.length} lignes
                </span>
              </div>
              <p className="text-xs text-blue-200/80">
                Nettoyage automatique, édition visuelle de la grille et intégration dans la Base Principale
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Diagnostic Bar / Health Indicator */}
        {diagnosticReport && (
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-semibold">Santé du Fichier :</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full font-bold font-mono text-[11px] ${
                    diagnosticReport.healthScore >= 90
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : diagnosticReport.healthScore >= 70
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-red-100 text-red-800 border border-red-300'
                  }`}
                >
                  {diagnosticReport.healthScore}% Valide
                </span>
              </div>

              <div className="flex items-center gap-3 text-slate-600">
                {diagnosticReport.subtotalsRemovedCount > 0 && (
                  <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-medium">
                    🧹 {diagnosticReport.subtotalsRemovedCount} sous-totaux nettoyés
                  </span>
                )}
                {diagnosticReport.pricesFixedCount > 0 && (
                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium">
                    ⚡ {diagnosticReport.pricesFixedCount} prix corrigés
                  </span>
                )}
                {diagnosticReport.duplicateBarcodesCount > 0 && (
                  <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium">
                    ⚠️ {diagnosticReport.duplicateBarcodesCount} doublons EAN
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleAutoCleanAll}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1 rounded-lg text-xs transition-colors shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Nettoyage Intelligente Auto</span>
              </button>
            </div>
          </div>
        )}

        {/* Notification Banner */}
        {bannerMessage && (
          <div
            className={`px-6 py-2 text-xs font-semibold flex items-center justify-between ${
              bannerMessage.type === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{bannerMessage.text}</span>
            </div>
            <button onClick={() => setBannerMessage(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Phase Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-100 px-6 gap-2 pt-2">
          <button
            onClick={() => setActiveStep('clean_grid')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-xl border-t border-x transition-all ${
              activeStep === 'clean_grid'
                ? 'bg-white text-blue-600 border-slate-200 shadow-sm -mb-px'
                : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>1. Édition & Nettoyage Grille Visuelle</span>
          </button>

          <button
            onClick={() => setActiveStep('mapping_confirm')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-xl border-t border-x transition-all ${
              activeStep === 'mapping_confirm'
                ? 'bg-white text-blue-600 border-slate-200 shadow-sm -mb-px'
                : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>2. Mapping & Validation Base de Données</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeStep === 'clean_grid' && (
            <>
              {/* 1-Click Quick Actions Toolbar */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-700 mr-1 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    Actions Rapides :
                  </span>

                  <button
                    onClick={handleNormalizeAllPrices}
                    className="flex items-center gap-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg shadow-xs font-medium"
                    title="Convertit les textes type '12,50 €' en nombres 12.50"
                  >
                    <Coins className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Normaliser Prix</span>
                  </button>

                  <button
                    onClick={handleDeduplicate}
                    className="flex items-center gap-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg shadow-xs font-medium"
                    title="Supprime les lignes ayant un code-barres en double"
                  >
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    <span>Dédupliquer EAN</span>
                  </button>

                  <button
                    onClick={handleUppercaseTitles}
                    className="flex items-center gap-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg shadow-xs font-medium"
                  >
                    <Type className="w-3.5 h-3.5 text-indigo-600" />
                    <span>MAJUSCULES</span>
                  </button>

                  <button
                    onClick={handleRemoveIncompleteRows}
                    className="flex items-center gap-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg shadow-xs font-medium text-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    <span>Purger Lignes Incomplètes</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddRow}
                    className="flex items-center gap-1 bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 px-2.5 py-1 rounded-lg font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Ligne</span>
                  </button>

                  <button
                    onClick={() => setShowAddColModal(true)}
                    className="flex items-center gap-1 bg-blue-50 border border-blue-300 text-blue-800 hover:bg-blue-100 px-2.5 py-1 rounded-lg font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Colonne</span>
                  </button>

                  {selectedRowIndices.size > 0 && (
                    <button
                      onClick={handleDeleteSelectedRows}
                      className="flex items-center gap-1 bg-red-600 text-white font-bold px-3 py-1 rounded-lg shadow-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Supprimer ({selectedRowIndices.size})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Filtering bar */}
              <div className="flex items-center justify-between text-xs pb-1">
                <div className="flex items-center gap-2 text-slate-600">
                  <Filter className="w-3.5 h-3.5" />
                  <span className="font-semibold">Filtre d'Affichage :</span>
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                    <button
                      onClick={() => setFilterMode('all')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                        filterMode === 'all' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Tous ({rows.length})
                    </button>
                    <button
                      onClick={() => setFilterMode('price_issues')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                        filterMode === 'price_issues' ? 'bg-white text-red-600 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      ⚠️ Prix Invalides
                    </button>
                    <button
                      onClick={() => setFilterMode('duplicates')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                        filterMode === 'duplicates' ? 'bg-white text-amber-600 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      🆔 Doublons EAN
                    </button>
                  </div>
                </div>

                <div className="text-slate-500">
                  Affichage de <strong className="text-slate-800">{filteredDisplayRows.length}</strong> / {rows.length} lignes
                </div>
              </div>

              {/* Spreadsheet Grid View */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white max-h-[420px] overflow-x-auto overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10 font-bold text-slate-700">
                    <tr>
                      <th className="p-2.5 w-10 text-center border-r border-slate-200">
                        <input
                          type="checkbox"
                          checked={selectedRowIndices.size === rows.length && rows.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded border-slate-300 text-blue-600"
                        />
                      </th>
                      <th className="p-2.5 w-12 text-center border-r border-slate-200 text-slate-400 font-mono">#</th>

                      {headers.map((h) => (
                        <th key={h} className="p-2.5 border-r border-slate-200 min-w-[150px] group">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-900 truncate" title={h}>
                              {h}
                            </span>
                            <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingColName(h);
                                  setNewColNameInput(h);
                                }}
                                className="p-1 hover:text-blue-600"
                                title="Renommer la colonne"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteColumn(h)}
                                className="p-1 hover:text-red-600"
                                title="Supprimer la colonne"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200">
                    {filteredDisplayRows.map((row, rIdx) => {
                      const isSelected = selectedRowIndices.has(rIdx);

                      return (
                        <tr
                          key={rIdx}
                          className={`transition-colors ${
                            isSelected ? 'bg-blue-50/80' : rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                          } hover:bg-blue-50/40`}
                        >
                          <td className="p-2 text-center border-r border-slate-200">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRowSelect(rIdx)}
                              className="rounded border-slate-300 text-blue-600"
                            />
                          </td>
                          <td className="p-2 text-center border-r border-slate-200 font-mono text-[11px] text-slate-400">
                            {rIdx + 1}
                          </td>

                          {headers.map((h) => {
                            const val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
                            const isPriceCol = h.toLowerCase().includes('prix') || h.toLowerCase().includes('price');

                            return (
                              <td key={h} className="p-1.5 border-r border-slate-200">
                                <input
                                  type="text"
                                  value={val}
                                  onChange={(e) => handleCellChange(rIdx, h, e.target.value)}
                                  className={`w-full px-2 py-1 rounded border text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 ${
                                    isPriceCol && (val === '' || parseFloat(val) <= 0)
                                      ? 'bg-red-50 border-red-300 text-red-900 font-bold'
                                      : 'bg-transparent border-transparent hover:border-slate-300'
                                  }`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* PHASE 2: MAPPING & DATABASE MERGE */}
          {activeStep === 'mapping_confirm' && (
            <div className="space-y-5 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <h3 className="font-bold text-sm text-slate-900 mb-1">Mapping des Colonnes vers le Modèle Produit</h3>
                <p className="text-slate-500 mb-4">
                  Associez chaque colonne nettoyée du fichier aux champs canoniques du logiciel E-Studio :
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {headers.map((h) => (
                    <div key={h} className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                      <div className="font-bold text-slate-800 mb-1 truncate" title={h}>
                        {h}
                      </div>
                      <select
                        value={fieldMapping[h] || '__custom__'}
                        onChange={(e) => setFieldMapping((prev) => ({ ...prev, [h]: e.target.value }))}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-900"
                      >
                        <option value="ITEMNAME">Désignation Principal (ITEMNAME)</option>
                        <option value="PRODUCT_SCAN">Code-Barres / EAN (PRODUCT_SCAN)</option>
                        <option value="SELLING_PRICE">Prix de Vente TTC (SELLING_PRICE)</option>
                        <option value="PROMOPRICE">Prix Promotionnel (PROMOPRICE)</option>
                        <option value="PARTNO">Référence / Part Number (PARTNO)</option>
                        <option value="BRAND_INFO">Marque / Fabricant (BRAND_INFO)</option>
                        <option value="CATEGORY_NAME">Rayon / Famille (CATEGORY_NAME)</option>
                        <option value="UNIT_PRICE_TEXT">Prix au Kilo / Litre (UNIT_PRICE_TEXT)</option>
                        <option value="__custom__">Attribut Personnalisé Libre</option>
                        <option value="__ignore__">❌ Ignorer cette colonne</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Database Save Mode Choice */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  Mode d'Enregistrement dans la Base de Données Principale
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label
                    onClick={() => setSaveMode('update_upsert')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      saveMode === 'update_upsert'
                        ? 'bg-blue-50/80 border-blue-400 shadow-xs'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-blue-600" />
                      Mettre à Jour & Enrichir (Upsert)
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Met à jour les prix/libellés des articles existants (selon le Code-barres/Réf) et ajoute les nouveaux.
                    </p>
                  </label>

                  <label
                    onClick={() => setSaveMode('overwrite')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      saveMode === 'overwrite'
                        ? 'bg-blue-50/80 border-blue-400 shadow-xs'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                      <RefreshCw className="w-4 h-4 text-red-600" />
                      Remplacer Intégralement
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Écrase la base de données principale avec le contenu nettoyé de ce fichier.
                    </p>
                  </label>

                  <label
                    onClick={() => setSaveMode('append')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      saveMode === 'append'
                        ? 'bg-blue-50/80 border-blue-400 shadow-xs'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-emerald-600" />
                      Ajouter à la Suite
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Conserve tous les articles actuels et ajoute ces {rows.length} lignes à la suite.
                    </p>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold"
          >
            Annuler
          </button>

          <div className="flex items-center gap-2">
            {activeStep === 'clean_grid' ? (
              <button
                onClick={() => setActiveStep('mapping_confirm')}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all"
              >
                <span>Suivant : Mapping & Validation</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleCommitToMasterDatabase}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all hover:scale-[1.02]"
              >
                <Check className="w-4 h-4" />
                <span>Enregistrer dans la Base Principale ({rows.length} articles)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add Column Popup Modal */}
      {showAddColModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 max-w-sm w-full space-y-3 shadow-2xl">
            <h4 className="font-bold text-sm text-slate-900">Ajouter une Nouvelle Colonne</h4>
            <input
              type="text"
              placeholder="Titre de la colonne (ex: TVA, MARGE, SEMAINE)"
              value={newColTitle}
              onChange={(e) => setNewColTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-xs"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => setShowAddColModal(false)} className="px-3 py-1.5 text-xs text-slate-600">
                Annuler
              </button>
              <button onClick={handleAddColumn} className="px-4 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-lg">
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Column Popup Modal */}
      {editingColName && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 max-w-sm w-full space-y-3 shadow-2xl">
            <h4 className="font-bold text-sm text-slate-900">Renommer la Colonne "{editingColName}"</h4>
            <input
              type="text"
              value={newColNameInput}
              onChange={(e) => setNewColNameInput(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-xs"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => setEditingColName(null)} className="px-3 py-1.5 text-xs text-slate-600">
                Annuler
              </button>
              <button
                onClick={() => handleRenameColumn(editingColName)}
                className="px-4 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-lg"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
