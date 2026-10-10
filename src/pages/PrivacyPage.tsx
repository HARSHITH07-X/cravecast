import React from 'react';
import { ShieldCheck, ArrowLeft, Lock, Database, Trash2, EyeOff } from 'lucide-react';

interface PrivacyPageProps {
  onNavigate: (path: string) => void;
}

export const PrivacyPage: React.FC<PrivacyPageProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-[#0F1F1B] text-[#FBF6EE] flex flex-col selection:bg-[#C8553D] selection:text-[#FBF6EE]">
      {/* Top Header */}
      <header className="border-b border-[#24463D] bg-[#0F1F1B]/90 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#FBF6EE]/70 hover:text-[#E0A526] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526] rounded-lg px-2.5 py-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Home</span>
          </button>
          <div className="h-4 w-px bg-[#24463D]" />
          <span className="font-serif text-lg font-bold text-[#FBF6EE]">CraveCast</span>
        </div>

        <button
          onClick={() => onNavigate('/app')}
          className="text-xs font-semibold px-4 py-2 rounded-xl bg-[#2F5D50] hover:bg-[#3D7364] text-[#FBF6EE] transition-colors"
        >
          Launch Kitchen App
        </button>
      </header>

      {/* Main Privacy Body */}
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-12">
        <div>
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold tracking-widest uppercase text-[#E0A526]">
            <ShieldCheck className="w-4 h-4" />
            <span>Plain-Language Privacy Commitment</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-[#FBF6EE] leading-tight">
            How CraveCast protects and stores your restaurant data
          </h1>
          <p className="mt-4 text-base sm:text-lg text-[#FBF6EE]/70 font-light leading-relaxed">
            We built CraveCast for chefs and independent restaurant owners. We believe your daily sales, recipes, and margin calculations belong strictly to you.
          </p>
        </div>

        {/* Core Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-[#142823] border border-[#24463D] space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#0F1F1B] border border-[#2F5D50] flex items-center justify-center text-[#E0A526]">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#FBF6EE]">1. Isolated Firestore Ownership</h3>
            <p className="text-xs sm:text-sm text-[#FBF6EE]/70 leading-relaxed">
              Every restaurant’s records (menu items, sales batches, recipes, inventory, plans) are stored under an isolated database path (<code className="text-[#E0A526] text-xs">restaurants/&#123;id&#125;</code>) governed by strict security rules. No second account or competitor can ever view your data.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#142823] border border-[#24463D] space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#0F1F1B] border border-[#2F5D50] flex items-center justify-center text-[#E0A526]">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#FBF6EE]">2. Zero Public Firestore Exposure</h3>
            <p className="text-xs sm:text-sm text-[#FBF6EE]/70 leading-relaxed">
              The public never connects to Firestore directly. Public diners interacting with the dish suggestion chat access rate-limited server proxy routes that expose only public dish names and flavors.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#142823] border border-[#24463D] space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#0F1F1B] border border-[#2F5D50] flex items-center justify-center text-[#E0A526]">
              <EyeOff className="w-5 h-5" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#FBF6EE]">3. No Data Selling or Ad Trackers</h3>
            <p className="text-xs sm:text-sm text-[#FBF6EE]/70 leading-relaxed">
              We never sell your sales records, POS numbers, or recipes to food distributors, advertising brokers, or hedge funds. We do not run invasive tracking pixels or commercial ad networks.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#142823] border border-[#24463D] space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#0F1F1B] border border-[#2F5D50] flex items-center justify-center text-[#E0A526]">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#FBF6EE]">4. Immediate Data Purge Guarantee</h3>
            <p className="text-xs sm:text-sm text-[#FBF6EE]/70 leading-relaxed">
              You maintain total data sovereignty. You can export a full, uncompressed JSON backup at any moment, or permanently delete your account and all associated collections with a single click.
            </p>
          </div>
        </div>

        {/* Detailed Sections */}
        <div className="space-y-6 pt-6 border-t border-[#24463D]/60 text-sm text-[#FBF6EE]/80 leading-relaxed">
          <section>
            <h2 className="font-serif text-xl font-bold text-[#FBF6EE] mb-2">What data is stored</h2>
            <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-[#FBF6EE]/70">
              <li><strong>Restaurant Profile:</strong> Restaurant name, city location, opening days, currency, and service operating hours.</li>
              <li><strong>Menu & Recipes:</strong> Dish titles, selling prices, food costs, prep stations, and ingredient ratios.</li>
              <li><strong>Sales History:</strong> Dates, item counts sold, stockout flags, and import batch provenance (CSV, photo, voice).</li>
              <li><strong>Deterministic Plans:</strong> Computed demand intervals (P10, P50, P90) and morning prep checklist targets.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-[#FBF6EE] mb-2">How AI & Gemini are utilized</h2>
            <p className="text-xs sm:text-sm text-[#FBF6EE]/70 leading-relaxed">
              In accordance with our core non-negotiable principles, Gemini NEVER produces prep quantities or forecast numbers. All statistical forecasts are computed by deterministic mathematical ensembles. The LLM is used only to parse multimodal receipts, explain calculations in plain language, and recommend dishes based on guest sentiment. All API calls execute securely server-side.
            </p>
          </section>
        </div>

        {/* Return Button */}
        <div className="pt-8 flex justify-center">
          <button
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-sm bg-[#C8553D] hover:bg-[#B54832] text-[#FBF6EE] transition-colors shadow-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to CraveCast Home</span>
          </button>
        </div>
      </main>
    </div>
  );
};
