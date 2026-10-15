import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ProductRecord, LabelTemplate } from '../types';
import { catalogRepository, ImportReport } from '../services/catalogRepository';
import { AuditLogService } from '../services/auditLogService';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Search,
  Plus,
  Upload,
  Download,
  Trash2,
  Printer,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  FileCheck,
  RefreshCw,
  FolderArchive,
  Eye,
} from 'lucide-react';
import { desktopFileService } from '../services/desktopFileService';
import { resolveCanonicalKey } from '../utils/mappingDictionary';

export interface CollisionItem {
  id: string;
  key: string;
  existingName: string;
  existingPrice: number;
  incomingName: string;
  incomingPrice: number;
  overwrite: boolean;
}

interface CatalogManagementStudioProps {
  onBack: () => void;
  templates: LabelTemplate[];
  onGenerateFromDatabase: (selectedProducts: ProductRecord[]) => void;
}

export const CatalogManagementStudio: React.FC<CatalogManagementStudioProps> = ({
  onBack,
  templates,
  onGenerateFromDatabase,
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'import_wizard' | 'reports'>('catalog');
  const [products, setProducts] = useState<ProductRecord[]>(() => catalogRepository.getProducts());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Import wizard state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [importMode, setImportMode] = useState<'merge_update' | 'replace' | 'review_collisions'>('merge_update');
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [collisions, setCollisions] = useState<CollisionItem[]>([]);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = catalogRepository.subscribe((updated) => {
      setProducts(updated);
    });
    return () => unsub();
  }, []);

  const departments = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const d = p.DEPT_NAME || p.CATEGORY_NAME;
      if (d) set.add(d);
    });
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    return catalogRepository.search(searchQuery, selectedDept);
  }, [products, searchQuery, selectedDept]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const processWorkbookData = (data: Uint8Array, fileName: string) => {
    try {
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (json.length === 0) {
        setActionFeedback('Le fichier sélectionné est vide.');
        return;
      }

      const headers = (json[0] || []).map((h: any) => String(h || '').trim()).filter(Boolean);
      const rows = json.slice(1).filter((r) => r.some((cell) => cell !== undefined && cell !== ''));

      setParsedHeaders(headers);
      setParsedRows(rows);

      // Auto-match headers via persistent dictionary first, followed by retail heuristics
      const autoMap: Record<string, string> = {};
      headers.forEach((h) => {
        const canonical = resolveCanonicalKey(h);
        if (canonical && !autoMap[canonical]) {
          autoMap[canonical] = h;
          return;
        }

        const lower = h.toLowerCase();
        if (
          (lower.includes('ean') || lower.includes('gencod') || lower.includes('barcode') || lower.includes('scan')) &&
          !autoMap['PRODUCT_SCAN']
        ) {
          autoMap['PRODUCT_SCAN'] = h;
        } else if (
          (lower.includes('designation') || lower.includes('libelle') || lower.includes('nom') || lower.includes('item')) &&
          !autoMap['ITEMNAME']
        ) {
          autoMap['ITEMNAME'] = h;
        } else if (lower.includes('prix') || lower.includes('price') || lower.includes('pv')) {
          if (lower.includes('promo') && !autoMap['PROMOPRICE']) autoMap['PROMOPRICE'] = h;
          else if (!autoMap['SELLING_PRICE']) autoMap['SELLING_PRICE'] = h;
        } else if (
          (lower.includes('sku') || lower.includes('ref') || lower.includes('art') || lower.includes('partno')) &&
          !autoMap['PARTNO']
        ) {
          autoMap['PARTNO'] = h;
        } else if (
          (lower.includes('rayon') || lower.includes('dept') || lower.includes('departement')) &&
          !autoMap['DEPT_NAME']
        ) {
          autoMap['DEPT_NAME'] = h;
        } else if (
          (lower.includes('categ') || lower.includes('famille')) &&
          !autoMap['CATEGORY_NAME']
        ) {
          autoMap['CATEGORY_NAME'] = h;
        }
      });

      setFieldMappings(autoMap);
      setWizardStep(2);
    } catch (err: any) {
      setActionFeedback(`Erreur lors de la lecture du fichier : ${err.message || 'Format non supporté'}`);
    }
  };

  const handlePickNativeFile = async () => {
    try {
      const res = await desktopFileService.openBinary([
        { name: 'Feuille de calcul', extensions: ['xlsx', 'xls', 'csv'] },
      ]);
      if (res) {
        setImportFile({ name: res.name } as any);
        processWorkbookData(res.data, res.name);
        return;
      }
    } catch (err) {
      console.warn('Native open failed, falling back to input:', err);
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      processWorkbookData(data, file.name);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleValidateImport = () => {
    if (!fieldMappings['ITEMNAME']) {
      setActionFeedback('Veuillez au minimum mapper la colonne de Désignation (Nom de l\'article).');
      return;
    }

    const issues: string[] = [];
    const nameColIdx = parsedHeaders.indexOf(fieldMappings['ITEMNAME']);
    const scanColIdx = parsedHeaders.indexOf(fieldMappings['PRODUCT_SCAN'] || '');
    const priceColIdx = parsedHeaders.indexOf(fieldMappings['SELLING_PRICE'] || '');
    const partNoColIdx = parsedHeaders.indexOf(fieldMappings['PARTNO'] || '');

    const detectedCollisions: CollisionItem[] = [];
    const scanMap = new Map<string, ProductRecord>();
    const partMap = new Map<string, ProductRecord>();
    products.forEach((p) => {
      if (p.PRODUCT_SCAN) scanMap.set(p.PRODUCT_SCAN.trim(), p);
      if (p.PARTNO) partMap.set(p.PARTNO.trim(), p);
    });

    parsedRows.forEach((row, i) => {
      const name = row[nameColIdx];
      if (!name) issues.push(`Ligne ${i + 2}: Désignation manquante`);
      if (priceColIdx >= 0) {
        const rawPrice = row[priceColIdx];
        if (rawPrice !== undefined && isNaN(Number(String(rawPrice).replace(',', '.')))) {
          issues.push(`Ligne ${i + 2}: Prix invalide "${rawPrice}"`);
        }
      }

      const barcode = scanColIdx >= 0 ? String(row[scanColIdx] || '').trim() : '';
      const partNo = partNoColIdx >= 0 ? String(row[partNoColIdx] || '').trim() : '';
      const match = (barcode && scanMap.get(barcode)) || (partNo && partMap.get(partNo));
      if (match) {
        const rawPrice = priceColIdx >= 0 ? row[priceColIdx] : 0;
        const parsedPrice = rawPrice ? Number(String(rawPrice).replace(',', '.')) : 0;
        const key = barcode || partNo || match.id;
        detectedCollisions.push({
          id: match.id,
          key,
          existingName: match.ITEMNAME,
          existingPrice: match.SELLING_PRICE,
          incomingName: String(name || '').trim(),
          incomingPrice: isNaN(parsedPrice) ? 0 : parsedPrice,
          overwrite: true,
        });
      }
    });

    setCollisions(detectedCollisions);
    setValidationIssues(issues);
    setWizardStep(3);
  };

  const handleCommitImport = () => {
    const nameColIdx = parsedHeaders.indexOf(fieldMappings['ITEMNAME']);
    const scanColIdx = parsedHeaders.indexOf(fieldMappings['PRODUCT_SCAN'] || '');
    const partNoColIdx = parsedHeaders.indexOf(fieldMappings['PARTNO'] || '');
    const priceColIdx = parsedHeaders.indexOf(fieldMappings['SELLING_PRICE'] || '');
    const promoColIdx = parsedHeaders.indexOf(fieldMappings['PROMOPRICE'] || '');
    const deptColIdx = parsedHeaders.indexOf(fieldMappings['DEPT_NAME'] || '');
    const catColIdx = parsedHeaders.indexOf(fieldMappings['CATEGORY_NAME'] || '');

    const imported: ProductRecord[] = [];

    parsedRows.forEach((row, index) => {
      const name = String(row[nameColIdx] || '').trim();
      if (!name) return; // Skip empty rows

      const barcode = scanColIdx >= 0 ? String(row[scanColIdx] || '').trim() : '';
      const partNo = partNoColIdx >= 0 ? String(row[partNoColIdx] || '').trim() : '';
      const rawPrice = priceColIdx >= 0 ? row[priceColIdx] : 0;
      const parsedPrice = rawPrice ? Number(String(rawPrice).replace(',', '.')) : 0;
      const rawPromo = promoColIdx >= 0 ? row[promoColIdx] : null;
      const parsedPromo = rawPromo ? Number(String(rawPromo).replace(',', '.')) : null;

      imported.push({
        id: `PROD-${Date.now().toString(36)}-${index}`,
        ITEMNAME: name,
        PRODUCT_SCAN: barcode,
        PARTNO: partNo || barcode,
        SELLING_PRICE: isNaN(parsedPrice) ? 0 : parsedPrice,
        PROMOPRICE: parsedPromo !== null && !isNaN(parsedPromo) ? parsedPromo : undefined,
        DEPT_NAME: deptColIdx >= 0 ? String(row[deptColIdx] || '').trim() : 'Général',
        CATEGORY_NAME: catColIdx >= 0 ? String(row[catColIdx] || '').trim() : undefined,
      });
    });

    const report: ImportReport = {
      id: `IMP-${Date.now()}`,
      timestamp: new Date().toISOString(),
      filename: importFile?.name || 'import.xlsx',
      totalRowsRead: parsedRows.length,
      importedCount: imported.length,
      updatedCount: 0,
      rejectedCount: parsedRows.length - imported.length,
      duplicateCount: collisions.length,
      warnings: validationIssues.slice(0, 10),
    };

    const skipKeys = new Set<string>();
    if (importMode === 'review_collisions') {
      collisions.forEach((c) => {
        if (!c.overwrite) {
          skipKeys.add(c.key);
        }
      });
    }

    catalogRepository.commitImport(imported, report, importMode, skipKeys);

    AuditLogService.append({
      action: 'IMPORT_CATALOGUE',
      details: `Importation de ${imported.length} articles depuis ${importFile?.name} (mode: ${importMode})`,
    });

    // Reset wizard
    setWizardStep(1);
    setImportFile(null);
    setParsedHeaders([]);
    setParsedRows([]);
    setActiveTab('catalog');
  };

  const handleExportWorkspace = async () => {
    const jsonStr = catalogRepository.exportWorkspaceJson();
    const filename = `estudio_catalogue_workspace_${Date.now()}.json`;
    await desktopFileService.saveText(filename, jsonStr, [
      { name: 'Catalogue E-Studio', extensions: ['json'] },
    ]);
  };

  const handleRestoreWorkspaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const res = catalogRepository.importWorkspaceJson(event.target?.result as string);
      setActionFeedback(res.message);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-900 text-slate-100 overflow-hidden font-sans">
      {/* Top Header Toolbar */}
      <header className="h-14 border-b border-slate-800 bg-slate-950 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            title="Retour au Tableau de Bord"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <h1 className="text-sm font-bold tracking-tight text-white">Catalogue & Résolution Produits</h1>
            </div>
            <p className="text-[10px] text-slate-400">Dépôt local vérifié · Importation Excel/CSV déterministe</p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-3 py-1 rounded-lg font-semibold transition ${
              activeTab === 'catalog' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Articles ({products.length})
          </button>
          <button
            onClick={() => {
              setWizardStep(1);
              setActiveTab('import_wizard');
            }}
            className={`px-3 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'import_wizard' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-3 h-3" />
            <span>Assistant d'Importation</span>
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3 py-1 rounded-lg font-semibold transition ${
              activeTab === 'reports' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Historique d'Imports
          </button>
        </div>

        {/* Workspace Backup / Restore */}
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={handleExportWorkspace}
            className="px-2.5 py-1.5 border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg flex items-center gap-1.5 transition"
            title="Sauvegarder l'espace de travail au format JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sauvegarder</span>
          </button>

          <input
            type="file"
            accept=".json"
            ref={restoreInputRef}
            onChange={handleRestoreWorkspaceFile}
            className="hidden"
          />
          <button
            onClick={() => restoreInputRef.current?.click()}
            className="px-2.5 py-1.5 border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg flex items-center gap-1.5 transition"
            title="Restaurer un fichier de sauvegarde JSON"
          >
            <FolderArchive className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Restaurer</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col min-h-0 p-6 overflow-hidden">
        {/* TAB 1: CATALOG VIEW */}
        {activeTab === 'catalog' && (
          <div className="flex-1 flex flex-col min-h-0 bg-slate-950 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            {/* Search & Actions Bar */}
            <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/60">
              <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher par désignation, EAN ou référence..."
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-300"
                  >
                    <option value="all">Tous les rayons ({products.length})</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Batch Actions */}
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <button
                    onClick={() => {
                      const selected = products.filter((p) => selectedIds.has(p.id));
                      onGenerateFromDatabase(selected);
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Générer étiquettes ({selectedIds.size})</span>
                  </button>
                )}

                {products.length > 0 && (
                  <button
                    onClick={() => {
                      if (confirm('Êtes-vous sûr de vouloir vider le catalogue local ?')) {
                        catalogRepository.clearCatalog();
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition"
                    title="Vider le catalogue local"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Table or Genuine Empty State */}
            {products.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center text-emerald-400 mb-4">
                  <FileSpreadsheet className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-white mb-1">Aucun article dans le catalogue</h3>
                <p className="text-xs text-slate-400 max-w-md mb-6">
                  Le catalogue est vierge. Importez un fichier Excel (.xlsx) ou CSV contenant vos articles, prix et codes-barres pour commencer la production d'étiquettes.
                </p>
                <button
                  onClick={() => {
                    setWizardStep(1);
                    setActiveTab('import_wizard');
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition"
                >
                  <Upload className="w-4 h-4" />
                  <span>Importer un fichier Excel / CSV</span>
                </button>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <Search className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs text-slate-400">Aucun article ne correspond aux filtres de recherche.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400 sticky top-0 z-10 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === filteredProducts.length && filteredProducts.length > 0}
                          onChange={handleSelectAll}
                          className="rounded border-slate-700"
                        />
                      </th>
                      <th className="p-3">Référence / SKU</th>
                      <th className="p-3">Code-Barre (EAN-13)</th>
                      <th className="p-3">Désignation</th>
                      <th className="p-3">Rayon</th>
                      <th className="p-3 text-right">Prix Vente</th>
                      <th className="p-3 text-right">Prix Promo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                    {filteredProducts.map((p) => {
                      const isSelected = selectedIds.has(p.id);
                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-slate-900/50 transition cursor-pointer ${
                            isSelected ? 'bg-blue-950/20' : ''
                          }`}
                          onClick={() => handleToggleSelect(p.id)}
                        >
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(p.id)}
                              className="rounded border-slate-700"
                            />
                          </td>
                          <td className="p-3 font-semibold text-slate-200">{p.PARTNO || '—'}</td>
                          <td className="p-3 text-slate-400">{p.PRODUCT_SCAN || '—'}</td>
                          <td className="p-3 font-sans font-medium text-white max-w-xs truncate">{p.ITEMNAME}</td>
                          <td className="p-3 font-sans text-slate-400">{p.DEPT_NAME || '—'}</td>
                          <td className="p-3 text-right font-bold text-emerald-400">
                            {p.SELLING_PRICE !== undefined ? `${p.SELLING_PRICE.toFixed(2)} €` : '—'}
                          </td>
                          <td className="p-3 text-right font-bold text-rose-400">
                            {p.PROMOPRICE ? `${p.PROMOPRICE.toFixed(2)} €` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: IMPORT WIZARD */}
        {activeTab === 'import_wizard' && (
          <div className="flex-1 flex flex-col min-h-0 bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl overflow-y-auto">
            <div className="max-w-2xl mx-auto w-full space-y-6">
              {/* Stepper */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className={`flex items-center gap-2 ${wizardStep >= 1 ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>
                  <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs">1</span>
                  <span className="text-xs">Fichier</span>
                </div>
                <div className="h-0.5 w-12 bg-slate-800" />
                <div className={`flex items-center gap-2 ${wizardStep >= 2 ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>
                  <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs">2</span>
                  <span className="text-xs">Mapping</span>
                </div>
                <div className="h-0.5 w-12 bg-slate-800" />
                <div className={`flex items-center gap-2 ${wizardStep >= 3 ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>
                  <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs">3</span>
                  <span className="text-xs">Validation</span>
                </div>
              </div>

              {/* STEP 1: CHOOSE FILE */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div
                    onClick={handlePickNativeFile}
                    className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition bg-slate-900/40"
                  >
                    <Upload className="w-10 h-10 text-slate-500 mb-3" />
                    <p className="text-sm font-semibold text-white">Cliquez pour sélectionner un fichier Excel (.xlsx, .xls) ou CSV</p>
                    <p className="text-xs text-slate-500 mt-1">Lecture directe en local sans transfert réseau</p>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: FIELD MAPPING */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">Correspondance des Colonnes</h3>
                      <p className="text-xs text-slate-400">
                        {parsedRows.length} lignes détectées dans <span className="font-mono text-blue-400">{importFile?.name}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => setWizardStep(1)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Changer de fichier
                    </button>
                  </div>

                  <div className="space-y-3 bg-slate-900 border border-slate-800 p-4 rounded-xl text-xs">
                    {[
                      { key: 'ITEMNAME', label: 'Désignation / Nom article * (Requis)' },
                      { key: 'PRODUCT_SCAN', label: 'Code-Barre / EAN-13' },
                      { key: 'PARTNO', label: 'Référence interne / SKU' },
                      { key: 'SELLING_PRICE', label: 'Prix de Vente Normal' },
                      { key: 'PROMOPRICE', label: 'Prix Promotionnel' },
                      { key: 'DEPT_NAME', label: 'Rayon / Département' },
                      { key: 'CATEGORY_NAME', label: 'Famille / Catégorie' },
                    ].map((target) => (
                      <div key={target.key} className="flex items-center justify-between gap-4">
                        <span className="font-semibold text-slate-300">{target.label}</span>
                        <select
                          value={fieldMappings[target.key] || ''}
                          onChange={(e) =>
                            setFieldMappings({ ...fieldMappings, [target.key]: e.target.value })
                          }
                          className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs max-w-xs w-full"
                        >
                          <option value="">-- Ignorer cette colonne --</option>
                          {parsedHeaders.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-4">
                    <button
                      onClick={() => setWizardStep(1)}
                      className="px-4 py-2 border border-slate-700 text-slate-300 rounded-xl text-xs"
                    >
                      Précédent
                    </button>
                    <button
                      onClick={handleValidateImport}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2"
                    >
                      <span>Valider les données</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: PREVIEW & COMMIT */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-white">Validation et Confirmation d'Importation</h3>

                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Total de lignes analysées :</span>
                      <span className="font-bold text-white">{parsedRows.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Mode d'intégration :</span>
                      <div className="flex items-center gap-3 flex-wrap">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="mergeMode"
                            checked={importMode === 'merge_update'}
                            onChange={() => setImportMode('merge_update')}
                          />
                          <span>Fusionner (Mise à jour)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="mergeMode"
                            checked={importMode === 'replace'}
                            onChange={() => setImportMode('replace')}
                          />
                          <span>Remplacer tout</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="mergeMode"
                            checked={importMode === 'review_collisions'}
                            onChange={() => setImportMode('review_collisions')}
                          />
                          <span>Examiner les collisions ({collisions.length})</span>
                        </label>
                      </div>
                    </div>

                    {importMode === 'review_collisions' && collisions.length > 0 && (
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white">Résolution des {collisions.length} collisions détectées</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setCollisions((prev) => prev.map((c) => ({ ...c, overwrite: true })))}
                              className="text-blue-400 hover:text-blue-300 font-semibold"
                            >
                              Tout écraser
                            </button>
                            <span className="text-slate-600">·</span>
                            <button
                              type="button"
                              onClick={() => setCollisions((prev) => prev.map((c) => ({ ...c, overwrite: false })))}
                              className="text-slate-400 hover:text-white"
                            >
                              Tout conserver
                            </button>
                          </div>
                        </div>
                        <div className="max-h-40 overflow-y-auto divide-y divide-slate-800/80 text-xs">
                          {collisions.map((col, idx) => (
                            <div key={idx} className="py-2 flex items-center justify-between gap-4">
                              <div className="min-w-0">
                                <span className="font-mono text-slate-400 text-[11px] block">{col.key}</span>
                                <span className="text-slate-300 truncate block">
                                  {col.existingName} → <strong className="text-white">{col.incomingName}</strong>
                                </span>
                                <span className="text-slate-500 text-[11px]">
                                  {col.existingPrice.toFixed(2)} € → {col.incomingPrice.toFixed(2)} €
                                </span>
                              </div>
                              <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                                <input
                                  type="checkbox"
                                  checked={col.overwrite}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setCollisions((prev) =>
                                      prev.map((c, i) => (i === idx ? { ...c, overwrite: checked } : c))
                                    );
                                  }}
                                  className="rounded"
                                />
                                <span className={col.overwrite ? 'text-blue-400 font-semibold' : 'text-slate-400'}>
                                  {col.overwrite ? 'Écraser' : 'Conserver'}
                                </span>
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {validationIssues.length > 0 && (
                      <div className="bg-amber-950/30 border border-amber-800/50 p-3 rounded-lg text-amber-300">
                        <div className="flex items-center gap-1.5 font-bold mb-1">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <span>{validationIssues.length} avertissement(s) détecté(s)</span>
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-200/80 max-h-24 overflow-y-auto">
                          {validationIssues.map((issue, idx) => (
                            <li key={idx}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4">
                    <button
                      onClick={() => setWizardStep(2)}
                      className="px-4 py-2 border border-slate-700 text-slate-300 rounded-xl text-xs"
                    >
                      Précédent
                    </button>
                    <button
                      onClick={handleCommitImport}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirmer et Enregistrer dans le Catalogue</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: IMPORT HISTORY REPORTS */}
        {activeTab === 'reports' && (
          <div className="flex-1 flex flex-col min-h-0 bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl overflow-y-auto">
            <h3 className="text-sm font-bold text-white mb-4">Rapports de Traçabilité des Importations</h3>
            {catalogRepository.getImportReports().length === 0 ? (
              <p className="text-xs text-slate-400">Aucun rapport d'importation enregistré pour le moment.</p>
            ) : (
              <div className="space-y-3">
                {catalogRepository.getImportReports().map((rep) => (
                  <div key={rep.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between font-semibold text-white">
                      <span>Fichier : {rep.filename}</span>
                      <span className="text-slate-400 text-[11px]">{new Date(rep.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="text-slate-400 text-[11px] flex gap-4 pt-1 font-mono">
                      <span>Articles importés : {rep.importedCount}</span>
                      <span>Total lignes : {rep.totalRowsRead}</span>
                      {rep.warnings.length > 0 && <span className="text-amber-400">Avertissements : {rep.warnings.length}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
