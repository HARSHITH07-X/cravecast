import React, { useState, useEffect } from 'react';
import {
  Download,
  Trash2,
  Shield,
  AlertTriangle,
  Building2,
  Clock,
  Globe,
  Check,
  Cpu,
  RefreshCw,
  Zap,
  Database,
} from 'lucide-react';
import { useAuth } from '../lib/authContext';

interface FeatureUsageMetric {
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  cachedTokens: number;
  calls: number;
}

interface TokenUsageSummary {
  date: string;
  dailyBudget: number;
  totalTokens: number;
  remainingTokens: number;
  budgetExceeded: boolean;
  contextCacheActiveCount: number;
  features: Record<string, FeatureUsageMetric>;
}

const FEATURE_LABELS: Record<string, string> = {
  ask_cravecast_triage: 'Ask CraveCast · Triage Router',
  ask_cravecast_explain: 'Ask CraveCast · Grounded Explainer',
  ask_cravecast_what_if: 'Ask CraveCast · What-If Simulator',
  feedback_parsing: 'End-of-Day Feedback Parser',
  sales_ingest_parsing: 'Voice / Text Sales Ingest',
  sales_csv_mapping: 'POS CSV Column Auto-Mapper',
  sales_photo_ocr: 'Multimodal Ledger / Bill OCR',
  sales_voice_quick_entry: 'Multilingual Voice Quick Entry',
  menu_tag_suggestions: 'Culinary Tag Proposals',
  recipe_parsing: 'Multimodal Recipe Card Parser',
  customer_mood_chat: 'Public Customer Mood Concierge',
  agent_triage: 'Agent Run · Triage',
  agent_explainer: 'Agent Run · Explainer',
  agent_what_if: 'Agent Run · What-If',
  agent_orchestrator: 'Agent Run · Daily Plan Orchestrator',
  agent_critic: 'Agent Run · Critic Verification',
};

interface SettingsViewProps {
  onNavigateHome?: () => void;
  onNavigatePrivacy?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = () => {
  const { restaurant, idToken, signOut } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Token usage & budget state
  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [budgetInput, setBudgetInput] = useState<number>(250000);
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetSaved, setBudgetSaved] = useState(false);

