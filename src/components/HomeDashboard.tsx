import React, { useState } from 'react';
import { LabelTemplate } from '../types';
import { LabelRenderer } from './LabelRenderer';
import { ContextTooltip, useTooltip } from '../context/TooltipContext';
import {
  Plus,
  Printer,
  Edit3,
  Copy,
  Trash2,
  Download,
  Upload,
  Search,
  Tag,
  BookOpen,
  FileSpreadsheet,
  Cpu,
  Database,
  History,
} from 'lucide-react';
import { desktopFileService } from '../services/desktopFileService';
import { PrintJobHistoryModal } from './PrintJobHistoryModal';
import { PreFlightEngine } from '../utils/preFlightEngine';

interface HomeDashboardProps {
  templates: LabelTemplate[];
  onSelectTemplateToEdit: (template: LabelTemplate) => void;
  onSelectTemplateToGenerate: (template: LabelTemplate) => void;
  onOpenNewWizard: () => void;
  onDuplicateTemplate: (template: LabelTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
  onImportTemplate: (template: LabelTemplate) => void;
  onOpenRulesModal: () => void;
  onOpenAuditLogs?: () => void;
  onOpenFontManager?: () => void;
  onOpenMappingDictionary?: () => void;
  onOpenCatalog?: () => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  templates,
  onSelectTemplateToEdit,
  onSelectTemplateToGenerate,
  onOpenNewWizard,
  onDuplicateTemplate,
  onDeleteTemplate,
  onImportTemplate,
  onOpenRulesModal,
  onOpenAuditLogs,
  onOpenFontManager,
  onOpenMappingDictionary,
  onOpenCatalog,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [devTestResult, setDevTestResult] = useState<string | null>(null);

  const handleDevTestSQLite = async () => {
    try {
      const testId = `dev_test_${Date.now()}`;
      const sampleDoc: LabelTemplate = {
        id: testId,
        schema_version: 1,
        revision: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        name: 'Gabarit Test SQLite',
        width_mm: 80,
        height_mm: 40,
        inner_margins_mm: { top: 2, bottom: 2, left: 2, right: 2 },
        outer_margins_mm: { top: 1, bottom: 1, left: 1, right: 1 },
        bg_color: '#FFFFFF',
        bg_opacity: 1,
        items: [],
      };

      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const saved = await invoke<LabelTemplate>('template_save', { doc: sampleDoc });
        const retrieved = await invoke<LabelTemplate>('template_get', { id: saved.id });
        setDevTestResult(`✅ SQLite vérifié (Tauri IPC): ${retrieved.name} [id=${retrieved.id}, rev=${retrieved.revision}]`);
      } else {
        setDevTestResult(`ℹ️ SQLite Tauri prêt: commandes 'template_save' & 'template_get' configurées`);
      }
    } catch (err: any) {
      setDevTestResult(`❌ Erreur SQLite: ${err?.message || String(err)}`);
    }
  };

