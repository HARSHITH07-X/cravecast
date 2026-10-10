import React, { useState } from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  UtensilsCrossed,
  CalendarDays,
  Sparkles,
  MessageSquareHeart,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Home,
  User,
} from 'lucide-react';
import { useAuth } from '../lib/authContext';

interface AppShellProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onNavigateHome: () => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentTab,
  onSelectTab,
  onNavigateHome,
  children,
}) => {
  const { restaurant, user, signOut } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'sales', label: 'Sales', icon: TrendingUp },
    { id: 'menu', label: 'Menu & Recipes', icon: UtensilsCrossed },
    { id: 'plan', label: 'Daily Plan', icon: CalendarDays },
    { id: 'ask', label: 'Ask CraveCast', icon: Sparkles },
    { id: 'chat', label: 'Customer Chat', icon: MessageSquareHeart },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#0F1F1B] text-[#FBF6EE] flex flex-col md:flex-row selection:bg-[#C8553D] selection:text-[#FBF6EE]">
      {/* ============================================================ */}
      {/* DESKTOP SIDEBAR (Collapsible)                               */}
      {/* ============================================================ */}
      <aside
        className={`hidden md:flex flex-col border-r border-[#24463D] bg-[#0A1613] transition-all duration-300 z-30 shrink-0 ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Brand / Logo Top */}
        <div className="h-20 border-b border-[#24463D] flex items-center justify-between px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-[#18332C] border border-[#2F5D50] flex items-center justify-center text-[#E0A526] shrink-0">
              <svg
                className="w-5 h-5 text-[#FBF6EE]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 4v2" />
                <path d="M4 14a8 8 0 0 1 16 0" />
                <path d="M3 17h18" />
                <path d="M5 20h14" />
              </svg>
            </div>
            {!sidebarCollapsed && (
              <div className="truncate">
                <span className="font-serif text-lg font-bold text-[#FBF6EE] block truncate">
                  {restaurant?.name || 'CraveCast'}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-[#E0A526] font-semibold block">
                  {restaurant?.city || 'Kitchen App'}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded-lg text-[#FBF6EE]/60 hover:text-[#FBF6EE] hover:bg-[#18332C] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#E0A526]"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-6 px-3 space-y-1.5 overflow-y-auto" aria-label="Sidebar Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#C8553D] text-[#FBF6EE] shadow-md font-semibold'
                    : 'text-[#FBF6EE]/70 hover:text-[#FBF6EE] hover:bg-[#142823]'
                } ${sidebarCollapsed ? 'justify-center' : ''}`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-[#FBF6EE]' : 'text-[#E0A526]'}`} />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-[#24463D] space-y-1">
          <button
            onClick={onNavigateHome}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-[#FBF6EE]/60 hover:text-[#FBF6EE] hover:bg-[#142823] transition-colors ${
              sidebarCollapsed ? 'justify-center' : ''
            }`}
            title="Return to Public Landing Page"
          >
            <Home className="w-4 h-4 shrink-0 text-[#2F5D50]" />
            {!sidebarCollapsed && <span>Public Landing</span>}
          </button>

          <button
            onClick={signOut}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-red-300 hover:text-red-200 hover:bg-red-950/30 transition-colors ${
              sidebarCollapsed ? 'justify-center' : ''
            }`}
            title="Sign Out"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* MAIN CONTENT AREA                                            */}
      {/* ============================================================ */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">
        {/* Top Header */}
        <header className="h-16 border-b border-[#24463D] bg-[#0F1F1B]/95 backdrop-blur-md sticky top-0 z-20 px-4 sm:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-serif text-lg font-bold text-[#FBF6EE] md:hidden truncate">
              {restaurant?.name || 'CraveCast'}
            </span>
            <span className="hidden md:inline-block text-xs uppercase tracking-widest text-[#E0A526] font-semibold">
              {restaurant?.name} · {restaurant?.city}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-[#18332C] border border-[#2F5D50] text-[11px] font-semibold text-[#E0A526]">
              {restaurant?.currency}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-[#FBF6EE]/70">
              <User className="w-3.5 h-3.5 text-[#E0A526]" />
              <span className="max-w-[150px] truncate">{user?.email}</span>
            </div>

            <button
              onClick={() => onSelectTab('settings')}
              className="p-2 rounded-xl text-[#FBF6EE]/70 hover:text-[#FBF6EE] hover:bg-[#18332C] transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* ============================================================ */}
      {/* MOBILE BOTTOM TAB BAR (Kitchen phone friendly)               */}
      {/* ============================================================ */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0A1613] border-t border-[#24463D] flex items-center justify-around z-40 px-2"
        aria-label="Mobile Bottom Navigation"
      >
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all ${
                isActive ? 'text-[#C8553D]' : 'text-[#FBF6EE]/60 hover:text-[#FBF6EE]'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="text-[9px] font-medium tracking-tight truncate max-w-[50px]">
                {item.label.split(' ')[0]}
              </span>
            </button>
          );
        })}
        {/* Settings button in mobile bottom bar */}
        <button
          onClick={() => onSelectTab('settings')}
          className={`flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all ${
            currentTab === 'settings' ? 'text-[#C8553D]' : 'text-[#FBF6EE]/60 hover:text-[#FBF6EE]'
          }`}
        >
          <Settings className="w-5 h-5 mb-0.5" />
          <span className="text-[9px] font-medium tracking-tight">More</span>
        </button>
      </nav>
    </div>
  );
};
