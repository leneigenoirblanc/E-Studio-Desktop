import React from 'react';
import { AppView, LabelTemplate } from '../types';
import {
  LayoutDashboard,
  Layers,
  Printer,
  ChevronRight,
  Settings2,
  BookOpen,
  Type,
  History,
  FileSpreadsheet,
  Keyboard,
} from 'lucide-react';

interface AppTopNavigationBarProps {
  currentView: AppView;
  activeTemplate: LabelTemplate | null;
  templates: LabelTemplate[];
  totalProductsCount: number;
  onNavigate: (view: AppView) => void;
  onOpenRulesModal: () => void;
  onOpenFontManager: () => void;
  onOpenAuditLogs: () => void;
  onOpenMappingDictionary: () => void;
  onOpenPreferences: () => void;
  onOpenShortcuts: () => void;
}

export const AppTopNavigationBar: React.FC<AppTopNavigationBarProps> = ({
  currentView,
  activeTemplate,
  templates,
  totalProductsCount,
  onNavigate,
  onOpenRulesModal,
  onOpenFontManager,
  onOpenAuditLogs,
  onOpenMappingDictionary,
  onOpenPreferences,
  onOpenShortcuts,
}) => {
  const [toolsDropdownOpen, setToolsDropdownOpen] = React.useState(false);

  // Global hotkeys Alt+1 .. Alt+4
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === '1') {
          e.preventDefault();
          onNavigate('home');
        } else if (e.key === '2') {
          e.preventDefault();
          onNavigate('editor');
        } else if (e.key === '3') {
          e.preventDefault();
          onNavigate('generation');
        } else if (e.key === '4') {
          e.preventDefault();
          onNavigate('catalog');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNavigate]);

  return (
    <nav className="bg-slate-950 text-white border-b border-slate-800 shrink-0 select-none z-40 relative shadow-md">
      <div className="h-12 px-3 sm:px-4 flex items-center justify-between gap-3">
        {/* Left Side: Brand Logo & Breadcrumb Navigation */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2 text-left group hover:opacity-90 transition shrink-0 focus:outline-none"
            title="Retour au Tableau de bord (Alt+1)"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-inner">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <div className="hidden md:flex flex-col">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-extrabold text-sm tracking-tight text-white">E-STUDIO</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase tracking-widest">
                  DESKTOP
                </span>
              </div>
            </div>
          </button>

          {/* Breadcrumb Separator */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 min-w-0">
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            {currentView === 'home' && (
              <span className="font-semibold text-slate-200">Tableau de Bord</span>
            )}

            {currentView === 'editor' && (
              <>
                <button
                  onClick={() => onNavigate('home')}
                  className="hover:text-blue-400 transition truncate"
                >
                  Gabarits
                </button>
                <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                <span className="font-semibold text-blue-400 truncate max-w-[140px] sm:max-w-[200px]">
                  {activeTemplate ? activeTemplate.name : 'Concepteur Visuel'}
                </span>
              </>
            )}

            {currentView === 'generation' && (
              <>
                <button
                  onClick={() => onNavigate('home')}
                  className="hover:text-blue-400 transition truncate"
                >
                  Production
                </button>
                <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                <span className="font-semibold text-blue-400 truncate max-w-[140px] sm:max-w-[200px]">
                  {activeTemplate ? activeTemplate.name : 'Planches & Impression'}
                </span>
              </>
            )}

            {currentView === 'catalog' && (
              <span className="font-semibold text-emerald-400">Catalogue Produits & Import</span>
            )}
          </div>
        </div>

        {/* Center: Module View Switcher */}
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 shadow-inner">
          <button
            onClick={() => onNavigate('home')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              currentView === 'home'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Accueil & Gabarits (Alt+1)"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Tableau de bord</span>
          </button>

          <button
            onClick={() => onNavigate('editor')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              currentView === 'editor'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Concepteur Visuel de Gabarit (Alt+2)"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Éditeur Gabarit</span>
          </button>

          <button
            onClick={() => onNavigate('generation')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              currentView === 'generation'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Impression & Planches (Alt+3)"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Production & Planche</span>
          </button>

          <button
            onClick={() => onNavigate('catalog')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              currentView === 'catalog'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Catalogue & Import Excel/CSV (Alt+4)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Catalogue</span>
            {totalProductsCount > 0 && (
              <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-full">
                {totalProductsCount}
              </span>
            )}
          </button>
        </div>

        {/* Right Side: Tools Dropdown Menu */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenShortcuts}
            className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition"
            title="Raccourcis Clavier"
          >
            <Keyboard className="w-4 h-4" />
          </button>

          <div className="relative">
            <button
              onClick={() => setToolsDropdownOpen((prev) => !prev)}
              className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 transition focus:outline-none"
              title="Outils & Paramètres système"
            >
              <Settings2 className="w-4 h-4" />
            </button>

            {toolsDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setToolsDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 p-2 text-xs divide-y divide-slate-800 animate-in fade-in-50 duration-100">
                  <div className="pb-1.5">
                    <span className="px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Données & Affichage
                    </span>
                    <button
                      onClick={() => {
                        setToolsDropdownOpen(false);
                        onOpenMappingDictionary();
                      }}
                      className="w-full text-left px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg flex items-center gap-2 transition"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                      <span>Dictionnaire de mapping & alias</span>
                    </button>
                    <button
                      onClick={() => {
                        setToolsDropdownOpen(false);
                        onOpenRulesModal();
                      }}
                      className="w-full text-left px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg flex items-center gap-2 transition"
                    >
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      <span>Moteur de règles omnicanal</span>
                    </button>
                    <button
                      onClick={() => {
                        setToolsDropdownOpen(false);
                        onOpenFontManager();
                      }}
                      className="w-full text-left px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg flex items-center gap-2 transition"
                    >
                      <Type className="w-3.5 h-3.5 text-amber-400" />
                      <span>Polices typographiques</span>
                    </button>
                  </div>

                  <div className="pt-1.5">
                    <span className="px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Sécurité & Audit
                    </span>
                    <button
                      onClick={() => {
                        setToolsDropdownOpen(false);
                        onOpenAuditLogs();
                      }}
                      className="w-full text-left px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg flex items-center gap-2 transition"
                    >
                      <History className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Journal d'audit local</span>
                    </button>
                    <button
                      onClick={() => {
                        setToolsDropdownOpen(false);
                        onOpenPreferences();
                      }}
                      className="w-full text-left px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg flex items-center gap-2 transition"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Préférences & Accessibilité</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
