import React, { useState } from 'react';
import { LabelTemplate, Margins } from '../types';
import { X, Sparkles, AlertCircle } from 'lucide-react';

interface NewGabaritWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (template: LabelTemplate) => void;
}

const PRESETS = [
  // ESL E-Ink Screens
  { name: "ESL 2.13\" E-Paper (48 × 23 mm)", w: 48, h: 23, inner: 1, outer: 0.5, category: "ESL E-Ink", dpi: 203, colorMode: "E-Ink B/W/Red" },
  { name: "ESL 2.9\" E-Paper (67 × 29 mm)", w: 67, h: 29, inner: 1.5, outer: 0.5, category: "ESL E-Ink", dpi: 203, colorMode: "E-Ink B/W/Red" },
  { name: "ESL 4.2\" E-Paper (85 × 64 mm)", w: 85, h: 64, inner: 2, outer: 1, category: "ESL E-Ink", dpi: 300, colorMode: "E-Ink 4-Color" },
  { name: "ESL 7.5\" E-Paper (163 × 98 mm)", w: 163, h: 98, inner: 3, outer: 1, category: "ESL E-Ink", dpi: 300, colorMode: "E-Ink 4-Color" },
  // Industrial Paper Tags
  { name: "Étiquette Prix Rayon (50 × 30 mm)", w: 50, h: 30, inner: 1.5, outer: 1, category: "Papier", dpi: 203, colorMode: "RGB" },
  { name: "Étiquette Standard (70 × 40 mm)", w: 70, h: 40, inner: 2, outer: 1, category: "Papier", dpi: 203, colorMode: "RGB" },
  { name: "Rayon Supermarché (100 × 50 mm)", w: 100, h: 50, inner: 2, outer: 1, category: "Papier", dpi: 300, colorMode: "RGB" },
  { name: "Étiquette Logistique (100 × 150 mm)", w: 100, h: 150, inner: 3, outer: 2, category: "Papier", dpi: 300, colorMode: "CMYK" },
  // Display Sheets
  { name: "A6 Signalétique (148 × 105 mm)", w: 148, h: 105, inner: 4, outer: 2, category: "PLV", dpi: 300, colorMode: "RGB" },
  { name: "A5 Affiche Tête de Gondole (210 × 148 mm)", w: 210, h: 148, inner: 5, outer: 3, category: "PLV", dpi: 300, colorMode: "CMYK" },
  { name: "A4 Grand Format (297 × 210 mm)", w: 297, h: 210, inner: 6, outer: 3, category: "PLV", dpi: 300, colorMode: "CMYK" },
];

