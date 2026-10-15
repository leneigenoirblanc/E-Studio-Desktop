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
    return null;
  },

  /**
   * Save binary content (PDF, etc.) to local disk via native OS dialog
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
    return null;
  },

  /**
   * Open and read a text/JSON file via native OS dialog
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
    return null;
  },

  /**
   * Open and read binary file (e.g. XLSX / XLS) via native OS dialog
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
    return null;
  },
};
