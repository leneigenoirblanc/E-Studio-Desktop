import React, { useState, useEffect, useCallback } from 'react';
import { TooltipProvider } from '../context/TooltipContext';
import { MappingDictionaryProvider } from '../context/MappingDictionaryContext';
import { AppProviders } from './providers/AppProviders';
import { AppTopNavigationBar } from '../components/AppTopNavigationBar';
import { HomeDashboard } from '../components/HomeDashboard';
import { TemplateEditor } from '../components/TemplateEditor';
import { GenerationWorkspace } from '../components/GenerationWorkspace';
import { CatalogManagementStudio } from '../components/CatalogManagementStudio';
import { OmniChannelStudioModal } from '../components/OmniChannelStudioModal';
import { NewGabaritWizard } from '../components/NewGabaritWizard';
import { AuditTrailModal } from '../components/AuditTrailModal';
import { FontManagerModal } from '../components/FontManagerModal';
import { KeyboardShortcutsModal } from '../components/KeyboardShortcutsModal';
import { MappingDictionaryModal } from '../components/MappingDictionaryModal';
import { AccessibilityPreferencesModal } from '../components/AccessibilityPreferencesModal';
import { LabelTemplate, ProductRecord } from '../types';
import { catalogRepository } from '../services/catalogRepository';
import { navigationService, AppView } from '../services/navigationService';
import { AuditLogService } from '../services/auditLogService';
import { sanitizeNonPriceElement } from '../utils/pricingEngine';
import { api } from '../services/api';

