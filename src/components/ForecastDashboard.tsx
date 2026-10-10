import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  Percent,
  Target,
  ShieldCheck,
  Flame,
  CloudRain,
  Sun,
  Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useAuth } from '../lib/authContext';

interface FactorContributions {
  baseLevel: number;
  weekdayEffect: number;
  trendEffect: number;
  weatherEffect: number;
  eventEffect: number;
}

interface DishForecast {
  menuItemId: string;
  dishName: string;
  category: string;
  targetDate: string;
  p10: number;
  p50: number;
  p90: number;
  confidence: 'High' | 'Medium' | 'Low';
  confidenceReason: string;
  modelWeights: Record<string, number>;
  factorContributions: FactorContributions;
  baselineSeasonalNaive: number;
  daysOfHistory: number;
}

interface DishBacktestMetrics {
  menuItemId: string;
  dishName: string;
  testDaysCount: number;
  wape: number;
  mase: number;
  bias: number;
  intervalCoverage: number;
  stockoutRate: number;
  maeEnsemble: number;
  maeSeasonalNaive: number;
  errorReductionPercent: number;
}

interface BacktestSummary {
  eligible: boolean;
  totalDaysAvailable: number;
  daysNeeded: number;
  message?: string;
  testWindowDays: number;
  overallWape: number;
  overallMase: number;
  overallBias: number;
  overallIntervalCoverage: number;
  overallStockoutRate: number;
  overallErrorReductionPercent: number;
  dishes: DishBacktestMetrics[];
  dailyComparisons: Array<{
    date: string;
    dishName: string;
    menuItemId: string;
    actualDemand: number;
    predictedP50: number;
    p10: number;
    p90: number;
    seasonalNaive: number;
    soldOut: boolean;
  }>;
}

