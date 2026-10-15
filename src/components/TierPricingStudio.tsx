import React, { useState, useMemo } from 'react';
import {
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Layers,
  Database,
  RefreshCw,
  Info,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { ProductRecord, PriceTierBreak } from '../types';
import { TierDetectionEngine } from '../utils/tierDetectionEngine';

interface TierPricingStudioProps {
  products: ProductRecord[];
  onUpdateProduct: (updated: ProductRecord) => void;
  onBatchUpdateProducts: (updatedList: ProductRecord[]) => void;
}

export const TierPricingStudio: React.FC<TierPricingStudioProps> = ({
  products,
  onUpdateProduct,
  onBatchUpdateProducts,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '');
  const [showAnomaliesOnly, setShowAnomaliesOnly] = useState(false);
  const [showImplicitModal, setShowImplicitModal] = useState(false);

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || products[0];
  }, [products, selectedProductId]);

  // Ensure tiers are normalized
  const tiers = useMemo(() => {
    if (!selectedProduct) return [];
    if (selectedProduct.price_tiers && selectedProduct.price_tiers.length > 0) {
      return selectedProduct.price_tiers;
    }
    if (selectedProduct.TIERS && selectedProduct.TIERS.length > 0) {
      return selectedProduct.TIERS.map((t) => ({
        min_qty: t.qty,
        unit_price: t.unit_price,
        label: t.qty === 1 ? 'Base Price' : `${t.qty}+ Units`,
        is_base: t.qty === 1,
      }));
    }
    return [
      { min_qty: 1, unit_price: selectedProduct.SELLING_PRICE, label: 'Base Price', is_base: true },
    ];
  }, [selectedProduct]);

  // Check validation issues
  const validation = useMemo(() => {
    if (!selectedProduct) return { has_error: false, issues: [] };
    return TierDetectionEngine.validateTierAnomalies({
      ...selectedProduct,
      price_tiers: tiers,
    });
  }, [selectedProduct, tiers]);

  // Products with anomalies
  const anomalousCount = useMemo(() => {
    return products.filter((p) => {
      const v = TierDetectionEngine.validateTierAnomalies(p);
      return v.has_error;
    }).length;
  }, [products]);

  const displayedProducts = useMemo(() => {
    if (!showAnomaliesOnly) return products;
    return products.filter((p) => TierDetectionEngine.validateTierAnomalies(p).has_error);
  }, [products, showAnomaliesOnly]);

  // Update tier list for selected product
  const handleTierChange = (index: number, field: keyof PriceTierBreak, val: any) => {
    if (!selectedProduct) return;
    const newTiers = [...tiers];
    newTiers[index] = { ...newTiers[index], [field]: val };
    const updated = TierDetectionEngine.applyManualFixes(selectedProduct, newTiers);
    onUpdateProduct(updated);
  };

  const handleAddTier = () => {
    if (!selectedProduct) return;
    const lastQty = tiers.length > 0 ? tiers[tiers.length - 1].min_qty : 1;
    const lastPrice = tiers.length > 0 ? tiers[tiers.length - 1].unit_price : selectedProduct.SELLING_PRICE;
    const nextQty = lastQty * 2 > lastQty ? lastQty * 2 : lastQty + 5;
    const nextPrice = Math.max(1, Math.round(lastPrice * 0.9));

    const newTiers = [
      ...tiers,
      { min_qty: nextQty, unit_price: nextPrice, label: `${nextQty}+ Units` },
    ];
    const updated = TierDetectionEngine.applyManualFixes(selectedProduct, newTiers);
    onUpdateProduct(updated);
  };

  const handleRemoveTier = (index: number) => {
    if (!selectedProduct || tiers.length <= 1) return;
    const newTiers = tiers.filter((_, i) => i !== index);
    const updated = TierDetectionEngine.applyManualFixes(selectedProduct, newTiers);
    onUpdateProduct(updated);
  };

  // Run Implicit multi-row ingestion
  const handleRunImplicitAggregation = () => {
    if (!products || products.length === 0) {
      setShowImplicitModal(false);
      return;
    }
    const aggregated = TierDetectionEngine.aggregateImplicitMultiRows(products);
    onBatchUpdateProducts(aggregated);
    if (aggregated.length > 0) {
      setSelectedProductId(aggregated[0].id);
    }
    setShowImplicitModal(false);
  };

  // Step-Graph Math for SVG Staircase rendering
  const graphWidth = 560;
  const graphHeight = 220;
  const padding = { top: 25, right: 35, bottom: 40, left: 60 };
  const innerW = graphWidth - padding.left - padding.right;
  const innerH = graphHeight - padding.top - padding.bottom;

  const maxQty = Math.max(...tiers.map((t) => t.min_qty), 1) * 1.15;
  const maxPrice = Math.max(...tiers.map((t) => t.unit_price), selectedProduct?.SELLING_PRICE || 1) * 1.15;
  const minPrice = Math.min(...tiers.map((t) => t.unit_price), 0);

  const getX = (qty: number) => padding.left + (qty / maxQty) * innerW;
  const getY = (price: number) => padding.top + innerH - ((price - minPrice) / (maxPrice - minPrice || 1)) * innerH;

  return (
    <div className="flex-1 bg-slate-100 flex flex-col overflow-hidden">
      {/* Top Banner & Control Strip */}
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Gestion des Paliers Tarifaires & Ingestion Dégressive
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                Step-Graph v2.2
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Résolution de structures explicites (mono-ligne) et agrégation implicite multi-lignes ERP avec détection d'anomalies
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowImplicitModal(true)}
            className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Database className="w-4 h-4" />
            <span>Ingestion Implicite ERP (Multi-Lignes)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAnomaliesOnly(!showAnomaliesOnly)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${
              showAnomaliesOnly
                ? 'bg-rose-50 border-rose-300 text-rose-700'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            <span>Anomalies ({anomalousCount})</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Product List */}
        <div className="w-80 bg-white border-r border-slate-200 flex flex-col">
          <div className="p-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Articles ({displayedProducts.length})
            </span>
            <span className="text-[10px] font-medium text-slate-500">
              {showAnomaliesOnly ? 'Filtre actif : Anomalies' : 'Tous les articles'}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {displayedProducts.map((p) => {
              const isSelected = p.id === selectedProductId;
              const hasAnomaly = TierDetectionEngine.validateTierAnomalies(p).has_error;
              const tierCount = p.price_tiers?.length || p.TIERS?.length || 1;

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProductId(p.id)}
                  className={`p-3 cursor-pointer transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-blue-50/80 border-l-4 border-blue-600 pl-2.5'
                      : 'hover:bg-slate-50 border-l-4 border-transparent pl-2.5'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 truncate block">
                        {p.ITEMNAME}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5 font-mono">
                      <span>{p.PARTNO || p.PRODUCT_SCAN || p.id}</span>
                      <span>•</span>
                      <span className="font-bold text-slate-700">{p.SELLING_PRICE} €/F</span>
                      <span>•</span>
                      <span className="text-blue-600 font-semibold">{tierCount} paliers</span>
                    </div>
                  </div>
                  {hasAnomaly ? (
                    <span className="shrink-0 p-1 bg-rose-100 text-rose-700 rounded-md" title="Anomalie détectée">
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel: Step-Graph Visualizer & Overriding Data Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {selectedProduct ? (
            <>
              {/* Product Header & Status Bar */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-lg font-bold text-slate-900">{selectedProduct.ITEMNAME}</h3>
                    {validation.has_error ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-100 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Structure Invalide</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Paliers Valides & Dégressifs</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    SKU: {selectedProduct.PARTNO || selectedProduct.id} • EAN: {selectedProduct.PRODUCT_SCAN || '—'} • Prix Base (1u):{' '}
                    <strong className="text-slate-800 font-bold">{selectedProduct.SELLING_PRICE} €</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddTier}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Ajouter un Palier</span>
                  </button>
                </div>
              </div>

              {/* Anomaly Callout Box if Error Detected */}
              {validation.has_error && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Anomalies de structure détectées (Intervention requise)</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-rose-800 space-y-1 pl-1">
                    {validation.issues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-rose-700 pt-1">
                    Utilisez la grille de saisie ci-dessous pour rectifier les quantités, supprimer les doublons ou réaligner la dégressivité.
                  </p>
                </div>
              )}

              {/* Step-Graph Visualization Card */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-sm text-slate-900">Visualisation Step-Graph (Courbe d'Escalier)</span>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    Axe X: Quantités minimum • Axe Y: Prix Unitaire (€)
                  </span>
                </div>

                {/* SVG Staircase Chart */}
                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-center overflow-hidden">
                  <svg
                    viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                    className="w-full max-w-xl h-auto overflow-visible select-none"
                  >
                    <defs>
                      <linearGradient id="stepAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>

                    {/* Grid Lines Horizontal */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                      const p = minPrice + ratio * (maxPrice - minPrice);
                      const y = getY(p);
                      return (
                        <g key={ratio}>
                          <line
                            x1={padding.left}
                            y1={y}
                            x2={graphWidth - padding.right}
                            y2={y}
                            stroke="#e2e8f0"
                            strokeDasharray="3 3"
                          />
                          <text
                            x={padding.left - 8}
                            y={y + 3}
                            fill="#64748b"
                            fontSize="9"
                            fontFamily="monospace"
                            textAnchor="end"
                          >
                            {p.toFixed(1)}€
                          </text>
                        </g>
                      );
                    })}

                    {/* Step Graph Path */}
                    {tiers.length > 0 && (
                      <>
                        {/* Shaded Area under staircase */}
                        <path
                          d={(() => {
                            let d = `M ${getX(tiers[0].min_qty)} ${getY(minPrice)}`;
                            d += ` L ${getX(tiers[0].min_qty)} ${getY(tiers[0].unit_price)}`;
                            for (let i = 1; i < tiers.length; i++) {
                              const prev = tiers[i - 1];
                              const curr = tiers[i];
                              d += ` L ${getX(curr.min_qty)} ${getY(prev.unit_price)}`;
                              d += ` L ${getX(curr.min_qty)} ${getY(curr.unit_price)}`;
                            }
                            const last = tiers[tiers.length - 1];
                            const endX = Math.min(graphWidth - padding.right, getX(last.min_qty * 1.4));
                            d += ` L ${endX} ${getY(last.unit_price)}`;
                            d += ` L ${endX} ${getY(minPrice)} Z`;
                            return d;
                          })()}
                          fill="url(#stepAreaGrad)"
                        />

                        {/* Staircase Line */}
                        <path
                          d={(() => {
                            let d = `M ${getX(tiers[0].min_qty)} ${getY(tiers[0].unit_price)}`;
                            for (let i = 1; i < tiers.length; i++) {
                              const prev = tiers[i - 1];
                              const curr = tiers[i];
                              d += ` L ${getX(curr.min_qty)} ${getY(prev.unit_price)}`;
                              d += ` L ${getX(curr.min_qty)} ${getY(curr.unit_price)}`;
                            }
                            const last = tiers[tiers.length - 1];
                            const endX = Math.min(graphWidth - padding.right, getX(last.min_qty * 1.4));
                            d += ` L ${endX} ${getY(last.unit_price)}`;
                            return d;
                          })()}
                          fill="none"
                          stroke="#2563eb"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />

                        {/* Step Points & Badges */}
                        {tiers.map((t, idx) => {
                          const cx = getX(t.min_qty);
                          const cy = getY(t.unit_price);
                          const isAnomalous =
                            idx > 0 && t.unit_price > tiers[idx - 1].unit_price;

                          return (
                            <g key={idx}>
                              {/* Vertical Drop Line */}
                              <line
                                x1={cx}
                                y1={cy}
                                x2={cx}
                                y2={padding.top + innerH}
                                stroke={isAnomalous ? '#f43f5e' : '#93c5fd'}
                                strokeDasharray="2 2"
                                strokeWidth="1"
                              />

                              {/* Point Circle */}
                              <circle
                                cx={cx}
                                cy={cy}
                                r={isAnomalous ? 6 : 5}
                                fill={isAnomalous ? '#e11d48' : '#ffffff'}
                                stroke={isAnomalous ? '#9f1239' : '#2563eb'}
                                strokeWidth="2.5"
                              />

                              {/* Label badge */}
                              <rect
                                x={cx - 24}
                                y={cy - 22}
                                width="48"
                                height="16"
                                rx="4"
                                fill={isAnomalous ? '#ffe4e6' : '#1e293b'}
                                stroke={isAnomalous ? '#f43f5e' : 'none'}
                              />
                              <text
                                x={cx}
                                y={cy - 11}
                                textAnchor="middle"
                                fill={isAnomalous ? '#9f1239' : '#ffffff'}
                                fontSize="9"
                                fontWeight="bold"
                                fontFamily="monospace"
                              >
                                {t.unit_price}€
                              </text>

                              {/* X-axis Quantity Label */}
                              <text
                                x={cx}
                                y={padding.top + innerH + 16}
                                textAnchor="middle"
                                fill="#475569"
                                fontSize="10"
                                fontWeight="bold"
                                fontFamily="monospace"
                              >
                                {t.min_qty}u
                              </text>
                            </g>
                          );
                        })}
                      </>
                    )}
                  </svg>
                </div>
              </div>

              {/* Overriding Data Grid */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-sm text-slate-900">
                      Grille de Saisie & Remplacement Dégressif (Overriding Data Grid)
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    Modifiez directement les seuils ci-dessous avec recalcul instantané
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-3 w-16">Rang</th>
                        <th className="p-3">Quantité Min. (Seuil)</th>
                        <th className="p-3">Prix Unitaire (€ / F)</th>
                        <th className="p-3">Libellé Affiché (Gabarit)</th>
                        <th className="p-3">Statut Palier</th>
                        <th className="p-3 w-12 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tiers.map((tier, idx) => {
                        const isBase = idx === 0;
                        const isAnomalous =
                          idx > 0 && tier.unit_price > tiers[idx - 1].unit_price;

                        return (
                          <tr
                            key={idx}
                            className={`transition ${
                              isAnomalous ? 'bg-rose-50/70' : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="p-3 font-mono font-bold text-slate-500">
                              #{idx + 1}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="1"
                                  value={tier.min_qty}
                                  onChange={(e) =>
                                    handleTierChange(idx, 'min_qty', parseInt(e.target.value) || 1)
                                  }
                                  className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                />
                                <span className="text-slate-400 text-[11px]">unités</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  step="0.05"
                                  min="0"
                                  value={tier.unit_price}
                                  onChange={(e) =>
                                    handleTierChange(idx, 'unit_price', parseFloat(e.target.value) || 0)
                                  }
                                  className={`w-28 px-2.5 py-1.5 bg-white border rounded-lg text-xs font-mono font-bold focus:ring-1 ${
                                    isAnomalous
                                      ? 'border-rose-400 text-rose-700 bg-rose-50 focus:ring-rose-500'
                                      : 'border-slate-300 text-slate-900 focus:border-blue-500 focus:ring-blue-500'
                                  }`}
                                />
                                <span className="text-slate-400 text-[11px]">€/u</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                value={tier.label || ''}
                                placeholder={isBase ? 'Base Price' : `${tier.min_qty}+ Units`}
                                onChange={(e) => handleTierChange(idx, 'label', e.target.value)}
                                className="w-full max-w-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-3">
                              {isBase ? (
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px] border border-slate-200">
                                  Prix Détail Base (1u)
                                </span>
                              ) : isAnomalous ? (
                                <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] border border-rose-300 flex items-center gap-1 w-fit">
                                  <AlertTriangle className="w-3 h-3" />
                                  Hausse Incohérente
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold text-[10px] border border-blue-200">
                                  Dégressif (-{Math.round((1 - tier.unit_price / tiers[0].unit_price) * 100)}%)
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {!isBase && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTier(idx)}
                                  className="p-1 hover:bg-rose-100 text-rose-500 rounded transition"
                                  title="Supprimer ce palier"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="h-96 flex flex-col items-center justify-center text-slate-400">
              <Info className="w-10 h-10 mb-2 stroke-1" />
              <p className="text-sm font-medium">Sélectionnez un article dans la liste de gauche</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Ingestion Implicite Multi-Lignes */}
      {showImplicitModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Ingestion & Détection de Paliers Implicites (Multi-Row)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Agrège plusieurs lignes de base de données portant le même SKU avec quantités différentes
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <p>
                Le moteur d'agrégation regroupe les lignes par identifiant unique (SKU / EAN), trie les entrées par quantité croissante, qualifie l'entrée de plus faible quantité comme <strong>Prix de Vente Normal</strong>, et pivote les données vers une matrice de paliers normalisée avec détection d'anomalies.
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono text-[11px] space-y-1">
                <div className="font-bold text-slate-700">État du Catalogue Courant :</div>
                <div className="text-slate-600">• Nombre d'articles chargés : {products.length}</div>
                <div className="text-slate-600">• Articles avec anomalies : {anomalousCount}</div>
                <div className="text-slate-500">• Clés de regroupement utilisées : PRODUCT_SCAN, PARTNO, EAN, SKU</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowImplicitModal(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleRunImplicitAggregation}
                className="px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Exécuter l'Agrégation & Importer</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
