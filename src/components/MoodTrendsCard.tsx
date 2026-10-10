import React, { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  Sparkles,
  QrCode,
  Printer,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  MessageSquareHeart,
  UtensilsCrossed,
  ShoppingBag,
  CloudSun,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/authContext';

interface DishByMoodRow {
  mood: string;
  dishName: string;
  suggestedCount: number;
  orderedCount: number;
}

interface MoodBreakdownGroup {
  mood: string;
  sessions: number;
  orders: number;
  topDishes: Array<{
    dishName: string;
    suggestedCount: number;
    orderedCount: number;
  }>;
}

interface MoodTrendsData {
  restaurantId: string;
  windowDays: number;
  totalSessionsThisWeek: number;
  totalOrdersConfirmedThisWeek: number;
  moodBreakdown: MoodBreakdownGroup[];
  dishByMoodRows: DishByMoodRow[];
  recentEvents: Array<{
    id: string;
    moodText: string;
    moodSummary: string;
    moodTags: string[];
    weatherContext?: string;
    suggestedDishes: string[];
    orderedDishes: string[];
    createdAt: string;
  }>;
}

interface MoodTrendsCardProps {
  onOpenCustomerChat?: (path: string) => void;
}

export const MoodTrendsCard: React.FC<MoodTrendsCardProps> = ({ onOpenCustomerChat }) => {
  const { restaurant, idToken } = useAuth();
  const [trends, setTrends] = useState<MoodTrendsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [qrSvg, setQrSvg] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);

  const restaurantId = restaurant?.id || '';
  const publicPath = restaurantId ? `/r/${restaurantId}` : '';
  const publicUrl =
    typeof window !== 'undefined' && restaurantId
      ? `${window.location.origin}/r/${restaurantId}`
      : publicPath;

  const fetchMoodTrends = useCallback(async () => {
    if (!idToken || !restaurantId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/public/mood-trends', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTrends(data);
      }
    } catch (err) {
      console.error('Failed to fetch mood trends:', err);
    } finally {
      setLoading(false);
    }
  }, [idToken, restaurantId]);

  useEffect(() => {
    fetchMoodTrends();
  }, [fetchMoodTrends]);

  useEffect(() => {
    if (!publicUrl) return;
    QRCode.toString(publicUrl, {
      type: 'svg',
      margin: 1,
      width: 180,
      color: {
        dark: '#0F1F1B',
        light: '#FBF6EE',
      },
    })
      .then((svg) => setQrSvg(svg))
      .catch((err) => console.warn('QR generation error:', err));
  }, [publicUrl]);

  const handleCopyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  if (!restaurantId) return null;

  return (
    <section
      data-testid="mood-trends-card"
      className="rounded-3xl bg-[#142823] border border-[#2F5D50] p-6 sm:p-8 shadow-xl space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#24463D] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#E0A526] mb-1">
            <MessageSquareHeart className="w-4 h-4" />
            <span>Customer Sentiment & Dining Concierge</span>
          </div>
          <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#FBF6EE]">
            Mood Trends (Moods vs. Dishes This Week)
          </h2>
          <p className="text-xs text-[#FBF6EE]/70 mt-1">
            Computed strictly from anonymous guest <code className="text-[#E0A526]">mood_events</code> at your public Customer Chat link.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={fetchMoodTrends}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#0F1F1B] hover:bg-[#18332C] border border-[#24463D] text-[#FBF6EE]/80 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#E0A526]' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setPrintModalOpen(true)}
            data-testid="open-qr-print-btn"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#18332C] hover:bg-[#20443B] border border-[#2F5D50] text-[#E0A526] transition-colors"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Printable Table QR Code</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (onOpenCustomerChat) {
                onOpenCustomerChat(publicPath);
              } else {
                window.location.href = publicPath;
              }
            }}
            data-testid="open-public-chat-btn"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#C8553D] hover:bg-[#B54832] text-[#FBF6EE] transition-colors shadow"
          >
            <span>Open Customer Chat</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Grid: Left = Moods vs Dishes This Week, Right = QR Code & Public Link */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Moods vs Dishes Analytics */}
        <div className="lg:col-span-2 space-y-5">
          {/* KPI Strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-[#0F1F1B] border border-[#24463D]">
              <span className="text-[11px] text-[#FBF6EE]/60 block">Mood Chats (7d)</span>
              <span className="font-serif text-2xl font-bold text-[#FBF6EE] tabular-nums">
                {trends?.totalSessionsThisWeek ?? 0}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-[#0F1F1B] border border-[#24463D]">
              <span className="text-[11px] text-[#FBF6EE]/60 block">Confirmed Orders (7d)</span>
              <span className="font-serif text-2xl font-bold text-emerald-400 tabular-nums">
                {trends?.totalOrdersConfirmedThisWeek ?? 0}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-[#0F1F1B] border border-[#24463D]">
              <span className="text-[11px] text-[#FBF6EE]/60 block">Distinct Moods</span>
              <span className="font-serif text-2xl font-bold text-[#E0A526] tabular-nums">
                {trends?.moodBreakdown?.length ?? 0}
              </span>
            </div>
          </div>

          {!trends || trends.totalSessionsThisWeek === 0 ? (
            <div className="rounded-2xl bg-[#0F1F1B] border border-[#24463D] p-8 text-center space-y-3">
              <div className="w-11 h-11 rounded-xl bg-[#18332C] border border-[#2F5D50] flex items-center justify-center text-[#E0A526] mx-auto">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-lg font-bold text-[#FBF6EE]">
                No guest mood events recorded this week yet
              </h3>
              <p className="text-xs text-[#FBF6EE]/70 max-w-md mx-auto leading-relaxed">
                When guests visit <code className="text-[#E0A526]">{publicPath}</code>, share how they feel, and tap dishes for their order list, you&apos;ll see which moods drive dish orders here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Moods vs. Dishes Table */}
              <div className="overflow-x-auto rounded-2xl border border-[#24463D] bg-[#0F1F1B]">
                <table className="w-full text-left text-xs text-[#FBF6EE]">
                  <thead className="bg-[#18332C] border-b border-[#24463D] text-[#E0A526] uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Guest Mood</th>
                      <th className="py-3 px-4">Matched Dish</th>
                      <th className="py-3 px-4 text-right">Suggested</th>
                      <th className="py-3 px-4 text-right">Ordered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#24463D]/60">
                    {trends.dishByMoodRows.slice(0, 10).map((row, idx) => (
                      <tr key={`${row.mood}-${row.dishName}-${idx}`} className="hover:bg-[#142823]/60">
                        <td className="py-2.5 px-4 font-medium text-[#E0A526]">{row.mood}</td>
                        <td className="py-2.5 px-4 font-semibold text-[#FBF6EE]">{row.dishName}</td>
                        <td className="py-2.5 px-4 text-right text-[#FBF6EE]/75 tabular-nums">
                          {row.suggestedCount}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-emerald-400 tabular-nums">
                          {row.orderedCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Recent Mood Events Feed */}
              {trends.recentEvents.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#FBF6EE]/60 block">
                    Latest Guest Mood Interactions
                  </span>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {trends.recentEvents.slice(0, 5).map((ev) => (
                      <div
                        key={ev.id}
                        className="p-3 rounded-xl bg-[#0F1F1B] border border-[#24463D] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded bg-[#18332C] border border-[#2F5D50] text-[10px] font-semibold text-[#E0A526]">
                              {ev.moodSummary}
                            </span>
                            {ev.weatherContext && (
                              <span className="text-[11px] text-[#FBF6EE]/60 flex items-center gap-1">
                                <CloudSun className="w-3 h-3 text-[#E0A526]" />
                                {ev.weatherContext}
                              </span>
                            )}
                          </div>
                          <p className="text-[#FBF6EE]/85 italic">&ldquo;{ev.moodText}&rdquo;</p>
                        </div>

                        <div className="text-right shrink-0 space-y-1">
                          {ev.orderedDishes && ev.orderedDishes.length > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/70 border border-emerald-700 text-emerald-300 text-[11px] font-semibold">
                              <ShoppingBag className="w-3 h-3" />
                              <span>Ordered: {ev.orderedDishes.join(', ')}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#FBF6EE]/55">
                              <UtensilsCrossed className="w-3 h-3" />
                              <span>Suggested: {(ev.suggestedDishes || []).join(', ')}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Printable Table QR Code Card */}
        <div className="rounded-2xl bg-[#0F1F1B] border border-[#24463D] p-5 flex flex-col justify-between items-center text-center space-y-4">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#E0A526]">
              Table Tent QR Code
            </span>
            <h3 className="font-serif text-lg font-bold text-[#FBF6EE]">
              Scan to Chat with Menu
            </h3>
            <p className="text-[11px] text-[#FBF6EE]/65">
              Place on dining tables so guests can get 3 mood-matched dish picks.
            </p>
          </div>

          {qrSvg ? (
            <div
              data-testid="qr-code-svg"
              className="p-3 rounded-2xl bg-[#FBF6EE] border-2 border-[#E0A526] shadow-md w-44 h-44 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <div className="w-44 h-44 rounded-2xl bg-[#142823] border border-[#24463D] flex items-center justify-center text-xs text-[#FBF6EE]/50">
              Generating QR...
            </div>
          )}

          <div className="w-full space-y-2">
            <div className="flex items-center gap-1.5 p-2 rounded-xl bg-[#142823] border border-[#24463D] text-[11px] text-[#FBF6EE]/80">
              <span className="truncate flex-1 font-mono text-left">{publicPath}</span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-2 py-1 rounded-lg bg-[#18332C] hover:bg-[#24463D] text-[#E0A526] flex items-center gap-1 shrink-0"
              >
                {copiedLink ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPrintModalOpen(true)}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-[#2F5D50] hover:bg-[#3D7364] text-[#FBF6EE] inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Table Standee</span>
            </button>
          </div>
        </div>
      </div>

      {/* Printable QR Standee Modal */}
      {printModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-md w-full rounded-3xl bg-[#FBF6EE] text-[#0F1F1B] border-4 border-[#E0A526] p-8 shadow-2xl space-y-6 text-center">
            <div className="flex items-center justify-between border-b border-[#0F1F1B]/15 pb-3">
              <span className="text-xs font-bold uppercase tracking-widest text-[#C8553D]">
                CraveCast Table Standee
              </span>
              <button
                type="button"
                onClick={() => setPrintModalOpen(false)}
                className="p-1 rounded-lg text-[#0F1F1B]/60 hover:text-[#0F1F1B]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="font-serif text-2xl font-bold text-[#0F1F1B]">
                {restaurant?.name}
              </h3>
              <p className="font-serif text-lg text-[#C8553D] font-semibold">
                &ldquo;How are you feeling today?&rdquo;
              </p>
              <p className="text-xs text-[#0F1F1B]/75 max-w-xs mx-auto">
                Scan to tell us your mood and get 3 tailored dish suggestions from our real kitchen menu.
              </p>
            </div>

            {qrSvg && (
              <div
                className="mx-auto w-56 h-56 p-3 rounded-2xl bg-white border-2 border-[#0F1F1B] shadow [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            )}

            <p className="font-mono text-xs text-[#0F1F1B]/80 break-all bg-[#EADFCF] px-3 py-1.5 rounded-lg">
              {publicUrl}
            </p>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#0F1F1B] text-[#FBF6EE] hover:bg-[#18332C]"
              >
                <Printer className="w-4 h-4" />
                <span>Print Standee</span>
              </button>
              <button
                type="button"
                onClick={() => setPrintModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#0F1F1B]/70 hover:text-[#0F1F1B]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