function MainWorkspace() {
  const [currentView, setCurrentView] = useState<AppView>('home');
  // Starts with genuine empty array on clean install, loads from SQLite
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<LabelTemplate | null>(null);
  const [generationProducts, setGenerationProducts] = useState<ProductRecord[] | undefined>(undefined);
  const [generationBatchName, setGenerationBatchName] = useState<string | undefined>(undefined);

  // Catalog products count
  const [productsCount, setProductsCount] = useState<number>(() => catalogRepository.getProducts().length);

  // Modals state
  const [isNewWizardOpen, setIsNewWizardOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isAuditLogsOpen, setIsAuditLogsOpen] = useState(false);
  const [isFontManagerOpen, setIsFontManagerOpen] = useState(false);
  const [isMappingDictOpen, setIsMappingDictOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  // Load templates from SQLite on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const summaries = await api.templateList();
        const fullDocs = await Promise.all(
          summaries.map(async (s) => {
            try {
              return await api.templateGet(s.id);
            } catch {
              return null;
            }
          })
        );
        const validDocs = fullDocs.filter((d): d is LabelTemplate => d !== null);
        if (!isMounted) return;
        setTemplates(validDocs);
        if (validDocs.length > 0) {
          setActiveTemplate((prev) => prev || validDocs[0]);
        }
      } catch (err) {
        console.warn('Failed to load templates from SQLite', err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Subscribe to Navigation Service
  useEffect(() => {
    const unsub = navigationService.subscribe((route) => {
      setCurrentView(route.view);
      const targetId = route.params.templateId || route.params.template;
      if (targetId) {
        const found = templates.find((t) => t.id === targetId || t.name === targetId);
        if (found) setActiveTemplate(found);
      }
    });
    return () => unsub();
  }, [templates]);

  // Subscribe to Catalog Repository changes
  useEffect(() => {
    const unsub = catalogRepository.subscribe((products) => {
      setProductsCount(products.length);
    });
    return () => unsub();
  }, []);

  // Navigation handlers
  const handleNavigate = (view: AppView, params: Record<string, string> = {}) => {
    navigationService.navigateTo(view, params);
  };

  const handleSelectTemplateToEdit = (template: LabelTemplate) => {
    setActiveTemplate(template);
    navigationService.navigateTo('editor', { template: template.id });
  };

  const handleSelectTemplateToGenerate = (
    template: LabelTemplate,
    customProducts?: ProductRecord[],
    batchName?: string
  ) => {
    setActiveTemplate(template);
    setGenerationProducts(customProducts);
    setGenerationBatchName(batchName);
    navigationService.navigateTo('generation', { template: template.id });
  };

  const handleSaveTemplate = async (updated: LabelTemplate) => {
    const now = new Date().toISOString();
    const sanitized: LabelTemplate = {
      ...updated,
      id: updated.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`),
      revision: (updated.revision || 0) + 1,
      created_at: updated.created_at || now,
      updated_at: now,
      items: (updated.items || []).map((it) => sanitizeNonPriceElement(it)),
    };
    try {
      const savedDoc = await api.templateSave(sanitized);
      setTemplates((prev) => {
        const existingIndex = prev.findIndex((t) => t.id === savedDoc.id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = savedDoc;
          return next;
        }
        return [savedDoc, ...prev];
      });
      setActiveTemplate(savedDoc);
      AuditLogService.append({
        action: 'MODIFICATION_GABARIT',
        template_name: savedDoc.name,
        details: `Gabarit sauvegardé : ${savedDoc.name} (Rev ${savedDoc.revision}, ${savedDoc.items.length} éléments)`,
      });
    } catch (err) {
      console.error('Failed to save template to SQLite', err);
    }
  };

  const handleDuplicateTemplate = async (template: LabelTemplate) => {
    const copyId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const copyName = `${template.name} - Copie`;
    const now = new Date().toISOString();
    const duplicated: LabelTemplate = {
      ...JSON.parse(JSON.stringify(template)),
      id: copyId,
      name: copyName,
      revision: 1,
      created_at: now,
      updated_at: now,
      items: JSON.parse(JSON.stringify(template.items || [])).map((it: any) => sanitizeNonPriceElement(it)),
    };
    try {
      const savedDoc = await api.templateSave(duplicated);
      setTemplates((prev) => [savedDoc, ...prev]);
      setActiveTemplate(savedDoc);
      AuditLogService.append({
        action: 'DUPLICATION_GABARIT',
        template_name: copyName,
        details: `Gabarit dupliqué depuis : ${template.name} (${template.id})`,
      });
    } catch (err) {
      console.error('Failed to duplicate template in SQLite', err);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    const toDelete = templates.find((t) => t.id === templateId || t.name === templateId);
    const realId = toDelete?.id || templateId;
    try {
      await api.templateDelete(realId);
      setTemplates((prev) => {
        const next = prev.filter((t) => t.id !== realId && t.name !== realId);
        if (activeTemplate?.id === realId || activeTemplate?.name === realId) {
          setActiveTemplate(next[0] || null);
        }
        return next;
      });
      AuditLogService.append({
        action: 'SUPPRESSION_GABARIT',
        template_name: toDelete?.name || templateId,
        details: `Gabarit supprimé : ${toDelete?.name || templateId}`,
      });
    } catch (err) {
      console.error('Failed to delete template from SQLite', err);
    }
  };

  const handleImportTemplate = async (imported: LabelTemplate) => {
    const now = new Date().toISOString();
    const sanitized: LabelTemplate = {
      ...imported,
      id: imported.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`),
      revision: imported.revision || 1,
      created_at: imported.created_at || now,
      updated_at: now,
      items: (imported.items || []).map((it) => sanitizeNonPriceElement(it)),
    };
    try {
      const savedDoc = await api.templateSave(sanitized);
      setTemplates((prev) => [savedDoc, ...prev.filter((t) => t.id !== savedDoc.id)]);
      setActiveTemplate(savedDoc);
      AuditLogService.append({
        action: 'IMPORT_GABARIT',
        template_name: savedDoc.name,
        details: `Gabarit importé : ${savedDoc.name} (${savedDoc.id})`,
      });
    } catch (err) {
      console.error('Failed to import template into SQLite', err);
    }
  };

  const handleCreateNewTemplate = async (newTemplate: LabelTemplate) => {
    const now = new Date().toISOString();
    const sanitized: LabelTemplate = {
      ...newTemplate,
      id: newTemplate.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`),
      revision: 1,
      created_at: newTemplate.created_at || now,
      updated_at: now,
      items: (newTemplate.items || []).map((it) => sanitizeNonPriceElement(it)),
    };
    try {
      const savedDoc = await api.templateSave(sanitized);
      setTemplates((prev) => [savedDoc, ...prev]);
      setActiveTemplate(savedDoc);
      setIsNewWizardOpen(false);
      navigationService.navigateTo('editor', { template: savedDoc.id });
      AuditLogService.append({
        action: 'CREATION_GABARIT',
        template_name: savedDoc.name,
        details: `Nouveau gabarit créé : ${savedDoc.name} (${savedDoc.width_mm}x${savedDoc.height_mm}mm)`,
      });
    } catch (err) {
      console.error('Failed to create template in SQLite', err);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Top Navigation Bar */}
      <AppTopNavigationBar
        currentView={currentView}
        activeTemplate={activeTemplate}
        templates={templates}
        totalProductsCount={productsCount}
        onNavigate={handleNavigate}
        onOpenRulesModal={() => setIsRulesModalOpen(true)}
        onOpenFontManager={() => setIsFontManagerOpen(true)}
        onOpenAuditLogs={() => setIsAuditLogsOpen(true)}
        onOpenMappingDictionary={() => setIsMappingDictOpen(true)}
        onOpenPreferences={() => setIsPreferencesOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative">
        {currentView === 'home' && (
          <HomeDashboard
            templates={templates}
            onSelectTemplateToEdit={handleSelectTemplateToEdit}
            onSelectTemplateToGenerate={(t) => handleSelectTemplateToGenerate(t)}
            onOpenNewWizard={() => setIsNewWizardOpen(true)}
            onDuplicateTemplate={handleDuplicateTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onImportTemplate={handleImportTemplate}
            onOpenRulesModal={() => setIsRulesModalOpen(true)}
            onOpenAuditLogs={() => setIsAuditLogsOpen(true)}
            onOpenFontManager={() => setIsFontManagerOpen(true)}
            onOpenMappingDictionary={() => setIsMappingDictOpen(true)}
            onOpenCatalog={() => handleNavigate('catalog')}
          />
        )}

        {currentView === 'editor' && (
          <TemplateEditor
            initialTemplate={activeTemplate || {
              id: 'tpl_default_new',
              revision: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              schema_version: 1,
              name: 'Nouveau Gabarit',
              width_mm: 100,
              height_mm: 50,
              inner_margins_mm: { top: 2, bottom: 2, left: 2, right: 2 },
              outer_margins_mm: { top: 1, bottom: 1, left: 1, right: 1 },
              bg_color: '#FFFFFF',
              bg_opacity: 1,
              items: [],
            }}
            onSaveTemplate={handleSaveTemplate}
            onBackToHome={() => handleNavigate('home')}
            onOpenGeneration={(t) => handleSelectTemplateToGenerate(t)}
            onOpenRulesModal={() => setIsRulesModalOpen(true)}
          />
        )}

        {currentView === 'generation' && (
          <GenerationWorkspace
            template={activeTemplate || {
              id: 'tpl_default_std',
              revision: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              schema_version: 1,
              name: 'Gabarit Standard',
              width_mm: 100,
              height_mm: 50,
              inner_margins_mm: { top: 2, bottom: 2, left: 2, right: 2 },
              outer_margins_mm: { top: 1, bottom: 1, left: 1, right: 1 },
              bg_color: '#FFFFFF',
              bg_opacity: 1,
              items: [],
            }}
            onBack={() => handleNavigate('home')}
            initialProducts={generationProducts}
            initialBatchName={generationBatchName}
          />
        )}

        {currentView === 'catalog' && (
          <CatalogManagementStudio
            onBack={() => handleNavigate('home')}
            templates={templates}
            onGenerateFromDatabase={(selectedItems) => {
              if (templates.length === 0) {
                handleNavigate('home');
                return;
              }
              const defaultTemplate = activeTemplate || templates[0];
              handleSelectTemplateToGenerate(defaultTemplate, selectedItems, 'Sélection Catalogue');
            }}
          />
        )}
      </main>

      {/* Global Modals */}
      <NewGabaritWizard
        isOpen={isNewWizardOpen}
        onClose={() => setIsNewWizardOpen(false)}
        onCreate={handleCreateNewTemplate}
      />

      <OmniChannelStudioModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
        currentTemplateName={activeTemplate?.name}
      />

      <AuditTrailModal
        isOpen={isAuditLogsOpen}
        onClose={() => setIsAuditLogsOpen(false)}
      />

      <FontManagerModal
        isOpen={isFontManagerOpen}
        onClose={() => setIsFontManagerOpen(false)}
      />

      <MappingDictionaryModal
        isOpen={isMappingDictOpen}
        onClose={() => setIsMappingDictOpen(false)}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      <AccessibilityPreferencesModal
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AppProviders>
      <TooltipProvider>
        <MappingDictionaryProvider>
          <MainWorkspace />
        </MappingDictionaryProvider>
      </TooltipProvider>
    </AppProviders>
  );
}
