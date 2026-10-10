import React from 'react';
import { CheckCircle2, Circle, ArrowRight, UploadCloud, UtensilsCrossed, CalendarDays, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { ForecastDashboard } from '../components/ForecastDashboard';
import { MoodTrendsCard } from '../components/MoodTrendsCard';

interface DashboardViewProps {
  onNavigateTab: (tab: string) => void;
  onNavigate?: (path: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateTab, onNavigate }) => {
  const { restaurant, idToken } = useAuth();
  const [salesCompleted, setSalesCompleted] = React.useState(false);
  const [recipesCompleted, setRecipesCompleted] = React.useState(false);
  const [plansCompleted, setPlansCompleted] = React.useState(false);

  React.useEffect(() => {
    if (!idToken) return;

    // Check sales count
    fetch('/api/sales/list?dish=all', { headers: { Authorization: `Bearer ${idToken}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.sales && d.sales.length > 0) setSalesCompleted(true);
      })
      .catch(() => {});

    // Check menu recipe count
    fetch('/api/menu/items', { headers: { Authorization: `Bearer ${idToken}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.items && d.items.some((i: any) => i.hasConfirmedRecipe)) setRecipesCompleted(true);
      })
      .catch(() => {});
  }, [idToken]);

  // Status indicators with dynamic live status
  const checklist = [
    {
      id: 'sales',
      title: '1. Add sales data',
      description: 'Upload your first sales CSV, POS register export, or a photo of your handwritten ledger.',
      status: salesCompleted ? 'completed' : 'pending',
      actionLabel: salesCompleted ? 'View Sales History' : 'Add Sales Records',
      targetTab: 'sales',
      icon: UploadCloud,
    },
    {
      id: 'menu',
      title: '2. Confirm menu & recipes',
      description: 'Verify dish names, categories, batch yield, and ingredient portion recipes.',
      status: recipesCompleted ? 'completed' : 'pending',
      actionLabel: recipesCompleted ? 'Manage Recipes' : 'Review Menu',
      targetTab: 'menu',
      icon: UtensilsCrossed,
    },
    {
      id: 'plan',
      title: '3. Generate first prep & order plan',
      description: 'Deterministic models calculate dish demand ranges and produce a one-page kitchen sheet.',
      status: plansCompleted ? 'completed' : 'pending',
      actionLabel: plansCompleted ? 'View Prep Sheet' : 'Generate Daily Plan',
      targetTab: 'plan',
      icon: CalendarDays,
    },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Top Welcome Card */}
      <div className="rounded-3xl bg-gradient-to-br from-[#18332C] via-[#142823] to-[#0F1F1B] border border-[#2F5D50] p-6 sm:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-[#E0A526]">
            <span>Active Kitchen Workspace</span>
            <span>·</span>
            <span>{restaurant?.city}</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-[#FBF6EE]">
            {restaurant?.name}
          </h1>
          <p className="text-xs sm:text-sm text-[#FBF6EE]/70 mt-1 max-w-xl">
            Operating in {restaurant?.currency}. Lunch service: {restaurant?.serviceHours.lunchStart}–{restaurant?.serviceHours.lunchEnd} · Dinner: {restaurant?.serviceHours.dinnerStart}–{restaurant?.serviceHours.dinnerEnd}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigateTab('sales')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-[#C8553D] hover:bg-[#B54832] text-[#FBF6EE] transition-colors shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Import Sales Data</span>
          </button>
        </div>
      </div>

      {/* Onboarding Checklist with Live Status */}
      <div className="space-y-4">
        <div>
          <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#FBF6EE]">
            Kitchen Launch Checklist
          </h2>
          <p className="text-xs sm:text-sm text-[#FBF6EE]/70 mt-1">
            Follow these 3 steps to configure your deterministic forecasting engine and daily prep plans.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {checklist.map((item) => {
            const Icon = item.icon;
            const isCompleted = item.status === 'completed';

            return (
              <div
                key={item.id}
                className="rounded-2xl bg-[#142823] border border-[#24463D] p-6 flex flex-col justify-between shadow-md hover:border-[#3D7364] transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-[#0F1F1B] border border-[#2F5D50] flex items-center justify-center text-[#E0A526]">
                      <Icon className="w-5 h-5 text-[#E0A526]" />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      {isCompleted ? (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Done</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[#E0A526]">
                          <Circle className="w-3.5 h-3.5" />
                          <span>Pending</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="font-serif text-lg font-bold text-[#FBF6EE] mb-2">
                    {item.title}
                  </h3>

                  <p className="text-xs text-[#FBF6EE]/70 leading-relaxed font-normal">
                    {item.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-[#24463D]/60">
                  <button
                    onClick={() => onNavigateTab(item.targetTab)}
                    className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-[#FBF6EE] bg-[#18332C] hover:bg-[#20443B] border border-[#2F5D50] rounded-xl transition-colors"
                  >
                    <span>{item.actionLabel}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Forecast Engine & Backtest Dashboard */}
      {salesCompleted ? (
        <div className="pt-4 border-t border-[#24463D]/60">
          <ForecastDashboard />
        </div>
      ) : (
        <div className="rounded-3xl bg-[#0F1F1B] border border-[#24463D] p-8 text-center max-w-2xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-xl bg-[#18332C] border border-[#2F5D50] flex items-center justify-center mx-auto text-[#E0A526]">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="font-serif text-lg sm:text-xl font-bold text-[#FBF6EE]">
            No forecasts or metrics generated yet
          </h3>
          <p className="text-xs sm:text-sm text-[#FBF6EE]/70 max-w-lg mx-auto leading-relaxed">
            CraveCast strictly adheres to zero fabricated numbers. Once you upload real sales history, our statistical ensemble will calculate expected demand intervals (P10, P50, P90) and build your morning prep sheet.
          </p>
          <button
            onClick={() => onNavigateTab('sales')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#2F5D50] hover:bg-[#3D7364] text-[#FBF6EE] transition-colors"
          >
            <UploadCloud className="w-4 h-4 text-[#E0A526]" />
            <span>Upload your first sales records</span>
          </button>
        </div>
      )}

      {/* Customer Mood Trends & Printable Table QR Code */}
      <div className="pt-4 border-t border-[#24463D]/60">
        <MoodTrendsCard onOpenCustomerChat={onNavigate} />
      </div>
    </div>
  );
};
