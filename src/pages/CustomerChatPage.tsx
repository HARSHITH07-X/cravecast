import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  UtensilsCrossed,
  CloudSun,
  Send,
  Plus,
  Minus,
  CheckCircle2,
  ShieldAlert,
  Clock,
  ShoppingBag,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Check,
  ChefHat,
  Info,
} from 'lucide-react';

interface PublicDish {
  id: string;
  name: string;
  category: string;
  price: number;
  tags: string[];
  description: string;
  allergens: string[];
  reason?: string;
}

interface PublicRestaurant {
  id: string;
  name: string;
  city: string;
  currency: string;
}

interface ChatTurn {
  id: string;
  eventId: string;
  customerMessage: string;
  greeting: string;
  moodSummary: string;
  moodTags: string[];
  language: string;
  weatherContext: string;
  suggestions: PublicDish[];
}

interface CustomerChatPageProps {
  restaurantId: string;
  onNavigate?: (path: string) => void;
}

const QUICK_MOOD_STARTERS = [
  {
    label: 'Tired — need warm comfort',
    text: 'Had a long, tiring workday and I want something warm, rich, and comforting.',
  },
  {
    label: 'Spicy & bold craving',
    text: 'Feeling energetic and craving something bold, spicy, and full of flavor!',
  },
  {
    label: 'Light & healthy',
    text: 'Looking for something light, fresh, and energizing that is not too heavy.',
  },
  {
    label: 'गरमा-गरम और चटपटा (Hindi)',
    text: 'आज कुछ गरमा-गरम, चटपटा और स्वादिष्ट खाने का मन कर रहा है।',
  },
  {
    label: 'వేడిగా స్పైసీగా (Telugu)',
    text: 'ఈరోజు ఏదైనా వేడిగా, కమ్మగా మరియు స్పైసీగా తినాలనిపిస్తోంది.',
  },
];

