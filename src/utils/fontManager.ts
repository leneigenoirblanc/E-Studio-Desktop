import { CustomFont } from '../types';

export const DEFAULT_FONTS: CustomFont[] = [
  { id: 'font-inter', name: 'Inter', family: 'Inter, sans-serif', source: 'google', category: 'sans-serif' },
  { id: 'font-roboto', name: 'Roboto', family: 'Roboto, sans-serif', source: 'google', category: 'sans-serif' },
  { id: 'font-montserrat', name: 'Montserrat', family: 'Montserrat, sans-serif', source: 'google', category: 'sans-serif' },
  { id: 'font-poppins', name: 'Poppins', family: 'Poppins, sans-serif', source: 'google', category: 'sans-serif' },
  { id: 'font-oswald', name: 'Oswald (Condensé)', family: 'Oswald, sans-serif', source: 'google', category: 'display' },
  { id: 'font-anton', name: 'Anton (Impact)', family: 'Anton, sans-serif', source: 'google', category: 'display' },
  { id: 'font-bebas', name: 'Bebas Neue', family: '"Bebas Neue", sans-serif', source: 'google', category: 'display' },
  { id: 'font-playfair', name: 'Playfair Display', family: '"Playfair Display", serif', source: 'google', category: 'serif' },
  { id: 'font-merriweather', name: 'Merriweather', family: 'Merriweather, serif', source: 'google', category: 'serif' },
  { id: 'font-roboto-mono', name: 'Roboto Mono', family: '"Roboto Mono", monospace', source: 'google', category: 'monospace' },
  { id: 'font-arial', name: 'Arial', family: 'Arial, sans-serif', source: 'system', category: 'sans-serif' },
  { id: 'font-helvetica', name: 'Helvetica', family: 'Helvetica, Arial, sans-serif', source: 'system', category: 'sans-serif' },
  { id: 'font-impact', name: 'Impact', family: 'Impact, fantasy', source: 'system', category: 'display' },
  { id: 'font-courier', name: 'Courier New', family: '"Courier New", monospace', source: 'system', category: 'monospace' },
];

import { api } from '../services/api';

let customFontsCache: CustomFont[] = [];

// Load custom fonts from SQLite kv on init
api.prefsGet('estudio_custom_fonts_v1').then((saved) => {
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        customFontsCache = parsed;
      }
    } catch {}
  }
}).catch(() => {});

export function getLoadedFonts(): CustomFont[] {
  return [...DEFAULT_FONTS, ...customFontsCache];
}

export function saveCustomFont(font: CustomFont): void {
  try {
    customFontsCache = [...customFontsCache.filter(f => f.id !== font.id), font];
    api.prefsSet('estudio_custom_fonts_v1', JSON.stringify(customFontsCache)).catch((e) => {
      console.error('Failed to save custom font to SQLite kv', e);
    });

    // If web font URL provided, inject <link> or @font-face
    if (font.url) {
      const linkId = `custom-font-${font.id}`;
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = font.url;
        document.head.appendChild(link);
      }
    }
  } catch (e) {
    console.error('Failed to save custom font', e);
  }
}

export function removeCustomFont(fontId: string): void {
  try {
    customFontsCache = customFontsCache.filter(f => f.id !== fontId);
    api.prefsSet('estudio_custom_fonts_v1', JSON.stringify(customFontsCache)).catch((e) => {
      console.error('Failed to remove custom font from SQLite kv', e);
    });
  } catch (e) {
    console.error('Failed to remove custom font', e);
  }
}

export function registerFontFromFile(file: File): Promise<CustomFont> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const fontName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        const fontFace = new FontFace(fontName, buffer);
        const loadedFace = await fontFace.load();
        document.fonts.add(loadedFace);

        const blob = new Blob([buffer]);
        const dataUrlReader = new FileReader();
        dataUrlReader.onload = () => {
          const dataUrl = dataUrlReader.result as string;
          const newFont: CustomFont = {
            id: `custom_font_${Date.now()}`,
            name: fontName,
            family: `"${fontName}", sans-serif`,
            source: 'custom_upload',
            url: dataUrl,
            category: 'sans-serif',
          };
          saveCustomFont(newFont);
          resolve(newFont);
        };
        dataUrlReader.readAsDataURL(blob);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}
