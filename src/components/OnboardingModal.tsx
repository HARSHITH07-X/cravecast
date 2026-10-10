import React, { useState } from 'react';
import { ChefHat, ArrowRight, Loader2, Clock, Calendar, MapPin, DollarSign } from 'lucide-react';
import { useAuth } from '../lib/authContext';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const CURRENCIES = [
  { code: 'INR', symbol: '₹', label: 'Indian Rupee (INR)' },
  { code: 'USD', symbol: '$', label: 'US Dollar (USD)' },
  { code: 'EUR', symbol: '€', label: 'Euro (EUR)' },
  { code: 'GBP', symbol: '£', label: 'British Pound (GBP)' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham (AED)' },
  { code: 'CAD', symbol: '$', label: 'Canadian Dollar (CAD)' },
  { code: 'AUD', symbol: '$', label: 'Australian Dollar (AUD)' },
  { code: 'SGD', symbol: '$', label: 'Singapore Dollar (SGD)' },
];

export const OnboardingModal: React.FC = () => {
  const { idToken, refreshRestaurant, user } = useAuth();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [openingDays, setOpeningDays] = useState<string[]>([...DAYS_OF_WEEK]);
  const [lunchStart, setLunchStart] = useState('12:00');
  const [lunchEnd, setLunchEnd] = useState('15:30');
  const [dinnerStart, setDinnerStart] = useState('19:00');
  const [dinnerEnd, setDinnerEnd] = useState('23:00');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (day: string) => {
    if (openingDays.includes(day)) {
      if (openingDays.length === 1) return; // Must have at least one day
      setOpeningDays(openingDays.filter((d) => d !== day));
    } else {
      setOpeningDays([...openingDays, day]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide your restaurant name.');
      return;
    }
    if (!city.trim()) {
      setError('Please provide your restaurant location city.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const activeToken = (await user?.getIdToken()) || idToken;
      if (!activeToken) {
        throw new Error('Please sign in before setting up your restaurant.');
      }

      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          city: city.trim(),
          currency,
          openingDays,
          serviceHours: {
            lunchStart,
            lunchEnd,
            dinnerStart,
            dinnerEnd,
          },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to complete restaurant setup.');
      }

      await refreshRestaurant();
    } catch (err: any) {
      console.error('Onboarding failed:', err);
      setError(err.message || 'Something went wrong while saving your restaurant.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl my-8 rounded-3xl bg-[#142823] border border-[#2F5D50] p-6 sm:p-10 shadow-2xl text-[#FBF6EE]">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#18332C] border border-[#2F5D50] mx-auto mb-4 flex items-center justify-center text-[#E0A526] shadow-inner">
            <ChefHat className="w-7 h-7" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-widest text-[#E0A526]">
            Welcome to CraveCast
          </span>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold mt-1 text-[#FBF6EE]">
            Set up your kitchen profile
          </h2>
          <p className="text-xs sm:text-sm text-[#FBF6EE]/70 max-w-md mx-auto mt-2 leading-relaxed">
            Tell us about your restaurant to calibrate your daily prep schedules and local service hours.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/60 border border-red-800/80 text-red-200 text-xs sm:text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Restaurant Name & City */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#FBF6EE]/80 uppercase tracking-wider mb-2">
                Restaurant Name <span className="text-[#C8553D]">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Copper Pot Bistro"
                className="w-full px-4 py-3 bg-[#0F1F1B] border border-[#24463D] focus:border-[#E0A526] rounded-xl text-[#FBF6EE] placeholder-[#FBF6EE]/30 focus:outline-none focus:ring-1 focus:ring-[#E0A526] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#FBF6EE]/80 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#E0A526]" />
                City / Location <span className="text-[#C8553D]">*</span>
              </label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Mumbai, Bengaluru"
                className="w-full px-4 py-3 bg-[#0F1F1B] border border-[#24463D] focus:border-[#E0A526] rounded-xl text-[#FBF6EE] placeholder-[#FBF6EE]/30 focus:outline-none focus:ring-1 focus:ring-[#E0A526] text-sm"
              />
            </div>
          </div>

          {/* Currency Selection */}
          <div>
            <label className="block text-xs font-semibold text-[#FBF6EE]/80 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-[#E0A526]" />
              Operating Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-4 py-3 bg-[#0F1F1B] border border-[#24463D] focus:border-[#E0A526] rounded-xl text-[#FBF6EE] focus:outline-none focus:ring-1 focus:ring-[#E0A526] text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code} className="bg-[#142823] text-[#FBF6EE]">
                  {c.label} ({c.symbol})
                </option>
              ))}
            </select>
          </div>

          {/* Operating Days */}
          <div>
            <label className="block text-xs font-semibold text-[#FBF6EE]/80 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#E0A526]" />
              Opening Days
            </label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = openingDays.includes(day);
                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-[#2F5D50] border-[#3D7364] text-[#FBF6EE]'
                        : 'bg-[#0F1F1B] border-[#24463D] text-[#FBF6EE]/40 hover:text-[#FBF6EE]'
                    }`}
                  >
                    {day.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Service Hours */}
          <div className="p-4 rounded-2xl bg-[#0F1F1B] border border-[#24463D] space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#E0A526] uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5" />
              <span>Typical Service Timings</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="block text-[#FBF6EE]/70 font-medium mb-1">Lunch Service</span>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={lunchStart}
                    onChange={(e) => setLunchStart(e.target.value)}
                    className="w-full px-3 py-2 bg-[#142823] border border-[#24463D] rounded-lg text-[#FBF6EE] focus:outline-none focus:ring-1 focus:ring-[#E0A526]"
                  />
                  <span className="text-[#FBF6EE]/40">to</span>
                  <input
                    type="time"
                    value={lunchEnd}
                    onChange={(e) => setLunchEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-[#142823] border border-[#24463D] rounded-lg text-[#FBF6EE] focus:outline-none focus:ring-1 focus:ring-[#E0A526]"
                  />
                </div>
              </div>

              <div>
                <span className="block text-[#FBF6EE]/70 font-medium mb-1">Dinner Service</span>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={dinnerStart}
                    onChange={(e) => setDinnerStart(e.target.value)}
                    className="w-full px-3 py-2 bg-[#142823] border border-[#24463D] rounded-lg text-[#FBF6EE] focus:outline-none focus:ring-1 focus:ring-[#E0A526]"
                  />
                  <span className="text-[#FBF6EE]/40">to</span>
                  <input
                    type="time"
                    value={dinnerEnd}
                    onChange={(e) => setDinnerEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-[#142823] border border-[#24463D] rounded-lg text-[#FBF6EE] focus:outline-none focus:ring-1 focus:ring-[#E0A526]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-6 rounded-xl font-semibold text-sm text-[#FBF6EE] bg-[#C8553D] hover:bg-[#B54832] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Configuring your kitchen...</span>
                </>
              ) : (
                <>
                  <span>Complete Kitchen Setup</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
