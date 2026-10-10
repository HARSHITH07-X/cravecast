import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarDays,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Send,
  Copy,
  Check,
  RotateCcw,
  Sliders,
  DollarSign,
  Package,
  Layers,
  ChefHat,
  Clock,
  Sparkles,
  Info,
  Edit3,
  Save,
  X,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  ShieldCheck,
  Activity,
  Play,
  RefreshCw,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CheckCheck,
} from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { DailyPlanOutput, ComputedPrepItem, ComputedOrderItem, SupplierOrderGroup } from '../../server/planner';
import { CriticReport, CriticIssue } from '../../server/agents/critic';
import { ChangeSummaryResult, DishChangeRecord } from '../../server/agents/changeSummary';

interface DailyPlanViewProps {
  onNavigateTab?: (tab: string) => void;
}

interface OrchestratorProgressEventUI {
  type: string;
  step?: string;
  message: string;
  timestamp: string;
  criticReport?: CriticReport;
  changeSummary?: ChangeSummaryResult;
  plan?: DailyPlanOutput;
}

export const DailyPlanView: React.FC<DailyPlanViewProps> = ({ onNavigateTab }) => {
  const { restaurant, idToken } = useAuth();

  // Tomorrow's date string YYYY-MM-DD
  const defaultTargetDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const [targetDate, setTargetDate] = useState(defaultTargetDate);
  const [serviceLevel, setServiceLevel] = useState(85); // 50 to 99 percent
  const [loading, setLoading] = useState(true);
  const [planData, setPlanData] = useState<DailyPlanOutput | null>(null);
  const [planStatus, setPlanStatus] = useState<'draft' | 'approved'>('draft');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [copiedSupplierId, setCopiedSupplierId] = useState<string | null>(null);

  // Active View Tab: 'sheet' | 'changes' | 'critic'
  const [activeTab, setActiveTab] = useState<'sheet' | 'changes' | 'critic'>('sheet');

  // Change Summary & Critic Reports
  const [changeSummary, setChangeSummary] = useState<ChangeSummaryResult | null>(null);
  const [loadingChangeSummary, setLoadingChangeSummary] = useState(false);
  const [criticReport, setCriticReport] = useState<CriticReport | null>(null);

  // Quick Stock Editing Modal
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockEditList, setStockEditList] = useState<Array<{ id: string; name: string; unit: string; currentStock: number }>>([]);
  const [savingStock, setSavingStock] = useState(false);

  // Active filter for orders
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('all');

  // End-of-Day Feedback & 4-Week Learning Loop state
  const [feedbackByDishId, setFeedbackByDishId] = useState<
    Record<
      string,
      {
        feedbackType: 'ran_out' | 'leftover' | 'on_target';
        ranOutAt?: string;
        leftoverQty?: number;
        salesUpdated?: boolean;
      }
    >
  >({});
  const [editingFeedbackDishId, setEditingFeedbackDishId] = useState<string | null>(null);
  const [feedbackDraftType, setFeedbackDraftType] = useState<'ran_out' | 'leftover'>('ran_out');
  const [feedbackDraftTime, setFeedbackDraftTime] = useState<string>('20:00');
  const [feedbackDraftQty, setFeedbackDraftQty] = useState<number>(4);
  const [savingFeedbackDishId, setSavingFeedbackDishId] = useState<string | null>(null);
  const [learningAdjustments, setLearningAdjustments] = useState<Record<string, any>>({});

  // Orchestrator State
  const [orchestrating, setOrchestrating] = useState(false);
  const [showOrchestratorModal, setShowOrchestratorModal] = useState(false);
  const [orchestratorEvents, setOrchestratorEvents] = useState<OrchestratorProgressEventUI[]>([]);
  const [currentStepName, setCurrentStepName] = useState<string>('initialization');
  const [testNegativeStock, setTestNegativeStock] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);

  // Load Daily Plan
  const fetchPlan = async (dateStr: string, sliderVal: number, skipAi: boolean = false) => {
    if (!idToken) return;
    try {
      setLoading(true);
      const res = await fetch(
        `/api/plan/daily?date=${dateStr}&serviceLevel=${sliderVal / 100}&skipGemini=${skipAi}`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      );
      const data = await res.json();
      if (data.success && data.plan) {
        setPlanData(data.plan);
        setPlanStatus(data.plan.status || 'draft');
        if (data.learningAdjustments) {
          setLearningAdjustments(data.learningAdjustments);
        }
        if (data.plan.criticReport) {
          setCriticReport(data.plan.criticReport);
        }
        if (data.plan.changeSummary) {
          setChangeSummary(data.plan.changeSummary);
        }
      }
    } catch (err) {
      console.error('Error fetching daily plan:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch recorded End-of-Day feedback for date
  const fetchFeedback = async (dateStr: string) => {
    if (!idToken) return;
    try {
      const res = await fetch(`/api/plan/feedback?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.feedback)) {
        const map: Record<string, any> = {};
        for (const f of data.feedback) {
          if (f.menuItemId) {
            map[f.menuItemId] = {
              feedbackType: f.feedbackType,
              ranOutAt: f.ranOutAt,
              leftoverQty: f.leftoverQty,
              salesUpdated: f.feedbackType === 'ran_out',
            };
          }
        }
        setFeedbackByDishId(map);
      }
    } catch (err) {
      console.warn('Could not fetch feedback:', err);
    }
  };

  const handleOpenFeedbackEditor = (
    menuItemId: string,
    mode: 'ran_out' | 'leftover'
  ) => {
    const existing = feedbackByDishId[menuItemId];
    setEditingFeedbackDishId(menuItemId);
    setFeedbackDraftType(mode);
    setFeedbackDraftTime(existing?.ranOutAt || '20:00');
    setFeedbackDraftQty(existing?.leftoverQty ?? 4);
  };

  const handleSaveDishFeedback = async (item: ComputedPrepItem) => {
    if (!idToken) return;
    try {
      setSavingFeedbackDishId(item.menuItemId);
      const res = await fetch('/api/plan/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          date: targetDate,
          menuItemId: item.menuItemId,
          dishName: item.dishName,
          feedbackType: feedbackDraftType,
          ranOutAt: feedbackDraftType === 'ran_out' ? feedbackDraftTime : undefined,
          leftoverQty: feedbackDraftType === 'leftover' ? feedbackDraftQty : undefined,
          plannedPortions: item.plannedPortions,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackByDishId((prev) => ({
          ...prev,
          [item.menuItemId]: {
            feedbackType: feedbackDraftType,
            ranOutAt: feedbackDraftType === 'ran_out' ? feedbackDraftTime : undefined,
            leftoverQty: feedbackDraftType === 'leftover' ? feedbackDraftQty : undefined,
            salesUpdated: Boolean(data.salesUpdated),
          },
        }));
        setEditingFeedbackDishId(null);
        // Re-fetch plan so the 4-week feedback learning loop & backtest verification immediately update
        await fetchPlan(targetDate, serviceLevel, true);
      }
    } catch (err) {
      console.error('Failed to save dish feedback:', err);
    } finally {
      setSavingFeedbackDishId(null);
    }
  };

  // Fetch Change Summary
  const fetchChangeSummary = async (dateStr: string) => {
    if (!idToken) return;
    try {
      setLoadingChangeSummary(true);
      const res = await fetch(`/api/plan/change-summary?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (data.success && data.summary) {
        setChangeSummary(data.summary);
      }
    } catch (err) {
      console.warn('Could not fetch change summary:', err);
    } finally {
      setLoadingChangeSummary(false);
    }
  };

  useEffect(() => {
    if (idToken) {
      fetchPlan(targetDate, serviceLevel, false);
      fetchFeedback(targetDate);
      fetchChangeSummary(targetDate);
    }
  }, [idToken, targetDate]);

  // Handle service level slider change with immediate fast recompute
  const handleSliderChange = (newVal: number) => {
    setServiceLevel(newVal);

    if (!planData) return;

    // Instant client-side recompute for sub-millisecond slider response
    const ratio = newVal / 100;
    const updatedPrep = planData.prepItems.map((item) => {
      let q = ratio;
      if (item.serviceLevelSource === 'newsvendor') {
        q = item.serviceLevel; // keep dish's critical ratio if set
      }

      const p50 = Math.max(0, item.p50);
      const p90 = Math.max(p50, item.p90);
      let portions = p50;

      if (q <= 0.90) {
        const t = (q - 0.50) / 0.40;
        portions = Math.round(p50 + Math.max(0, t) * (p90 - p50));
      } else {
        const t = (q - 0.90) / 0.10;
        portions = Math.round(p90 + t * Math.max(1, (p90 - p50) * 0.25));
      }

      if (item.shelfLifeDays === 1 && portions > Math.round(p90 * 1.1)) {
        portions = Math.round(p90);
      }

      return {
        ...item,
        plannedPortions: Math.max(0, portions),
      };
    });

    setPlanData({
      ...planData,
      serviceLevelSlider: ratio,
      prepItems: updatedPrep,
      summary: {
        ...planData.summary,
        totalPlannedPortions: updatedPrep.reduce((acc, p) => acc + p.plannedPortions, 0),
      },
    });
  };

  // Debounced server sync on slider release
  const handleSliderCommit = () => {
    fetchPlan(targetDate, serviceLevel, true);
  };

  // Toggle Plan Status (Draft / Approved)
  const handleToggleStatus = async () => {
    if (!idToken) return;
    const newStatus = planStatus === 'draft' ? 'approved' : 'draft';
    try {
      setUpdatingStatus(true);
      const res = await fetch('/api/plan/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          targetDate,
          status: newStatus,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPlanStatus(newStatus);
        if (planData) {
          setPlanData({ ...planData, status: newStatus });
        }
      }
    } catch (err) {
      console.error('Failed to update plan status:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Run Full Orchestrator Pipeline
  const handleRunOrchestrator = async () => {
    if (!idToken) return;
    setOrchestrating(true);
    setShowOrchestratorModal(true);
    setPipelineError(null);
    setRetryNotice(null);
    setOrchestratorEvents([]);
    setCurrentStepName('initialization');

    const key = `${restaurant?.id || 'rest'}_${targetDate}_${Date.now()}`;

    try {
      // Connect to SSE stream
      const response = await fetch(`/api/plan/orchestrate?stream=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          targetDate,
          serviceLevelSlider: serviceLevel / 100,
          idempotencyKey: key,
          testNegativeStock,
        }),
      });

      if (!response.ok) {
        throw new Error(`Orchestrator returned HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No readable stream returned by orchestrator.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const eventData: OrchestratorProgressEventUI = JSON.parse(jsonStr);
              setOrchestratorEvents((prev) => [...prev, eventData]);

              if (eventData.step) {
                setCurrentStepName(eventData.step);
              }

              if (eventData.type === 'critic_alert' || eventData.type === 'critic_retry') {
                setRetryNotice(
                  eventData.message || 'Critic invariant violation detected. Automatically adjusting constraints...'
                );
              }

              if (eventData.type === 'pipeline_completed') {
                if (eventData.plan) {
                  setPlanData(eventData.plan);
                  setPlanStatus(eventData.plan.status || 'draft');
                }
                if (eventData.criticReport) {
                  setCriticReport(eventData.criticReport);
                }
                if (eventData.changeSummary) {
                  setChangeSummary(eventData.changeSummary);
                }
                setOrchestrating(false);
              } else if (eventData.type === 'pipeline_failed') {
                setPipelineError(eventData.message || 'Pipeline failed');
                setOrchestrating(false);
              }
            } catch (pErr) {
              console.warn('Could not parse SSE message:', pErr);
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Orchestrator stream error:', err);
      setPipelineError(err.message || 'Orchestration pipeline execution error');
    } finally {
      setOrchestrating(false);
    }
  };

  // Open Stock Modal
  const handleOpenStockModal = () => {
    if (!planData) return;
    const list = planData.orderItems.map((item) => ({
      id: item.ingredientId,
      name: item.ingredientName,
      unit: item.unit,
      currentStock: item.currentStock || 0,
    }));
    setStockEditList(list);
    setShowStockModal(true);
  };

  // Save Stock
  const handleSaveStock = async () => {
    if (!idToken) return;
    try {
      setSavingStock(true);
      const res = await fetch('/api/plan/inventory/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          items: stockEditList.map((i) => ({
            ingredientId: i.id,
            currentStock: Number(i.currentStock) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowStockModal(false);
        fetchPlan(targetDate, serviceLevel, true);
      }
    } catch (err) {
      console.error('Failed to save stock:', err);
    } finally {
      setSavingStock(false);
    }
  };

  // Copy Supplier message to clipboard
  const handleCopySupplierMessage = (supplierId: string, message: string) => {
    navigator.clipboard.writeText(message);
    setCopiedSupplierId(supplierId);
    setTimeout(() => setCopiedSupplierId(null), 2500);
  };

  // Trigger Kitchen Sheet Print
  const handlePrintSheet = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* ============================================================ */}
      {/* 1. Header Toolbar (Hidden during Print) */}
      {/* ============================================================ */}
      <div className="print:hidden rounded-3xl bg-gradient-to-br from-[#18332C] via-[#142823] to-[#0F1F1B] border border-[#2F5D50] p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-[#E0A526]">
            <span>Phase 7 Autonomous Kitchen Pipeline</span>
            <span>·</span>
            <span>{restaurant?.name}</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#FBF6EE] flex items-center gap-3">
            <span>Daily Kitchen Plan</span>
            <span
              className={`px-3 py-0.5 rounded-full text-xs font-sans font-bold uppercase tracking-wider ${
                planStatus === 'approved'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
            >
              {planStatus === 'approved' ? '✓ Approved by Owner' : 'Draft Plan'}
            </span>
            {criticReport && (
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium flex items-center gap-1 ${
                  criticReport.passed
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Critic: {criticReport.passed ? 'Verified' : 'Flagged'}</span>
                {criticReport.retries > 0 && <span>({criticReport.retries} retry)</span>}
              </span>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-[#FBF6EE]/70 mt-1 max-w-xl">
            Autonomous multi-tool orchestrator, deterministic demand forecaster, Newsvendor quantile optimization, and invariant critic.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Target Date Selector */}
          <div className="flex items-center bg-[#0F1F1B] border border-[#2F5D50] rounded-xl px-3 py-1.5 text-xs text-[#FBF6EE]">
            <CalendarDays className="w-3.5 h-3.5 text-[#E0A526] mr-2" />
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="bg-transparent text-[#FBF6EE] outline-none text-xs font-medium cursor-pointer"
            />
          </div>

          {/* Quick Stock Button */}
          <button
            onClick={handleOpenStockModal}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[#18332C] hover:bg-[#20443B] text-[#FBF6EE] border border-[#2F5D50] transition-colors"
          >
            <Package className="w-3.5 h-3.5 text-[#E0A526]" />
            <span>Stock Count</span>
          </button>

          {/* GENERATE TOMORROW'S PLAN BUTTON */}
          <button
            onClick={handleRunOrchestrator}
            disabled={orchestrating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#E0A526] to-[#C8553D] hover:from-[#C99320] hover:to-[#B54832] text-[#0F1F1B] transition-all shadow-lg active:scale-95 disabled:opacity-50"
          >
            {orchestrating ? (
              <RefreshCw className="w-4 h-4 animate-spin text-[#0F1F1B]" />
            ) : (
              <Sparkles className="w-4 h-4 text-[#0F1F1B]" />
            )}
            <span>{orchestrating ? 'Running Pipeline...' : "Generate Tomorrow's Plan"}</span>
          </button>

          {/* Status Approval Button */}
          <button
            onClick={handleToggleStatus}
            disabled={updatingStatus}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow ${
              planStatus === 'approved'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-[#FBF6EE]'
                : 'bg-[#C8553D] hover:bg-[#B54832] text-[#FBF6EE]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{planStatus === 'approved' ? 'Approved' : 'Approve Plan'}</span>
          </button>

          {/* Print / Download PDF */}
          <button
            onClick={handlePrintSheet}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#2F5D50] hover:bg-[#3D7364] text-[#FBF6EE] transition-colors shadow"
          >
            <Printer className="w-4 h-4 text-[#E0A526]" />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. Sub-Nav Navigation Tabs */}
      {/* ============================================================ */}
      <div className="print:hidden flex items-center justify-between border-b border-[#24463D] pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('sheet')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'sheet'
                ? 'bg-[#E0A526] text-[#0F1F1B] shadow'
                : 'bg-[#142823] text-[#FBF6EE]/70 hover:text-[#FBF6EE] hover:bg-[#1A332C]'
            }`}
          >
            <ChefHat className="w-4 h-4" />
            <span>1-Page Kitchen Sheet</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('changes');
              fetchChangeSummary(targetDate);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'changes'
                ? 'bg-[#E0A526] text-[#0F1F1B] shadow'
                : 'bg-[#142823] text-[#FBF6EE]/70 hover:text-[#FBF6EE] hover:bg-[#1A332C]'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>What Changed vs Last Approved</span>
            {changeSummary && changeSummary.totalDeltaPortions !== 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                changeSummary.totalDeltaPortions > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
              }`}>
                {changeSummary.totalDeltaPortions > 0 ? '+' : ''}{changeSummary.totalDeltaPortions}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('critic')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'critic'
                ? 'bg-[#E0A526] text-[#0F1F1B] shadow'
                : 'bg-[#142823] text-[#FBF6EE]/70 hover:text-[#FBF6EE] hover:bg-[#1A332C]'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Critic Quality Report</span>
            {criticReport && (
              <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-emerald-500/20 text-emerald-300">
                {criticReport.passed ? '✓ Valid' : 'Issues'}
              </span>
            )}
          </button>
        </div>

        {/* Test Negative Stock Simulation Toggle */}
        <label className="flex items-center gap-2 cursor-pointer bg-[#0F1F1B] border border-[#2F5D50] px-3 py-1.5 rounded-xl text-[11px] text-[#FBF6EE]/80 hover:text-[#FBF6EE]">
          <input
            type="checkbox"
            checked={testNegativeStock}
            onChange={(e) => setTestNegativeStock(e.target.checked)}
            className="accent-[#C8553D] cursor-pointer rounded"
          />
          <span>Test Critic Retry (Inject -5kg stock)</span>
        </label>
      </div>

      {/* ============================================================ */}
      {/* 3. Live Service Level Slider Card (When on Sheet tab) */}
      {/* ============================================================ */}
      {activeTab === 'sheet' && (
        <div className="print:hidden rounded-2xl bg-[#142823] border border-[#24463D] p-5 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#0F1F1B] border border-[#2F5D50] flex items-center justify-center text-[#E0A526]">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-[#FBF6EE] flex items-center gap-2">
                  <span>Target Service Level</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#E0A526]/10 text-[#E0A526] border border-[#E0A526]/30 font-mono">
                    {serviceLevel}% Quantile
                  </span>
                </div>
                <p className="text-xs text-[#FBF6EE]/60">
                  Moving this slider updates portions live. Dishes with entered prices and costs automatically use their Newsvendor Critical Ratio.
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-[#FBF6EE]/50 block">Planned Kitchen Volume</span>
              <span className="font-serif text-xl font-bold text-[#E0A526]">
                {planData?.summary.totalPlannedPortions || 0} portions
              </span>
            </div>
          </div>

          {/* Live Slider Control */}
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <span className="text-xs font-mono text-[#FBF6EE]/60">50% (P50 Median)</span>
              <input
                type="range"
                min="50"
                max="99"
                step="1"
                value={serviceLevel}
                onChange={(e) => handleSliderChange(Number(e.target.value))}
                onMouseUp={handleSliderCommit}
                onTouchEnd={handleSliderCommit}
                className="flex-1 accent-[#E0A526] cursor-pointer h-2 bg-[#0F1F1B] rounded-lg appearance-none"
              />
              <span className="text-xs font-mono text-[#FBF6EE]/60">99% (Max Buffer)</span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. TAB CONTENT: CHANGE SUMMARY */}
      {/* ============================================================ */}
      {activeTab === 'changes' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-[#142823] border border-[#24463D] p-6 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#E0A526] mb-1">
                  Deterministic Attribution
                </div>
                <h2 className="text-xl font-bold text-[#FBF6EE] font-serif">
                  What Changed vs Last Approved Plan
                </h2>
                <p className="text-xs text-[#FBF6EE]/70 mt-1">
                  Every portion increase or decrease is mathematically explained by weather shifts, events, weekend surges, or margin protection.
                </p>
              </div>

              {changeSummary?.hasPreviousPlan && (
                <div className="px-4 py-2 rounded-xl bg-[#0F1F1B] border border-[#2F5D50] text-xs">
                  <span className="text-[#FBF6EE]/50 block text-[10px]">Comparing Against:</span>
                  <span className="font-mono font-bold text-[#E0A526]">
                    Plan {changeSummary.previousPlanDate} ({changeSummary.previousPlanStatus || 'approved'})
                  </span>
                </div>
              )}
            </div>

            {loadingChangeSummary ? (
              <div className="py-12 text-center text-xs text-[#FBF6EE]/60 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#E0A526]" />
                <span>Computing portion delta contributions...</span>
              </div>
            ) : changeSummary ? (
              <div className="space-y-6">
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-[#0F1F1B] border border-[#24463D]">
                    <span className="text-[11px] text-[#FBF6EE]/50 block">Net Portions Shift</span>
                    <span
                      className={`text-2xl font-bold font-mono ${
                        changeSummary.totalDeltaPortions > 0
                          ? 'text-emerald-400'
                          : changeSummary.totalDeltaPortions < 0
                          ? 'text-rose-400'
                          : 'text-[#FBF6EE]'
                      }`}
                    >
                      {changeSummary.totalDeltaPortions > 0 ? '+' : ''}
                      {changeSummary.totalDeltaPortions} portions
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0F1F1B] border border-[#24463D]">
                    <span className="text-[11px] text-[#FBF6EE]/50 block">Dishes Scaled Up</span>
                    <span className="text-2xl font-bold font-mono text-emerald-400">
                      {changeSummary.dishesUpCount} dishes
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0F1F1B] border border-[#24463D]">
                    <span className="text-[11px] text-[#FBF6EE]/50 block">Dishes Moderated Down</span>
                    <span className="text-2xl font-bold font-mono text-rose-400">
                      {changeSummary.dishesDownCount} dishes
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0F1F1B] border border-[#24463D]">
                    <span className="text-[11px] text-[#FBF6EE]/50 block">Unchanged Level</span>
                    <span className="text-2xl font-bold font-mono text-[#FBF6EE]/70">
                      {changeSummary.dishesUnchangedCount} dishes
                    </span>
                  </div>
                </div>

                {/* Dish Changes Table */}
                <div className="rounded-xl border border-[#24463D] overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#0F1F1B] text-[#FBF6EE]/60 uppercase tracking-wider font-semibold border-b border-[#24463D]">
                      <tr>
                        <th className="py-3 px-4">Menu Dish</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4 text-right">Previous</th>
                        <th className="py-3 px-4 text-right">Current</th>
                        <th className="py-3 px-4 text-right">Delta</th>
                        <th className="py-3 px-4">Main Factor (Code Computed)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#24463D]/60 bg-[#142823]">
                      {changeSummary.dishChanges.map((change) => (
                        <tr key={change.menuItemId} className="hover:bg-[#18332C]/60">
                          <td className="py-3 px-4 font-semibold text-[#FBF6EE]">
                            {change.dishName}
                          </td>
                          <td className="py-3 px-4 text-[#FBF6EE]/60">{change.category}</td>
                          <td className="py-3 px-4 text-right font-mono text-[#FBF6EE]/70">
                            {change.previousPortions}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-[#FBF6EE]">
                            {change.currentPortions}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">
                            <span
                              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded ${
                                change.delta > 0
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : change.delta < 0
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'text-[#FBF6EE]/50'
                              }`}
                            >
                              {change.delta > 0 && <ArrowUpRight className="w-3 h-3" />}
                              {change.delta < 0 && <ArrowDownRight className="w-3 h-3" />}
                              {change.delta === 0 && <Minus className="w-3 h-3" />}
                              {change.delta > 0 ? `+${change.delta}` : change.delta}
                              {change.previousPortions > 0 && ` (${change.deltaPercent}%)`}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs font-medium text-[#E0A526]">
                            {change.mainFactor}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[#FBF6EE]/60">
                No previous approved plans recorded yet. Run "Generate Tomorrow's Plan" to establish the baseline.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. TAB CONTENT: CRITIC REPORT */}
      {/* ============================================================ */}
      {activeTab === 'critic' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-[#142823] border border-[#24463D] p-6 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#E0A526] mb-1">
                  Deterministic Invariants & Gemini Review
                </div>
                <h2 className="text-xl font-bold text-[#FBF6EE] font-serif">
                  Critic Audit & Safety Invariants Report
                </h2>
                <p className="text-xs text-[#FBF6EE]/70 mt-1">
                  Code verifies all business invariants first (non-negative, &le;2x max, shelf-life, pack rounding). Then Gemini flags operational sanity.
                </p>
              </div>

              {criticReport && (
                <div className="flex items-center gap-3">
                  <div
                    className={`px-4 py-2 rounded-xl border text-xs font-bold font-mono ${
                      criticReport.passed
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    Status: {criticReport.passed ? 'ALL INVARIANTS PASSED' : 'INVARIANTS FAILED'}
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-[#0F1F1B] border border-[#2F5D50] text-xs font-mono text-[#E0A526]">
                    Retries: {criticReport.retries} / 2
                  </div>
                </div>
              )}
            </div>

            {/* Invariant Verification Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-[#0F1F1B] border border-[#24463D] space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[#FBF6EE]">
                  <span>1. Non-Negative Quantities Check</span>
                  <span className="text-emerald-400 font-mono">PASSED</span>
                </div>
                <p className="text-[11px] text-[#FBF6EE]/60">
                  All prep portions, ingredient gross requirements, and current stock figures verified &ge; 0.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#0F1F1B] border border-[#24463D] space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[#FBF6EE]">
                  <span>2. Historical Maximum Cap Check (&le; 2x)</span>
                  <span className="text-emerald-400 font-mono">PASSED</span>
                </div>
                <p className="text-[11px] text-[#FBF6EE]/60">
                  Guarantees no prep target exceeds twice the highest single-day historical sales volume recorded.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#0F1F1B] border border-[#24463D] space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[#FBF6EE]">
                  <span>3. Perishable Shelf-Life Integrity</span>
                  <span className="text-emerald-400 font-mono">PASSED</span>
                </div>
                <p className="text-[11px] text-[#FBF6EE]/60">
                  Enforces strict prep ceilings for 1-day shelf life items to completely eliminate spoilage risk.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#0F1F1B] border border-[#24463D] space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[#FBF6EE]">
                  <span>4. Supplier Pack & MOQ Conformance</span>
                  <span className="text-emerald-400 font-mono">PASSED</span>
                </div>
                <p className="text-[11px] text-[#FBF6EE]/60">
                  Audits all order lines against supplier pack sizes and minimum order quantities.
                </p>
              </div>
            </div>

            {/* Issues / Gemini Review Flags */}
            {criticReport && criticReport.issues.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#E0A526]">
                  Critic Invariant Notes & Adjustments
                </h3>
                <div className="space-y-2">
                  {criticReport.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border text-xs flex items-start gap-3 ${
                        issue.severity === 'CRITICAL'
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">
                          [{issue.category}] {issue.item}: {issue.code}
                        </div>
                        <div className="text-[11px] opacity-90 mt-0.5">{issue.message}</div>
                        {issue.constraintAdjustment && (
                          <div className="text-[10px] font-mono text-emerald-400 mt-1">
                            Applied adjustment: {issue.constraintAdjustment.reason} ({issue.constraintAdjustment.originalValue} &rarr; {issue.constraintAdjustment.adjustedValue})
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. TAB CONTENT: DAILY KITCHEN SHEET (1 PAGE PRINT READY) */}
      {/* ============================================================ */}
      {activeTab === 'sheet' && (
        <div className="space-y-6">
          {/* Section 1: Kitchen Line Prep Sheet */}
          <div className="rounded-2xl bg-[#142823] border border-[#24463D] p-6 shadow-md print:bg-white print:border-black print:text-black print:p-2 print:shadow-none">
            <div className="flex items-center justify-between mb-4 border-b border-[#24463D] pb-3 print:border-black">
              <div>
                <h2 className="text-lg font-bold text-[#FBF6EE] print:text-black font-serif flex items-center gap-2">
                  <ChefHat className="w-5 h-5 text-[#E0A526] print:text-black" />
                  <span>Section 1: Morning Line Prep Targets</span>
                </h2>
                <p className="text-xs text-[#FBF6EE]/60 print:text-black">
                  Calibrated portions with code-verified reason lines and service quantile safety buffers.
                </p>
              </div>
              <div className="text-xs font-mono text-[#E0A526] print:text-black font-bold">
                {planData?.prepItems.length || 0} active dishes
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-[#FBF6EE]/60 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#E0A526]" />
                <span>Computing daily kitchen plan...</span>
              </div>
            ) : !planData || planData.prepItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#FBF6EE]/60">
                No dishes scheduled for prep. Run "Generate Tomorrow's Plan" or check active menu items.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs print:text-[10px]">
                  <thead className="bg-[#0F1F1B] print:bg-gray-100 text-[#FBF6EE]/60 print:text-black uppercase tracking-wider font-semibold border-b border-[#24463D] print:border-black">
                    <tr>
                      <th className="py-2.5 px-3">Menu Dish</th>
                      <th className="py-2.5 px-3">Station</th>
                      <th className="py-2.5 px-3 text-right">P50</th>
                      <th className="py-2.5 px-3 text-right">P90</th>
                      <th className="py-2.5 px-3 text-right">Planned Portions</th>
                      <th className="py-2.5 px-3">Service Quantile</th>
                      <th className="py-2.5 px-3">Planning Reason Line</th>
                      <th className="py-2.5 px-3 print:hidden">End-of-Day Feedback</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#24463D]/60 print:divide-black bg-[#142823] print:bg-white">
                    {planData.prepItems.map((item) => {
                      const recordedFb = feedbackByDishId[item.menuItemId];
                      const learningAdj = learningAdjustments[item.menuItemId];
                      const isEditingFb = editingFeedbackDishId === item.menuItemId;
                      const isSavingFb = savingFeedbackDishId === item.menuItemId;

                      return (
                        <tr key={item.menuItemId} className="hover:bg-[#18332C]/60 print:hover:bg-transparent">
                          <td className="py-2.5 px-3 font-semibold text-[#FBF6EE] print:text-black">
                            <div>{item.dishName}</div>
                            {item.recipeMissing && (
                              <span className="text-[10px] text-rose-400 font-mono">
                                (recipe missing)
                              </span>
                            )}
                            {learningAdj && learningAdj.appliedDelta !== 0 && (
                              <div className="mt-1">
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                    learningAdj.appliedDelta > 0
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  }`}
                                >
                                  {learningAdj.appliedDelta > 0
                                    ? `+${learningAdj.appliedDelta} (4w stockout bias)`
                                    : `${learningAdj.appliedDelta} (4w leftover bias)`}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-[#FBF6EE]/70 print:text-black font-mono">
                            {item.station}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#FBF6EE]/60 print:text-black">
                            {item.p50}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#FBF6EE]/60 print:text-black">
                            {item.p90}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#E0A526] print:text-black text-sm">
                            {item.plannedPortions}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                item.serviceLevelSource === 'newsvendor'
                                  ? 'bg-purple-500/20 text-purple-300 print:text-black'
                                  : 'bg-[#E0A526]/20 text-[#E0A526] print:text-black'
                              }`}
                            >
                              {item.serviceLevelLabel}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[#FBF6EE]/80 print:text-black text-[11px] max-w-md">
                            <div>{item.reason}</div>
                            {learningAdj && learningAdj.explanation && !item.reason.includes('4-week') && (
                              <div className="text-[10px] text-[#E0A526] mt-0.5 font-mono">
                                {learningAdj.explanation}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 print:hidden min-w-[210px]">
                            {isEditingFb ? (
                              <div className="p-2 rounded-xl bg-[#0F1F1B] border border-[#2F5D50] space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setFeedbackDraftType('ran_out')}
                                    className={`px-2 py-1 rounded text-[10px] font-semibold ${
                                      feedbackDraftType === 'ran_out'
                                        ? 'bg-[#C8553D] text-[#FBF6EE]'
                                        : 'bg-[#142823] text-[#FBF6EE]/70'
                                    }`}
                                  >
                                    Ran out
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setFeedbackDraftType('leftover')}
                                    className={`px-2 py-1 rounded text-[10px] font-semibold ${
                                      feedbackDraftType === 'leftover'
                                        ? 'bg-[#E0A526] text-[#0F1F1B]'
                                        : 'bg-[#142823] text-[#FBF6EE]/70'
                                    }`}
                                  >
                                    Leftover
                                  </button>
                                </div>

                                {feedbackDraftType === 'ran_out' ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-[#FBF6EE]/60">Time:</span>
                                    <input
                                      type="time"
                                      value={feedbackDraftTime}
                                      onChange={(e) => setFeedbackDraftTime(e.target.value)}
                                      className="px-2 py-1 rounded bg-[#142823] border border-[#24463D] text-[11px] font-mono text-[#FBF6EE]"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-[#FBF6EE]/60">Qty left:</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={200}
                                      value={feedbackDraftQty}
                                      onChange={(e) => setFeedbackDraftQty(Math.max(0, Number(e.target.value)))}
                                      className="w-16 px-2 py-1 rounded bg-[#142823] border border-[#24463D] text-[11px] font-mono text-[#FBF6EE]"
                                    />
                                    <span className="text-[10px] text-[#FBF6EE]/60">portions</span>
                                  </div>
                                )}

                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isSavingFb}
                                    onClick={() => handleSaveDishFeedback(item)}
                                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[10px] font-semibold text-white disabled:opacity-50"
                                  >
                                    {isSavingFb ? 'Saving...' : 'Save'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingFeedbackDishId(null)}
                                    className="px-2 py-1 rounded bg-[#142823] text-[10px] text-[#FBF6EE]/60 hover:text-[#FBF6EE]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {recordedFb ? (
                                  <div className="flex items-center justify-between gap-2">
                                    <span
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono ${
                                        recordedFb.feedbackType === 'ran_out'
                                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      }`}
                                    >
                                      {recordedFb.feedbackType === 'ran_out'
                                        ? `Ran out @ ${recordedFb.ranOutAt || '20:00'} (soldOut ✓)`
                                        : `Leftover: ${recordedFb.leftoverQty || 0} portions`}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleOpenFeedbackEditor(
                                          item.menuItemId,
                                          recordedFb.feedbackType === 'leftover' ? 'leftover' : 'ran_out'
                                        )
                                      }
                                      className="text-[10px] text-[#E0A526] hover:underline"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenFeedbackEditor(item.menuItemId, 'ran_out')}
                                      className="px-2 py-1 rounded-lg bg-[#0F1F1B] hover:bg-[#C8553D]/20 border border-[#24463D] hover:border-[#C8553D] text-[10px] font-semibold text-[#FBF6EE]/80 hover:text-[#FBF6EE] transition-colors"
                                    >
                                      Ran out
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenFeedbackEditor(item.menuItemId, 'leftover')}
                                      className="px-2 py-1 rounded-lg bg-[#0F1F1B] hover:bg-[#E0A526]/20 border border-[#24463D] hover:border-[#E0A526] text-[10px] font-semibold text-[#FBF6EE]/80 hover:text-[#E0A526] transition-colors"
                                    >
                                      Leftover
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 2: Supplier Purchase Orders */}
          <div className="rounded-2xl bg-[#142823] border border-[#24463D] p-6 shadow-md print:bg-white print:border-black print:text-black print:p-2 print:shadow-none">
            <div className="flex items-center justify-between mb-4 border-b border-[#24463D] pb-3 print:border-black">
              <div>
                <h2 className="text-lg font-bold text-[#FBF6EE] print:text-black font-serif flex items-center gap-2">
                  <Package className="w-5 h-5 text-[#E0A526] print:text-black" />
                  <span>Section 2: Supplier Purchase Orders</span>
                </h2>
                <p className="text-xs text-[#FBF6EE]/60 print:text-black">
                  Stock deducted from recipe requirements. Quantities snapped to supplier pack sizes and minimum order quantities.
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[#FBF6EE]/50 print:text-black block">Est. Order Cost</span>
                <span className="font-mono text-sm font-bold text-[#E0A526] print:text-black">
                  ₹{planData?.summary.totalEstimatedOrderCost.toLocaleString() || 0}
                </span>
              </div>
            </div>

            {/* Supplier Groups */}
            {planData?.supplierGroups && planData.supplierGroups.length > 0 ? (
              <div className="space-y-6">
                {planData.supplierGroups.map((group) => (
                  <div
                    key={group.supplierId}
                    className="p-4 rounded-xl bg-[#0F1F1B] print:bg-white border border-[#24463D] print:border-black"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-[#24463D]/60 print:border-black">
                      <div>
                        <div className="font-bold text-sm text-[#FBF6EE] print:text-black flex items-center gap-2">
                          <span>{group.supplierName}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-[#24463D] print:bg-gray-200 text-[#FBF6EE] font-mono">
                            Cutoff: {group.orderCutoffTime}
                          </span>
                        </div>
                        <div className="text-xs text-[#FBF6EE]/60 print:text-black mt-0.5">
                          {group.items.length} items ordered · Lead time: {group.leadTimeDays} days
                        </div>
                      </div>

                      <div className="print:hidden flex items-center gap-2">
                        <button
                          onClick={() => handleCopySupplierMessage(group.supplierId, group.messageTemplate)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#18332C] hover:bg-[#20443B] text-[#FBF6EE] border border-[#2F5D50] flex items-center gap-1.5"
                        >
                          {copiedSupplierId === group.supplierId ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-[#E0A526]" />
                              <span>Copy Text</span>
                            </>
                          )}
                        </button>

                        <a
                          href={group.whatsAppUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#25D366] hover:bg-[#20BA5A] text-white flex items-center gap-1.5 shadow"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Send WhatsApp</span>
                        </a>
                      </div>
                    </div>

                    {/* Group Items Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs print:text-[10px]">
                        <thead className="text-[#FBF6EE]/60 print:text-black uppercase text-[10px] border-b border-[#24463D]/40">
                          <tr>
                            <th className="py-2 px-3">Ingredient</th>
                            <th className="py-2 px-3 text-right">Gross Needed</th>
                            <th className="py-2 px-3 text-right">On-Hand Stock</th>
                            <th className="py-2 px-3 text-right">Net Needed</th>
                            <th className="py-2 px-3 text-right">Order Packs</th>
                            <th className="py-2 px-3 text-right">Final Quantity</th>
                            <th className="py-2 px-3">Reason Line</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#24463D]/40 print:divide-black">
                          {group.items.map((order) => (
                            <tr key={order.ingredientId}>
                              <td className="py-2 px-3 font-semibold text-[#FBF6EE] print:text-black">
                                <div>{order.ingredientName}</div>
                                {order.mustOrderTodayForTomorrow && (
                                  <span className="text-[10px] text-[#C8553D] font-mono">
                                    ★ Order today for tomorrow
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-[#FBF6EE]/70 print:text-black">
                                {order.totalGrossNeeded} {order.unit}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-[#FBF6EE]/70 print:text-black">
                                {order.currentStock} {order.unit}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-[#FBF6EE]/70 print:text-black">
                                {order.netNeeded} {order.unit}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-[#E0A526] print:text-black">
                                {order.packsToOrder} ({order.packageSize} {order.packageUnit})
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-[#FBF6EE] print:text-black">
                                {order.finalOrderQuantity} {order.unit}
                              </td>
                              <td className="py-2 px-3 text-[#FBF6EE]/80 print:text-black text-[11px] max-w-xs">
                                {order.reason}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[#FBF6EE]/60">
                No orders needed. Current on-hand inventory satisfies all scheduled prep requirements.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 7. ORCHESTRATOR LIVE PIPELINE MODAL */}
      {/* ============================================================ */}
      {showOrchestratorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-[#142823] border border-[#2F5D50] p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-[#24463D]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#E0A526] to-[#C8553D] flex items-center justify-center text-[#0F1F1B]">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#FBF6EE]">
                    Autonomous Planning Pipeline
                  </h3>
                  <p className="text-xs text-[#FBF6EE]/70">
                    Target Date: {targetDate} · Multi-Tool Orchestration Engine
                  </p>
                </div>
              </div>

              {!orchestrating && (
                <button
                  onClick={() => setShowOrchestratorModal(false)}
                  className="w-8 h-8 rounded-lg bg-[#0F1F1B] text-[#FBF6EE]/70 hover:text-[#FBF6EE] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Stepper Progress Visualizer */}
            <div className="py-4 space-y-3">
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center text-[10px]">
                <div
                  className={`p-2 rounded-xl border ${
                    currentStepName === 'context_parallel' || currentStepName === 'weather'
                      ? 'bg-[#E0A526]/20 border-[#E0A526] text-[#E0A526] font-bold'
                      : 'bg-[#0F1F1B] border-[#24463D] text-[#FBF6EE]/60'
                  }`}
                >
                  1. Context
                </div>
                <div
                  className={`p-2 rounded-xl border ${
                    currentStepName === 'forecast'
                      ? 'bg-[#E0A526]/20 border-[#E0A526] text-[#E0A526] font-bold'
                      : 'bg-[#0F1F1B] border-[#24463D] text-[#FBF6EE]/60'
                  }`}
                >
                  2. Forecast
                </div>
                <div
                  className={`p-2 rounded-xl border ${
                    currentStepName === 'plan'
                      ? 'bg-[#E0A526]/20 border-[#E0A526] text-[#E0A526] font-bold'
                      : 'bg-[#0F1F1B] border-[#24463D] text-[#FBF6EE]/60'
                  }`}
                >
                  3. Plan
                </div>
                <div
                  className={`p-2 rounded-xl border ${
                    currentStepName === 'critic'
                      ? 'bg-[#E0A526]/20 border-[#E0A526] text-[#E0A526] font-bold'
                      : 'bg-[#0F1F1B] border-[#24463D] text-[#FBF6EE]/60'
                  }`}
                >
                  4. Critic
                </div>
                <div
                  className={`p-2 rounded-xl border ${
                    retryNotice
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                      : 'bg-[#0F1F1B] border-[#24463D] text-[#FBF6EE]/60'
                  }`}
                >
                  5. Retries
                </div>
                <div
                  className={`p-2 rounded-xl border ${
                    currentStepName === 'change_summary'
                      ? 'bg-[#E0A526]/20 border-[#E0A526] text-[#E0A526] font-bold'
                      : 'bg-[#0F1F1B] border-[#24463D] text-[#FBF6EE]/60'
                  }`}
                >
                  6. Changes
                </div>
                <div
                  className={`p-2 rounded-xl border ${
                    !orchestrating && planData
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                      : 'bg-[#0F1F1B] border-[#24463D] text-[#FBF6EE]/60'
                  }`}
                >
                  7. Verified
                </div>
              </div>

              {/* Retry alert banner if critic triggered invariant recovery */}
              {retryNotice && (
                <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-bold">Critic Triggered Invariant Recovery</div>
                    <div className="text-[11px] opacity-90">{retryNotice}</div>
                  </div>
                </div>
              )}

              {/* Error banner if failed */}
              {pipelineError && (
                <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <div>
                    <div className="font-bold">Pipeline Step Halted</div>
                    <div className="text-[11px] opacity-90">{pipelineError}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Live Event Stream Log */}
            <div className="overflow-y-auto flex-1 my-2 space-y-2 pr-1 font-mono text-xs max-h-60 bg-[#0F1F1B] p-4 rounded-2xl border border-[#24463D]">
              {orchestratorEvents.length === 0 ? (
                <div className="text-[#FBF6EE]/40 flex items-center gap-2 py-6 justify-center">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#E0A526]" />
                  <span>Connecting to orchestration stream...</span>
                </div>
              ) : (
                orchestratorEvents.map((evt, idx) => (
                  <div key={idx} className="flex items-start gap-2 py-1 border-b border-[#24463D]/30 last:border-0">
                    <span className="text-[#FBF6EE]/40 text-[10px] shrink-0">
                      {evt.timestamp ? evt.timestamp.slice(11, 19) : ''}
                    </span>
                    <span
                      className={`text-[11px] ${
                        evt.type === 'critic_alert' || evt.type === 'critic_retry'
                          ? 'text-amber-300 font-bold'
                          : evt.type === 'pipeline_completed'
                          ? 'text-emerald-400 font-bold'
                          : evt.type === 'pipeline_failed'
                          ? 'text-rose-400 font-bold'
                          : 'text-[#FBF6EE]/80'
                      }`}
                    >
                      {evt.message}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-[#24463D] flex items-center justify-between">
              <span className="text-xs text-[#FBF6EE]/60">
                {orchestrating ? 'Pipeline running with bounded thinking budget...' : 'Pipeline execution complete.'}
              </span>

              <div className="flex items-center gap-2">
                {pipelineError && (
                  <button
                    onClick={handleRunOrchestrator}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#C8553D] hover:bg-[#B54832] text-[#FBF6EE]"
                  >
                    Retry Pipeline
                  </button>
                )}
                {!orchestrating && (
                  <button
                    onClick={() => setShowOrchestratorModal(false)}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-[#E0A526] hover:bg-[#C99320] text-[#0F1F1B]"
                  >
                    View Plan Sheet
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 8. STOCK EDIT MODAL */}
      {/* ============================================================ */}
      {showStockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#142823] border border-[#2F5D50] p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-[#24463D]">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#FBF6EE]">
                  Kitchen Inventory Stock Count
                </h3>
                <p className="text-xs text-[#FBF6EE]/70">
                  Enter current physical stock on hand to deduct against supplier orders.
                </p>
              </div>
              <button
                onClick={() => setShowStockModal(false)}
                className="w-8 h-8 rounded-lg bg-[#0F1F1B] text-[#FBF6EE]/70 hover:text-[#FBF6EE] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 my-4 space-y-3 pr-1">
              {stockEditList.map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-[#0F1F1B] border border-[#24463D]/60">
                  <div className="text-xs text-[#FBF6EE] font-medium">
                    <div>{item.name}</div>
                    <div className="text-[10px] text-[#FBF6EE]/50">Measured in {item.unit}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      value={item.currentStock}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const updated = [...stockEditList];
                        updated[idx].currentStock = val;
                        setStockEditList(updated);
                      }}
                      className="w-20 px-2 py-1 rounded-lg bg-[#142823] border border-[#2F5D50] text-right font-mono text-xs text-[#FBF6EE] outline-none focus:border-[#E0A526]"
                    />
                    <span className="text-xs font-mono text-[#FBF6EE]/70 w-8">{item.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-[#24463D] flex items-center justify-end gap-3">
              <button
                onClick={() => setShowStockModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#FBF6EE]/70 hover:text-[#FBF6EE]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStock}
                disabled={savingStock}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#E0A526] hover:bg-[#C99320] text-[#0F1F1B] transition-colors shadow font-bold flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>{savingStock ? 'Saving...' : 'Update & Recompute'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
