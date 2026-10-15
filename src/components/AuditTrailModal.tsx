import React, { useState } from 'react';
import { AuditLogEntry } from '../types';
import { AuditLogService } from '../services/auditLogService';
import { desktopFileService } from '../services/desktopFileService';
import { History, Filter, Download, Trash2, Clock, User } from 'lucide-react';

interface AuditTrailModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuditTrailModal: React.FC<AuditTrailModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>(() => AuditLogService.getAll());
  const [filterAction, setFilterAction] = useState<string>('all');

  React.useEffect(() => {
    if (isOpen) {
      AuditLogService.fetchAll().then((records) => setLogs(records)).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredLogs = filterAction === 'all'
    ? logs
    : logs.filter((l) => l.action.toLowerCase().includes(filterAction.toLowerCase()));

  const handleClearLogs = () => {
    AuditLogService.clear();
    setLogs([]);
  };

  const handleExportLogs = async () => {
    const dataStr = JSON.stringify(logs, null, 2);
    const filename = `journal_audit_etiquettes_${Date.now()}.json`;
    await desktopFileService.saveText(filename, dataStr, [
      { name: 'Journal d\'Audit', extensions: ['json'] },
    ]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-sm">Journal d'Audit & Traçabilité Réglementaire</h2>
              <p className="text-[11px] text-slate-500">Historique horodaté des modifications, impressions et exports</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-2.5 bg-slate-50/50 border-b border-slate-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="px-2 py-1 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 outline-none"
            >
              <option value="all">Toutes les actions</option>
              <option value="create">Créations de gabarits</option>
              <option value="update">Modifications</option>
              <option value="print">Impressions & Spooling</option>
              <option value="export">Exports de données</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportLogs}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold rounded-lg flex items-center gap-1 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exporter Journal</span>
            </button>
            <button
              onClick={handleClearLogs}
              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg flex items-center gap-1 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Purger</span>
            </button>
          </div>
        </div>

        {/* Log Entries */}
        <div className="p-5 overflow-y-auto space-y-2.5 flex-1 text-xs">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-400 italic">
              Aucun événement enregistré dans le journal pour le moment.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 border border-slate-200 rounded-xl bg-slate-50/40 hover:bg-white transition flex items-start justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 capitalize">{log.action}</span>
                    {log.template_name && (
                      <span className="px-1.5 py-0.2 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-mono">
                        {log.template_name}
                      </span>
                    )}
                  </div>

                  <p className="text-slate-600 text-[11px]">{log.details}</p>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      {log.user || 'Système'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-lg text-xs"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
