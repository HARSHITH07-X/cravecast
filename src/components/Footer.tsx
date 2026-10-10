import React, { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FooterProps {
  onNavigate: (path: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const handleNavClick = (href: string) => {
    if (href.startsWith('#')) {
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else {
      onNavigate(href);
    }
  };

  return (
    <footer className="border-t border-[#24463D] bg-[#0A1613] text-[#FBF6EE]/70 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-[#18332C] border border-[#2F5D50] flex items-center justify-center">
              <svg
                className="w-4 h-4 text-[#E0A526]"
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
            <span className="font-serif text-xl font-bold text-[#FBF6EE]">CraveCast</span>
          </div>
          <p className="text-xs text-[#FBF6EE]/60 max-w-sm leading-relaxed">
            Deterministic demand forecasting and daily prep planning for restaurant kitchens.
            Built on real sales data, understandable math, and customer sentiment signals.
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-6 text-sm font-medium" aria-label="Footer Navigation">
          <a
            href="#problem"
            onClick={(e) => {
              e.preventDefault();
              handleNavClick('#problem');
            }}
            className="hover:text-[#FBF6EE] transition-colors py-1"
          >
            Problem
          </a>
          <a
            href="#how-it-works"
            onClick={(e) => {
              e.preventDefault();
              handleNavClick('#how-it-works');
            }}
            className="hover:text-[#FBF6EE] transition-colors py-1"
          >
            How it works
          </a>
          <a
            href="#features"
            onClick={(e) => {
              e.preventDefault();
              handleNavClick('#features');
            }}
            className="hover:text-[#FBF6EE] transition-colors py-1"
          >
            Features
          </a>
          <button
            onClick={() => setPrivacyOpen(true)}
            className="hover:text-[#FBF6EE] transition-colors py-1 underline-offset-4 hover:underline text-left cursor-pointer"
          >
            Privacy
          </button>
          <button
            onClick={() => onNavigate('/app')}
            className="text-[#E0A526] hover:underline transition-all py-1 font-semibold"
          >
            Launch CraveCast
          </button>
        </nav>
      </div>

      <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-[#1C3830] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#FBF6EE]/40">
        <p>© {new Date().getFullYear()} CraveCast. All rights reserved.</p>
        <p>Kitchen operations software designed for culinary precision.</p>
      </div>

      {/* Accessible Privacy Policy Modal */}
      <AnimatePresence>
        {privacyOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-modal-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.2 }}
              className="bg-[#142823] border border-[#2F5D50] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl text-[#FBF6EE] relative"
            >
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#24463D]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0F1F1B] border border-[#2F5D50] flex items-center justify-center text-[#E0A526]">
                    <ShieldCheck className="w-5 h-5 text-[#E0A526]" />
                  </div>
                  <div>
                    <h3 id="privacy-modal-title" className="font-serif text-xl font-bold">
                      Privacy & Data Ownership
                    </h3>
                    <p className="text-xs text-[#FBF6EE]/60">Your restaurant data belongs to you.</p>
                  </div>
                </div>
                <button
                  onClick={() => setPrivacyOpen(false)}
                  className="p-2 text-[#FBF6EE]/60 hover:text-[#FBF6EE] rounded-xl hover:bg-[#18332C] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
                  aria-label="Close privacy policy"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-sm text-[#FBF6EE]/80 max-h-[60vh] overflow-y-auto pr-1">
                <section>
                  <h4 className="font-semibold text-[#FBF6EE] mb-1">1. Sole Ownership of Sales History</h4>
                  <p className="text-xs leading-relaxed text-[#FBF6EE]/70">
                    All sales figures, receipts, ledger photos, recipes, and prep sheets imported into CraveCast remain strictly your proprietary property. We do not sell or broker restaurant data.
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-[#FBF6EE] mb-1">2. Public Dining Privacy</h4>
                  <p className="text-xs leading-relaxed text-[#FBF6EE]/70">
                    Customer flavor mood chats are session-only and require no diner sign-in. Guests never need to disclose their real name, phone number, or payment details to receive dish suggestions.
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-[#FBF6EE] mb-1">3. Delete-My-Data Guarantee</h4>
                  <p className="text-xs leading-relaxed text-[#FBF6EE]/70">
                    You can purge your entire menu, sales records, and forecasting history at any time from your settings with immediate permanent removal.
                  </p>
                </section>
              </div>

              <div className="mt-6 pt-4 border-t border-[#24463D] flex justify-end">
                <button
                  onClick={() => setPrivacyOpen(false)}
                  className="px-5 py-2.5 bg-[#C8553D] hover:bg-[#B54832] text-sm font-semibold text-[#FBF6EE] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
                >
                  Understood
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </footer>
  );
};

