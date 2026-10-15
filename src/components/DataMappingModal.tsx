import React, { useState, useMemo } from 'react';
import { useMappingDictionary } from '../context/MappingDictionaryContext';
import { ProductRecord } from '../types';
import {
  Check,
  ArrowRight,
  Table,
  AlertCircle,
  FileSpreadsheet,
  RefreshCw,
  Zap,
  BookmarkPlus,
  BookOpen,
  CheckCircle2,
} from 'lucide-react';
import { MappingDictionaryModal } from './MappingDictionaryModal';

export interface DataMappingModalProps {
  rawHeaders: string[];
  rawRows: any[];
  onApplyMapping: (mappedProducts: ProductRecord[]) => void;
  onCancel: () => void;
}

export const DataMappingModal: React.FC<DataMappingModalProps> = ({
  rawHeaders,
  rawRows,
  onApplyMapping,
  onCancel,
}) => {
  const { dictionary, detectField, addAlias } = useMappingDictionary();
  const [isDictionaryModalOpen, setIsDictionaryModalOpen] = useState(false);
  const [savedAliasesFeedback, setSavedAliasesFeedback] = useState<Record<string, string>>({});

  // Compute sample values for each column (up to 5 non-empty values for heuristic detection)
  const sampleValuesByHeader = useMemo(() => {
    const res: Record<string, any[]> = {};
    rawHeaders.forEach((h) => {
      res[h] = rawRows.slice(0, 5).map((r) => r[h]).filter((v) => v !== undefined && v !== null && v !== '');
    });
    return res;
  }, [rawHeaders, rawRows]);

  // Initial detection results per header
  const initialDetection = useMemo(() => {
    const det: Record<string, any> = {};
    rawHeaders.forEach((h) => {
      const match = detectField(h, sampleValuesByHeader[h]);
      det[h] = match;
    });
    return det;
  }, [rawHeaders, sampleValuesByHeader, detectField]);

  // Mapping: rawHeader -> canonical DomainField key (or '__ignore__' or '__custom__')
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    rawHeaders.forEach((h) => {
      const match = detectField(h, sampleValuesByHeader[h]);
      init[h] = match ? match.canonical_key : '__custom__';
    });
    return init;
  });

  const [previewRowCount] = useState(3);

  const handleFieldChange = (header: string, targetKey: string) => {
    setMapping((prev) => ({ ...prev, [header]: targetKey }));
  };

  const autoMap = () => {
    const auto: Record<string, string> = {};
    rawHeaders.forEach((h) => {
      const match = detectField(h, sampleValuesByHeader[h]);
      auto[h] = match ? match.canonical_key : '__custom__';
    });
    setMapping(auto);
  };

  const handleSaveAsAlias = (header: string, targetKey: string) => {
    if (!targetKey || targetKey === '__ignore__' || targetKey === '__custom__') return;
    const res = addAlias(targetKey, header);
    if (res.success) {
      setSavedAliasesFeedback((prev) => ({ ...prev, [header]: `Alias mémorisé pour [${targetKey}]` }));
      setTimeout(() => {
        setSavedAliasesFeedback((prev) => {
          const copy = { ...prev };
          delete copy[header];
          return copy;
        });
      }, 3500);
    } else {
      console.warn(res.message || "Impossible d'enregistrer l'alias.");
    }
  };

  const handleConfirm = () => {
    const fieldMap = new Map(dictionary.map((f) => [f.key, f]));

    const converted: ProductRecord[] = rawRows.map((rawRow, idx) => {
      const prod: ProductRecord = {
        id: `ROW-${idx + 1}`,
        ITEMNAME: `Article #${idx + 1}`,
        SELLING_PRICE: 0,
      };

      rawHeaders.forEach((header) => {
        const target = mapping[header];
        if (!target || target === '__ignore__') return;

        const val = rawRow[header];
        if (val === undefined || val === null) return;

        if (target === '__custom__') {
          const cleanKey = header.trim().toUpperCase().replace(/[\s\.\-]+/g, '_');
          prod[cleanKey] = val;
        } else {
          const fieldDef = fieldMap.get(target);
          if (fieldDef?.numeric || fieldDef?.value_type === 'currency' || fieldDef?.value_type === 'number') {
            const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]+/g, '')) || 0;
            (prod as any)[target] = num;
          } else {
            (prod as any)[target] = String(val).trim();
          }
        }
      });

      // Sensible defaults
      if (!prod.ITEMNAME || prod.ITEMNAME === `Article #${idx + 1}`) {
        prod.ITEMNAME = prod.PARTNO ? `Article ${prod.PARTNO}` : `Article #${idx + 1}`;
      }
      if (!prod.STORE_NAME) prod.STORE_NAME = 'POINT DE VENTE';

      return prod;
    });

    onApplyMapping(converted);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-2xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Assistant de Correspondance & Détection Automatique (Mapping)
              </h2>
              <p className="text-xs text-slate-500">
                Détection par mots-clés, alias persistants et alignement avec le dictionnaire de gabarits.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDictionaryModalOpen(true)}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition shadow-2xs"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-600" />
              <span>Dictionnaire d'Alias</span>
            </button>

            <button
              onClick={autoMap}
              className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
              <span>Auto-détection</span>
            </button>
          </div>
        </div>

        {/* Content: Mapping List & Live Sample Preview */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-blue-600 mt-0.5" />
            <div>
              <strong>Détection Intelligente Active :</strong> Les colonnes sont associées automatiquement grâce aux
              alias standards et personnalisés. Vous pouvez enregistrer tout nouvel en-tête comme alias permanent en 1 clic.
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Colonne Fichier Excel</th>
                  <th className="py-2.5 px-3">Exemple de donnée</th>
                  <th className="py-2.5 px-3">Détection & Score</th>
                  <th className="py-2.5 px-3 w-6 text-center"></th>
                  <th className="py-2.5 px-3">Champ Cible Gabarit</th>
                  <th className="py-2.5 px-3 text-right">Action Alias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rawHeaders.map((header) => {
                  const sampleVal = rawRows[0] ? String(rawRows[0][header] ?? '') : '';
                  const targetVal = mapping[header] || '__custom__';
                  const match = initialDetection[header];
                  const feedback = savedAliasesFeedback[header];

                  return (
                    <tr key={header} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px] border border-slate-200">
                          {header}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px] max-w-[150px] truncate">
                        {sampleVal ? `"${sampleVal}"` : <span className="italic text-slate-400">&lt;vide&gt;</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        {match ? (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full w-max ${
                                match.confidence >= 95
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : match.confidence >= 80
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              <Zap className="w-2.5 h-2.5" />
                              {match.confidence}% • {match.match_type === 'user_alias' ? 'Alias Perso' : match.match_type === 'exact' ? 'Exact' : 'Mot-clé'}
                            </span>
                            <span className="text-[10px] text-slate-400 truncate max-w-[180px]">
                              {match.explanation}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Clé personnalisée</span>
                        )}
                      </td>
                      <td className="py-2.5 px-1 text-center text-slate-300">
                        <ArrowRight className="w-3.5 h-3.5 inline" />
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={targetVal}
                          onChange={(e) => handleFieldChange(header, e.target.value)}
                          className={`w-full py-1 px-2 border rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 ${
                            targetVal === '__ignore__'
                              ? 'bg-slate-100 border-slate-200 text-slate-400'
                              : targetVal === '__custom__'
                              ? 'bg-amber-50/50 border-amber-300 text-amber-900 font-semibold'
                              : 'bg-blue-50/50 border-blue-300 text-blue-900 font-semibold'
                          }`}
                        >
                          <optgroup label="Champs du Schéma d'Étiquetage">
                            {dictionary.map((df) => (
                              <option key={df.key} value={df.key}>
                                {df.label} [{df.key}]
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Options d'importation">
                            <option value="__custom__">
                              ★ Conserver comme Clé Personnalisée ({header.trim().toUpperCase().replace(/[\s\.\-]+/g, '_')})
                            </option>
                            <option value="__ignore__">✕ Ignorer cette colonne</option>
                          </optgroup>
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {feedback ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            {feedback}
                          </span>
                        ) : (
                          targetVal !== '__ignore__' &&
                          targetVal !== '__custom__' && (
                            <button
                              onClick={() => handleSaveAsAlias(header, targetVal)}
                              title={`Enregistrer "${header}" comme alias permanent pour ${targetVal}`}
                              className="px-2 py-1 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 hover:border-blue-200 text-slate-600 text-[11px] font-medium rounded-md flex items-center gap-1 ml-auto transition"
                            >
                              <BookmarkPlus className="w-3 h-3 text-blue-600" />
                              <span>Mémoriser alias</span>
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Quick preview of first rows */}
          <div>
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
              <Table className="w-3.5 h-3.5 text-slate-500" />
              Aperçu des premières données ({rawRows.length} lignes totales détectées) :
            </span>
            <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-36">
              <table className="min-w-full text-[11px] text-left">
                <thead className="bg-slate-50 text-slate-500 font-mono text-[10px] border-b border-slate-200">
                  <tr>
                    {rawHeaders.slice(0, 8).map((h) => (
                      <th key={h} className="p-1.5 border-r border-slate-200">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[10px]">
                  {rawRows.slice(0, previewRowCount).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      {rawHeaders.slice(0, 8).map((h) => (
                        <td key={h} className="p-1.5 text-slate-600 border-r border-slate-200 truncate max-w-[120px]">
                          {String(row[h] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {rawRows.length} articles prêts à être injectés dans la planche d'impression.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-1.5 border border-slate-300 hover:bg-white text-slate-700 text-xs font-semibold rounded-lg transition"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Appliquer et Importer</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mapping Dictionary Modal */}
      <MappingDictionaryModal
        isOpen={isDictionaryModalOpen}
        onClose={() => setIsDictionaryModalOpen(false)}
      />
    </div>
  );
};