export const CustomerChatPage: React.FC<CustomerChatPageProps> = ({ restaurantId, onNavigate }) => {
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<PublicRestaurant | null>(null);
  const [menuComingSoon, setMenuComingSoon] = useState(false);
  const [publicDishes, setPublicDishes] = useState<PublicDish[]>([]);
  const [botProtection, setBotProtection] = useState<{
    turnstileSiteKey: string | null;
    recaptchaSiteKey: string | null;
  }>({ turnstileSiteKey: null, recaptchaSiteKey: null });

  // Chat state
  const [moodInput, setMoodInput] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [botToken, setBotToken] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [latestMoodText, setLatestMoodText] = useState<string>('');
  const [latestMoodSummary, setLatestMoodSummary] = useState<string>('');
  const [latestMoodTags, setLatestMoodTags] = useState<string[]>([]);
  const [latestSuggestedIds, setLatestSuggestedIds] = useState<string[]>([]);

  // Order list state (dishId -> quantity)
  const [orderQuantities, setOrderQuantities] = useState<Record<string, number>>({});
  const [confirmingOrder, setConfirmingOrder] = useState(false);
  const [confirmedOrderCard, setConfirmedOrderCard] = useState<{
    eventId: string;
    items: Array<{ id: string; name: string; price: number; quantity: number; allergens: string[] }>;
    timestamp: string;
  } | null>(null);
  const [showFullMenu, setShowFullMenu] = useState(false);

  useEffect(() => {
    if (!restaurantId) {
      setMenuError('Missing restaurant link.');
      setLoadingMenu(false);
      return;
    }

    let cancelled = false;
    setLoadingMenu(true);
    setMenuError(null);

    fetch(`/api/public/menu/${encodeURIComponent(restaurantId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'Unable to load menu.');
        }
        if (cancelled) return;
        setRestaurant(data.restaurant || { id: restaurantId, name: 'Restaurant', city: '', currency: 'INR' });
        const dishes: PublicDish[] = Array.isArray(data.dishes) ? data.dishes : [];
        setPublicDishes(dishes);
        setMenuComingSoon(Boolean(data.menuComingSoon || dishes.length === 0));
        if (data.botProtection) {
          setBotProtection(data.botProtection);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMenuError(err.message || 'Failed to load restaurant menu.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMenu(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const handleSendMood = async (overrideMessage?: string) => {
    const textToSend = (overrideMessage !== undefined ? overrideMessage : moodInput).trim();
    if (!textToSend || sendingChat) return;

    if (textToSend.length > 300) {
      setChatError('Please keep your message under 300 characters.');
      return;
    }

    setSendingChat(true);
    setChatError(null);

    try {
      const res = await fetch('/api/public/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          message: textToSend,
          honeypot,
          botToken: botToken || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Could not get dish suggestions right now.');
      }

      if (data.menuComingSoon) {
        setMenuComingSoon(true);
        return;
      }

      const suggestions: PublicDish[] = Array.isArray(data.suggestions) ? data.suggestions : [];
      const turn: ChatTurn = {
        id: `turn_${Date.now()}`,
        eventId: data.eventId || `mood_${Date.now()}`,
        customerMessage: textToSend,
        greeting: data.greeting || 'Here are 3 dishes from our menu matched to your mood:',
        moodSummary: data.moodSummary || 'Personal Pick',
        moodTags: Array.isArray(data.moodTags) ? data.moodTags : [],
        language: data.language || 'en',
        weatherContext: data.weatherContext || '',
        suggestions,
      };

      setChatTurns((prev) => [turn, ...prev]);
      setActiveEventId(turn.eventId);
      setLatestMoodText(textToSend);
      setLatestMoodSummary(turn.moodSummary);
      setLatestMoodTags(turn.moodTags);
      setLatestSuggestedIds(suggestions.map((s) => s.id));
      if (overrideMessage === undefined) {
        setMoodInput('');
      }
    } catch (err: any) {
      setChatError(err.message || 'Unable to process your request right now.');
    } finally {
      setSendingChat(false);
    }
  };

  const handleAdjustDishQuantity = (dishId: string, delta: number) => {
    setConfirmedOrderCard(null);
    setOrderQuantities((prev) => {
      const current = prev[dishId] || 0;
      const next = Math.max(0, Math.min(20, current + delta));
      const copy = { ...prev };
      if (next === 0) {
        delete copy[dishId];
      } else {
        copy[dishId] = next;
      }
      return copy;
    });
  };

  const selectedOrderItems = Object.entries(orderQuantities)
    .map(([dishId, quantity]) => {
      const dish = publicDishes.find((d) => d.id === dishId);
      if (!dish || quantity <= 0) return null;
      return {
        ...dish,
        quantity,
      };
    })
    .filter(Boolean) as Array<PublicDish & { quantity: number }>;

  const totalOrderItemsCount = selectedOrderItems.reduce((acc, item) => acc + item.quantity, 0);
  const totalEstimatedPrice = selectedOrderItems.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );

  const handleConfirmOrderForStaff = async () => {
    if (selectedOrderItems.length === 0 || confirmingOrder) return;
    setConfirmingOrder(true);
    setChatError(null);

    try {
      const res = await fetch('/api/public/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          eventId: activeEventId || undefined,
          moodText: latestMoodText || 'Direct table order list',
          moodSummary: latestMoodSummary || 'Table Selection',
          moodTags: latestMoodTags,
          suggestedDishIds: latestSuggestedIds,
          items: selectedOrderItems.map((item) => ({
            dishId: item.id,
            quantity: item.quantity,
          })),
          orderedDishIds: selectedOrderItems.flatMap((item) =>
            Array(item.quantity).fill(item.id)
          ),
          honeypot,
          botToken: botToken || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Could not confirm order list.');
      }

      setConfirmedOrderCard({
        eventId: data.eventId,
        items: data.confirmedItems || [],
        timestamp: data.timestamp || new Date().toISOString(),
      });
    } catch (err: any) {
      setChatError(err.message || 'Could not save order list.');
    } finally {
      setConfirmingOrder(false);
    }
  };

  const currencySymbol = restaurant?.currency === 'INR' ? '₹' : `${restaurant?.currency || 'INR'} `;

  return (
    <div className="min-h-screen bg-[#0F1F1B] text-[#FBF6EE] flex flex-col justify-between">
      {/* Top Restaurant Header */}
      <header className="sticky top-0 z-30 bg-[#0F1F1B]/95 backdrop-blur-md border-b border-[#24463D] px-4 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#18332C] border border-[#2F5D50] flex items-center justify-center text-[#E0A526]">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-lg sm:text-xl font-bold text-[#FBF6EE]">
                  {restaurant?.name || 'CraveCast Dining'}
                </h1>
                {restaurant?.city && (
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#18332C] border border-[#24463D] text-[#E0A526]">
                    {restaurant.city}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#FBF6EE]/65">
                Mood-Matched Dish Concierge · Real Menu · Zero Guesswork
              </p>
            </div>
          </div>

          {onNavigate && (
            <button
              onClick={() => onNavigate('/')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#FBF6EE]/70 hover:text-[#FBF6EE] bg-[#142823] border border-[#24463D]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CraveCast Home</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-8 space-y-6">
        {loadingMenu ? (
          <div className="rounded-3xl bg-[#142823] border border-[#24463D] p-12 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#E0A526] mx-auto" />
            <p className="text-sm text-[#FBF6EE]/80 font-medium">
              Loading today&apos;s kitchen menu...
            </p>
          </div>
        ) : menuError ? (
          <div className="rounded-3xl bg-[#142823] border border-red-800/60 p-8 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
            <h2 className="font-serif text-xl font-bold text-[#FBF6EE]">Unable to Load Menu</h2>
            <p className="text-xs text-[#FBF6EE]/70 max-w-md mx-auto">{menuError}</p>
          </div>
        ) : menuComingSoon ? (
          /* Polite "Menu Coming Soon" State when no public dishes are enabled */
          <div
            data-testid="menu-coming-soon"
            className="rounded-3xl bg-gradient-to-br from-[#18332C] via-[#142823] to-[#0F1F1B] border border-[#2F5D50] p-8 sm:p-12 text-center space-y-4 shadow-xl"
          >
            <div className="w-14 h-14 rounded-2xl bg-[#0F1F1B] border border-[#2F5D50] flex items-center justify-center text-[#E0A526] mx-auto">
              <ChefHat className="w-7 h-7" />
            </div>
            <span className="inline-block text-[11px] font-semibold uppercase tracking-widest text-[#E0A526]">
              {restaurant?.name || 'Kitchen Update'}
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#FBF6EE]">
              Menu coming soon
            </h2>
            <p className="text-xs sm:text-sm text-[#FBF6EE]/75 max-w-md mx-auto leading-relaxed">
              Our chefs are currently preparing the public menu for mood-based dish suggestions. Please ask your server for today&apos;s freshly prepared specials!
            </p>
          </div>
        ) : (
          <>
            {/* Opening Prompt Card: "How are you feeling today?" */}
            <section className="rounded-3xl bg-gradient-to-br from-[#18332C] via-[#142823] to-[#0F1F1B] border border-[#2F5D50] p-6 sm:p-8 shadow-xl space-y-5">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#E0A526]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Personal Table Concierge</span>
                </div>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#FBF6EE]">
                  How are you feeling today?
                </h2>
                <p className="text-xs sm:text-sm text-[#FBF6EE]/75 max-w-2xl">
                  Tell us your mood, appetite, or craving in English, Hindi, or Telugu. We&apos;ll pair today&apos;s local weather with 3 real dishes from {restaurant?.name}&apos;s menu.
                </p>
              </div>

              {/* Quick Mood Starters */}
              <div className="flex flex-wrap gap-2">
                {QUICK_MOOD_STARTERS.map((starter) => (
                  <button
                    key={starter.label}
                    type="button"
                    disabled={sendingChat}
                    onClick={() => {
                      setMoodInput(starter.text);
                      handleSendMood(starter.text);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#0F1F1B]/90 hover:bg-[#24463D] border border-[#2F5D50] text-xs text-[#FBF6EE]/90 transition-colors"
                  >
                    {starter.label}
                  </button>
                ))}
              </div>

              {/* Mood Input Form with Honeypot & Length Cap */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMood();
                }}
                className="space-y-2.5"
              >
                {/* Honeypot field — invisible to human guests, traps automated bots */}
                <div className="hidden" aria-hidden="true">
                  <label htmlFor="customer-website-hp">Website</label>
                  <input
                    id="customer-website-hp"
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </div>

                <div className="relative">
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={moodInput}
                    onChange={(e) => setMoodInput(e.target.value)}
                    placeholder='e.g. "Exhausted after work, want something warm and comforting" or "आज कुछ चटपटा खाने का मन है"'
                    className="w-full p-3.5 pr-28 rounded-2xl bg-[#0F1F1B] border border-[#2F5D50] focus:border-[#E0A526] text-sm text-[#FBF6EE] placeholder:text-[#FBF6EE]/40 focus:outline-none"
                  />
                  <div className="absolute right-2.5 bottom-2.5 flex items-center gap-2">
                    <span className="text-[11px] text-[#FBF6EE]/45 tabular-nums">
                      {moodInput.length}/300
                    </span>
                    <button
                      type="submit"
                      disabled={sendingChat || !moodInput.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#C8553D] hover:bg-[#B54832] disabled:opacity-50 text-[#FBF6EE] transition-colors shadow"
                    >
                      {sendingChat ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>Match 3 Dishes</span>
                    </button>
                  </div>
                </div>

                {/* Optional Bot Check indicator if Turnstile/reCAPTCHA is configured */}
                {(botProtection.turnstileSiteKey || botProtection.recaptchaSiteKey) && (
                  <div className="flex items-center gap-2 text-[11px] text-[#FBF6EE]/60">
                    <span>Bot verification active</span>
                    <input
                      type="text"
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder="Verification token"
                      className="px-2 py-1 rounded bg-[#0F1F1B] border border-[#24463D] text-xs"
                    />
                  </div>
                )}

                {/* Mandatory Short Consent Line Under the Input */}
                <p
                  data-testid="mood-consent-line"
                  className="text-[11px] text-[#FBF6EE]/60 flex items-center gap-1.5 leading-snug"
                >
                  <Info className="w-3.5 h-3.5 text-[#E0A526] shrink-0" />
                  <span>
                    Consent note: We save your trimmed mood note and selected dishes anonymously to help the restaurant understand which moods drive orders. No personal data or account is used.
                  </span>
                </p>
              </form>

              {chatError && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{chatError}</span>
                </div>
              )}
            </section>

            {/* Confirmed Order Card to Show Staff (When Confirmed) */}
            {confirmedOrderCard && (
              <section
                data-testid="confirmed-staff-order-card"
                className="rounded-3xl bg-[#18332C] border-2 border-[#E0A526] p-6 sm:p-8 shadow-2xl space-y-4"
              >
                <div className="flex items-start justify-between gap-4 border-b border-[#2F5D50] pb-4">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Ready to Show Your Server</span>
                    </div>
                    <h3 className="font-serif text-2xl font-bold text-[#FBF6EE]">
                      Table Order List for Staff
                    </h3>
                    <p className="text-xs text-[#FBF6EE]/70 mt-0.5">
                      Show this card to your waiter to place your order. No online payment required.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[#E0A526] bg-[#0F1F1B] px-3 py-1 rounded-lg border border-[#2F5D50]">
                    #{confirmedOrderCard.eventId.slice(-6).toUpperCase()}
                  </span>
                </div>

                <div className="divide-y divide-[#24463D]">
                  {confirmedOrderCard.items.map((item) => (
                    <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-lg bg-[#E0A526] text-[#0F1F1B] font-bold text-sm tabular-nums">
                            {item.quantity}x
                          </span>
                          <span className="font-serif text-lg font-bold text-[#FBF6EE]">
                            {item.name}
                          </span>
                        </div>
                        {item.allergens && item.allergens.length > 0 && (
                          <p className="text-[11px] text-amber-300 mt-1">
                            Declared Allergens: {item.allergens.join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="font-serif text-base font-bold text-[#FBF6EE] tabular-nums">
                        {currencySymbol}
                        {item.price * item.quantity}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-[#2F5D50] flex items-center justify-between">
                  <span className="text-xs text-[#FBF6EE]/70">
                    Estimated Menu Total (Pay at table)
                  </span>
                  <span className="font-serif text-xl font-bold text-[#E0A526] tabular-nums">
                    {currencySymbol}
                    {confirmedOrderCard.items.reduce(
                      (sum, i) => sum + i.price * i.quantity,
                      0
                    )}
                  </span>
                </div>
              </section>
            )}

            {/* Live Order Tray (When customer taps dishes) */}
            {selectedOrderItems.length > 0 && (
              <section
                data-testid="order-tray"
                className="rounded-2xl bg-[#142823] border border-[#E0A526]/70 p-5 shadow-lg space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#0F1F1B] border border-[#2F5D50] flex items-center justify-center text-[#E0A526]">
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-serif text-base font-bold text-[#FBF6EE]">
                        Your Order List to Show Staff ({totalOrderItemsCount}{' '}
                        {totalOrderItemsCount === 1 ? 'dish' : 'dishes'})
                      </h3>
                      <p className="text-[11px] text-[#FBF6EE]/65">
                        No payment in app — tap Confirm to lock your list and show your server.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-serif text-base font-bold text-[#E0A526] tabular-nums">
                      {currencySymbol}
                      {totalEstimatedPrice}
                    </span>
                    <button
                      type="button"
                      onClick={handleConfirmOrderForStaff}
                      disabled={confirmingOrder}
                      data-testid="confirm-order-btn"
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#C8553D] hover:bg-[#B54832] text-[#FBF6EE] transition-colors shadow"
                    >
                      {confirmingOrder ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      <span>Confirm Order List for Staff</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-[#24463D]">
                  {selectedOrderItems.map((item) => (
                    <div
                      key={item.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0F1F1B] border border-[#24463D] text-xs"
                    >
                      <span className="font-semibold text-[#FBF6EE]">{item.name}</span>
                      <span className="text-[#FBF6EE]/60 tabular-nums">
                        ({currencySymbol}
                        {item.price})
                      </span>
                      <div className="flex items-center gap-1 ml-1">
                        <button
                          type="button"
                          onClick={() => handleAdjustDishQuantity(item.id, -1)}
                          className="p-1 rounded bg-[#18332C] hover:bg-[#24463D] text-[#FBF6EE]"
                          aria-label={`Decrease ${item.name}`}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-1.5 font-bold text-[#E0A526] tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAdjustDishQuantity(item.id, 1)}
                          className="p-1 rounded bg-[#18332C] hover:bg-[#24463D] text-[#FBF6EE]"
                          aria-label={`Increase ${item.name}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Mood Agent Recommendation Turns (3 Real Menu Dishes per Turn) */}
            {chatTurns.map((turn) => (
              <section
                key={turn.id}
                data-testid="mood-suggestions-turn"
                className="rounded-3xl bg-[#142823] border border-[#24463D] p-6 sm:p-8 space-y-6 shadow-lg"
              >
                {/* Guest Message & Weather Context Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#24463D]">
                  <div className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wider text-[#E0A526] font-semibold">
                      Your Mood Note
                    </span>
                    <p className="text-sm text-[#FBF6EE] italic">&ldquo;{turn.customerMessage}&rdquo;</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0F1F1B] border border-[#2F5D50] text-xs text-[#E0A526]">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{turn.moodSummary}</span>
                    </span>
                    {turn.weatherContext && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0F1F1B] border border-[#24463D] text-xs text-[#FBF6EE]/80">
                        <CloudSun className="w-3.5 h-3.5 text-[#E0A526]" />
                        <span>{turn.weatherContext}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Concierge Greeting in Customer's Language */}
                <p className="text-sm sm:text-base text-[#FBF6EE]/90 font-medium leading-relaxed">
                  {turn.greeting}
                </p>

                {/* 3 Dish Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {turn.suggestions.map((dish, idx) => {
                    const qty = orderQuantities[dish.id] || 0;
                    return (
                      <div
                        key={dish.id}
                        data-testid={`suggested-dish-card-${idx}`}
                        className={`rounded-2xl p-5 flex flex-col justify-between border transition-all ${
                          qty > 0
                            ? 'bg-[#18332C] border-[#E0A526] shadow-md'
                            : 'bg-[#0F1F1B] border-[#24463D] hover:border-[#3D7364]'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#E0A526] block">
                                Pick #{idx + 1} · {dish.category}
                              </span>
                              <h4 className="font-serif text-lg font-bold text-[#FBF6EE] leading-snug mt-0.5">
                                {dish.name}
                              </h4>
                            </div>
                            <span className="font-serif text-base font-bold text-[#E0A526] shrink-0 tabular-nums">
                              {currencySymbol}
                              {dish.price}
                            </span>
                          </div>

                          {/* One-line Mood Reason */}
                          {dish.reason && (
                            <p className="text-xs text-[#FBF6EE]/85 bg-[#142823] border border-[#24463D] rounded-xl p-2.5 leading-relaxed">
                              {dish.reason}
                            </p>
                          )}

                          {dish.description && (
                            <p className="text-xs text-[#FBF6EE]/65 line-clamp-2">
                              {dish.description}
                            </p>
                          )}

                          {/* Tags & Strictly Owner-Entered Allergens */}
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {(dish.tags || []).map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 rounded-md bg-[#142823] border border-[#24463D] text-[10px] text-[#FBF6EE]/80"
                              >
                                {tag}
                              </span>
                            ))}
                            {(dish.allergens || []).map((allergen) => (
                              <span
                                key={allergen}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/70 border border-amber-700/80 text-[10px] text-amber-200"
                              >
                                <ShieldAlert className="w-2.5 h-2.5" />
                                <span>Allergen: {allergen}</span>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Tap to Add to Order List */}
                        <div className="pt-4 mt-4 border-t border-[#24463D]/80">
                          {qty === 0 ? (
                            <button
                              type="button"
                              onClick={() => handleAdjustDishQuantity(dish.id, 1)}
                              data-testid={`add-dish-btn-${dish.id}`}
                              className="w-full py-2.5 px-3 rounded-xl text-xs font-semibold bg-[#2F5D50] hover:bg-[#3D7364] text-[#FBF6EE] flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Tap to Add to Order List</span>
                            </button>
                          ) : (
                            <div className="flex items-center justify-between bg-[#0F1F1B] border border-[#E0A526] rounded-xl px-3 py-1.5">
                              <button
                                type="button"
                                onClick={() => handleAdjustDishQuantity(dish.id, -1)}
                                className="p-1 text-[#FBF6EE] hover:text-[#E0A526]"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <span className="text-xs font-bold text-[#E0A526] tabular-nums">
                                {qty} in Order List
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAdjustDishQuantity(dish.id, 1)}
                                className="p-1 text-[#FBF6EE] hover:text-[#E0A526]"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            {/* Browse Full Public Menu Collapsible Section */}
            <section className="rounded-2xl bg-[#142823] border border-[#24463D] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#FBF6EE]">
                    Full Public Menu ({publicDishes.length} dishes)
                  </h3>
                  <p className="text-xs text-[#FBF6EE]/65">
                    Every dish includes owner-verified pricing and allergen declarations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFullMenu((prev) => !prev)}
                  className="px-3.5 py-1.5 rounded-xl bg-[#0F1F1B] border border-[#2F5D50] text-xs font-semibold text-[#E0A526]"
                >
                  {showFullMenu ? 'Hide Full Menu' : 'Browse All Dishes'}
                </button>
              </div>

              {showFullMenu && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#24463D]">
                  {publicDishes.map((dish) => {
                    const qty = orderQuantities[dish.id] || 0;
                    return (
                      <div
                        key={dish.id}
                        className="p-4 rounded-xl bg-[#0F1F1B] border border-[#24463D] flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider text-[#E0A526] font-semibold">
                            {dish.category}
                          </span>
                          <h4 className="font-serif text-base font-bold text-[#FBF6EE]">
                            {dish.name}
                          </h4>
                          {dish.description && (
                            <p className="text-xs text-[#FBF6EE]/65">{dish.description}</p>
                          )}
                          <div className="flex flex-wrap gap-1 pt-1">
                            {(dish.tags || []).map((t) => (
                              <span
                                key={t}
                                className="px-1.5 py-0.5 rounded bg-[#142823] text-[10px] text-[#FBF6EE]/75"
                              >
                                {t}
                              </span>
                            ))}
                            {(dish.allergens || []).map((a) => (
                              <span
                                key={a}
                                className="px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-800 text-[10px] text-amber-200"
                              >
                                Allergen: {a}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="text-right shrink-0 space-y-2">
                          <span className="font-serif text-sm font-bold text-[#E0A526] block tabular-nums">
                            {currencySymbol}
                            {dish.price}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAdjustDishQuantity(dish.id, 1)}
                            className="px-3 py-1.5 rounded-lg bg-[#2F5D50] hover:bg-[#3D7364] text-[11px] font-semibold text-[#FBF6EE]"
                          >
                            {qty > 0 ? `+ Add (${qty})` : '+ Add'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#24463D] py-4 px-4 text-center text-[11px] text-[#FBF6EE]/50">
        Powered by CraveCast · Real Menu Items Only · Owner-Declared Allergens · No Personal Data Collected
      </footer>
    </div>
  );
};
