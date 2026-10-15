import React, { useState, useEffect } from 'react';
import { PrintJob, PrintJobStatus, ProductRecord } from '../types';
import { api } from '../services/api';
import { desktopFileService } from '../services/desktopFileService';
import { ZplExporter } from '../utils/zplExporter';
import jsPDF from 'jspdf';
import {
  Printer,
  History,
  CheckCircle2,
  AlertCircle,
  Clock,
  X,
  RefreshCw,
  FileText,
  FileCode,
  Download,
} from 'lucide-react';

interface PrintJobHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrintJobHistoryModal: React.FC<PrintJobHistoryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterFormat, setFilterFormat] = useState<'all' | 'pdf' | 'zpl'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const list = await api.jobList();
      setJobs(list);
    } catch (err) {
      console.error('Failed to load print jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadJobs();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredJobs = jobs.filter((j) => {
    if (filterFormat !== 'all' && j.format !== filterFormat) return false;
    if (filterStatus !== 'all' && j.status !== filterStatus) return false;
    return true;
  });

  const handleUpdateStatus = async (jobId: string, newStatus: PrintJobStatus) => {
    try {
      await api.jobSetStatus(jobId, newStatus);
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
      );
      if (selectedJob?.id === jobId) {
        setSelectedJob((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
      setActionMessage(`Statut du travail ${jobId} mis à jour : ${newStatus}`);
    } catch (err: any) {
      console.error('Failed to update job status:', err);
    }
  };

  const handleReExport = async (job: PrintJob) => {
    try {
      const filename = `reexport_${job.id}.${job.format}`;
      let template = job.template_snapshot;
      if (!template && job.template_id) {
        template = (await api.templateGet(job.template_id)) || undefined;
      }
      let products = job.printed_products as ProductRecord[] | undefined;
      if (!products && job.product_ids?.length > 0) {
        const allProds = await api.catalogSearch('');
        const idSet = new Set(job.product_ids);
        products = allProds.filter((p) => idSet.has(p.id));
      }

      if (job.format === 'zpl') {
        let content = '';
        if (template && products && products.length > 0) {
          content = ZplExporter.generateBatchZpl(template, products);
        } else {
          content = `^XA\n^FX E-STUDIO RE-SPOOL JOB ${job.id}\n^FO50,50^A0N,28,24^FDRe-export Job ${job.id}^FS\n^XZ`;
        }
        const path = await desktopFileService.saveText(
          filename,
          content,
          [{ name: 'Fichier ZPL', extensions: ['zpl', 'txt'] }]
        );
        if (path) {
          setActionMessage(`Travail ré-exporté avec succès vers ${path}`);
          await handleUpdateStatus(job.id, 'ready');
        }
      } else {
        const doc = new jsPDF({ unit: 'mm' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text(`E-Studio Re-spool Job : ${job.id}`, 15, 20);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Template ID: ${job.template_id} (Rev ${job.template_revision})`, 15, 28);
        doc.text(`Date de création initiale: ${job.created_at}`, 15, 34);
        doc.text(`Articles inclus: ${job.product_ids?.length || 0}`, 15, 40);
        if (products && products.length > 0) {
          doc.text(`Articles ré-imprimés :`, 15, 48);
          products.slice(0, 15).forEach((p, idx) => {
            doc.text(`• ${p.ITEMNAME || p.id} — ${p.SELLING_PRICE ?? '—'} €`, 20, 56 + idx * 6);
          });
        }
        const arrayBuffer = doc.output('arraybuffer');
        const path = await desktopFileService.saveBinary(
          filename,
          new Uint8Array(arrayBuffer),
          [{ name: 'Document PDF', extensions: ['pdf'] }]
        );
        if (path) {
          setActionMessage(`Travail ré-exporté avec succès vers ${path}`);
          await handleUpdateStatus(job.id, 'ready');
        }
      }
    } catch (err: any) {
      console.error('Failed to re-export job:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[85vh] overflow-hidden text-slate-100 font-sans">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Historique des Impressions & Spooler</span>
                <span className="text-xs text-slate-500 font-normal">({filteredJobs.length} travaux)</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Traçabilité des exports PDF et flux ZPL enregistrés dans SQLite
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadJobs}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title="Rafraîchir la liste"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-slate-400 font-medium">Format:</span>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {(['all', 'pdf', 'zpl'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setFilterFormat(fmt)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                    filterFormat === fmt
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>

            <span className="text-slate-400 font-medium ml-2">Statut:</span>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {['all', 'ready', 'sent', 'failed'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                    filterStatus === st
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st === 'all' ? 'TOUS' : st.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {actionMessage && (
            <span className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-3 py-1 rounded-lg truncate max-w-sm">
              {actionMessage}
            </span>
          )}
        </div>

        {/* Job List Viewport */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
          {filteredJobs.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              <Printer className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p>Aucun travail d'impression enregistré dans cette vue.</p>
            </div>
          ) : (
            filteredJobs.map((job) => (
              <div
                key={job.id}
                onClick={() => setSelectedJob(job)}
                className={`px-6 py-3.5 flex items-center justify-between hover:bg-slate-800/40 cursor-pointer transition ${
                  selectedJob?.id === job.id ? 'bg-slate-800/60' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                    {job.format === 'pdf' ? (
                      <FileText className="w-4 h-4 text-red-400" />
                    ) : (
                      <FileCode className="w-4 h-4 text-purple-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-white">{job.id}</span>
                      <span className="text-slate-500 text-[11px]">·</span>
                      <span className="text-slate-400 text-xs truncate">{job.target || 'Fichier exporté'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                      <span>{new Date(job.created_at).toLocaleString()}</span>
                      <span aria-hidden="true">·</span>
                      <span>{job.product_ids?.length || 0} étiquettes</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          job.status === 'ready'
                            ? 'text-emerald-400'
                            : job.status === 'sent'
                            ? 'text-blue-400'
                            : 'text-amber-400'
                        }
                      >
                        {job.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReExport(job);
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                    title="Ré-exporter ce travail"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Ré-exporter</span>
                  </button>

                  <select
                    value={job.status}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleUpdateStatus(job.id, e.target.value as PrintJobStatus);
                    }}
                    className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg text-xs px-2 py-1"
                  >
                    <option value="draft">Brouillon</option>
                    <option value="ready">Prêt</option>
                    <option value="sent">Envoyé</option>
                    <option value="failed">Échec</option>
                  </select>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-500">
          <span>Base SQLite locale : estudio.sqlite / table print_jobs</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
