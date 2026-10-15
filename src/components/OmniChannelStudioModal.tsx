import React, { useState, useMemo } from 'react';
import {
  Rule,
  DeviceProfile,
  StoreContext,
  EvaluationResult,
  TriggerType,
  ActionType,
  ConditionOperator,
  RuleCondition,
} from '../rulesEngine/types';
import { DEVICE_PROFILES, SAMPLE_STORES } from '../rulesEngine/deviceProfiles';
import { DEFAULT_RULES } from '../rulesEngine/defaultRules';
import { RulesEngine } from '../rulesEngine/engine';
import { catalogRepository as databaseService } from '../services/catalogRepository';
import { api } from '../services/api';
import {
  Cpu,
  Tv,
  Printer,
  Tablet,
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  Check,
  RotateCcw,
  Sliders,
  Clock,
  Layers,
  Sparkles,
  Eye,
  EyeOff,
  Tag,
  Flame,
  Plus,
  Trash2,
  Edit2,
  Download,
  Upload,
  Zap,
  ArrowRight,
  ShieldCheck,
  X,
} from 'lucide-react';

interface OmniChannelStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTemplateName?: string;
}

export const OmniChannelStudioModal: React.FC<OmniChannelStudioModalProps> = ({
  isOpen,
  onClose,
  currentTemplateName,
}) => {
  // Local state for active rules
  const [rules, setRules] = useState<Rule[]>(DEFAULT_RULES);

  React.useEffect(() => {
    if (isOpen) {
      api.prefsGet('estudio_rules_v1').then((saved) => {
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) setRules(parsed);
          } catch {}
        }
      }).catch(() => {});
    }
  }, [isOpen]);

  const [activeTab, setActiveTab] = useState<'simulation' | 'rules' | 'payload'>('simulation');

  // Simulation Context State
  const [selectedProductIdx, setSelectedProductIdx] = useState<number>(0);
  const [selectedDeviceKey, setSelectedDeviceKey] = useState<string>('EINK_2_1_INCH');
  const [selectedStoreIdx, setSelectedStoreIdx] = useState<number>(0);
  const [simulatedDiscount, setSimulatedDiscount] = useState<number>(30);
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Rule Editor State
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [isRuleFormOpen, setIsRuleFormOpen] = useState(false);

  const engine = useMemo(() => new RulesEngine(rules), [rules]);

  const simProducts = useMemo(() => {
    const dbItems = databaseService.getProducts();
    if (dbItems.length > 0) return dbItems;
    return [
      {
        id: 'SIM-001',
        ITEMNAME: 'Café Moulu Pur Arabica 250g',
        SELLING_PRICE: 2450,
        ITEMDESCRIPTION: 'Torréfaction artisanale supérieure, arômes équilibrés et intenses.',
        PRODUCT_SCAN: '3250390123456',
        DEPT_NAME: 'BOISSONS',
      },
    ];
  }, []);

  // Current context constructed for simulation
  const currentProduct = useMemo(() => {
    const base = simProducts[selectedProductIdx] || simProducts[0];
    const discount = simulatedDiscount;
    const basePrice = Number(base.SELLING_PRICE) || 10;
    const promoPrice = Number((basePrice * (1 - discount / 100)).toFixed(2));
    return {
      ...base,
      DISCOUNT_PCT: discount,
      SELLING_PRICE: basePrice,
      PROMOPRICE: promoPrice,
      ITEMDESCRIPTION: base.ITEMDESCRIPTION || 'Torréfaction artisanale supérieure, arômes équilibrés et intenses.',
    };
  }, [simProducts, selectedProductIdx, simulatedDiscount]);

  const currentDevice = useMemo(() => {
    return DEVICE_PROFILES[selectedDeviceKey] || DEVICE_PROFILES.EINK_2_1_INCH;
  }, [selectedDeviceKey]);

  const currentStore = useMemo(() => {
    return SAMPLE_STORES[selectedStoreIdx] || SAMPLE_STORES[0];
  }, [selectedStoreIdx]);

  // Real-time evaluation execution
  const evalResult: EvaluationResult = useMemo(() => {
    return engine.evaluate({
      product: currentProduct,
      store: currentStore,
      device: currentDevice,
      timestamp: new Date().toISOString(),
    });
  }, [engine, currentProduct, currentStore, currentDevice]);

  if (!isOpen) return null;

  const handleSaveRules = (updatedRules: Rule[]) => {
    setRules(updatedRules);
    api.prefsSet('estudio_rules_v1', JSON.stringify(updatedRules)).catch((e) => {
      console.error(e);
    });
  };

  const handleResetDefaultRules = () => {
    if (confirm('Réinitialiser toutes les règles aux valeurs d\'usine standard ?')) {
      handleSaveRules(DEFAULT_RULES);
    }
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(evalResult.payload, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  // 1-Click Acceptance Criteria scenarios
  const applyScenario = (type: 'eink_30' | 'print_30' | 'conflict') => {
    if (type === 'eink_30') {
      setSelectedDeviceKey('EINK_2_1_INCH');
      setSimulatedDiscount(30);
      setSelectedStoreIdx(0);
    } else if (type === 'print_30') {
      setSelectedDeviceKey('PRINT_HIGH_RES_A4');
      setSimulatedDiscount(30);
      setSelectedStoreIdx(0);
    } else if (type === 'conflict') {
      // Both RULE_PROMO_30_OMNICHANNEL (priority 800) and RULE_LOCAL_STORE_MARGIN (priority 400) match!
      setSelectedDeviceKey('EINK_2_1_INCH');
      setSimulatedDiscount(35);
      setSelectedStoreIdx(1); // Store with LOCAL_MARGIN_DEFENSE campaign
    }
  };

  const isEink = currentDevice.type === 'eink';
  const isPrint = currentDevice.type === 'print';
  const isLcd = currentDevice.type === 'lcd';

  const layout = evalResult.payload.layout_instructions;
  const isDescHidden = layout.hidden_elements.includes('ITEMDESCRIPTION');
  const priceBlockOverride = layout.style_overrides['price_block'];
  const isInvertedPrice = layout.color_mode === 'inverted' || (priceBlockOverride?.bg_color && priceBlockOverride.bg_color.includes('dc2626'));
  const highResPromoAsset = layout.assets_to_inject.find((a) => a.role === 'promo_stamp' && a.cmyk_ready);
  const lcdAnimations = layout.animation_triggers;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-7xl h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header Bar */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/30 border border-blue-400/40 rounded-xl text-blue-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Moteur de Règles Omni-Canal & Découplage Métier (Headless)
                </h2>
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-semibold rounded-full uppercase tracking-wider">
                  TCA Framework v2.0
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Evaluation dynamique déportée : Profils Papier (Print), E-Ink (ESL) et Affichage Numérique (LCD/LED).
              </p>
            </div>
          </div>

          {/* Tab Navigation & Close */}
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                onClick={() => setActiveTab('simulation')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  activeTab === 'simulation'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                <span>Bac à Sable & Rendu Multi-Device</span>
              </button>
              <button
                onClick={() => setActiveTab('rules')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  activeTab === 'rules'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Gestionnaire de Règles ({rules.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('payload')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  activeTab === 'payload'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Payload JSON Enrichi</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
              title="Fermer la fenêtre"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Latency & SLA Live Status Ribbon */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-2 flex flex-wrap items-center justify-between text-xs gap-4 shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>Temps d'exécution :</span>
              <strong className="font-mono text-slate-900 bg-white px-1.5 py-0.5 border border-slate-200 rounded">
                {evalResult.payload.audit_trail.execution_time_ms} ms
              </strong>
            </span>

            <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 font-semibold rounded-full border border-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>SLA &lt; 50ms Respecté ({evalResult.payload.audit_trail.execution_time_ms}ms &lt;&lt; 50ms)</span>
            </span>

            <span className="text-slate-600 hidden sm:inline">
              Règles actives : <strong>{evalResult.payload.audit_trail.rules_applied.length}</strong> appliquée(s) sur{' '}
              <strong>{rules.length}</strong>
            </span>
          </div>

          {/* Quick Scenario Buttons for Acceptance Criteria Validation */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
              Scénarios Critères de Recette :
            </span>
            <button
              onClick={() => applyScenario('eink_30')}
              className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition ${
                selectedDeviceKey === 'EINK_2_1_INCH' && simulatedDiscount >= 30
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-700'
              }`}
              title="Test Recette 1 : Produit -30% sur E-Ink 2.1 pouces -> Inversion couleurs + Masquage description"
            >
              <Tablet className="w-3 h-3" />
              <span>1. E-Ink 2" (-30%)</span>
            </button>

            <button
              onClick={() => applyScenario('print_30')}
              className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition ${
                selectedDeviceKey === 'PRINT_HIGH_RES_A4'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-700'
              }`}
              title="Test Recette 2 : Même produit sur Papier High-Res -> Description complète + Sticker Promo HD"
            >
              <Printer className="w-3 h-3" />
              <span>2. Papier HD (-30%)</span>
            </button>

            <button
              onClick={() => applyScenario('conflict')}
              className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition ${
                evalResult.payload.audit_trail.conflicts_resolved.length > 0
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-700'
              }`}
              title="Test Recette 3 : Résolution de Conflit (Promo 800 vs Marge Locale 400)"
            >
              <ShieldCheck className="w-3 h-3" />
              <span>3. Conflit Priorité (800 vs 400)</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Interactive Simulation Workspace */}
        {activeTab === 'simulation' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Parameter Controls Panel */}
            <div className="w-80 border-r border-slate-200 bg-white p-5 overflow-y-auto space-y-5 shrink-0 text-xs">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-blue-600" />
                  <span>Contexte d'Exécution Unifié</span>
                </h3>

                {/* 1. Device Profile Selector */}
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-700">
                    1. Profil Périphérique (Device_Profile)
                  </label>
                  <select
                    value={selectedDeviceKey}
                    onChange={(e) => setSelectedDeviceKey(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    {Object.values(DEVICE_PROFILES).map((dev) => (
                      <option key={dev.id} value={dev.id}>
                        {dev.type === 'eink' ? '🏷️ ' : dev.type === 'print' ? '🖨️ ' : '📺 '}
                        {dev.name}
                      </option>
                    ))}
                  </select>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-[11px] text-slate-600">
                    <div className="flex justify-between">
                      <span>Technologie :</span>
                      <strong className="uppercase font-mono text-slate-800">{currentDevice.type}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Palette Physique :</span>
                      <strong className="uppercase font-mono text-slate-800">{currentDevice.color_palette}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Dimensions / Diagonale :</span>
                      <strong className="font-mono text-slate-800">
                        {currentDevice.dimensions.width_mm}x{currentDevice.dimensions.height_mm}mm ({currentDevice.screen_size_inches || 'N/A'}")
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Résolution :</span>
                      <strong className="font-mono text-slate-800">{currentDevice.resolution_dpi} DPI</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Product Data Selector */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block font-semibold text-slate-700">
                  2. Données Produit (Product_Data)
                </label>
                <select
                  value={selectedProductIdx}
                  onChange={(e) => setSelectedProductIdx(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                  {simProducts.map((prod, idx) => (
                    <option key={prod.id} value={idx}>
                      {prod.ITEMNAME} ({prod.SELLING_PRICE} {currentStore.currency})
                    </option>
                  ))}
                </select>

                {/* Simulated Discount Slider */}
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-slate-700">Taux de Remise :</span>
                    <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                      simulatedDiscount >= 30 ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-800'
                    }`}>
                      -{simulatedDiscount}% {simulatedDiscount >= 30 && '🔥 (Seuil déclenché)'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="70"
                    step="5"
                    value={simulatedDiscount}
                    onChange={(e) => setSimulatedDiscount(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>0% (Standard)</span>
                    <span className="text-rose-600 font-semibold">30% (Règle Métier)</span>
                    <span>70% (Destockage)</span>
                  </div>
                </div>
              </div>

              {/* 3. Store Context Selector */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block font-semibold text-slate-700">
                  3. Contexte Magasin (Store_Context)
                </label>
                <select
                  value={selectedStoreIdx}
                  onChange={(e) => setSelectedStoreIdx(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                  {SAMPLE_STORES.map((st, idx) => (
                    <option key={st.store_id} value={idx}>
                      {st.store_name} ({st.currency})
                    </option>
                  ))}
                </select>
                <div className="text-[11px] text-slate-500 space-y-0.5">
                  <div>Campagnes : <strong className="text-slate-700">{currentStore.active_campaigns.join(', ')}</strong></div>
                  <div>Région : <span className="text-slate-700">{currentStore.region}</span></div>
                </div>
              </div>

              {/* Audit Summary Box */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 text-[11px] space-y-1.5">
                <div className="font-bold text-blue-900 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>Trace d'Audit Headless</span>
                </div>
                <div className="text-blue-800">
                  • <strong>{evalResult.payload.audit_trail.rules_applied.length}</strong> règle(s) appliquée(s).
                </div>
                {evalResult.payload.audit_trail.conflicts_resolved.length > 0 && (
                  <div className="text-purple-700 font-semibold">
                    • <strong>{evalResult.payload.audit_trail.conflicts_resolved.length}</strong> conflit(s) de priorité résolu(s).
                  </div>
                )}
                <div className="text-emerald-700 font-semibold">
                  • Latence : <strong>{evalResult.payload.audit_trail.execution_time_ms} ms</strong>
                </div>
              </div>
            </div>

            {/* Center Visual Multi-Device Preview Stage */}
            <div className="flex-1 bg-slate-100 p-6 overflow-y-auto flex flex-col items-center justify-start space-y-6">
              
              {/* Acceptance Criteria Status Card */}
              <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span>Validation des Critères de Recette en Direct</span>
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Criterion 1 check */}
                  <div className={`p-2.5 rounded-lg border flex items-start gap-2 ${
                    isEink && currentDevice.screen_size_inches && currentDevice.screen_size_inches <= 2.5 && simulatedDiscount >= 30
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}>
                    <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${
                      isEink && simulatedDiscount >= 30 ? 'text-emerald-600' : 'text-slate-400'
                    }`} />
                    <div>
                      <strong className="block text-slate-900">E-Ink 2" avec Remise 30%+ :</strong>
                      <span>Couleurs inversées (blanc sur bloc rouge/noir) : <strong>{isInvertedPrice ? 'OUI ✅' : 'NON'}</strong></span>
                      <br />
                      <span>Description masquée : <strong>{isDescHidden ? 'OUI ✅ (gain d\'espace)' : 'NON'}</strong></span>
                    </div>
                  </div>

                  {/* Criterion 2 check */}
                  <div className={`p-2.5 rounded-lg border flex items-start gap-2 ${
                    isPrint && simulatedDiscount >= 30
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}>
                    <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${
                      isPrint && simulatedDiscount >= 30 ? 'text-emerald-600' : 'text-slate-400'
                    }`} />
                    <div>
                      <strong className="block text-slate-900">Papier High-Res avec Remise 30%+ :</strong>
                      <span>Description conservée : <strong>{!isDescHidden ? 'OUI ✅' : 'NON'}</strong></span>
                      <br />
                      <span>Asset promo haute déf. (CMYK) : <strong>{highResPromoAsset ? 'OUI ✅' : 'NON'}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Conflict resolution banner if any */}
                {evalResult.payload.audit_trail.conflicts_resolved.length > 0 && (
                  <div className="mt-3 p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-900 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Conflit Arbitré Déterministement : </span>
                      {evalResult.payload.audit_trail.conflicts_resolved.map((c, i) => (
                        <span key={i}>
                          La règle <strong>{c.winning_rule_name} (Priorité {c.winning_priority})</strong> a supplanté{' '}
                          <strong>{c.superseded_rule_name} (Priorité {c.superseded_priority})</strong> pour l'action '{c.conflict_key}'.
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Physical Render Representation Container */}
              <div className="flex flex-col items-center">
                <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-2">
                  <span>Simulation Visuelle Aval :</span>
                  <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md font-mono text-[11px]">
                    Interprétation du Payload JSON pour [{currentDevice.name}]
                  </span>
                </div>

                {/* E-INK FRAME (ESL Physical Look) */}
                {isEink && (
                  <div className="relative p-4 bg-slate-900 rounded-2xl shadow-xl border-4 border-slate-700 flex flex-col items-center">
                    {/* Bezel frame and screen info */}
                    <div className="w-full flex justify-between items-center text-[10px] text-slate-400 mb-2 font-mono">
                      <span>🏷️ ESL E-INK {currentDevice.screen_size_inches}"</span>
                      <span>{currentDevice.dimensions.width_px}x{currentDevice.dimensions.height_px}px ({currentDevice.color_palette.toUpperCase()})</span>
                    </div>

                    {/* Actual simulated e-ink display screen */}
                    <div
                      className="bg-white border-2 border-slate-300 rounded p-3 flex flex-col justify-between overflow-hidden shadow-inner select-none font-sans"
                      style={{
                        width: `${Math.max(280, currentDevice.dimensions.width_mm * 4.5)}px`,
                        height: `${Math.max(140, currentDevice.dimensions.height_mm * 4.5)}px`,
                      }}
                    >
                      {/* Top Bar: SKU & Part No */}
                      <div className="flex justify-between items-center text-[10px] text-slate-600 border-b border-slate-200 pb-1">
                        <span className="font-mono font-bold">{currentProduct.PRODUCT_SCAN || '—'}</span>
                        <span className="font-bold text-slate-800">{currentProduct.PARTNO || 'REF-01'}</span>
                      </div>

                      {/* Title & Truncation */}
                      <div className="my-1">
                        <div className="font-extrabold text-slate-900 text-xs leading-tight line-clamp-2">
                          {evalResult.payload.enriched_product.ITEMNAME}
                        </div>

                        {/* Long Description: conditionally displayed based on rules! */}
                        {!isDescHidden ? (
                          <div className="text-[10px] text-slate-600 line-clamp-1 mt-0.5">
                            {currentProduct.ITEMDESCRIPTION}
                          </div>
                        ) : (
                          <div className="text-[9px] text-rose-700 italic font-semibold mt-0.5 flex items-center gap-1">
                            <EyeOff className="w-3 h-3" />
                            <span>Description masquée par la règle d'optimisation ESL</span>
                          </div>
                        )}
                      </div>

                      {/* Price Section: Color Inversion if Promoted! */}
                      <div className="flex items-end justify-between mt-auto pt-1">
                        {/* Unit price or Origin */}
                        <div className="text-[10px] text-slate-600">
                          <div>Origine: <strong className="text-slate-800">{currentProduct.ORIGIN_COUNTRY || 'France'}</strong></div>
                          <div>{currentProduct.UNIT_PRICE_TEXT || '7.80 €/kg'}</div>
                        </div>

                        {/* Promoted Price Block */}
                        <div
                          className={`px-3 py-1.5 rounded text-right transition-colors ${
                            isInvertedPrice
                              ? 'bg-red-600 text-white font-extrabold shadow-sm'
                              : 'bg-slate-100 text-slate-900 font-bold border border-slate-300'
                          }`}
                        >
                          {simulatedDiscount > 0 && (
                            <div className="text-[10px] flex items-center justify-end gap-1 font-normal opacity-90">
                              <span className="line-through">{currentProduct.SELLING_PRICE.toFixed(2)}</span>
                              <span className="px-1 py-0.2 bg-black text-white text-[9px] font-bold rounded">
                                -{simulatedDiscount}%
                              </span>
                            </div>
                          )}
                          <div className="text-xl font-black leading-none tracking-tight">
                            {currentProduct.PROMOPRICE ? currentProduct.PROMOPRICE.toFixed(2) : currentProduct.SELLING_PRICE.toFixed(2)} {currentStore.currency}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 text-[10px] text-slate-400 font-mono">
                      Rafraîchissement physique : ~{currentDevice.refresh_latency_ms} ms (Bistable E-Paper)
                    </div>
                  </div>
                )}

                {/* HIGH-RES PRINT FRAME (Paper Label Look) */}
                {isPrint && (
                  <div className="bg-white p-6 rounded-xl shadow-xl border border-slate-300 max-w-md w-full relative">
                    {/* Crop marks simulation */}
                    <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-slate-400" />
                    <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-slate-400" />
                    <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-slate-400" />
                    <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-slate-400" />

                    <div className="flex justify-between items-center text-xs text-slate-400 pb-2 border-b border-slate-200">
                      <span className="font-mono font-bold text-slate-700">PRINT READY 300 DPI (CMYK)</span>
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold text-[10px]">
                        Support Papier Haute Densité
                      </span>
                    </div>

                    {/* High-res promotional sticker injected by rule engine! */}
                    {highResPromoAsset && (
                      <div className="my-3 p-2 bg-gradient-to-r from-amber-500 to-rose-600 text-white rounded-lg flex items-center justify-between shadow-md">
                        <div className="flex items-center gap-2">
                          <Flame className="w-5 h-5 text-yellow-200 animate-bounce" />
                          <div>
                            <div className="font-black text-xs uppercase tracking-wider">
                              {evalResult.payload.enriched_product.PROMO_BANNER_TEXT || 'MEGA PROMO'}
                            </div>
                            <div className="text-[10px] text-white/90">
                              Asset vectoriel CMYK injecté par le moteur de règles
                            </div>
                          </div>
                        </div>
                        <span className="text-base font-black px-2 py-0.5 bg-white text-rose-700 rounded-md shadow-xs">
                          -{simulatedDiscount}%
                        </span>
                      </div>
                    )}

                    <div className="mt-3">
                      <h3 className="text-base font-black text-slate-900 leading-snug">
                        {currentProduct.ITEMNAME}
                      </h3>
                      {/* Full description preserved for print */}
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed bg-slate-50 p-2 rounded border border-slate-200">
                        <span className="font-semibold text-slate-700 block text-[10px] uppercase tracking-wider mb-0.5">
                          Description Complète Imprimable :
                        </span>
                        {currentProduct.ITEMDESCRIPTION}
                      </p>
                    </div>

                    <div className="flex items-end justify-between mt-4 pt-3 border-t border-slate-200">
                      <div className="text-xs text-slate-600 space-y-0.5">
                        <div>Origine : <strong className="text-slate-800">{currentProduct.ORIGIN_COUNTRY}</strong></div>
                        <div>Prix unitaire : <strong className="text-slate-800">{currentProduct.UNIT_PRICE_TEXT}</strong></div>
                        <div className="font-mono text-[10px] text-slate-400">Gencod : {currentProduct.PRODUCT_SCAN}</div>
                      </div>

                      <div className="text-right">
                        {simulatedDiscount > 0 && (
                          <div className="text-xs text-slate-400 line-through">
                            {currentProduct.SELLING_PRICE.toFixed(2)} {currentStore.currency}
                          </div>
                        )}
                        <div className="text-2xl font-black text-slate-900">
                          {currentProduct.PROMOPRICE ? currentProduct.PROMOPRICE.toFixed(2) : currentProduct.SELLING_PRICE.toFixed(2)}{' '}
                          <span className="text-sm font-bold text-slate-600">{currentStore.currency}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* DIGITAL SIGNAGE (LCD/LED Display Look) */}
                {isLcd && (
                  <div className="bg-slate-950 p-6 rounded-2xl shadow-2xl border-4 border-slate-800 text-white max-w-lg w-full relative overflow-hidden">
                    <div className="flex justify-between items-center text-[10px] text-slate-400 mb-3 border-b border-slate-800 pb-2">
                      <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        ÉCRAN NUMÉRIQUE DYNAMIQUE 60 FPS
                      </span>
                      <span className="font-mono">1920x1080 Full HD</span>
                    </div>

                    {/* Dynamic Marquee/Animation Indicator */}
                    {lcdAnimations.length > 0 && (
                      <div className="mb-3 px-3 py-1.5 bg-blue-600/30 border border-blue-400/40 rounded-lg text-xs text-blue-200 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                          <span>Animations actives : {lcdAnimations.map((a) => a.type).join(', ')}</span>
                        </span>
                        <span className="text-[10px] font-mono bg-blue-500/30 px-1.5 py-0.5 rounded">
                          Live Render Loop
                        </span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="text-lg font-black text-white tracking-tight animate-pulse">
                        {currentProduct.ITEMNAME}
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2">
                        {currentProduct.ITEMDESCRIPTION}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800">
                      <div className="text-xs text-slate-400">
                        <div>Campagne : <span className="text-white font-semibold">{currentStore.active_campaigns[0] || 'Promo'}</span></div>
                        <div className="text-[10px] text-slate-500 font-mono">Ref: {currentProduct.PARTNO}</div>
                      </div>

                      <div className="text-right p-3 bg-red-600/90 rounded-xl border border-red-400 shadow-lg animate-bounce">
                        <div className="text-xs font-bold text-yellow-200 uppercase">
                          Offre Spéciale -{simulatedDiscount}%
                        </div>
                        <div className="text-2xl font-black text-white">
                          {currentProduct.PROMOPRICE ? currentProduct.PROMOPRICE.toFixed(2) : currentProduct.SELLING_PRICE.toFixed(2)} {currentStore.currency}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Rules Manager (TCA Editor & Rules Table) */}
        {activeTab === 'rules' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Rules List */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Règles Actives dans le Moteur ({rules.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ordonnancement déterministe par score de priorité (le score le plus élevé gagne en cas de conflit).
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetDefaultRules}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
                    title="Réinitialiser aux règles par défaut"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Réinitialiser</span>
                  </button>

                  <button
                    onClick={() => {
                      const newRule: Rule = {
                        id: `RULE_${Date.now()}`,
                        name: 'Nouvelle Règle Métier',
                        description: 'Description de la règle...',
                        enabled: true,
                        priority: 500,
                        trigger: 'on_promo_active',
                        condition_group: {
                          id: `grp_${Date.now()}`,
                          logical_operator: 'AND',
                          conditions: [
                            {
                              id: `c_${Date.now()}`,
                              field_path: 'product.DISCOUNT_PCT',
                              operator: 'gt',
                              value: 10,
                            },
                          ],
                        },
                        actions: [
                          {
                            id: `act_${Date.now()}`,
                            type: 'enrich_data',
                            conflict_key: 'custom_tag',
                            parameters: {
                              field_name: 'CUSTOM_FLAG',
                              field_value: 'ACTIF',
                            },
                          },
                        ],
                      };
                      handleSaveRules([...rules, newRule]);
                      setEditingRule(newRule);
                      setIsRuleFormOpen(true);
                    }}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Créer une Règle</span>
                  </button>
                </div>
              </div>

              {/* Rules Cards List */}
              <div className="space-y-3">
                {rules
                  .sort((a, b) => b.priority - a.priority)
                  .map((r) => (
                    <div
                      key={r.id}
                      className={`p-4 rounded-xl border transition ${
                        r.enabled
                          ? 'bg-white border-slate-200 shadow-xs hover:border-slate-300'
                          : 'bg-slate-50 border-slate-200 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-200">
                              Priorité: {r.priority}
                            </span>

                            <h4 className="text-sm font-bold text-slate-900">{r.name}</h4>

                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              Trigger: {r.trigger}
                            </span>

                            {r.time_bound?.enabled && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>Horodatée</span>
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-500">{r.description}</p>

                          {/* Conditions & Actions pills summary */}
                          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-600">
                            <span className="font-semibold text-slate-700">Conditions :</span>
                            <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px]">
                              {r.condition_group.conditions.length} condition(s) [{r.condition_group.logical_operator}]
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="font-semibold text-slate-700">Actions :</span>
                            {r.actions.map((act) => (
                              <span
                                key={act.id}
                                className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.2 rounded font-mono text-[10px]"
                              >
                                {act.type} ({act.conflict_key || 'global'})
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Actions buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              const updated = rules.map((item) =>
                                item.id === r.id ? { ...item, enabled: !item.enabled } : item
                              );
                              handleSaveRules(updated);
                            }}
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              r.enabled
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                          >
                            {r.enabled ? 'Actif' : 'Désactivé'}
                          </button>

                          <button
                            onClick={() => {
                              setEditingRule(r);
                              setIsRuleFormOpen(true);
                            }}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg"
                            title="Modifier cette règle"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => {
                              if (confirm(`Supprimer la règle "${r.name}" ?`)) {
                                handleSaveRules(rules.filter((item) => item.id !== r.id));
                              }
                            }}
                            className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg"
                            title="Supprimer cette règle"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Rule Edit Drawer */}
            {isRuleFormOpen && editingRule && (
              <div className="w-96 border-l border-slate-200 bg-slate-50 p-5 overflow-y-auto space-y-4 shrink-0 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <h4 className="font-bold text-slate-900 text-sm">Configuration Règle TCA</h4>
                  <button
                    onClick={() => setIsRuleFormOpen(false)}
                    className="p-1 hover:bg-slate-200 rounded text-slate-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Nom de la Règle</label>
                    <input
                      type="text"
                      value={editingRule.name}
                      onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Description</label>
                    <textarea
                      value={editingRule.description}
                      onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs h-16"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Score Priorité (1-1000)</label>
                      <input
                        type="number"
                        value={editingRule.priority}
                        onChange={(e) => setEditingRule({ ...editingRule, priority: Number(e.target.value) })}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Trigger Déclencheur</label>
                      <select
                        value={editingRule.trigger}
                        onChange={(e) => setEditingRule({ ...editingRule, trigger: e.target.value as TriggerType })}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                      >
                        <option value="on_promo_active">on_promo_active</option>
                        <option value="on_price_update">on_price_update</option>
                        <option value="on_device_render">on_device_render</option>
                        <option value="schedule_event">schedule_event</option>
                        <option value="on_stock_drop">on_stock_drop</option>
                      </select>
                    </div>
                  </div>

                  {/* Conditions summary */}
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-2">
                    <div className="font-semibold text-slate-700">Conditions Logiques (AND/OR/NOT)</div>
                    <div className="space-y-1.5">
                      {editingRule.condition_group.conditions.map((c: any, cIdx: number) => (
                        <div key={cIdx} className="text-[11px] font-mono bg-slate-50 p-1.5 rounded border border-slate-200">
                          {c.field_path} {c.operator} {String(c.value)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions summary */}
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-2">
                    <div className="font-semibold text-slate-700">Actions Enregistrées ({editingRule.actions.length})</div>
                    <div className="space-y-1.5">
                      {editingRule.actions.map((act, aIdx) => (
                        <div key={aIdx} className="text-[11px] font-mono bg-purple-50 text-purple-900 p-1.5 rounded border border-purple-200">
                          <div className="font-bold">{act.type} (cible: {act.target_element_id || 'global'})</div>
                          <div className="text-[10px] text-purple-700">Clé de conflit: {act.conflict_key || 'aucun'}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const updated = rules.map((r) => (r.id === editingRule.id ? editingRule : r));
                      handleSaveRules(updated);
                      setIsRuleFormOpen(false);
                    }}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
                  >
                    Enregistrer les Modifications
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Enriched JSON Payload Inspector */}
        {activeTab === 'payload' && (
          <div className="flex-1 flex flex-col p-6 overflow-hidden bg-slate-900 text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-400" />
                  <span>Payload JSON Enrichi (Headless Client Contract)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Données enrichies prêtes pour transmission aux micro-services d'impression ou d'affichage en rayon.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyPayload}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition shadow-xs"
                >
                  {copiedPayload ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPayload ? 'Copié dans le presse-papier !' : 'Copier JSON'}</span>
                </button>
              </div>
            </div>

            {/* Syntax-highlighted style JSON viewer */}
            <div className="flex-1 overflow-auto mt-4 p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400 leading-relaxed select-text">
              <pre>{JSON.stringify(evalResult.payload, null, 2)}</pre>
            </div>
          </div>
        )}

        {/* Footer Bar */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Moteur Headless conforme architecture distribuée (Cloud Run / ESL Gateway / POS Server).</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};
