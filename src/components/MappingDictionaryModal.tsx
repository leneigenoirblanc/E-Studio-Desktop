import React, { useState, useMemo, useEffect } from 'react';
import { useMappingDictionary } from '../context/MappingDictionaryContext';
import { FieldAliasDefinition, MatchResult, normalizeToken } from '../utils/mappingDictionary';
import { desktopFileService } from '../services/desktopFileService';
import {
  BookOpen,
  Search,
  Plus,
  Pencil,
  Copy,
  Trash2,
  Download,
  Upload,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Tag,
  Hash,
  DollarSign,
  Barcode,
  Calendar,
  Layers,
  Truck,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Check,
  X,
  Sliders,
  HelpCircle,
  FolderPlus,
  Save,
  Clock,
  ArrowRight,
} from 'lucide-react';

interface MappingDictionaryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CategoryTab = 'all' | 'identity' | 'pricing' | 'classification' | 'logistics' | 'lifecycle' | 'custom' | 'simulator';

export const MappingDictionaryModal: React.FC<MappingDictionaryModalProps> = ({ isOpen, onClose }) => {
  const {
    dictionary: savedDictionary,
    setFullDictionary,
    resetToDefaults,
    exportJson,
    importJson,
    detectField,
  } = useMappingDictionary();

  // Local working draft copy of the dictionary for the Save/Apply/Cancel pattern
  const [draftDictionary, setDraftDictionary] = useState<FieldAliasDefinition[]>([]);
  const [activeTab, setActiveTab] = useState<CategoryTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newAliasInputs, setNewAliasInputs] = useState<Record<string, string>>({});
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Field Edit / Create modal state
  const [editingField, setEditingField] = useState<{
    originalKey: string | null; // null if creating new
    key: string;
    label: string;
    description: string;
    value_type: 'text' | 'currency' | 'barcode' | 'number' | 'date' | 'promo';
    category: 'identity' | 'pricing' | 'classification' | 'logistics' | 'lifecycle' | 'custom';
    default_aliases: string[];
    custom_aliases: string[];
    keywords: string[];
    is_volatile: boolean;
    numeric: boolean;
    is_custom_field: boolean;
  } | null>(null);

  // Field Delete confirmation state
  const [deletingFieldKey, setDeletingFieldKey] = useState<string | null>(null);

  // Protected Reset Modal state
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');

  // Unsaved changes exit confirmation dialog
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

  // Simulator scratchpad state
  const [simulatorInput, setSimulatorInput] = useState('EAN13, DESIGNATION, PRIX_VENTE_TTC, PV_PROMO, DATE_FIN_PROMO, FOURNISSEUR, PCB');

  // Initialize draft when modal opens
  useEffect(() => {
    if (isOpen) {
      setDraftDictionary(JSON.parse(JSON.stringify(savedDictionary)));
      setSearchQuery('');
      setFeedbackMessage(null);
    }
  }, [isOpen, savedDictionary]);

  // Check if draft has unsaved changes compared to savedDictionary
  const isDirty = useMemo(() => {
    return JSON.stringify(draftDictionary) !== JSON.stringify(savedDictionary);
  }, [draftDictionary, savedDictionary]);

  // Number of changed or created items
  const changedItemsCount = useMemo(() => {
    if (!isDirty) return 0;
    let count = 0;
    for (const d of draftDictionary) {
      const orig = savedDictionary.find((s) => s.key === d.key);
      if (!orig || JSON.stringify(orig) !== JSON.stringify(d)) {
        count++;
      }
    }
    // Also count deleted items
    for (const s of savedDictionary) {
      if (!draftDictionary.some((d) => d.key === s.key)) {
        count++;
      }
    }
    return count;
  }, [draftDictionary, savedDictionary, isDirty]);

  // Filter dictionary items in active draft
  const filteredFields = useMemo(() => {
    return draftDictionary.filter((field) => {
      const matchesCategory =
        activeTab === 'all'
          ? true
          : activeTab === 'custom'
          ? field.is_custom_field || field.category === 'custom'
          : field.category === activeTab;

      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      const inKey = field.key.toLowerCase().includes(q);
      const inLabel = field.label.toLowerCase().includes(q);
      const inDesc = (field.description || '').toLowerCase().includes(q);
      const inDefaultAliases = (field.default_aliases || []).some((a) => a.toLowerCase().includes(q));
      const inCustomAliases = (field.custom_aliases || []).some((a) => a.toLowerCase().includes(q));
      const inKeywords = (field.keywords || []).some((k) => k.toLowerCase().includes(q));

      return inKey || inLabel || inDesc || inDefaultAliases || inCustomAliases || inKeywords;
    });
  }, [draftDictionary, activeTab, searchQuery]);

  // Simulator results computation based on active draft
  const simulationResults = useMemo(() => {
    if (activeTab !== 'simulator') return [];
    const headers = simulatorInput
      .split(/[\n,;\t]+/)
      .map((h) => h.trim())
      .filter(Boolean);

    return headers.map((header) => {
      const raw = header.trim();
      const norm = normalizeToken(raw);
      const tokens = norm.split('_').filter((t) => t.length > 1);

      let match: MatchResult | null = null;

      // 1. Exact key match in draft
      for (const field of draftDictionary) {
        if (normalizeToken(field.key) === norm) {
          match = {
            canonical_key: field.key,
            field_label: field.label,
            confidence: 100,
            match_type: 'exact',
            matched_token: field.key,
            explanation: `Correspondance exacte avec la clé [${field.key}]`,
          };
          break;
        }
      }

      // 2. Custom aliases in draft
      if (!match) {
        for (const field of draftDictionary) {
          for (const alias of field.custom_aliases || []) {
            if (normalizeToken(alias) === norm) {
              match = {
                canonical_key: field.key,
                field_label: field.label,
                confidence: 99,
                match_type: 'user_alias',
                matched_token: alias,
                explanation: `Correspondance avec alias personnalisé utilisateur: "${alias}"`,
              };
              break;
            }
          }
          if (match) break;
        }
      }

      // 3. Default aliases in draft
      if (!match) {
        for (const field of draftDictionary) {
          for (const alias of field.default_aliases || []) {
            if (normalizeToken(alias) === norm) {
              match = {
                canonical_key: field.key,
                field_label: field.label,
                confidence: 95,
                match_type: 'default_alias',
                matched_token: alias,
                explanation: `Correspondance avec alias standard du commerce: "${alias}"`,
              };
              break;
            }
          }
          if (match) break;
        }
      }

      // 4. Keyword token match
      if (!match) {
        let bestScore = 0;
        let bestField: FieldAliasDefinition | null = null;
        let bestToken = '';

        for (const field of draftDictionary) {
          for (const kw of field.keywords || []) {
            if (tokens.includes(kw) || norm.includes(kw)) {
              const score = Math.round((kw.length / Math.max(norm.length, 1)) * 90);
              if (score > bestScore && score >= 40) {
                bestScore = score;
                bestField = field;
                bestToken = kw;
              }
            }
          }
        }

        if (bestField) {
          match = {
            canonical_key: bestField.key,
            field_label: bestField.label,
            confidence: Math.min(bestScore, 85),
            match_type: 'keyword_fuzzy',
            matched_token: bestToken,
            explanation: `Détection automatique par mot-clé contextuel: "${bestToken}"`,
          };
        }
      }

      return {
        header,
        match,
      };
    });
  }, [simulatorInput, activeTab, draftDictionary]);

  if (!isOpen) return null;

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  // Safe Close Request
  const handleRequestClose = () => {
    if (isDirty) {
      setIsDiscardConfirmOpen(true);
    } else {
      onClose();
    }
  };

  // Save / Apply Changes
  const handleSaveAndApply = () => {
    setFullDictionary(draftDictionary);
    showToast('success', 'Toutes les modifications du dictionnaire ont été enregistrées et appliquées avec succès.');
  };

  // Save / Apply and Close
  const handleSaveAndClose = () => {
    setFullDictionary(draftDictionary);
    onClose();
  };

  // Discard & Reset draft
  const handleDiscardChanges = () => {
    setDraftDictionary(JSON.parse(JSON.stringify(savedDictionary)));
    setIsDiscardConfirmOpen(false);
    showToast('info', 'Les modifications non enregistrées ont été annulées.');
  };

  // Inline Add Alias in Draft
  const handleInlineAddAlias = (fieldKey: string) => {
    const rawVal = newAliasInputs[fieldKey];
    if (!rawVal || !rawVal.trim()) return;

    const cleaned = rawVal.trim();
    const norm = normalizeToken(cleaned);

    // Duplicate check in draft
    for (const f of draftDictionary) {
      const allAliases = [...(f.default_aliases || []), ...(f.custom_aliases || [])].map((a) => normalizeToken(a));
      if (allAliases.includes(norm) || normalizeToken(f.key) === norm) {
        if (f.key === fieldKey) {
          showToast('error', `L'alias "${cleaned}" existe déjà pour ce champ.`);
        } else {
          showToast('error', `L'alias "${cleaned}" est déjà associé au champ "${f.label}" [${f.key}].`);
        }
        return;
      }
    }

    setDraftDictionary((prev) =>
      prev.map((f) => {
        if (f.key !== fieldKey) return f;
        const custom_aliases = [...(f.custom_aliases || []), cleaned];
        const keywords = Array.from(new Set([...(f.keywords || []), norm]));
        return { ...f, custom_aliases, keywords };
      })
    );

    setNewAliasInputs((prev) => ({ ...prev, [fieldKey]: '' }));
    showToast('success', `Alias "${cleaned}" ajouté (en attente d'enregistrement).`);
  };

  // Inline Remove Alias from Draft (works for both custom and default aliases!)
  const handleInlineRemoveAlias = (fieldKey: string, aliasToRemove: string, isDefault: boolean) => {
    setDraftDictionary((prev) =>
      prev.map((f) => {
        if (f.key !== fieldKey) return f;
        if (isDefault) {
          const default_aliases = (f.default_aliases || []).filter(
            (a) => a.trim().toLowerCase() !== aliasToRemove.trim().toLowerCase()
          );
          return { ...f, default_aliases };
        } else {
          const custom_aliases = (f.custom_aliases || []).filter(
            (a) => a.trim().toLowerCase() !== aliasToRemove.trim().toLowerCase()
          );
          return { ...f, custom_aliases };
        }
      })
    );
    showToast('info', `Alias "${aliasToRemove}" retiré.`);
  };

  // Open Edit Field Modal (Works for BOTH Predefined and Custom fields!)
  const handleOpenEditField = (field: FieldAliasDefinition) => {
    setEditingField({
      originalKey: field.key,
      key: field.key,
      label: field.label,
      description: field.description || '',
      value_type: field.value_type,
      category: field.category || 'custom',
      default_aliases: [...(field.default_aliases || [])],
      custom_aliases: [...(field.custom_aliases || [])],
      keywords: [...(field.keywords || [])],
      is_volatile: !!field.is_volatile,
      numeric: !!field.numeric,
      is_custom_field: !!field.is_custom_field,
    });
  };

  // Duplicate Field into Draft
  const handleDuplicateField = (sourceField: FieldAliasDefinition) => {
    let baseKey = `${sourceField.key}_COPIE`;
    let uniqueKey = baseKey;
    let suffix = 2;
    while (draftDictionary.some((f) => f.key === uniqueKey)) {
      uniqueKey = `${baseKey}_${suffix}`;
      suffix++;
    }

    const duplicatedDef: FieldAliasDefinition = {
      ...sourceField,
      key: uniqueKey,
      label: `${sourceField.label} (Copie)`,
      is_custom_field: true,
      default_aliases: [],
      custom_aliases: [...(sourceField.default_aliases || []), ...(sourceField.custom_aliases || [])],
      keywords: Array.from(
        new Set([
          normalizeToken(uniqueKey),
          ...(sourceField.keywords || []),
          ...(sourceField.default_aliases || []).map((a) => normalizeToken(a)),
        ])
      ),
    };

    setDraftDictionary((prev) => [duplicatedDef, ...prev]);
    showToast('success', `Champ dupliqué sous la clé [${uniqueKey}]. Vous pouvez maintenant l'ajuster.`);
    // Directly open in edit modal for immediate customization
    handleOpenEditField(duplicatedDef);
  };

  // Open Create New Field Modal
  const handleOpenCreateField = () => {
    setEditingField({
      originalKey: null,
      key: '',
      label: '',
      description: '',
      value_type: 'text',
      category: activeTab === 'all' || activeTab === 'simulator' ? 'custom' : activeTab,
      default_aliases: [],
      custom_aliases: [],
      keywords: [],
      is_volatile: false,
      numeric: false,
      is_custom_field: true,
    });
  };

  // Save Field from Edit / Create Modal into Draft
  const handleSaveFieldFromModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingField) return;

    const cleanKey = normalizeToken(editingField.key);
    if (!cleanKey) {
      showToast('error', 'La clé canonique est invalide.');
      return;
    }

    if (!editingField.label.trim()) {
      showToast('error', 'Veuillez saisir un libellé descriptif.');
      return;
    }

    // Check duplicate key
    const isNew = editingField.originalKey === null;
    const isKeyChanged = !isNew && editingField.originalKey !== cleanKey;

    if (isNew || isKeyChanged) {
      if (draftDictionary.some((f) => f.key === cleanKey)) {
        showToast('error', `Un champ avec la clé "${cleanKey}" existe déjà dans le dictionnaire.`);
        return;
      }
    }

    const allAliasesTokens = [...editingField.default_aliases, ...editingField.custom_aliases].map((a) =>
      normalizeToken(a)
    );
    const finalKeywords = Array.from(new Set([cleanKey, ...editingField.keywords, ...allAliasesTokens]));

    const updatedFieldDef: FieldAliasDefinition = {
      key: cleanKey,
      label: editingField.label.trim(),
      description: editingField.description.trim() || undefined,
      value_type: editingField.value_type,
      category: editingField.category,
      default_aliases: editingField.default_aliases,
      custom_aliases: editingField.custom_aliases,
      keywords: finalKeywords,
      is_volatile: editingField.is_volatile,
      numeric: editingField.numeric,
      is_custom_field: editingField.is_custom_field,
    };

    if (isNew) {
      setDraftDictionary((prev) => [updatedFieldDef, ...prev]);
      showToast('success', `Nouveau champ [${cleanKey}] créé dans le brouillon.`);
    } else {
      setDraftDictionary((prev) =>
        prev.map((f) => (f.key === editingField.originalKey ? updatedFieldDef : f))
      );
      showToast('success', `Champ [${cleanKey}] mis à jour dans le brouillon.`);
    }

    setEditingField(null);
  };

  // Delete Field from Draft (Works for BOTH Predefined and Custom fields!)
  const handleConfirmDeleteField = () => {
    if (!deletingFieldKey) return;
    const target = draftDictionary.find((f) => f.key === deletingFieldKey);
    setDraftDictionary((prev) => prev.filter((f) => f.key !== deletingFieldKey));
    setDeletingFieldKey(null);
    showToast('info', `Champ [${target?.label || deletingFieldKey}] supprimé du dictionnaire.`);
  };

  // Export Draft/Saved as JSON
  const handleExport = async () => {
    const jsonStr = JSON.stringify(draftDictionary, null, 2);
    const filename = `estudio_dictionnaire_mapping_${new Date().toISOString().slice(0, 10)}.json`;
    await desktopFileService.saveText(filename, jsonStr, [
      { name: 'Dictionnaire de Mapping', extensions: ['json'] },
    ]);
    showToast('success', 'Fichier JSON de configuration exporté avec succès.');
  };

  // Import JSON into Draft
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) {
          showToast('error', 'Format de fichier invalide (un tableau JSON est attendu).');
          return;
        }
        for (const item of parsed) {
          if (!item.key || !item.label || !item.value_type) {
            showToast('error', `Élément invalide dans le fichier (clé "${item.key || 'inconnue'}").`);
            return;
          }
        }
        setDraftDictionary(parsed);
        showToast('success', `Importation réussie : ${parsed.length} définitions chargées (en attente d'application).`);
      } catch (err) {
        showToast('error', `Erreur lors de l'importation JSON : ${String(err)}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Protected Reset Execution
  const handleExecuteProtectedReset = () => {
    if (resetConfirmInput.trim().toUpperCase() !== 'REINITIALISER') {
      showToast('error', 'Veuillez saisir exactement "REINITIALISER" pour confirmer la réinitialisation.');
      return;
    }

    resetToDefaults();
    setIsResetModalOpen(false);
    setResetConfirmInput('');
    showToast('info', 'Le dictionnaire a été restauré aux valeurs d\'usine de départ.');
  };

  // Stats
  const totalFields = draftDictionary.length;
  const totalUserAliases = draftDictionary.reduce((acc, f) => acc + (f.custom_aliases?.length || 0), 0);
  const totalDefaultAliases = draftDictionary.reduce((acc, f) => acc + (f.default_aliases?.length || 0), 0);

  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'identity':
        return <Barcode className="w-4 h-4 text-blue-600" />;
      case 'pricing':
        return <DollarSign className="w-4 h-4 text-emerald-600" />;
      case 'classification':
        return <Layers className="w-4 h-4 text-indigo-600" />;
      case 'logistics':
        return <Truck className="w-4 h-4 text-amber-600" />;
      case 'lifecycle':
        return <Calendar className="w-4 h-4 text-purple-600" />;
      default:
        return <Tag className="w-4 h-4 text-slate-600" />;
    }
  };

  const getValueTypeBadge = (type: string) => {
    switch (type) {
      case 'currency':
        return <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-semibold">Monétaire (€)</span>;
      case 'barcode':
        return <span className="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded text-[10px] font-semibold">Code-barres</span>;
      case 'number':
        return <span className="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-semibold">Numérique</span>;
      case 'date':
        return <span className="bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded text-[10px] font-semibold">Date</span>;
      case 'promo':
        return <span className="bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded text-[10px] font-semibold">Promo Badge</span>;
      default:
        return <span className="bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-semibold">Texte</span>;
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[94vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header Bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/90 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">
                  Dictionnaire de Correspondance des Données & Alias
                </h2>
                <span className="bg-blue-100 text-blue-800 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-blue-200">
                  {totalFields} champs • {totalUserAliases + totalDefaultAliases} alias reconnus
                </span>
                {isDirty && (
                  <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                    <Clock className="w-3 h-3 text-amber-700" />
                    <span>{changedItemsCount} modification(s) en attente d'enregistrement</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Modifiez, dupliquez, supprimez ou ajoutez des champs et règles d'alignement pour reconnaître automatiquement vos colonnes Excel / ERP.
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExport}
              title="Exporter la configuration du dictionnaire en JSON"
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Exporter JSON</span>
            </button>

            <label
              title="Importer un fichier JSON de dictionnaire"
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>Importer JSON</span>
              <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
            </label>

            {/* Protected Reset Trigger Button */}
            <button
              onClick={() => {
                setResetConfirmInput('');
                setIsResetModalOpen(true);
              }}
              title="Réinitialisation protégée aux paramètres d'usine"
              className="px-2.5 py-1.5 bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition group"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600 group-hover:scale-110 transition" />
              <span>Réinitialiser (Sécurisé)</span>
            </button>

            <button
              onClick={handleRequestClose}
              className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition ml-1"
              title="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback / Notification Banner */}
        {feedbackMessage && (
          <div
            className={`px-4 py-2 text-xs font-medium flex items-center justify-between border-b ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : feedbackMessage.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              {feedbackMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
              {feedbackMessage.type === 'info' && <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />}
              <span>{feedbackMessage.text}</span>
            </div>
            <button
              onClick={() => setFeedbackMessage(null)}
              className="text-slate-400 hover:text-slate-700 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Toolbar & Filter Tabs */}
        <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Tous ({draftDictionary.length})
            </button>
            <button
              onClick={() => setActiveTab('identity')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'identity'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Barcode className="w-3.5 h-3.5" />
              <span>Identité & Code-barres</span>
            </button>
            <button
              onClick={() => setActiveTab('pricing')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'pricing'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Prix & Promotions</span>
            </button>
            <button
              onClick={() => setActiveTab('classification')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'classification'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Rayons & Catégories</span>
            </button>
            <button
              onClick={() => setActiveTab('logistics')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'logistics'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Fournisseurs & Colisage</span>
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'custom'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Champs Personnalisés</span>
            </button>
            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'simulator'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Simulateur & Alignement</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab !== 'simulator' && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher champ, clé, libellé ou alias..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-60 focus:bg-white focus:ring-1 focus:ring-blue-500 transition"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            <button
              onClick={handleOpenCreateField}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nouveau Champ</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50/60 space-y-4">
          
          {/* SIMULATOR TAB */}
          {activeTab === 'simulator' ? (
            <div className="space-y-4">
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span>Testeur de Détection & Correspondance Automatique en Direct</span>
                </div>
                <p className="text-xs text-slate-600">
                  Collez ci-dessous la liste des en-têtes de colonnes provenant de votre fichier Excel, CSV ou ERP. Le simulateur teste vos règles actives en temps réel (incluant les modifications non encore enregistrées).
                </p>

                <textarea
                  value={simulatorInput}
                  onChange={(e) => setSimulatorInput(e.target.value)}
                  placeholder="Collez vos en-têtes séparés par des virgules ou retours à la ligne..."
                  rows={3}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Simulation Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {simulationResults.map((item, idx) => {
                  const match = item.match;

                  return (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border transition space-y-2 bg-white ${
                        match ? 'border-emerald-200 shadow-2xs' : 'border-amber-200 bg-amber-50/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                          "{item.header}"
                        </span>
                        {match ? (
                          <div className="flex items-center gap-1">
                            <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                              {match.confidence}% match
                            </span>
                          </div>
                        ) : (
                          <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            Non reconnu
                          </span>
                        )}
                      </div>

                      {match ? (
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-700">Champ Cible :</span>
                            <span className="font-mono font-bold text-blue-700">[{match.canonical_key}]</span>
                          </div>
                          <div className="text-slate-600 text-[11px] font-medium">{match.field_label}</div>
                          <div className="text-[10px] text-slate-500 italic mt-0.5">{match.explanation}</div>
                        </div>
                      ) : (
                        <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-start gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            Aucun alias correspondant. Vous pouvez l'associer ci-dessous ou créer un champ.
                          </span>
                        </div>
                      )}

                      {/* Quick Bind Action */}
                      {!match && (
                        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                const targetKey = e.target.value;
                                setNewAliasInputs((prev) => ({ ...prev, [targetKey]: item.header }));
                                handleInlineAddAlias(targetKey);
                              }
                            }}
                            defaultValue=""
                            className="w-full text-xs py-1 px-2 border border-slate-200 rounded bg-white text-slate-700"
                          >
                            <option value="" disabled>
                              + Associer immédiatement à un champ existant...
                            </option>
                            {draftDictionary.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label} [{f.key}]
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* FIELDS LIST */
            <div className="space-y-3">
              {filteredFields.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
                  <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">Aucun champ ne correspond à votre recherche.</p>
                  <p className="text-xs text-slate-400 mt-1">Modifiez vos filtres ou créez un nouveau champ personnalisé.</p>
                </div>
              ) : (
                filteredFields.map((field) => {
                  const currentInput = newAliasInputs[field.key] || '';
                  const totalAliasesForField = (field.default_aliases?.length || 0) + (field.custom_aliases?.length || 0);

                  return (
                    <div
                      key={field.key}
                      className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3 hover:border-slate-300 transition"
                    >
                      {/* Top Row: Field Title, Category, Types & Action Buttons (Edit, Duplicate, Delete) */}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 shrink-0 mt-0.5">
                            {getCategoryIcon(field.category)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-xs font-bold text-slate-900">{field.label}</h3>
                              <span className="font-mono bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                [{field.key}]
                              </span>
                              {field.is_custom_field ? (
                                <span className="bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">
                                  Personnalisé
                                </span>
                              ) : (
                                <span className="bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">
                                  Prédéfini
                                </span>
                              )}
                              {field.is_volatile && (
                                <span className="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">
                                  Volatile
                                </span>
                              )}
                            </div>
                            
                            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                              <span>
                                Catégorie : <strong className="capitalize text-slate-700">{field.category || 'Général'}</strong>
                              </span>
                              <span>•</span>
                              <span>Type :</span>
                              {getValueTypeBadge(field.value_type)}
                              {field.description && (
                                <>
                                  <span>•</span>
                                  <span className="italic text-slate-400">{field.description}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions Toolbar for EVERY field: Edit, Duplicate, Delete */}
                        <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200">
                          {/* EDIT BUTTON */}
                          <button
                            onClick={() => handleOpenEditField(field)}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-blue-700 hover:bg-white rounded flex items-center gap-1 transition"
                            title="Modifier ce champ (libellé, type, catégorie, alias prédéfinis, etc.)"
                          >
                            <Pencil className="w-3.5 h-3.5 text-blue-600" />
                            <span>Modifier</span>
                          </button>

                          {/* DUPLICATE BUTTON */}
                          <button
                            onClick={() => handleDuplicateField(field)}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-emerald-700 hover:bg-white rounded flex items-center gap-1 transition"
                            title="Dupliquer la définition de ce champ"
                          >
                            <Copy className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Dupliquer</span>
                          </button>

                          {/* DELETE BUTTON */}
                          <button
                            onClick={() => setDeletingFieldKey(field.key)}
                            className="px-2 py-1 text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-white rounded flex items-center gap-1 transition"
                            title="Supprimer ce champ du dictionnaire"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            <span>Supprimer</span>
                          </button>
                        </div>
                      </div>

                      {/* Aliases List & Inline Management */}
                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span className="text-[11px] font-semibold text-slate-600">
                            Alias & Noms de Colonnes Reconnus ({totalAliasesForField}) :
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Normalisation automatique (casse, espaces, tirets et underscores)
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
                          {/* User custom aliases (blue tags) */}
                          {(field.custom_aliases || []).map((alias) => (
                            <span
                              key={alias}
                              className="inline-flex items-center gap-1 bg-blue-100 text-blue-900 border border-blue-300 px-2 py-0.5 rounded-md text-xs font-mono font-medium shadow-2xs group"
                            >
                              <span>{alias}</span>
                              <button
                                onClick={() => handleInlineRemoveAlias(field.key, alias, false)}
                                className="text-blue-600 hover:text-rose-700 ml-0.5 hover:bg-blue-200 rounded p-0.5 transition"
                                title="Supprimer cet alias personnalisé"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}

                          {/* Default system / predefined aliases (slate tags with removal option too!) */}
                          {(field.default_aliases || []).map((alias) => (
                            <span
                              key={alias}
                              className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md text-xs font-mono group"
                              title="Alias prédéfini standard"
                            >
                              <span>{alias}</span>
                              <button
                                onClick={() => handleInlineRemoveAlias(field.key, alias, true)}
                                className="text-slate-400 hover:text-rose-600 ml-0.5 hover:bg-slate-200 rounded p-0.5 transition"
                                title="Retirer cet alias standard pour ce champ"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}

                          {totalAliasesForField === 0 && (
                            <span className="text-xs text-slate-400 italic">
                              Aucun alias configuré. Ajoutez-en un ci-dessous.
                            </span>
                          )}
                        </div>

                        {/* Inline Add Alias Input */}
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            placeholder="Ajouter un nouvel alias reconnu (ex: PRIX_MAGASIN_TTC, CODE_ERP)..."
                            value={currentInput}
                            onChange={(e) =>
                              setNewAliasInputs((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleInlineAddAlias(field.key);
                              }
                            }}
                            className="flex-1 px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-blue-500 font-mono transition"
                          />
                          <button
                            onClick={() => handleInlineAddAlias(field.key)}
                            disabled={!currentInput.trim()}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Ajouter Alias</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Modal Footer with Save/Apply, Cancel & Status */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/90 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {isDirty ? (
              <div className="flex items-center gap-1.5 text-xs text-amber-800 font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Modifications non enregistrées dans la mémoire active. Cliquez sur "Appliquer & Enregistrer".</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Toutes les règles du dictionnaire sont synchronisées avec vos étiquettes.</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* CANCEL BUTTON */}
            <button
              onClick={handleRequestClose}
              className="px-3.5 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl transition"
            >
              Annuler
            </button>

            {/* SAVE & APPLY BUTTON */}
            <button
              onClick={handleSaveAndApply}
              disabled={!isDirty}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition"
            >
              <Save className="w-4 h-4" />
              <span>Appliquer & Enregistrer</span>
            </button>

            {/* SAVE & CLOSE BUTTON */}
            <button
              onClick={handleSaveAndClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
            >
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Enregistrer & Fermer</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. EDIT / CREATE FIELD MODAL (For Predefined & Custom)     */}
      {/* ========================================================= */}
      {editingField && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-60 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Pencil className="w-4 h-4 text-blue-600" />
                <span>
                  {editingField.originalKey
                    ? `Modifier le Champ [${editingField.originalKey}]`
                    : 'Créer un Nouveau Champ'}
                </span>
              </div>
              <button
                onClick={() => setEditingField(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFieldFromModal} className="space-y-3.5 text-xs">
              {/* Canonical Key */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Clé interne canonique (MAJUSCULES, ex: PRIX_VENTE, REF_FOURN) :
                </label>
                <input
                  type="text"
                  value={editingField.key}
                  onChange={(e) =>
                    setEditingField({
                      ...editingField,
                      key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
                    })
                  }
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Label */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Libellé descriptif (affiché dans l'interface et les variables) :
                </label>
                <input
                  type="text"
                  value={editingField.label}
                  onChange={(e) => setEditingField({ ...editingField, label: e.target.value })}
                  placeholder="Ex: Prix Vente TTC, Code Article..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Description / Note explicative (optionnel) :
                </label>
                <input
                  type="text"
                  value={editingField.description}
                  onChange={(e) => setEditingField({ ...editingField, description: e.target.value })}
                  placeholder="Ex: Tarif de vente au détail incluant la TVA en vigueur..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Category and Value Type */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Type de valeur :</label>
                  <select
                    value={editingField.value_type}
                    onChange={(e) => setEditingField({ ...editingField, value_type: e.target.value as any })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white"
                  >
                    <option value="text">Texte libre</option>
                    <option value="currency">Prix / Monétaire (€)</option>
                    <option value="barcode">Code-barres / EAN</option>
                    <option value="number">Numérique / Quantité</option>
                    <option value="date">Date (DLC / Promo)</option>
                    <option value="promo">Badge Promo</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Catégorie :</label>
                  <select
                    value={editingField.category}
                    onChange={(e) => setEditingField({ ...editingField, category: e.target.value as any })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white"
                  >
                    <option value="identity">Identité & Code-barres</option>
                    <option value="pricing">Prix & Promotions</option>
                    <option value="classification">Rayons & Catégories</option>
                    <option value="logistics">Fournisseurs & Colisage</option>
                    <option value="lifecycle">Cycle de vie & Dates</option>
                    <option value="custom">Champs Personnalisés</option>
                  </select>
                </div>
              </div>

              {/* Custom Aliases Edit (comma separated) */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Alias personnalisés (séparés par virgules) :
                </label>
                <textarea
                  rows={2}
                  value={editingField.custom_aliases.join(', ')}
                  onChange={(e) => {
                    const parsed = e.target.value
                      .split(/[,;\n]+/)
                      .map((a) => a.trim())
                      .filter(Boolean);
                    setEditingField({ ...editingField, custom_aliases: parsed });
                  }}
                  placeholder="Ex: PV_TTC, PRIX_CLIENT, TARIF_TTC"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Default Aliases Edit */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Alias standards / prédéfinis (séparés par virgules) :
                </label>
                <textarea
                  rows={2}
                  value={editingField.default_aliases.join(', ')}
                  onChange={(e) => {
                    const parsed = e.target.value
                      .split(/[,;\n]+/)
                      .map((a) => a.trim())
                      .filter(Boolean);
                    setEditingField({ ...editingField, default_aliases: parsed });
                  }}
                  placeholder="Ex: PRIX, TTC, PV"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Flags */}
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={editingField.is_volatile}
                    onChange={(e) => setEditingField({ ...editingField, is_volatile: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Champ Volatile (change fréquemment)</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={editingField.numeric}
                    onChange={(e) => setEditingField({ ...editingField, numeric: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Valeur Numérique Calculable</span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingField(null)}
                  className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm"
                >
                  {editingField.originalKey ? 'Enregistrer dans le brouillon' : 'Créer le Champ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. FIELD DELETION CONFIRMATION MODAL                      */}
      {/* ========================================================= */}
      {deletingFieldKey && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-60 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="p-2.5 bg-rose-100 rounded-xl">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Supprimer la Définition de Champ ?</h3>
                <span className="font-mono text-xs font-bold text-rose-700">[{deletingFieldKey}]</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Êtes-vous certain de vouloir supprimer le champ <strong>[{deletingFieldKey}]</strong> ainsi que tous ses alias associés ? Les données de vos imports Excel correspondant à ce champ ne seront plus automatiquement mappées.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setDeletingFieldKey(null)}
                className="px-3.5 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmDeleteField}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Supprimer Définitivement</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. PROTECTED RESET SECURITY MODAL                         */}
      {/* ========================================================= */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-70 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border-2 border-rose-300 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl">
                <ShieldAlert className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Zone de Sécurité : Réinitialisation Usine
                </h3>
                <p className="text-xs text-rose-600 font-semibold">
                  Action destructive irréversible sans sauvegarde préalable
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-xs text-rose-900">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Attention : cette action va écraser :</span>
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] pl-1 text-rose-800">
                <li>Tous vos alias personnalisés ajoutés au fil de l'utilisation.</li>
                <li>Tous les champs créés ou modifiés manuellement.</li>
                <li>Toutes les règles de correspondance spécifiques à votre magasin / ERP.</li>
              </ul>
            </div>

            {/* Recommendation to Backup First */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-600">Recommandé avant réinitialisation :</span>
              <button
                onClick={handleExport}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>Télécharger une sauvegarde JSON</span>
              </button>
            </div>

            {/* Protection Passphrase Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Pour débloquer la réinitialisation, tapez <span className="font-mono text-rose-600 select-all">REINITIALISER</span> ci-dessous :
              </label>
              <input
                type="text"
                placeholder="Tapez REINITIALISER pour confirmer..."
                value={resetConfirmInput}
                onChange={(e) => setResetConfirmInput(e.target.value)}
                className="w-full p-2.5 border-2 border-slate-200 focus:border-rose-500 rounded-xl text-xs font-mono tracking-wider uppercase focus:outline-none transition"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  setIsResetModalOpen(false);
                  setResetConfirmInput('');
                }}
                className="px-3.5 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl transition"
              >
                Annuler
              </button>
              <button
                onClick={handleExecuteProtectedReset}
                disabled={resetConfirmInput.trim().toUpperCase() !== 'REINITIALISER'}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Confirmer la Réinitialisation Usine</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. DISCARD UNSAVED CHANGES CONFIRMATION                   */}
      {/* ========================================================= */}
      {isDiscardConfirmOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-70 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-amber-700">
              <div className="p-2.5 bg-amber-100 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Modifications non enregistrées</h3>
                <span className="text-xs text-slate-500">Voulez-vous quitter sans enregistrer ?</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Vous avez {changedItemsCount} modification(s) en attente dans le dictionnaire. Si vous quittez maintenant, ces changements seront perdus.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setIsDiscardConfirmOpen(false)}
                className="px-3 py-1.5 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Continuer les modifications
              </button>
              <button
                onClick={() => {
                  handleDiscardChanges();
                  onClose();
                }}
                className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg"
              >
                Quitter sans enregistrer
              </button>
              <button
                onClick={handleSaveAndClose}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm"
              >
                Enregistrer & Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
