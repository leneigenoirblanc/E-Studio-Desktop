import { isTauriEnvironment } from './api';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeFile, readFile, readTextFile } from '@tauri-apps/plugin-fs';

export interface FileFilter {
  name: string;
  extensions: string[];
}

export const desktopFileService = {
  /**
   * Save text or JSON content to local disk via native OS dialog
   */
  async saveText(
    defaultFilename: string,
    content: string,
    filters: FileFilter[] = [{ name: 'Fichier Texte', extensions: ['txt'] }]
  ): Promise<string | null> {
    if (isTauriEnvironment()) {
      try {
        const filePath = await save({
          defaultPath: defaultFilename,
          filters,
        });
        if (!filePath) return null;
        const encoder = new TextEncoder();
        await writeFile(filePath, encoder.encode(content));
        return filePath;
      } catch (err) {
        console.error('Failed to save file via Tauri dialog/fs:', err);
        return null;
      }
    }
    if (typeof window !== 'undefined') {
      try {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return defaultFilename;
      } catch (err) {
        console.error('Failed to trigger web download:', err);
      }
    }
    return null;
  },

  /**
   * Save binary content (PDF, etc.) to local disk via native OS dialog or browser download
   */
  async saveBinary(
    defaultFilename: string,
    data: Uint8Array,
    filters: FileFilter[] = [{ name: 'Document PDF', extensions: ['pdf'] }]
  ): Promise<string | null> {
    if (isTauriEnvironment()) {
      try {
        const filePath = await save({
          defaultPath: defaultFilename,
          filters,
        });
        if (!filePath) return null;
        await writeFile(filePath, data);
        return filePath;
      } catch (err) {
        console.error('Failed to save binary file via Tauri dialog/fs:', err);
        return null;
      }
    }

    if (typeof window !== 'undefined') {
      try {
        const blob = new Blob([data as unknown as BlobPart]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return defaultFilename;
      } catch (err) {
        console.error('Failed to trigger web binary download:', err);
      }
    }
    return null;
  },

  /**
   * Open and read a text/JSON file via native OS dialog or browser file picker
   */
  async openText(
    filters: FileFilter[] = [{ name: 'Fichier JSON', extensions: ['json'] }]
  ): Promise<{ path: string; name: string; content: string } | null> {
    if (isTauriEnvironment()) {
      try {
        const selected = await open({
          multiple: false,
          directory: false,
          filters,
        });
        if (!selected || typeof selected !== 'string') return null;
        const content = await readTextFile(selected);
        const name = selected.split(/[\\/]/).pop() || 'file';
        return { path: selected, name, content };
      } catch (err) {
        console.error('Failed to open text file via Tauri dialog/fs:', err);
        return null;
      }
    }

    if (typeof document !== 'undefined') {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        const accept = filters.flatMap((f) => f.extensions.map((ext) => `.${ext}`)).join(',');
        if (accept) input.accept = accept;
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }
          const content = await file.text();
          resolve({ path: file.name, name: file.name, content });
        };
        input.click();
      });
    }

    return null;
  },

  /**
   * Open and read binary file (e.g. XLSX / XLS) via native OS dialog or browser file picker
   */
  async openBinary(
    filters: FileFilter[] = [{ name: 'Feuille de calcul', extensions: ['xlsx', 'xls', 'csv'] }]
  ): Promise<{ path: string; name: string; data: Uint8Array } | null> {
    if (isTauriEnvironment()) {
      try {
        const selected = await open({
          multiple: false,
          directory: false,
          filters,
        });
        if (!selected || typeof selected !== 'string') return null;
        const data = await readFile(selected);
        const name = selected.split(/[\\/]/).pop() || 'file';
        return { path: selected, name, data };
      } catch (err) {
        console.error('Failed to open binary file via Tauri dialog/fs:', err);
        return null;
      }
    }

    if (typeof document !== 'undefined') {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        const accept = filters.flatMap((f) => f.extensions.map((ext) => `.${ext}`)).join(',');
        if (accept) input.accept = accept;
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }
          const buf = await file.arrayBuffer();
          resolve({ path: file.name, name: file.name, data: new Uint8Array(buf) });
        };
        input.click();
      });
    }

    return null;
  },
};