export const NewGabaritWizard: React.FC<NewGabaritWizardProps> = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState("Nouveau Gabarit");
  const [width_mm, setWidth_mm] = useState(100.0);
  const [height_mm, setHeight_mm] = useState(50.0);
  const [innerMargins, setInnerMargins] = useState<Margins>({ top: 2.0, bottom: 2.0, left: 2.0, right: 2.0 });
  const [outerMargins, setOuterMargins] = useState<Margins>({ top: 1.0, bottom: 1.0, left: 1.0, right: 1.0 });
  const [bgColor, setBgColor] = useState("#FFFFFF");
  const [bgOpacity, setBgOpacity] = useState(1.0);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgImageOpacity, setBgImageOpacity] = useState(0.35);
  const [bgImageFit, setBgImageFit] = useState<'contain' | 'cover' | 'stretch'>('contain');
  const [targetDpi, setTargetDpi] = useState<number>(203);
  const [hardwareColorMode, setHardwareColorMode] = useState<string>('RGB');

  const [errors, setErrors] = useState<string[]>([]);

  if (!isOpen) return null;

  const handlePreset = (preset: typeof PRESETS[0]) => {
    setWidth_mm(preset.w);
    setHeight_mm(preset.h);
    setInnerMargins({ top: preset.inner, bottom: preset.inner, left: preset.inner, right: preset.inner });
    setOuterMargins({ top: preset.outer, bottom: preset.outer, left: preset.outer, right: preset.outer });
    setName(preset.name.split(' (')[0]);
    if (preset.dpi) setTargetDpi(preset.dpi);
    if (preset.colorMode) setHardwareColorMode(preset.colorMode);
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        setBgImage(loadEvt.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors: string[] = [];

    if (!name.trim()) {
      validationErrors.push("Le nom du gabarit ne peut pas être vide.");
    }
    if (width_mm <= 0 || height_mm <= 0) {
      validationErrors.push("Les dimensions doivent être strictement positives.");
    }
    if (
      innerMargins.top < 0 ||
      innerMargins.bottom < 0 ||
      innerMargins.left < 0 ||
      innerMargins.right < 0 ||
      outerMargins.top < 0 ||
      outerMargins.bottom < 0 ||
      outerMargins.left < 0 ||
      outerMargins.right < 0
    ) {
      validationErrors.push("Les marges ne peuvent pas être négatives.");
    }
    const printableW = width_mm - innerMargins.left - innerMargins.right;
    const printableH = height_mm - innerMargins.top - innerMargins.bottom;
    if (printableW <= 0 || printableH <= 0) {
      validationErrors.push("Les marges intérieures doivent laisser une zone imprimable.");
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    const now = new Date().toISOString();
    const newTemplate: LabelTemplate = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      revision: 1,
      created_at: now,
      updated_at: now,
      schema_version: 1,
      name: name.trim(),
      width_mm: width_mm,
      height_mm: height_mm,
      inner_margins_mm: innerMargins,
      outer_margins_mm: outerMargins,
      bg_color: bgColor,
      bg_opacity: bgOpacity,
      background_image_path: bgImage,
      background_image_opacity: bgImageOpacity,
      background_image_fit: bgImageFit,
      background_image_visible: !!bgImage,
      background_image_locked: true,
      background_image_in_output: false,
      items: [],
    };

    onCreate(newTemplate);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Nouveau Gabarit d'Étiquette</h2>
              <p className="text-xs text-slate-500">Configurez les dimensions physiques, zones de découpe et marges</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
          {errors.length > 0 && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>Erreurs de validation :</span>
              </div>
              <ul className="list-disc list-inside pl-1 text-[11px]">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Presets */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Formats Prédéfinis</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handlePreset(p)}
                  className="px-3 py-2 text-left border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 rounded-lg transition flex flex-col"
                >
                  <span className="font-semibold text-slate-800 truncate">{p.name}</span>
                  <span className="text-[11px] text-slate-500">{p.w} × {p.h} mm</span>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nom du Gabarit</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Étiquette Rayon Promo 100x50mm"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          {/* Dimensions */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Largeur (mm)</label>
              <input
                type="number"
                step="0.5"
                min="10"
                max="500"
                required
                value={width_mm}
                onChange={(e) => setWidth_mm(parseFloat(e.target.value) || 10)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Hauteur (mm)</label>
              <input
                type="number"
                step="0.5"
                min="10"
                max="500"
                required
                value={height_mm}
                onChange={(e) => setHeight_mm(parseFloat(e.target.value) || 10)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Hardware Parameters: Resolution & Color Mode */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Résolution Cible (DPI)</label>
              <select
                value={targetDpi}
                onChange={(e) => setTargetDpi(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-mono"
              >
                <option value={152}>152 DPI (Écran ESL basse rés.)</option>
                <option value={203}>203 DPI (Thermique Standard / ESL)</option>
                <option value={300}>300 DPI (Impression Haute Définition)</option>
                <option value={600}>600 DPI (Offset / Micro-Impression)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Palette / Mode Matériel</label>
              <select
                value={hardwareColorMode}
                onChange={(e) => setHardwareColorMode(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
              >
                <option value="RGB">Couleurs RGB (Écran / Web)</option>
                <option value="CMYK">CMYK Quadri (Impression Masse)</option>
                <option value="E-Ink B/W">E-Ink B&W (Noir & Blanc 2-Couleurs)</option>
                <option value="E-Ink B/W/Red">E-Ink BWR (Noir/Blanc/Rouge 3-Couleurs)</option>
                <option value="E-Ink 4-Color">E-Ink Spectra 4-Couleurs (B/W/R/Y)</option>
              </select>
            </div>
          </div>

          {/* Inner printable margins */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">Marges Intérieures (Zone Imprimable)</span>
              <span className="text-[11px] text-slate-500 font-mono">
                Imprimable: {(width_mm - innerMargins.left - innerMargins.right).toFixed(1)} × {(height_mm - innerMargins.top - innerMargins.bottom).toFixed(1)} mm
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[11px] text-slate-500">Haut (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={innerMargins.top}
                  onChange={(e) => setInnerMargins({ ...innerMargins, top: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">Bas (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={innerMargins.bottom}
                  onChange={(e) => setInnerMargins({ ...innerMargins, bottom: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">Gauche (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={innerMargins.left}
                  onChange={(e) => setInnerMargins({ ...innerMargins, left: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">Droite (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={innerMargins.right}
                  onChange={(e) => setInnerMargins({ ...innerMargins, right: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Outer margins / Bleed */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <span className="font-semibold text-slate-800">Marges Extérieures (Fond Perdu / Bleed)</span>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[11px] text-slate-500">Haut (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={outerMargins.top}
                  onChange={(e) => setOuterMargins({ ...outerMargins, top: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">Bas (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={outerMargins.bottom}
                  onChange={(e) => setOuterMargins({ ...outerMargins, bottom: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">Gauche (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={outerMargins.left}
                  onChange={(e) => setOuterMargins({ ...outerMargins, left: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">Droite (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={outerMargins.right}
                  onChange={(e) => setOuterMargins({ ...outerMargins, right: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Reference Image for Calibration */}
          <div className="space-y-2">
            <label className="block font-semibold text-slate-700">Image de Référence Arrière-plan (Non imprimée)</label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageFile}
                className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {bgImage && (
                <button
                  type="button"
                  onClick={() => setBgImage(null)}
                  className="text-xs text-rose-600 hover:underline"
                >
                  Supprimer l'image
                </button>
              )}
            </div>
            {bgImage && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] text-slate-500">Opacité ({Math.round(bgImageOpacity * 100)}%)</label>
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={bgImageOpacity}
                    onChange={(e) => setBgImageOpacity(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">Ajustement</label>
                  <select
                    value={bgImageFit}
                    onChange={(e) => setBgImageFit(e.target.value as any)}
                    className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                  >
                    <option value="contain">Conserver proportions (contain)</option>
                    <option value="cover">Remplir (cover)</option>
                    <option value="stretch">Étirer (stretch)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition"
            >
              Créer le Gabarit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
