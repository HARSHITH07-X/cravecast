import React, { useState } from 'react';
import { ChefHat, ArrowLeft, Loader2, TrendingUp, UtensilsCrossed, CalendarDays, Sparkles, MessageSquareHeart } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { OnboardingModal } from '../components/OnboardingModal';
import { AppShell } from '../components/AppShell';
import { DashboardView } from './DashboardView';
import { SalesView } from './SalesView';
import { MenuView } from './MenuView';
import { DailyPlanView } from './DailyPlanView';
import { SettingsView } from './SettingsView';
import { AskCraveCastView } from './AskCraveCastView';
import { CustomerChatPage } from './CustomerChatPage';
import { MoodTrendsCard } from '../components/MoodTrendsCard';

interface AppPageProps {
  onNavigate: (path: string) => void;
}

export const AppPage: React.FC<AppPageProps> = ({ onNavigate }) => {
  const { user, loading, restaurant, signIn } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signIn();
    } catch (err: any) {
      console.error('Sign in failed:', err);
      setAuthError(err.message || 'Failed to sign in with Google. Please try again.');
    } finally {
      setSigningIn(false);
    }
  };

  // 1. Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1F1B] text-[#FBF6EE] flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#142823] border border-[#2F5D50] flex items-center justify-center mx-auto text-[#E0A526]">
            <Loader2 className="w-6 h-6 animate-spin text-[#E0A526]" />
          </div>
          <span className="font-serif text-lg font-bold text-[#FBF6EE]">Loading CraveCast...</span>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated State (Sign In Required)
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0F1F1B] text-[#FBF6EE] flex flex-col">
        {/* Top return nav */}
        <header className="p-4 sm:p-6 flex items-center justify-between border-b border-[#24463D]/60 bg-[#0F1F1B]/90">
          <button
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#FBF6EE]/70 hover:text-[#E0A526] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526] rounded-lg px-2.5 py-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Landing Page</span>
          </button>
          <span className="font-serif text-lg font-bold text-[#FBF6EE]">CraveCast</span>
        </header>

        {/* Sign In Portal Card */}
        <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <div className="max-w-md w-full rounded-3xl bg-[#142823] border border-[#2F5D50] p-8 sm:p-10 shadow-2xl text-center space-y-6">
            <div className="w-14 h-14 rounded-2xl bg-[#18332C] border border-[#2F5D50] mx-auto flex items-center justify-center text-[#E0A526] shadow-inner">
              <ChefHat className="w-7 h-7" />
            </div>

            <div>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#E0A526]">
                Kitchen Owner Portal
              </span>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold mt-1 text-[#FBF6EE]">
                Sign in to your kitchen
              </h1>
              <p className="text-xs sm:text-sm text-[#FBF6EE]/70 mt-2 leading-relaxed">
                Connect with your Google account to access your restaurant forecast, daily prep sheets, and inventory orders.
              </p>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs text-left">
                {authError}
              </div>
            )}

            <button
              onClick={handleSignIn}
              disabled={signingIn}
              className="w-full py-3.5 px-6 rounded-xl font-semibold text-sm text-[#0F1F1B] bg-[#FBF6EE] hover:bg-white active:bg-[#EADFCF] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
            >
              {signingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#0F1F1B]" />
                  <span>Connecting to Google...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            <div className="pt-2 border-t border-[#24463D]/60 text-[11px] text-[#FBF6EE]/50 flex items-center justify-between">
              <span>Owner authentication required</span>
              <button
                onClick={() => onNavigate('/privacy')}
                className="text-[#E0A526] hover:underline"
              >
                Privacy policy
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 3. Onboarding State (First login only, restaurant not yet created)
  if (!restaurant) {
    return <OnboardingModal />;
  }

  // 4. Authenticated & Onboarded: Render App Shell with Active Tab
  return (
    <AppShell
      currentTab={currentTab}
      onSelectTab={setCurrentTab}
      onNavigateHome={() => onNavigate('/')}
    >
      {currentTab === 'dashboard' && (
        <DashboardView
          onNavigateTab={(tab) => setCurrentTab(tab)}
          onNavigate={onNavigate}
        />
      )}

      {currentTab === 'sales' && <SalesView />}

      {currentTab === 'menu' && <MenuView />}

      {currentTab === 'plan' && (
        <DailyPlanView onNavigateTab={(tab) => setCurrentTab(tab)} />
      )}

      {currentTab === 'ask' && (
        <AskCraveCastView onNavigateTab={(tab) => setCurrentTab(tab)} />
      )}

      {currentTab === 'chat' && restaurant?.id && (
        <div className="space-y-8 max-w-6xl mx-auto">
          <MoodTrendsCard onOpenCustomerChat={onNavigate} />
          <div className="rounded-3xl border border-[#2F5D50] overflow-hidden shadow-2xl">
            <div className="bg-[#18332C] px-6 py-3 border-b border-[#2F5D50] flex items-center justify-between text-xs">
              <span className="font-semibold text-[#E0A526] uppercase tracking-wider">
                Live Customer View Preview (/r/{restaurant.id})
              </span>
              <button
                type="button"
                onClick={() => onNavigate(`/r/${restaurant.id}`)}
                className="text-[#FBF6EE] hover:text-[#E0A526] font-semibold underline"
              >
                Open Full-Screen Public Link →
              </button>
            </div>
            <CustomerChatPage restaurantId={restaurant.id} onNavigate={onNavigate} />
          </div>
        </div>
      )}

      {currentTab === 'settings' && (
        <SettingsView
          onNavigateHome={() => onNavigate('/')}
          onNavigatePrivacy={() => onNavigate('/privacy')}
        />
      )}
    </AppShell>
  );
};