export const ForecastDashboard: React.FC = () => {
  const { idToken } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [forecasts, setForecasts] = useState<DishForecast[]>([]);
  const [targetDate, setTargetDate] = useState<string>('');
  const [backtest, setBacktest] = useState<BacktestSummary | null>(null);
  const [selectedDishFilter, setSelectedDishFilter] = useState<string>('all');
  const [expandedDish, setExpandedDish] = useState<string | null>(null);

  const fetchForecastData = async (isManualRefresh = false) => {
    if (!idToken) return;
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/forecast/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to load forecast data');
      }

      const data = await res.json();
      setForecasts(data.forecasts || []);
      setTargetDate(data.targetDate || '');
      setBacktest(data.backtest || null);
    } catch (err: any) {
      console.error('Failed to load forecast data:', err);
      setError(err.message || 'An error occurred while generating forecasts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchForecastData();
  }, [idToken]);

  if (loading) {
    return (
      <div className="p-8 rounded-3xl bg-[#142823] border border-[#24463D] text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#E0A526]" />
        <p className="text-sm text-[#FBF6EE]/70 font-medium">
          Calibrating demand intervals & running walk-forward backtest...
        </p>
      </div>
    );
  }

  // Filter comparisons for chart
  const filteredComparisons = (backtest?.dailyComparisons || []).filter((pt) => {
    if (selectedDishFilter === 'all') return true;
    return pt.menuItemId === selectedDishFilter || pt.dishName === selectedDishFilter;
  });

  // Group by date if viewing all dishes
  const chartData = (() => {
    if (selectedDishFilter !== 'all') {
      return filteredComparisons.map((pt) => ({
        date: pt.date.slice(5), // MM-DD
        fullDate: pt.date,
        actual: pt.actualDemand,
        predicted: pt.predictedP50,
        p10: pt.p10,
        p90: pt.p90,
        seasonalNaive: pt.seasonalNaive,
        soldOut: pt.soldOut,
      }));
    }

    // Aggregate by date across dishes
    const byDate = new Map<string, { actual: number; predicted: number; p10: number; p90: number; seasonalNaive: number }>();
    for (const pt of filteredComparisons) {
      const prev = byDate.get(pt.date) || { actual: 0, predicted: 0, p10: 0, p90: 0, seasonalNaive: 0 };
      byDate.set(pt.date, {
        actual: prev.actual + pt.actualDemand,
        predicted: prev.predicted + pt.predictedP50,
        p10: prev.p10 + pt.p10,
        p90: prev.p90 + pt.p90,
        seasonalNaive: prev.seasonalNaive + pt.seasonalNaive,
      });
    }

    return Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dStr, vals]) => ({
        date: dStr.slice(5),
        fullDate: dStr,
        actual: vals.actual,
        predicted: Math.round(vals.predicted * 10) / 10,
        p10: Math.round(vals.p10 * 10) / 10,
        p90: Math.round(vals.p90 * 10) / 10,
        seasonalNaive: Math.round(vals.seasonalNaive * 10) / 10,
      }));
  })();

  const hasForecasts = forecasts.length > 0;
  const isBacktestEligible = backtest?.eligible === true;

  return (
    <div className="space-y-8">
      {/* Top Controls & Status Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#E0A526]">
            <Activity className="w-4 h-4" />
            <span>Demand Forecast Engine</span>
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#FBF6EE] mt-0.5">
            Calibrated Demand & Accuracy Engine
          </h2>
          <p className="text-xs sm:text-sm text-[#FBF6EE]/70 mt-1">
            Deterministic statistical ensemble with split conformal intervals (P10, P50, P90). Sold-out days act as censored lower bounds.
          </p>
        </div>

        <button
          onClick={() => fetchForecastData(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-[#18332C] hover:bg-[#20443B] border border-[#2F5D50] text-[#FBF6EE] transition-colors self-start sm:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#E0A526] ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'Recalculating...' : 'Recalculate Models'}</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-950/60 border border-red-800 text-red-200 text-xs sm:text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Hero Accuracy Card: Genuine Backtest Metric vs Baseline */}
      {isBacktestEligible ? (
        <div className="rounded-3xl bg-gradient-to-br from-[#1A3830] via-[#142823] to-[#0F1F1B] border border-[#2F5D50] p-6 sm:p-8 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Walk-Forward Backtest Verified (28-day Out-of-Sample)</span>
            </div>
            <h3 className="font-serif text-3xl sm:text-4xl font-bold text-[#FBF6EE] flex items-center gap-3">
              <span className="text-[#E0A526]">{backtest?.overallErrorReductionPercent}%</span>
              <span>lower error than same-as-last-week</span>
            </h3>
            <p className="text-xs sm:text-sm text-[#FBF6EE]/70 max-w-2xl leading-relaxed">
              Tested on {backtest?.totalDaysAvailable} historical days across all dishes. Our multi-model ensemble (Ridge regression, Holt-Winters, weighted weekday) beats seasonal naive with an overall MASE of {backtest?.overallMase} and {Math.round((backtest?.overallIntervalCoverage || 0) * 100)}% empirical coverage on the 80% interval.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full md:w-auto flex-shrink-0">
            <div className="bg-[#0F1F1B]/80 border border-[#24463D] p-3.5 rounded-2xl text-center">
              <span className="text-[10px] text-[#FBF6EE]/60 uppercase tracking-wider block font-semibold">
                Overall WAPE
              </span>
              <span className="text-lg sm:text-xl font-bold text-[#FBF6EE] mt-0.5 block">
                {Math.round((backtest?.overallWape || 0) * 100)}%
              </span>
            </div>
            <div className="bg-[#0F1F1B]/80 border border-[#24463D] p-3.5 rounded-2xl text-center">
              <span className="text-[10px] text-[#FBF6EE]/60 uppercase tracking-wider block font-semibold">
                80% Coverage
              </span>
              <span className="text-lg sm:text-xl font-bold text-emerald-400 mt-0.5 block">
                {Math.round((backtest?.overallIntervalCoverage || 0) * 100)}%
              </span>
            </div>
            <div className="bg-[#0F1F1B]/80 border border-[#24463D] p-3.5 rounded-2xl text-center col-span-2 sm:col-span-1">
              <span className="text-[10px] text-[#FBF6EE]/60 uppercase tracking-wider block font-semibold">
                Stockout Rate
              </span>
              <span className="text-lg sm:text-xl font-bold text-[#E0A526] mt-0.5 block">
                {Math.round((backtest?.overallStockoutRate || 0) * 100)}%
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-[#142823] border border-[#2F5D50] p-6 sm:p-8 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-800/80 text-amber-300 text-xs font-semibold">
              <Info className="w-3.5 h-3.5" />
              <span>Backtest History Gate</span>
            </div>
            <h3 className="font-serif text-2xl sm:text-3xl font-bold text-[#FBF6EE]">
              {backtest?.message || `Not enough history yet: add ${backtest?.daysNeeded || 84} more days`}
            </h3>
            <p className="text-xs sm:text-sm text-[#FBF6EE]/70 max-w-xl leading-relaxed">
              Backtesting requires at least 84 days of real sales history (56 days for training + 28 days for walk-forward evaluation) to rigorously compute out-of-sample error. Currently available: {backtest?.totalDaysAvailable || 0} days.
            </p>
          </div>

          <div className="bg-[#0F1F1B] border border-[#24463D] p-5 rounded-2xl text-center min-w-[200px] w-full md:w-auto">
            <span className="text-xs text-[#FBF6EE]/60 uppercase tracking-wider block font-semibold">
              History Progress
            </span>
            <div className="mt-2 flex items-baseline justify-center gap-1">
              <span className="text-2xl font-bold text-[#E0A526]">{backtest?.totalDaysAvailable || 0}</span>
              <span className="text-xs text-[#FBF6EE]/50">/ 84 days</span>
            </div>
            <div className="w-full bg-[#18332C] h-2 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-[#E0A526] h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.round(((backtest?.totalDaysAvailable || 0) / 84) * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tomorrow's Calibrated Forecast Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#FBF6EE]">
              Tomorrow's Calibrated Demand Forecast
            </h3>
            <p className="text-xs text-[#FBF6EE]/70 mt-0.5">
              Forecast horizon: {targetDate || 'Next Service Day'}. Quantiles calibrated via split conformal prediction.
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-xl bg-[#18332C] border border-[#24463D] text-[#E0A526] self-start sm:self-auto">
            {forecasts.length} Active Dishes
          </span>
        </div>

        {hasForecasts ? (
          <div className="overflow-x-auto rounded-3xl border border-[#24463D] bg-[#142823] shadow-md">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#0F1F1B]/90 text-[#FBF6EE]/70 border-b border-[#24463D] text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">Dish & Category</th>
                  <th className="py-3.5 px-4 font-semibold text-center">Confidence</th>
                  <th className="py-3.5 px-4 font-semibold text-center">
                    Calibrated Range <span className="text-[10px] text-[#FBF6EE]/50 font-normal">[P10 – P90]</span>
                  </th>
                  <th className="py-3.5 px-4 font-semibold text-center">
                    Expected Median <span className="text-[10px] text-[#E0A526] font-semibold">(P50)</span>
                  </th>
                  <th className="py-3.5 px-4 font-semibold text-center">Baseline Naive</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Factors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#24463D]/60 text-[#FBF6EE]">
                {forecasts.map((fc) => {
                  const isExpanded = expandedDish === fc.menuItemId;
                  const confidenceBadge =
                    fc.confidence === 'High'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                      : fc.confidence === 'Medium'
                      ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                      : 'bg-purple-950/80 text-purple-300 border-purple-800';

                  return (
                    <React.Fragment key={fc.menuItemId}>
                      <tr className="hover:bg-[#18332C]/60 transition-colors">
                        <td className="py-4 px-4 font-medium">
                          <div className="font-semibold text-sm text-[#FBF6EE]">{fc.dishName}</div>
                          <span className="text-[11px] text-[#FBF6EE]/50">{fc.category}</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span
                            title={fc.confidenceReason}
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${confidenceBadge}`}
                          >
                            {fc.confidence}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center font-mono text-sm">
                          <span className="text-[#FBF6EE]/70">{fc.p10}</span>
                          <span className="text-[#FBF6EE]/40 mx-1.5">—</span>
                          <span className="text-[#FBF6EE]/90 font-semibold">{fc.p90}</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="font-bold text-base text-[#E0A526] font-mono">{fc.p50}</span>
                        </td>
                        <td className="py-4 px-4 text-center text-[#FBF6EE]/60 font-mono text-xs">
                          {fc.baselineSeasonalNaive}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={() => setExpandedDish(isExpanded ? null : fc.menuItemId)}
                            className="inline-flex items-center gap-1 text-xs text-[#E0A526] hover:underline font-semibold"
                          >
                            <span>{isExpanded ? 'Hide' : 'Explain'}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Factor Breakdown */}
                      {isExpanded && (
                        <tr className="bg-[#0F1F1B]/95 text-xs">
                          <td colSpan={6} className="p-4 border-t border-[#24463D]/60 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#24463D]/60 text-[11px]">
                              <span className="text-[#FBF6EE]/70">
                                <strong>Confidence Tier:</strong> {fc.confidenceReason}
                              </span>
                              <span className="text-[#FBF6EE]/50">
                                History: {fc.daysOfHistory} recorded days
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
                              <div className="p-2.5 rounded-xl bg-[#142823] border border-[#24463D]">
                                <span className="text-[10px] text-[#FBF6EE]/60 uppercase block">Base Level</span>
                                <span className="text-sm font-semibold text-[#FBF6EE] font-mono">
                                  {fc.factorContributions.baseLevel}
                                </span>
                              </div>
                              <div className="p-2.5 rounded-xl bg-[#142823] border border-[#24463D]">
                                <span className="text-[10px] text-[#FBF6EE]/60 uppercase block">Weekday Effect</span>
                                <span
                                  className={`text-sm font-semibold font-mono ${
                                    fc.factorContributions.weekdayEffect >= 0 ? 'text-emerald-400' : 'text-[#C8553D]'
                                  }`}
                                >
                                  {fc.factorContributions.weekdayEffect >= 0 ? '+' : ''}
                                  {fc.factorContributions.weekdayEffect}
                                </span>
                              </div>
                              <div className="p-2.5 rounded-xl bg-[#142823] border border-[#24463D]">
                                <span className="text-[10px] text-[#FBF6EE]/60 uppercase block">Trend / Momentum</span>
                                <span
                                  className={`text-sm font-semibold font-mono ${
                                    fc.factorContributions.trendEffect >= 0 ? 'text-emerald-400' : 'text-[#C8553D]'
                                  }`}
                                >
                                  {fc.factorContributions.trendEffect >= 0 ? '+' : ''}
                                  {fc.factorContributions.trendEffect}
                                </span>
                              </div>
                              <div className="p-2.5 rounded-xl bg-[#142823] border border-[#24463D]">
                                <span className="text-[10px] text-[#FBF6EE]/60 uppercase block">Weather Adjustment</span>
                                <span
                                  className={`text-sm font-semibold font-mono ${
                                    fc.factorContributions.weatherEffect >= 0 ? 'text-emerald-400' : 'text-[#C8553D]'
                                  }`}
                                >
                                  {fc.factorContributions.weatherEffect >= 0 ? '+' : ''}
                                  {fc.factorContributions.weatherEffect}
                                </span>
                              </div>
                              <div className="p-2.5 rounded-xl bg-[#142823] border border-[#24463D]">
                                <span className="text-[10px] text-[#FBF6EE]/60 uppercase block">Local Events</span>
                                <span
                                  className={`text-sm font-semibold font-mono ${
                                    fc.factorContributions.eventEffect >= 0 ? 'text-emerald-400' : 'text-[#C8553D]'
                                  }`}
                                >
                                  {fc.factorContributions.eventEffect >= 0 ? '+' : ''}
                                  {fc.factorContributions.eventEffect}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 rounded-3xl bg-[#142823] border border-[#24463D] text-center space-y-2">
            <p className="text-sm text-[#FBF6EE]/70 font-medium">
              No sales records available yet to generate dish forecasts.
            </p>
            <p className="text-xs text-[#FBF6EE]/50">
              Upload your sales CSV or ledger photo in the Sales tab to activate deterministic forecasting.
            </p>
          </div>
        )}
      </div>

      {/* Forecast-vs-Actual Walk-Forward Backtest Chart */}
      {isBacktestEligible && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#FBF6EE]">
                Forecast vs Actual Walk-Forward Backtest
              </h3>
              <p className="text-xs text-[#FBF6EE]/70 mt-0.5">
                Evaluated strictly out-of-sample over the last 28 days using only data available prior to each day.
              </p>
            </div>

            {/* Dish selector for chart */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#FBF6EE]/70 font-medium">Dish:</label>
              <select
                value={selectedDishFilter}
                onChange={(e) => setSelectedDishFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-[#0F1F1B] border border-[#2F5D50] text-[#FBF6EE] text-xs focus:outline-none focus:ring-1 focus:ring-[#E0A526]"
              >
                <option value="all">All Dishes (Aggregate Demand)</option>
                {backtest?.dishes.map((d) => (
                  <option key={d.menuItemId} value={d.menuItemId}>
                    {d.dishName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-3xl border border-[#24463D] bg-[#142823] p-5 sm:p-6 shadow-md space-y-4">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#24463D" opacity={0.5} />
                  <XAxis dataKey="date" stroke="#FBF6EE" opacity={0.6} tick={{ fontSize: 11 }} />
                  <YAxis stroke="#FBF6EE" opacity={0.6} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F1F1B',
                      borderColor: '#2F5D50',
                      borderRadius: '12px',
                      color: '#FBF6EE',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />

                  {/* Shaded P10-P90 interval band */}
                  <Area
                    type="monotone"
                    dataKey="p90"
                    stroke="none"
                    fill="#E0A526"
                    fillOpacity={0.15}
                    name="P10–P90 Range"
                  />
                  {/* Baseline seasonal naive */}
                  <Line
                    type="monotone"
                    dataKey="seasonalNaive"
                    stroke="#8B9B90"
                    strokeDasharray="4 4"
                    dot={false}
                    name="Seasonal Naive (Same Day Last Week)"
                  />
                  {/* Predicted P50 */}
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    stroke="#E0A526"
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: '#E0A526' }}
                    name="CraveCast Predicted (P50)"
                  />
                  {/* Actual demand */}
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#34D399"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#34D399' }}
                    name="Actual Sales / Demand"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Per-dish breakdown table */}
            <div className="pt-4 border-t border-[#24463D]/60 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[#FBF6EE]/60 text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="py-2 px-3">Dish</th>
                    <th className="py-2 px-3 text-center">WAPE</th>
                    <th className="py-2 px-3 text-center">MASE vs Naive</th>
                    <th className="py-2 px-3 text-center">Bias</th>
                    <th className="py-2 px-3 text-center">80% Interval Coverage</th>
                    <th className="py-2 px-3 text-center">Stockout Rate</th>
                    <th className="py-2 px-3 text-right">Improvement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#24463D]/40 text-[#FBF6EE]/90">
                  {backtest?.dishes.map((dm) => (
                    <tr key={dm.menuItemId} className="hover:bg-[#18332C]/40">
                      <td className="py-2.5 px-3 font-semibold text-[#FBF6EE]">{dm.dishName}</td>
                      <td className="py-2.5 px-3 text-center font-mono">{Math.round(dm.wape * 100)}%</td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        <span className={dm.mase < 1 ? 'text-emerald-400 font-semibold' : 'text-[#FBF6EE]/70'}>
                          {dm.mase}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {dm.bias >= 0 ? '+' : ''}
                        {Math.round(dm.bias * 100)}%
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-emerald-400">
                        {Math.round(dm.intervalCoverage * 100)}%
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-[#E0A526]">
                        {Math.round(dm.stockoutRate * 100)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-400">
                        +{dm.errorReductionPercent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