  const fetchTokenUsage = async () => {
    if (!idToken) return;
    try {
      setLoadingUsage(true);
      const res = await fetch('/api/restaurant/token-usage', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (data.success && data.usage) {
        setTokenUsage(data.usage);
        setBudgetInput(data.usage.dailyBudget || 250000);
      }
    } catch (err) {
      console.warn('Could not load token usage:', err);
    } finally {
      setLoadingUsage(false);
    }
  };

  useEffect(() => {
    if (idToken) {
      fetchTokenUsage();
    }
  }, [idToken]);

  const handleSaveBudget = async () => {
    if (!idToken) return;
    try {
      setSavingBudget(true);
      setBudgetSaved(false);
      const res = await fetch('/api/restaurant/token-budget', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ dailyTokenBudget: budgetInput }),
      });
      const data = await res.json();
      if (data.success) {
        setBudgetSaved(true);
        await fetchTokenUsage();
        setTimeout(() => setBudgetSaved(false), 2500);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update daily token budget');
    } finally {
      setSavingBudget(false);
    }
  };

  const handleExportData = async () => {
    if (!idToken) return;
    setExporting(true);
    setError(null);
    try {
      const res = await fetch('/api/restaurant/export-data', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (!res.ok) throw new Error('Failed to export data');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cravecast-export-${restaurant?.id || 'data'}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setExportDone(true);
      setTimeout(() => setExportDone(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Error exporting data');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!idToken || confirmDeleteText !== 'DELETE') return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch('/api/restaurant/delete-account', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (!res.ok) throw new Error('Failed to delete account data');
      await signOut();
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Error deleting account');
      setDeleting(false);
    }
  };

  const featureEntries = Object.entries(tokenUsage?.features || {}).sort(
    (a, b) => b[1].totalTokens - a[1].totalTokens
  );
  const totalCachedTokens = featureEntries.reduce((acc, [, m]) => acc + (m.cachedTokens || 0), 0);
  const usagePercent = tokenUsage
    ? Math.min(100, Math.round((tokenUsage.totalTokens / Math.max(1, tokenUsage.dailyBudget)) * 100))
    : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#FBF6EE]">
          Restaurant Settings & Data Ownership
        </h1>
        <p className="text-sm text-[#FBF6EE]/70 mt-1">
          View your configured profile, monitor AI token usage per feature, export your operational archive, or permanently purge your data.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-[#C8553D]/20 border border-[#C8553D] text-sm text-[#FBF6EE]">
          {error}
        </div>
      )}

      {/* Restaurant Profile Summary */}
      <div className="rounded-2xl bg-[#142823] border border-[#24463D] p-6 space-y-5">
        <div className="flex items-center gap-3 border-b border-[#24463D] pb-4">
          <Building2 className="w-5 h-5 text-[#E0A526]" />
          <h2 className="font-serif text-lg font-bold text-[#FBF6EE]">
            Restaurant Configuration
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
          <div>
            <span className="text-xs uppercase tracking-wider text-[#FBF6EE]/50 block">Restaurant Name</span>
            <span className="font-semibold text-[#FBF6EE] mt-1 block">{restaurant?.name}</span>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-[#FBF6EE]/50 block">City & Operating Days</span>
            <span className="font-semibold text-[#FBF6EE] mt-1 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#E0A526]" />
              {restaurant?.city} · {(restaurant?.openingDays || []).join(', ')}
            </span>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-[#FBF6EE]/50 block">Currency</span>
            <span className="font-semibold text-[#FBF6EE] mt-1 block">
              {restaurant?.currency}
            </span>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-[#FBF6EE]/50 block">Service Windows</span>
            <span className="font-semibold text-[#FBF6EE] mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#E0A526]" />
              Lunch {restaurant?.serviceHours.lunchStart}–{restaurant?.serviceHours.lunchEnd} / Dinner {restaurant?.serviceHours.dinnerStart}–{restaurant?.serviceHours.dinnerEnd}
            </span>
          </div>
        </div>
      </div>

      {/* AI Token Usage & Daily Budget Panel (Phase 10 Reliability & Cost) */}
      <div className="rounded-2xl bg-[#142823] border border-[#24463D] p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#24463D] pb-4">
          <div className="flex items-center gap-3">
            <Cpu className="w-5 h-5 text-[#E0A526]" />
            <div>
              <h2 className="font-serif text-lg font-bold text-[#FBF6EE]">
                AI Token Usage & Daily Cost Guardrails
              </h2>
              <p className="text-xs text-[#FBF6EE]/60">
                Tracks Gemini token consumption per feature with automatic retry backoff, context caching, and daily restaurant token caps.
              </p>
            </div>
          </div>
          <button
            onClick={fetchTokenUsage}
            disabled={loadingUsage}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F1F1B] border border-[#2F5D50] text-xs font-semibold text-[#FBF6EE]/80 hover:text-[#FBF6EE] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingUsage ? 'animate-spin text-[#E0A526]' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {loadingUsage && !tokenUsage ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse">
            <div className="h-20 rounded-xl bg-[#0F1F1B] border border-[#24463D]" />
            <div className="h-20 rounded-xl bg-[#0F1F1B] border border-[#24463D]" />
            <div className="h-20 rounded-xl bg-[#0F1F1B] border border-[#24463D]" />
          </div>
        ) : (
          <>
            {/* Top Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#0F1F1B] border border-[#24463D]">
                <span className="text-[11px] uppercase tracking-wider text-[#FBF6EE]/50 block">
                  Today's Token Use ({tokenUsage?.date || new Date().toISOString().slice(0, 10)})
                </span>
                <span className="font-mono text-2xl font-bold text-[#E0A526] mt-1 block">
                  {(tokenUsage?.totalTokens || 0).toLocaleString()}
                </span>
                <span className="text-[11px] text-[#FBF6EE]/50">
                  of {(tokenUsage?.dailyBudget || 250000).toLocaleString()} daily budget ({usagePercent}%)
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#0F1F1B] border border-[#24463D]">
                <span className="text-[11px] uppercase tracking-wider text-[#FBF6EE]/50 block">
                  Remaining Daily Budget
                </span>
                <span className="font-mono text-2xl font-bold text-emerald-400 mt-1 block">
                  {(tokenUsage?.remainingTokens ?? 250000).toLocaleString()}
                </span>
                <span className="text-[11px] text-[#FBF6EE]/50">
                  {tokenUsage?.budgetExceeded ? 'Budget cap reached — falling back to deterministic code' : 'Protected by per-restaurant daily token cap'}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#0F1F1B] border border-[#24463D]">
                <span className="text-[11px] uppercase tracking-wider text-[#FBF6EE]/50 block">
                  Context Caching & Retries
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <Database className="w-4 h-4 text-[#E0A526]" />
                  <span className="font-mono text-lg font-bold text-[#FBF6EE]">
                    {totalCachedTokens.toLocaleString()} cached tokens
                  </span>
                </div>
                <span className="text-[11px] text-[#FBF6EE]/50 block mt-0.5">
                  Active prompt cache entries: {tokenUsage?.contextCacheActiveCount || 0} · Exponential backoff enabled
                </span>
              </div>
            </div>

            {/* Budget Progress Bar & Editor */}
            <div className="p-4 rounded-xl bg-[#0F1F1B] border border-[#24463D] space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#FBF6EE]">Daily Token Budget Utilization</span>
                <span className="font-mono text-[#E0A526]">{usagePercent}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-[#142823] overflow-hidden border border-[#24463D]">
                <div
                  className={`h-full transition-all duration-300 ${
                    usagePercent >= 90 ? 'bg-rose-500' : usagePercent >= 70 ? 'bg-amber-400' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.max(2, usagePercent)}%` }}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <label className="text-xs text-[#FBF6EE]/70">
                  Configure Daily Restaurant Token Budget (tokens/day):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={10000}
                    max={5000000}
                    step={10000}
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(Number(e.target.value))}
                    className="w-36 px-3 py-1.5 rounded-lg bg-[#142823] border border-[#2F5D50] text-xs font-mono text-[#FBF6EE] focus:outline-none focus:border-[#E0A526]"
                  />
                  <button
                    onClick={handleSaveBudget}
                    disabled={savingBudget}
                    className="px-3.5 py-1.5 rounded-lg bg-[#2F5D50] hover:bg-[#3D7364] text-xs font-semibold text-[#FBF6EE] transition-colors disabled:opacity-50"
                  >
                    {savingBudget ? 'Saving...' : budgetSaved ? 'Saved!' : 'Update Cap'}
                  </button>
                </div>
              </div>
            </div>

            {/* Per-Feature Breakdown Table */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#E0A526] flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                <span>Token Use Per Feature</span>
              </h3>

              {featureEntries.length === 0 ? (
                <div className="p-6 rounded-xl bg-[#0F1F1B] border border-[#24463D] text-center text-xs text-[#FBF6EE]/60">
                  No Gemini API tokens consumed yet today. Deterministic forecasting and planning run in pure code at zero token cost; AI tokens are recorded when you use Ask CraveCast, recipe/ledger OCR, or customer mood chat.
                </div>
              ) : (
                <div className="rounded-xl border border-[#24463D] overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#0F1F1B] text-[#FBF6EE]/60 uppercase tracking-wider font-semibold border-b border-[#24463D]">
                      <tr>
                        <th className="py-2.5 px-4">Feature</th>
                        <th className="py-2.5 px-3 text-right">Calls</th>
                        <th className="py-2.5 px-3 text-right">Prompt Tokens</th>
                        <th className="py-2.5 px-3 text-right">Output Tokens</th>
                        <th className="py-2.5 px-3 text-right">Cached Tokens</th>
                        <th className="py-2.5 px-4 text-right">Total Tokens</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#24463D]/60 bg-[#142823]">
                      {featureEntries.map(([featureKey, metrics]) => (
                        <tr key={featureKey} className="hover:bg-[#18332C]/60">
                          <td className="py-2.5 px-4 font-medium text-[#FBF6EE]">
                            {FEATURE_LABELS[featureKey] || featureKey.replace(/_/g, ' ')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#FBF6EE]/70">
                            {metrics.calls}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#FBF6EE]/70">
                            {metrics.tokensIn.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#FBF6EE]/70">
                            {metrics.tokensOut.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                            {(metrics.cachedTokens || 0).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-[#E0A526]">
                            {metrics.totalTokens.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Data Ownership & Export */}
      <div className="rounded-2xl bg-[#142823] border border-[#24463D] p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-[#E0A526]" />
          <h2 className="font-serif text-lg font-bold text-[#FBF6EE]">
            Data Ownership & Portability
          </h2>
        </div>

        <p className="text-sm text-[#FBF6EE]/75 leading-relaxed">
          You own 100% of your sales logs, recipes, supplier directories, and generated plans. Your data is isolated to your restaurant account and is never shared across restaurants. You can download a full JSON archive of every collection at any time.
        </p>

        <div className="pt-2">
          <button
            onClick={handleExportData}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2F5D50] hover:bg-[#3D7364] text-sm font-semibold text-[#FBF6EE] transition-colors disabled:opacity-50"
          >
            {exportDone ? (
              <>
                <Check className="w-4 h-4 text-[#E0A526]" />
                <span>Archive Downloaded</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>{exporting ? 'Preparing JSON Export...' : 'Export All Restaurant Data (JSON)'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Danger Zone: Delete Account & Purge Data */}
      <div className="rounded-2xl bg-[#C8553D]/10 border border-[#C8553D]/40 p-6 space-y-4">
        <div className="flex items-center gap-3 text-[#C8553D]">
          <AlertTriangle className="w-5 h-5" />
          <h2 className="font-serif text-lg font-bold text-[#FBF6EE]">
            Permanent Account & Data Deletion
          </h2>
        </div>

        <p className="text-sm text-[#FBF6EE]/75 leading-relaxed">
          Deleting your account permanently removes your restaurant profile, menu items, recipes, sales history, forecasts, and daily plans from Firestore. This action cannot be undone.
        </p>

        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-md">
          <input
            type="text"
            value={confirmDeleteText}
            onChange={(e) => setConfirmDeleteText(e.target.value)}
            placeholder='Type "DELETE" to confirm'
            className="px-4 py-2.5 rounded-xl bg-[#0F1F1B] border border-[#C8553D]/50 text-sm text-[#FBF6EE] placeholder-[#FBF6EE]/30 focus:outline-none focus:border-[#C8553D]"
          />
          <button
            onClick={handleDeleteAccount}
            disabled={confirmDeleteText !== 'DELETE' || deleting}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#C8553D] hover:bg-[#B54832] text-sm font-semibold text-[#FBF6EE] transition-colors disabled:opacity-40 shrink-0"
          >
            <Trash2 className="w-4 h-4" />
            <span>{deleting ? 'Purging...' : 'Delete Everything'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
