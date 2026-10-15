import React, { useState, useMemo } from 'react';
import {
  Boxes,
  Sparkles,
  Tag,
  Plus,
  Trash2,
  CheckCircle2,
  Info,
  Layers,
  ArrowRight,
  Edit3,
  Sliders
} from 'lucide-react';
import { ProductRecord } from '../types';
import {
  SemanticClusteringEngine,
  ClusterCandidate,
} from '../utils/semanticClusteringEngine';

interface ProductClusteringStudioProps {
  products: ProductRecord[];
  onAddVirtualAssortment: (virtualItem: ProductRecord) => void;
  onRemoveProduct: (productId: string) => void;
  onUpdateProduct: (product: ProductRecord) => void;
}

export const ProductClusteringStudio: React.FC<ProductClusteringStudioProps> = ({
  products,
  onAddVirtualAssortment,
  onRemoveProduct,
  onUpdateProduct,
}) => {
  const [language, setLanguage] = useState<'fr' | 'en'>('fr');
  const [selectedIdsForManual, setSelectedIdsForManual] = useState<string[]>([]);
  const [manualAssortmentId, setManualAssortmentId] = useState('ASSORT-01');
  const [manualOverarchingTitle, setManualOverarchingTitle] = useState('Gamme Soins & Lotions Corporelles 400ml');
  const [manualSharedTag, setManualSharedTag] = useState('GAMME_LOTION');

  // Automated Semantic Clusters detection
  const detectedClusters = useMemo(() => {
    return SemanticClusteringEngine.detectAssortmentClusters(products);
  }, [products]);

  // Existing Virtual Assortments in product list
  const existingAssortments = useMemo(() => {
    return products.filter((p) => p.is_virtual_assortment);
  }, [products]);

  // Toggle selection for manual grouping
  const handleToggleSelectManual = (id: string) => {
    setSelectedIdsForManual((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Convert an automated cluster candidate into a virtual assortment item
  const handleInstantiateCluster = (candidate: ClusterCandidate) => {
    const virtualItem = SemanticClusteringEngine.createVirtualAssortmentItem(
      candidate,
      language
    );
    onAddVirtualAssortment(virtualItem);
  };

  // Create manual assortment
  const handleCreateManual = () => {
    if (selectedIdsForManual.length < 2) {
      return;
    }
    const items = products.filter((p) => selectedIdsForManual.includes(p.id));
    const virtualItem = SemanticClusteringEngine.createManualAssortment(
      items,
      manualAssortmentId,
      manualOverarchingTitle,
      manualSharedTag
    );
    onAddVirtualAssortment(virtualItem);
    setSelectedIdsForManual([]);
  };

  return (
    <div className="flex-1 bg-slate-100 flex flex-col overflow-hidden">
      {/* Header Banner */}
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 shadow-xs">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Regroupement & Assortiments (« Tous Parfums / Tailles »)
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                Semantic Cluster Pipeline
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Extraction de racine textuelle, validation financière et substitution dynamique d'étiquettes collectives
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Langue de substitution :</span>
          <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button
              type="button"
              onClick={() => setLanguage('fr')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                language === 'fr' ? 'bg-white shadow-xs text-purple-700 font-bold' : 'text-slate-600'
              }`}
            >
              Français
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                language === 'en' ? 'bg-white shadow-xs text-purple-700 font-bold' : 'text-slate-600'
              }`}
            >
              English
            </button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Section 1: Automated Semantic Detection Pipeline */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Clusters Sémantiques Détectés Automatiquement ({detectedClusters.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Filtrés par racine textuelle commune et double validation financière (prix unitaire identique)
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200">
              Double Validation Gate Active
            </span>
          </div>

          {detectedClusters.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {detectedClusters.map((cluster, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3 hover:border-purple-300 transition"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800">
                        {cluster.clusterType === 'flavor'
                          ? 'Variantes Parfums'
                          : cluster.clusterType === 'size'
                          ? 'Échelle de Tailles'
                          : 'Assortiment Mixte'}
                      </span>
                      <span className="font-mono font-bold text-xs text-slate-900">
                        Prix Commun: {cluster.sharedPrice} €
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-slate-800">
                      {cluster.rootName}
                    </h4>

                    {/* Discriminators */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {cluster.discriminators.map((disc, dIdx) => (
                        <span
                          key={dIdx}
                          className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-600"
                        >
                          {disc}
                        </span>
                      ))}
                    </div>

                    {/* Substitution Preview */}
                    <div className="p-2.5 bg-purple-50/60 border border-purple-200 rounded-lg text-xs space-y-1">
                      <span className="text-[10px] font-bold text-purple-900 block">
                        Aperçu du libellé généré (Substitution dynamique) :
                      </span>
                      <p className="font-semibold text-purple-950 italic">
                        « {cluster.rootName} —{' '}
                        {language === 'fr'
                          ? cluster.clusterType === 'flavor'
                            ? 'Tous Parfums Disponibles'
                            : 'Toutes Tailles Incluses'
                          : cluster.clusterType === 'flavor'
                          ? 'All Flavors Available'
                          : 'All Sizes Included'} »
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleInstantiateCluster(cluster)}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Créer l'Article Virtuel Assortiment</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-1">
              <CheckCircle2 className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs font-bold text-slate-700">Aucun cluster automatique détecté</p>
              <p className="text-[11px] text-slate-500">
                Vos articles ont déjà été groupés ou ont des prix différents. Vous pouvez utiliser le module de regroupement manuel ci-dessous.
              </p>
            </div>
          )}
        </div>

        {/* Section 2: Manual Grouping and Tagging Workspace */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Espace de Regroupement & Marquage Manuel (Fallback Workspace)
              </h3>
              <p className="text-xs text-slate-500">
                Sélectionnez des articles disparates (ex: crèmes Nivea et NBody) et assignez-leur un titre générique global
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1 & 2: Product Selector */}
            <div className="lg:col-span-2 border border-slate-200 rounded-xl overflow-hidden flex flex-col h-80">
              <div className="bg-slate-50 p-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Catalogue Articles ({products.length})</span>
                <span className="text-indigo-600">
                  {selectedIdsForManual.length} articles sélectionnés
                </span>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
                {products
                  .filter((p) => !p.is_virtual_assortment)
                  .map((p) => {
                    const isSelected = selectedIdsForManual.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleToggleSelectManual(p.id)}
                        className={`p-2.5 rounded-lg border cursor-pointer flex items-center justify-between transition text-xs ${
                          isSelected
                            ? 'bg-indigo-50/80 border-indigo-300 text-indigo-900 font-semibold'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded text-indigo-600 pointer-events-none"
                          />
                          <div>
                            <span className="font-bold block">{p.ITEMNAME}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              SKU: {p.PARTNO || p.id} • {p.SELLING_PRICE} €
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {p.CATEGORY_NAME || 'Épicerie'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Column 3: Manual Cluster Overrides Form */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3 text-xs">
              <div className="space-y-3">
                <span className="font-bold text-slate-900 block text-xs uppercase tracking-wider">
                  Paramètres de l'Assortiment
                </span>

                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    ID d'Assortiment (Tag)
                  </label>
                  <input
                    type="text"
                    value={manualAssortmentId}
                    onChange={(e) => setManualAssortmentId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    Titre Global Remplaçant (Custom Overriding Name)
                  </label>
                  <textarea
                    rows={3}
                    value={manualOverarchingTitle}
                    onChange={(e) => setManualOverarchingTitle(e.target.value)}
                    placeholder="Ex: Gamme Laits & Lotions Nivea 400ml"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                  />
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Ce texte remplacera les noms individuels sur l'étiquette finale.
                  </span>
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    Tag Partagé / Badge Promo
                  </label>
                  <input
                    type="text"
                    value={manualSharedTag}
                    onChange={(e) => setManualSharedTag(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateManual}
                disabled={selectedIdsForManual.length < 2}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 shadow-xs transition"
              >
                <Plus className="w-4 h-4" />
                <span>Créer l'Assortiment Manuel ({selectedIdsForManual.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Section 3: Active Virtual Assortments List */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-slate-700" />
              <h3 className="text-sm font-bold text-slate-900">
                Articles Virtuels Actifs dans le Studio ({existingAssortments.length})
              </h3>
            </div>
          </div>

          {existingAssortments.length > 0 ? (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {existingAssortments.map((assort) => (
                <div
                  key={assort.id}
                  className="p-3.5 bg-white hover:bg-slate-50 flex items-center justify-between transition text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[10px]">
                        Virtuel ({assort.cluster_count || 2} réf.)
                      </span>
                      <span className="font-bold text-slate-900 text-sm">{assort.ITEMNAME}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Réf: {assort.PARTNO} • Prix: {assort.SELLING_PRICE} € • {assort.ITEMDESCRIPTION}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onRemoveProduct(assort.id)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                      title="Dissoudre l'assortiment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              Aucun article virtuel créé pour l'instant. Utilisez les modules ci-dessus pour en instancier un.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