  const filteredTemplates = templates.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [importError, setImportError] = useState<string | null>(null);
  const [showJobHistory, setShowJobHistory] = useState(false);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json && json.name && json.width_mm && json.height_mm) {
          setImportError(null);
          onImportTemplate(json);
        } else {
          setImportError('Fichier JSON de gabarit invalide (propriétés manquantes).');
        }
      } catch (err) {
        setImportError('Erreur lors de la lecture du fichier JSON: ' + String(err));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportTemplate = async (template: LabelTemplate) => {
    const dataStr = JSON.stringify(template, null, 2);
    const filename = `gabarit_${template.name.replace(/\s+/g, '_')}.json`;
    await desktopFileService.saveText(filename, dataStr, [
      { name: 'Gabarit E-Studio', extensions: ['json'] },
    ]);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 overflow-y-auto font-sans">
      {/* Top Welcome Banner */}
      <div className="bg-slate-900 border-b border-slate-800 py-6 px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-400 mb-1 font-semibold text-xs uppercase tracking-wider">
              <Tag className="w-4 h-4" />
              <span>Conception & Production d'Étiquettes Retail</span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              E-Studio Desktop
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Conception vectorielle en millimètres réels, résolution locale de catalogue Excel/CSV, validation pré-presse déterministe et imposition sur planches.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={onOpenCatalog}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Catalogue & Import</span>
            </button>

            <button
              onClick={() => setShowJobHistory(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition"
              title="Consulter l'historique des travaux d'impression et le spooler SQLite"
            >
              <History className="w-3.5 h-3.5 text-purple-400" />
              <span>Spooler</span>
            </button>

            <button
              onClick={onOpenMappingDictionary}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-400" />
              <span>Mapping</span>
            </button>

            <button
              onClick={onOpenRulesModal}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition"
            >
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <span>Règles d'Affichage</span>
            </button>

            <button
              onClick={onOpenNewWizard}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Créer un Gabarit</span>
            </button>

            <label className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer transition">
              <Upload className="w-3.5 h-3.5" />
              <span>Importer JSON</span>
              <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
            </label>

            <button
              onClick={handleDevTestSQLite}
              className="px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition"
              title="Dev-only: Test SQLite template_save et template_get"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Dev: Test SQLite</span>
            </button>
          </div>
        </div>

        {devTestResult && (
          <div className="mt-4 bg-slate-900 border border-amber-500/50 text-amber-200 text-xs px-4 py-2.5 rounded-xl flex items-center justify-between shadow-md">
            <span>{devTestResult}</span>
            <button
              onClick={() => setDevTestResult(null)}
              className="text-slate-400 hover:text-white font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto w-full p-8 flex-1 flex flex-col space-y-6">
        {/* Search & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-white">
              Gabarits d'Étiquettes Enregistrés
            </h2>
            <span className="bg-slate-800 text-slate-300 font-mono font-bold text-xs px-2.5 py-0.5 rounded-full border border-slate-700">
              {filteredTemplates.length}
            </span>
          </div>

          {templates.length > 0 && (
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrer les gabarits..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {/* Empty State or Templates Grid */}
        {templates.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-950/40 border border-blue-800/40 flex items-center justify-center text-blue-400 mb-4">
              <Tag className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Aucun gabarit créé pour le moment</h3>
            <p className="text-xs text-slate-400 max-w-md mb-6">
              L'espace de travail est prêt. Créez votre premier gabarit d'étiquette sur-mesure (prix, promo, code-barres) ou importez un modèle existant.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onOpenNewWizard}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>Créer un nouveau gabarit</span>
              </button>
              <label className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition">
                <Upload className="w-4 h-4" />
                <span>Importer un gabarit JSON</span>
                <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
              </label>
            </div>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-900 border border-dashed border-slate-800 rounded-2xl text-center">
            <Search className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-xs text-slate-400">Aucun gabarit ne correspond à votre recherche "{searchTerm}".</p>
            <button
              onClick={() => setSearchTerm('')}
              className="mt-3 text-xs text-blue-400 hover:text-blue-300 font-semibold"
            >
              Effacer le filtre
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-sm transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="font-bold text-sm text-white group-hover:text-blue-400 transition-colors truncate">
                      {template.name}
                    </h3>
                  </div>

                  {/* Dimensions & Computed Status */}
                  <div className="flex items-center justify-between mb-4 text-[11px] font-mono text-slate-400">
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                      {template.width_mm} × {template.height_mm} mm
                    </span>
                    <div className="flex items-center gap-1.5 font-sans">
                      {(() => {
                        const status = PreFlightEngine.computeTemplateStatus(template);
                        if (status === 'ready') {
                          return <span className="text-emerald-400 font-semibold text-[11px]">● Prêt</span>;
                        }
                        if (status === 'warning') {
                          return <span className="text-amber-400 font-semibold text-[11px]">● À vérifier</span>;
                        }
                        return <span className="text-slate-500 font-semibold text-[11px]">● Brouillon</span>;
                      })()}
                    </div>
                  </div>

                  {/* Mini Preview Box */}
                  <div className="h-32 bg-slate-950 border border-slate-800/80 rounded-xl p-2 flex items-center justify-center overflow-hidden mb-4 relative">
                    <div className="scale-75 origin-center pointer-events-none">
                      <LabelRenderer template={template} scale={0.7} />
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onDuplicateTemplate(template)}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                      title="Dupliquer le gabarit"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleExportTemplate(template)}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                      title="Exporter en JSON"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Supprimer le gabarit "${template.name}" ?`)) {
                          onDeleteTemplate(template.id);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onSelectTemplateToEdit(template)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1 transition"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Éditer</span>
                    </button>
                    <button
                      onClick={() => onSelectTemplateToGenerate(template)}
                      className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-sm transition"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Planche</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PrintJobHistoryModal
        isOpen={showJobHistory}
        onClose={() => setShowJobHistory(false)}
      />
    </div>
  );
};
