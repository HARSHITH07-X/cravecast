import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  Camera,
  Mic,
  MicOff,
  Plus,
  Trash2,
  Calendar,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  FileSpreadsheet,
  TrendingUp,
  CloudSun,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useAuth } from '../lib/authContext';

interface SalesRow {
  date: string;
  dishName: string;
  quantitySold: number;
  price?: number;
  soldOut: boolean;
  soldOutTime?: string;
  confidence?: 'high' | 'low';
}

interface CleaningReport {
  rowsRead: number;
  rowsKept: number;
  rowsFixed: number;
  rowsDropped: number;
  dropReasons: string[];
}

interface EventItem {
  id: string;
  date: string;
  eventName: string;
  eventType: string;
  expectedImpact: string;
  notes: string;
  source: string;
  sourceTitle?: string;
  approvedByOwner?: boolean;
}

export const SalesView: React.FC = () => {
  const { restaurant, idToken } = useAuth();

  // Active sub-tab
  const [activeTab, setActionTab] = useState<'overview' | 'import' | 'events'>('overview');
  const [inputMethod, setInputMethod] = useState<'csv' | 'photo' | 'voice' | 'manual'>('csv');

  // Sales records & summary
  const [salesRecords, setSalesRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loadingSales, setLoadingSales] = useState(false);
  const [selectedDishFilter, setSelectedDishFilter] = useState<string>('all');
  const [availableDishes, setAvailableDishes] = useState<string[]>([]);

  // Batches
  const [batches, setBatches] = useState<any[]>([]);

  // Staging / Cleaned Data for Confirmation
  const [stagedRows, setStagedRows] = useState<SalesRow[]>([]);
  const [cleaningReport, setCleaningReport] = useState<CleaningReport | null>(null);
  const [importSource, setImportSource] = useState<string>('csv');
  const [importFilename, setImportFilename] = useState<string>('');
  const [committing, setCommitting] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState<string | null>(null);

  // Method 1: CSV / Excel Mapping State
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawSampleRows, setRawSampleRows] = useState<any[][]>([]);
  const [allRawRows, setAllRawRows] = useState<any[]>([]);
  const [columnMapping, setColumnMapping] = useState({
    dateColumn: '',
    dishColumn: '',
    quantityColumn: '',
    priceColumn: '',
    soldOutColumn: '',
  });
  const [analyzingColumns, setAnalyzingColumns] = useState(false);

  // Method 2: Photo / PDF OCR State
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Method 3: Voice / Quick text State
  const [quickText, setQuickText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [quickParsing, setQuickParsing] = useState(false);

  // Method 4: Daily manual form
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualRows, setManualRows] = useState<SalesRow[]>([
    { date: new Date().toISOString().slice(0, 10), dishName: '', quantitySold: 0, soldOut: false },
  ]);

  // Context: Events Grounding
  const [events, setEvents] = useState<EventItem[]>([]);
  const [suggestedEvents, setSuggestedEvents] = useState<EventItem[]>([]);
  const [discoveringEvents, setDiscoveringEvents] = useState(false);
  const [eventNotice, setEventNotice] = useState<string | null>(null);

  // Load Sales Data
  const fetchSalesData = async () => {
    if (!idToken) return;
    setLoadingSales(true);
    try {
      const res = await fetch(`/api/sales/list?dish=${encodeURIComponent(selectedDishFilter)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSalesRecords(data.sales || []);
        setSummary(data.summary || null);

        // Compute dish options
        const dishSet = new Set<string>();
        (data.sales || []).forEach((s: any) => {
          if (s.dishName) dishSet.add(s.dishName);
        });
        setAvailableDishes(Array.from(dishSet).sort());
      }
    } catch (err) {
      console.error('Fetch sales failed:', err);
    } finally {
      setLoadingSales(false);
    }
  };

  // Load Batches
  const fetchBatches = async () => {
    if (!idToken) return;
    try {
      const res = await fetch('/api/sales/batches', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBatches(data.batches || []);
      }
    } catch (err) {
      console.error('Fetch batches error:', err);
    }
  };

  // Load Events
  const fetchEvents = async () => {
    if (!idToken) return;
    try {
      const res = await fetch('/api/events/events', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error('Fetch events error:', err);
    }
  };

  useEffect(() => {
    fetchSalesData();
    fetchBatches();
    fetchEvents();
  }, [idToken, selectedDishFilter]);

  // -------------------------------------------------------------
  // METHOD 1: CSV / EXCEL HANDLER
  // -------------------------------------------------------------
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFilename(file.name);
    setImportSource(file.name.endsWith('.csv') ? 'csv' : 'excel');
    setAnalyzingColumns(true);
    setCleaningReport(null);
    setStagedRows([]);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (jsonRows.length === 0) {
        alert('Spreadsheet is empty.');
        setAnalyzingColumns(false);
        return;
      }

      const headers = Object.keys(jsonRows[0]);
      const sample = jsonRows.slice(0, 5).map((row) => headers.map((h) => String(row[h] || '')));

      setRawHeaders(headers);
      setRawSampleRows(sample);
      setAllRawRows(jsonRows);

      // Call Gemini MODEL_FAST to suggest column mapping
      const mapRes = await fetch('/api/sales/map-columns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ headers, sampleRows: sample }),
      });

      if (mapRes.ok) {
        const data = await mapRes.json();
        if (data.mapping) {
          setColumnMapping({
            dateColumn: data.mapping.dateColumn || headers[0],
            dishColumn: data.mapping.dishColumn || headers[1] || headers[0],
            quantityColumn: data.mapping.quantityColumn || headers[2] || headers[0],
            priceColumn: data.mapping.priceColumn || '',
            soldOutColumn: data.mapping.soldOutColumn || '',
          });
        }
      } else {
        // Fallback default mapping
        setColumnMapping({
          dateColumn: headers[0],
          dishColumn: headers[1] || headers[0],
          quantityColumn: headers[2] || headers[0],
          priceColumn: '',
          soldOutColumn: '',
        });
      }
    } catch (err: any) {
      console.error('File parsing failed:', err);
      alert('Failed to parse file: ' + err.message);
    } finally {
      setAnalyzingColumns(false);
    }
  };

  const handleApplyMapping = async () => {
    if (!columnMapping.dateColumn || !columnMapping.dishColumn || !columnMapping.quantityColumn) {
      alert('Please map Date, Dish Name, and Quantity Sold columns.');
      return;
    }

    const mapped = allRawRows.map((r) => ({
      date: r[columnMapping.dateColumn],
      dishName: r[columnMapping.dishColumn],
      quantitySold: r[columnMapping.quantityColumn],
      price: columnMapping.priceColumn ? r[columnMapping.priceColumn] : undefined,
      soldOut: columnMapping.soldOutColumn ? Boolean(r[columnMapping.soldOutColumn]) : false,
    }));

    // Send to cleaning preview
    const prevRes = await fetch('/api/sales/preview-import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ rows: mapped }),
    });

    if (prevRes.ok) {
      const data = await prevRes.json();
      setCleaningReport(data.report);
      setStagedRows(data.cleanedRows);
    }
  };

  // -------------------------------------------------------------
  // METHOD 2: PHOTO / PDF LEDGER EXTRACTION
  // -------------------------------------------------------------
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFilename(file.name);
    setImportSource('ledger_photo');
    setOcrLoading(true);
    setOcrError(null);
    setCleaningReport(null);
    setStagedRows([]);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const mimeType = file.type || 'image/jpeg';

        const res = await fetch('/api/sales/extract-ledger', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            imageBase64: base64Data,
            mimeType,
            defaultDate: new Date().toISOString().slice(0, 10),
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'Failed to extract ledger photo.');
        }

        const data = await res.json();
        const extracted = data.result?.extractedRows || [];

        // Preview and clean
        const prevRes = await fetch('/api/sales/preview-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ rows: extracted }),
        });

        if (prevRes.ok) {
          const pData = await prevRes.json();
          setCleaningReport(pData.report);
          setStagedRows(pData.cleanedRows);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Ledger error:', err);
      setOcrError(err.message || 'Could not process ledger image.');
    } finally {
      setOcrLoading(false);
    }
  };

  // -------------------------------------------------------------
  // METHOD 3: VOICE & QUICK ENTRY PARSING
  // -------------------------------------------------------------
  const startSpeechRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Browser speech recognition not supported. You can type directly in the box below!');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; // Also catches Hindi/Telugu code-switching
    recognition.interimResults = false;

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuickText((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };

    recognition.start();
  };

  const handleParseQuickEntry = async () => {
    if (!quickText.trim()) return;
    setQuickParsing(true);
    setCleaningReport(null);

    try {
      const res = await fetch('/api/sales/parse-quick-entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          text: quickText,
          defaultDate: new Date().toISOString().slice(0, 10),
        }),
      });

      if (!res.ok) throw new Error('Failed to parse speech/entry');

      const data = await res.json();
      const rows = data.rows || [];

      setImportFilename('voice_entry');
      setImportSource('voice');

      // Send to preview
      const prevRes = await fetch('/api/sales/preview-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ rows }),
      });

      if (prevRes.ok) {
        const pData = await prevRes.json();
        setCleaningReport(pData.report);
        setStagedRows(pData.cleanedRows);
      }
    } catch (err: any) {
      console.error('Quick parse error:', err);
      alert('Could not parse text: ' + err.message);
    } finally {
      setQuickParsing(false);
    }
  };

  // -------------------------------------------------------------
  // METHOD 4: MANUAL DAILY FORM
  // -------------------------------------------------------------
  const handleAddManualLine = () => {
    setManualRows([
      ...manualRows,
      { date: manualDate, dishName: '', quantitySold: 0, soldOut: false },
    ]);
  };

  const handleManualPreview = async () => {
    const valid = manualRows.filter((r) => r.dishName.trim() && r.quantitySold > 0);
    if (valid.length === 0) {
      alert('Please fill out at least one dish name and positive quantity.');
      return;
    }

    setImportFilename('daily_manual_form');
    setImportSource('manual');

    const prevRes = await fetch('/api/sales/preview-import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ rows: valid }),
    });

    if (prevRes.ok) {
      const pData = await prevRes.json();
      setCleaningReport(pData.report);
      setStagedRows(pData.cleanedRows);
    }
  };

  // -------------------------------------------------------------
  // COMMIT BATCH TO FIRESTORE
  // -------------------------------------------------------------
  const handleCommitBatch = async () => {
    if (stagedRows.length === 0) return;
    setCommitting(true);
    setCommitSuccess(null);

    try {
      const res = await fetch('/api/sales/commit-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          rows: stagedRows,
          source: importSource,
          filename: importFilename,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to save sales batch.');
      }

      const data = await res.json();
      setCommitSuccess(
        `Successfully saved ${data.savedRows} sales records! ${
          data.newDishesAdded?.length ? `Added dishes to menu: ${data.newDishesAdded.join(', ')}` : ''
        }`
      );
      setStagedRows([]);
      setCleaningReport(null);

      // Refresh sales records & batches
      await fetchSalesData();
      await fetchBatches();
    } catch (err: any) {
      console.error('Commit error:', err);
      alert('Failed to save batch: ' + err.message);
    } finally {
      setCommitting(false);
    }
  };

  // -------------------------------------------------------------
  // UNDO BATCH
  // -------------------------------------------------------------
  const handleUndoBatch = async (batchId: string) => {
    if (!confirm('Are you sure you want to undo and remove this sales import batch?')) return;
    try {
      const res = await fetch('/api/sales/undo-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ batchId }),
      });

      if (res.ok) {
        await fetchSalesData();
        await fetchBatches();
      }
    } catch (err) {
      console.error('Undo error:', err);
    }
  };

  // -------------------------------------------------------------
  // GOOGLE SEARCH GROUNDING: SUGGEST EVENTS
  // -------------------------------------------------------------
  const handleDiscoverEvents = async () => {
    setDiscoveringEvents(true);
    setEventNotice(null);
    try {
      const res = await fetch('/api/events/suggest-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!res.ok) throw new Error('Failed to discover local events.');

      const data = await res.json();
      setSuggestedEvents(data.events || []);
      if (!data.events || data.events.length === 0) {
        setEventNotice('No upcoming major local events found in your city for the next 14 days.');
      }
    } catch (err: any) {
      console.error('Discover error:', err);
      setEventNotice('Could not retrieve local events: ' + err.message);
    } finally {
      setDiscoveringEvents(false);
    }
  };

  const handleAcceptEvent = async (eventItem: EventItem) => {
    try {
      const res = await fetch('/api/events/accept-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(eventItem),
      });

      if (res.ok) {
        // Remove from suggested and add to accepted
        setSuggestedEvents((prev) => prev.filter((e) => e.id !== eventItem.id));
        await fetchEvents();
      }
    } catch (err) {
      console.error('Accept event error:', err);
    }
  };

  // Format chart data: aggregate sales by date
  const chartDataMap: Record<string, number> = {};
  salesRecords.forEach((s) => {
    chartDataMap[s.date] = (chartDataMap[s.date] || 0) + s.quantitySold;
  });
  const chartData = Object.keys(chartDataMap)
    .sort()
    .map((date) => ({
      date: date.slice(5), // MM-DD
      fullDate: date,
      portions: chartDataMap[date],
    }));

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#24463D] pb-5">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#FBF6EE]">
            Sales Intelligence & History
          </h1>
          <p className="text-xs sm:text-sm text-[#FBF6EE]/70 mt-1">
            Real daily sales records, multimodal intake, and demand calibration.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 p-1 bg-[#142823] border border-[#24463D] rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setActionTab('overview')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'overview'
                ? 'bg-[#2F5D50] text-[#FBF6EE] shadow'
                : 'text-[#FBF6EE]/60 hover:text-[#FBF6EE]'
            }`}
          >
            Sales Overview
          </button>
          <button
            onClick={() => setActionTab('import')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'import'
                ? 'bg-[#C8553D] text-[#FBF6EE] shadow'
                : 'text-[#FBF6EE]/60 hover:text-[#FBF6EE]'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Sales</span>
          </button>
          <button
            onClick={() => setActionTab('events')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'events'
                ? 'bg-[#2F5D50] text-[#FBF6EE] shadow'
                : 'text-[#FBF6EE]/60 hover:text-[#FBF6EE]'
            }`}
          >
            <CloudSun className="w-3.5 h-3.5 text-[#E0A526]" />
            <span>Weather & Events</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: SALES OVERVIEW (CHART & REAL SUMMARY)                 */}
      {/* ============================================================ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {commitSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-700/80 text-emerald-200 text-xs sm:text-sm flex items-center justify-between">
              <span>{commitSuccess}</span>
              <button onClick={() => setCommitSuccess(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Empty State when no sales exist */}
          {salesRecords.length === 0 ? (
            <div className="rounded-3xl bg-[#142823] border border-[#24463D] p-10 text-center max-w-2xl mx-auto space-y-6 shadow-xl">
              <div className="w-16 h-16 rounded-2xl bg-[#0F1F1B] border border-[#2F5D50] flex items-center justify-center mx-auto text-[#E0A526] shadow-inner">
                <UploadCloud className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#FBF6EE]">
                  No sales history uploaded yet
                </h3>
                <p className="text-xs sm:text-sm text-[#FBF6EE]/70 max-w-md mx-auto leading-relaxed">
                  CraveCast displays charts and metrics exclusively from real kitchen sales. Upload past records in under 2 minutes using spreadsheets, ledger photos, or quick voice notes.
                </p>
              </div>
              <button
                onClick={() => setActionTab('import')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-xs sm:text-sm font-semibold bg-[#C8553D] hover:bg-[#B54832] text-[#FBF6EE] transition-all shadow-lg"
              >
                <Plus className="w-4 h-4" />
                <span>Upload Sales Records</span>
              </button>
            </div>
          ) : (
            <>
              {/* Summary Metric Row (computed ONLY from saved data) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-[#142823] border border-[#24463D]">
                  <span className="text-[11px] uppercase tracking-wider text-[#FBF6EE]/50 font-semibold block mb-1">
                    Total Portions Sold
                  </span>
                  <div className="font-serif text-2xl sm:text-3xl font-bold text-[#FBF6EE]">
                    {summary?.totalSales?.toLocaleString() || 0}
                  </div>
                  <span className="text-[11px] text-[#E0A526] font-medium mt-1 block">
                    {summary?.recordCount || 0} recorded items
                  </span>
                </div>

                <div className="p-5 rounded-2xl bg-[#142823] border border-[#24463D]">
                  <span className="text-[11px] uppercase tracking-wider text-[#FBF6EE]/50 font-semibold block mb-1">
                    Busiest Service Day
                  </span>
                  <div className="font-serif text-xl sm:text-2xl font-bold text-[#FBF6EE] truncate">
                    {summary?.bestDay?.date || '—'}
                  </div>
                  <span className="text-[11px] text-[#FBF6EE]/70 font-medium mt-1 block">
                    {summary?.bestDay?.total ? `${summary.bestDay.total} portions` : '—'}
                  </span>
                </div>

                <div className="p-5 rounded-2xl bg-[#142823] border border-[#24463D]">
                  <span className="text-[11px] uppercase tracking-wider text-[#FBF6EE]/50 font-semibold block mb-1">
                    Top Selling Dish
                  </span>
                  <div className="font-serif text-lg sm:text-xl font-bold text-[#FBF6EE] truncate">
                    {summary?.topDish?.name || '—'}
                  </div>
                  <span className="text-[11px] text-[#E0A526] font-medium mt-1 block">
                    {summary?.topDish?.quantity ? `${summary.topDish.quantity} total portions` : '—'}
                  </span>
                </div>

                <div className="p-5 rounded-2xl bg-[#142823] border border-[#24463D]">
                  <span className="text-[11px] uppercase tracking-wider text-[#FBF6EE]/50 font-semibold block mb-1">
                    Recorded Gross Revenue
                  </span>
                  <div className="font-serif text-2xl sm:text-3xl font-bold text-[#FBF6EE]">
                    {restaurant?.currency} {Math.round(summary?.totalRevenue || 0).toLocaleString()}
                  </div>
                  <span className="text-[11px] text-[#FBF6EE]/60 font-medium mt-1 block">
                    From items with price
                  </span>
                </div>
              </div>

              {/* Chart & Dish Filter */}
              <div className="rounded-3xl bg-[#142823] border border-[#24463D] p-6 sm:p-8 space-y-6 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-serif text-xl font-bold text-[#FBF6EE]">
                      Historical Daily Sales Velocity
                    </h2>
                    <p className="text-xs text-[#FBF6EE]/60 mt-0.5">
                      Daily portion volumes plotted over recorded service dates.
                    </p>
                  </div>

                  {/* Filter dropdown */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#FBF6EE]/60 font-medium">Filter by dish:</span>
                    <select
                      value={selectedDishFilter}
                      onChange={(e) => setSelectedDishFilter(e.target.value)}
                      className="px-3 py-1.5 bg-[#0F1F1B] border border-[#24463D] rounded-xl text-xs text-[#FBF6EE] focus:outline-none focus:ring-1 focus:ring-[#E0A526]"
                    >
                      <option value="all">All Dishes Combined</option>
                      {availableDishes.map((dish) => (
                        <option key={dish} value={dish}>
                          {dish}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Line Chart */}
                <div className="h-72 w-full pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1F3F34" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="#FBF6EE"
                        opacity={0.6}
                        fontSize={11}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="#FBF6EE"
                        opacity={0.6}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-[#0A1613] border border-[#2F5D50] p-3 rounded-xl shadow-xl text-xs">
                                <span className="font-bold text-[#E0A526] block">{data.fullDate}</span>
                                <span className="text-[#FBF6EE] block mt-1">
                                  {data.portions} portions sold
                                </span>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="portions"
                        stroke="#C8553D"
                        strokeWidth={3}
                        dot={{ fill: '#E0A526', r: 4, stroke: '#0F1F1B', strokeWidth: 1.5 }}
                        activeDot={{ r: 6, fill: '#FBF6EE', stroke: '#C8553D', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Batch History with Undo capability */}
              <div className="rounded-3xl bg-[#142823] border border-[#24463D] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-lg font-bold text-[#FBF6EE]">
                    Import Batches & Audit Trail
                  </h3>
                  <span className="text-xs text-[#FBF6EE]/50">{batches.length} past batches</span>
                </div>

                <div className="divide-y divide-[#24463D]/60 max-h-60 overflow-y-auto">
                  {batches.map((b) => (
                    <div key={b.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-medium text-[#FBF6EE] flex items-center gap-2">
                          <span className="capitalize">{b.source.replace('_', ' ')}</span>
                          <span className="text-[#FBF6EE]/40">·</span>
                          <span className="text-[#E0A526]">{b.filename}</span>
                        </div>
                        <span className="text-[#FBF6EE]/50">
                          {b.rowCount} rows · {b.dateRange?.start} to {b.dateRange?.end}
                        </span>
                      </div>

                      {b.status === 'undone' ? (
                        <span className="text-red-400 font-medium">Undone</span>
                      ) : (
                        <button
                          onClick={() => handleUndoBatch(b.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F1F1B] hover:bg-red-950/40 text-red-300 border border-[#24463D] transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Undo Batch</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: ADD SALES INTAKE (4 MODALITIES)                       */}
      {/* ============================================================ */}
      {activeTab === 'import' && (
        <div className="space-y-8">
          {/* Intake Method Selector */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => setInputMethod('csv')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                inputMethod === 'csv'
                  ? 'bg-[#18332C] border-[#E0A526] shadow-md'
                  : 'bg-[#142823] border-[#24463D] hover:border-[#3D7364]'
              }`}
            >
              <FileSpreadsheet className="w-5 h-5 text-[#E0A526] mb-2" />
              <div className="font-semibold text-xs sm:text-sm text-[#FBF6EE]">1. CSV / Excel</div>
              <p className="text-[11px] text-[#FBF6EE]/60 mt-1">Smart column mapping</p>
            </button>

            <button
              onClick={() => setInputMethod('photo')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                inputMethod === 'photo'
                  ? 'bg-[#18332C] border-[#E0A526] shadow-md'
                  : 'bg-[#142823] border-[#24463D] hover:border-[#3D7364]'
              }`}
            >
              <Camera className="w-5 h-5 text-[#E0A526] mb-2" />
              <div className="font-semibold text-xs sm:text-sm text-[#FBF6EE]">2. Ledger Photo</div>
              <p className="text-[11px] text-[#FBF6EE]/60 mt-1">OCR handwritten bill books</p>
            </button>

            <button
              onClick={() => setInputMethod('voice')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                inputMethod === 'voice'
                  ? 'bg-[#18332C] border-[#E0A526] shadow-md'
                  : 'bg-[#142823] border-[#24463D] hover:border-[#3D7364]'
              }`}
            >
              <Mic className="w-5 h-5 text-[#E0A526] mb-2" />
              <div className="font-semibold text-xs sm:text-sm text-[#FBF6EE]">3. Voice / Quick</div>
              <p className="text-[11px] text-[#FBF6EE]/60 mt-1">EN, Hindi, Telugu speech</p>
            </button>

            <button
              onClick={() => setInputMethod('manual')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                inputMethod === 'manual'
                  ? 'bg-[#18332C] border-[#E0A526] shadow-md'
                  : 'bg-[#142823] border-[#24463D] hover:border-[#3D7364]'
              }`}
            >
              <Plus className="w-5 h-5 text-[#E0A526] mb-2" />
              <div className="font-semibold text-xs sm:text-sm text-[#FBF6EE]">4. Daily Form</div>
              <p className="text-[11px] text-[#FBF6EE]/60 mt-1">Item entry & 86 timings</p>
            </button>
          </div>

          {/* Method 1: CSV / Excel Upload */}
          {inputMethod === 'csv' && (
            <div className="rounded-3xl bg-[#142823] border border-[#24463D] p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-6 h-6 text-[#E0A526]" />
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#FBF6EE]">
                    Upload Sales Spreadsheet (.csv, .xlsx, .xls)
                  </h3>
                  <p className="text-xs text-[#FBF6EE]/60">
                    Gemini analyzes the headers and 5 sample rows to suggest column mapping.
                  </p>
                </div>
              </div>

              <input
                type="file"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileUpload}
                className="block w-full text-xs text-[#FBF6EE]/80 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#2F5D50] file:text-[#FBF6EE] hover:file:bg-[#3D7364] file:cursor-pointer"
              />

              {analyzingColumns && (
                <div className="flex items-center gap-2 text-xs text-[#E0A526]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gemini is analyzing column headers and sample rows...</span>
                </div>
              )}

              {rawHeaders.length > 0 && !analyzingColumns && (
                <div className="p-4 rounded-2xl bg-[#0F1F1B] border border-[#24463D] space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#E0A526] uppercase tracking-wider">
                      Verify Column Mappings
                    </span>
                    <span className="text-xs text-[#FBF6EE]/50">Found {allRawRows.length} rows</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="block text-[#FBF6EE]/70 mb-1 font-medium">Date Column *</label>
                      <select
                        value={columnMapping.dateColumn}
                        onChange={(e) => setColumnMapping({ ...columnMapping, dateColumn: e.target.value })}
                        className="w-full p-2 rounded-lg bg-[#142823] border border-[#24463D] text-[#FBF6EE]"
                      >
                        {rawHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[#FBF6EE]/70 mb-1 font-medium">Dish Name Column *</label>
                      <select
                        value={columnMapping.dishColumn}
                        onChange={(e) => setColumnMapping({ ...columnMapping, dishColumn: e.target.value })}
                        className="w-full p-2 rounded-lg bg-[#142823] border border-[#24463D] text-[#FBF6EE]"
                      >
                        {rawHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[#FBF6EE]/70 mb-1 font-medium">Quantity Sold Column *</label>
                      <select
                        value={columnMapping.quantityColumn}
                        onChange={(e) =>
                          setColumnMapping({ ...columnMapping, quantityColumn: e.target.value })
                        }
                        className="w-full p-2 rounded-lg bg-[#142823] border border-[#24463D] text-[#FBF6EE]"
                      >
                        {rawHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleApplyMapping}
                    className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#2F5D50] hover:bg-[#3D7364] text-[#FBF6EE] transition-colors"
                  >
                    Generate Cleaning Preview
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Method 2: Photo / Ledger OCR */}
          {inputMethod === 'photo' && (
            <div className="rounded-3xl bg-[#142823] border border-[#24463D] p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-3">
                <Camera className="w-6 h-6 text-[#E0A526]" />
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#FBF6EE]">
                    Photo of Handwritten Ledger or POS Slip
                  </h3>
                  <p className="text-xs text-[#FBF6EE]/60">
                    Gemini multimodal vision transcribes dish sales rows with confidence tagging.
                  </p>
                </div>
              </div>

              <input
                type="file"
                accept="image/*, application/pdf"
                capture="environment"
                onChange={handlePhotoUpload}
                className="block w-full text-xs text-[#FBF6EE]/80 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#C8553D] file:text-[#FBF6EE] hover:file:bg-[#B54832] file:cursor-pointer"
              />

              {ocrLoading && (
                <div className="flex items-center gap-2 text-xs text-[#E0A526]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing handwritten ledger lines and extracting portion quantities...</span>
                </div>
              )}

              {ocrError && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs">
                  {ocrError}
                </div>
              )}
            </div>
          )}

          {/* Method 3: Voice / Quick Entry */}
          {inputMethod === 'voice' && (
            <div className="rounded-3xl bg-[#142823] border border-[#24463D] p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mic className="w-6 h-6 text-[#E0A526]" />
                  <div>
                    <h3 className="font-serif text-lg font-bold text-[#FBF6EE]">
                      Voice or Quick Natural Text (English, Hindi, Telugu)
                    </h3>
                    <p className="text-xs text-[#FBF6EE]/60">
                      Speak or type phrases like &ldquo;sold 40 biryani, 12 dosa, dosa finished at 8pm&rdquo;.
                    </p>
                  </div>
                </div>

                <button
                  onClick={startSpeechRecognition}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isRecording
                      ? 'bg-red-600 text-white animate-pulse'
                      : 'bg-[#2F5D50] hover:bg-[#3D7364] text-[#FBF6EE]'
                  }`}
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>{isRecording ? 'Listening...' : 'Tap to Speak'}</span>
                </button>
              </div>

              <textarea
                rows={3}
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                placeholder="e.g. sold 45 chicken biryani, 20 butter naan, paneer tikka 15 finished at 8:30pm"
                className="w-full p-4 bg-[#0F1F1B] border border-[#24463D] focus:border-[#E0A526] rounded-2xl text-xs sm:text-sm text-[#FBF6EE] focus:outline-none"
              />

              <button
                onClick={handleParseQuickEntry}
                disabled={quickParsing || !quickText.trim()}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold bg-[#C8553D] hover:bg-[#B54832] disabled:opacity-50 text-[#FBF6EE] transition-colors"
              >
                {quickParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Parse Into Staging Rows</span>
              </button>
            </div>
          )}

          {/* Method 4: Daily Manual Form */}
          {inputMethod === 'manual' && (
            <div className="rounded-3xl bg-[#142823] border border-[#24463D] p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#FBF6EE]">
                    Daily Service Sales Form
                  </h3>
                  <p className="text-xs text-[#FBF6EE]/60">
                    Log today&apos;s counts and capture whether bestsellers sold out early.
                  </p>
                </div>

                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => {
                    setManualDate(e.target.value);
                    setManualRows(manualRows.map((r) => ({ ...r, date: e.target.value })));
                  }}
                  className="px-3 py-1.5 bg-[#0F1F1B] border border-[#24463D] rounded-xl text-xs text-[#FBF6EE]"
                />
              </div>

              <div className="space-y-3">
                {manualRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 rounded-2xl bg-[#0F1F1B] border border-[#24463D] text-xs items-center"
                  >
                    <div className="sm:col-span-5">
                      <input
                        type="text"
                        placeholder="Dish Name (e.g. Tandoori Roti)"
                        value={row.dishName}
                        onChange={(e) => {
                          const updated = [...manualRows];
                          updated[idx].dishName = e.target.value;
                          setManualRows(updated);
                        }}
                        className="w-full p-2 bg-[#142823] border border-[#24463D] rounded-lg text-[#FBF6EE]"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <input
                        type="number"
                        placeholder="Portions Sold"
                        value={row.quantitySold || ''}
                        onChange={(e) => {
                          const updated = [...manualRows];
                          updated[idx].quantitySold = parseFloat(e.target.value) || 0;
                          setManualRows(updated);
                        }}
                        className="w-full p-2 bg-[#142823] border border-[#24463D] rounded-lg text-[#FBF6EE]"
                      />
                    </div>

                    <div className="sm:col-span-3 flex items-center gap-2">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={row.soldOut}
                          onChange={(e) => {
                            const updated = [...manualRows];
                            updated[idx].soldOut = e.target.checked;
                            setManualRows(updated);
                          }}
                          className="rounded text-[#C8553D]"
                        />
                        <span className="text-[#FBF6EE]/80">Sold Out (86ed)</span>
                      </label>
                    </div>

                    <div className="sm:col-span-1 text-right">
                      <button
                        onClick={() => setManualRows(manualRows.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-300 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleAddManualLine}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#18332C] border border-[#2F5D50] text-[#FBF6EE]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Another Dish</span>
                </button>

                <button
                  onClick={handleManualPreview}
                  className="px-6 py-2 rounded-xl text-xs font-semibold bg-[#C8553D] hover:bg-[#B54832] text-[#FBF6EE]"
                >
                  Preview Staging Table
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* CLEANING REPORT & CONFIRMATION TABLE                         */}
          {/* ============================================================ */}
          {cleaningReport && stagedRows.length > 0 && (
            <div className="rounded-3xl bg-[#142823] border border-[#2F5D50] p-6 sm:p-8 space-y-6 shadow-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#24463D]">
                <div>
                  <h3 className="font-serif text-xl font-bold text-[#FBF6EE]">
                    Cleaning & Validation Report
                  </h3>
                  <p className="text-xs text-[#FBF6EE]/70 mt-1">
                    Normalized dates (DD/MM/YYYY supported), trimmed dish names, and verified positive quantities.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="px-3 py-1.5 rounded-lg bg-emerald-950/70 border border-emerald-800 text-emerald-300 font-medium">
                    Kept: {cleaningReport.rowsKept}
                  </span>
                  {cleaningReport.rowsFixed > 0 && (
                    <span className="px-3 py-1.5 rounded-lg bg-yellow-950/70 border border-yellow-800 text-yellow-300 font-medium">
                      Fixed Dates: {cleaningReport.rowsFixed}
                    </span>
                  )}
                  {cleaningReport.rowsDropped > 0 && (
                    <span className="px-3 py-1.5 rounded-lg bg-red-950/70 border border-red-800 text-red-300 font-medium">
                      Dropped: {cleaningReport.rowsDropped}
                    </span>
                  )}
                </div>
              </div>

              {cleaningReport.dropReasons.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-800/60 text-amber-200 text-xs space-y-1">
                  <span className="font-semibold block">Dropped row log:</span>
                  {cleaningReport.dropReasons.slice(0, 5).map((r, i) => (
                    <div key={i}>• {r}</div>
                  ))}
                </div>
              )}

              {/* Editable Review Table */}
              <div className="overflow-x-auto max-h-80 border border-[#24463D] rounded-2xl">
                <table className="w-full text-left text-xs text-[#FBF6EE]">
                  <thead className="bg-[#0F1F1B] border-b border-[#24463D] sticky top-0 text-[#E0A526]">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Dish Name</th>
                      <th className="p-3">Quantity Sold</th>
                      <th className="p-3">Sold Out?</th>
                      <th className="p-3">Confidence</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#24463D]/40 bg-[#142823]">
                    {stagedRows.map((row, idx) => (
                      <tr
                        key={idx}
                        className={row.confidence === 'low' ? 'bg-amber-950/20 text-amber-100' : ''}
                      >
                        <td className="p-3 font-mono">{row.date}</td>
                        <td className="p-3 font-medium">{row.dishName}</td>
                        <td className="p-3 font-semibold">{row.quantitySold}</td>
                        <td className="p-3">
                          {row.soldOut ? (
                            <span className="px-2 py-0.5 rounded bg-red-950/80 border border-red-800 text-red-300 text-[10px]">
                              Yes {row.soldOutTime ? `(${row.soldOutTime})` : ''}
                            </span>
                          ) : (
                            <span className="text-[#FBF6EE]/40">No</span>
                          )}
                        </td>
                        <td className="p-3">
                          {row.confidence === 'low' ? (
                            <span className="text-amber-400 font-semibold flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Review</span>
                            </span>
                          ) : (
                            <span className="text-emerald-400 font-medium">Verified</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setStagedRows(stagedRows.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-300 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Confirm & Save Button */}
              <div className="flex items-center justify-between pt-4">
                <button
                  onClick={() => {
                    setStagedRows([]);
                    setCleaningReport(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-[#FBF6EE]/60 hover:text-[#FBF6EE]"
                >
                  Discard Staging
                </button>

                <button
                  onClick={handleCommitBatch}
                  disabled={committing}
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-xs sm:text-sm bg-[#C8553D] hover:bg-[#B54832] disabled:opacity-60 text-[#FBF6EE] transition-all shadow-lg"
                >
                  {committing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving batch & enriching weather...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Save {stagedRows.length} Records</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 3: WEATHER & SEARCH-GROUNDED EVENTS                      */}
      {/* ============================================================ */}
      {activeTab === 'events' && (
        <div className="space-y-8">
          {/* Open-Meteo Weather Status */}
          <div className="rounded-3xl bg-[#142823] border border-[#24463D] p-6 sm:p-8 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <CloudSun className="w-6 h-6 text-[#E0A526]" />
              <div>
                <h2 className="font-serif text-xl font-bold text-[#FBF6EE]">
                  Automated Weather Enrichment ({restaurant?.city})
                </h2>
                <p className="text-xs text-[#FBF6EE]/60">
                  Open-Meteo archive caches temperatures and precipitation for all sales dates to inform demand models.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0F1F1B] border border-[#24463D] text-xs text-[#FBF6EE]/75 flex items-center justify-between">
              <span>Weather data is cached in background on every sales batch import.</span>
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <Check className="w-4 h-4" /> Active
              </span>
            </div>
          </div>

          {/* Local Events & Google Search Grounding */}
          <div className="rounded-3xl bg-[#142823] border border-[#24463D] p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#E0A526] mb-1">
                  <Sparkles className="w-4 h-4" />
                  <span>Google Search Grounded Discovery</span>
                </div>
                <h2 className="font-serif text-xl font-bold text-[#FBF6EE]">
                  Upcoming Local Festivals & Events (Next 14 Days)
                </h2>
                <p className="text-xs text-[#FBF6EE]/60 mt-0.5">
                  AI Studio search grounding scans current calendars for {restaurant?.city}. Every event requires explicit owner acceptance.
                </p>
              </div>

              <button
                onClick={handleDiscoverEvents}
                disabled={discoveringEvents}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#2F5D50] hover:bg-[#3D7364] disabled:opacity-50 text-[#FBF6EE] transition-colors shrink-0"
              >
                {discoveringEvents ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#E0A526]" />
                    <span>Searching local calendars...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-[#E0A526]" />
                    <span>Suggest Upcoming Events</span>
                  </>
                )}
              </button>
            </div>

            {eventNotice && (
              <div className="p-3 rounded-xl bg-[#0F1F1B] border border-[#24463D] text-xs text-[#FBF6EE]/70">
                {eventNotice}
              </div>
            )}

            {/* Suggested Events (Waiting for Owner Approval) */}
            {suggestedEvents.length > 0 && (
              <div className="space-y-3 pt-2">
                <span className="text-xs font-semibold text-[#E0A526] uppercase tracking-wider block">
                  Found {suggestedEvents.length} Pending Event Suggestions
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {suggestedEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-5 rounded-2xl bg-[#0F1F1B] border border-[#2F5D50] flex flex-col justify-between space-y-4"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2 text-xs">
                          <span className="font-mono text-[#E0A526] font-semibold">{ev.date}</span>
                          <span className="px-2 py-0.5 rounded-full bg-[#18332C] border border-[#2F5D50] text-[#FBF6EE]/80 text-[10px] uppercase">
                            {ev.eventType} · {ev.expectedImpact}
                          </span>
                        </div>
                        <h4 className="font-serif text-base font-bold text-[#FBF6EE] mb-1">
                          {ev.eventName}
                        </h4>
                        <p className="text-xs text-[#FBF6EE]/70">{ev.notes}</p>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-[#24463D] text-xs">
                        <a
                          href={ev.source}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#E0A526] hover:underline inline-flex items-center gap-1 text-[11px]"
                        >
                          <span>{ev.sourceTitle || 'View Source'}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>

                        <button
                          onClick={() => handleAcceptEvent(ev)}
                          className="px-4 py-1.5 rounded-lg bg-[#C8553D] hover:bg-[#B54832] text-[#FBF6EE] font-semibold text-xs transition-colors"
                        >
                          Accept Event
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Approved Active Events */}
            <div className="pt-4 border-t border-[#24463D]/60 space-y-3">
              <h3 className="font-serif text-base font-bold text-[#FBF6EE]">
                Confirmed Calendar Events ({events.length})
              </h3>

              {events.length === 0 ? (
                <p className="text-xs text-[#FBF6EE]/50 italic">
                  No confirmed events added yet. Accept suggestions above or add manual dates in settings.
                </p>
              ) : (
                <div className="divide-y divide-[#24463D]/40">
                  {events.map((ev) => (
                    <div key={ev.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono text-[#E0A526] mr-3">{ev.date}</span>
                        <span className="font-semibold text-[#FBF6EE] mr-2">{ev.eventName}</span>
                        <span className="text-[#FBF6EE]/50 capitalize">({ev.eventType})</span>
                      </div>
                      <span className="text-emerald-400 font-medium">Included in Demand Factors</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
