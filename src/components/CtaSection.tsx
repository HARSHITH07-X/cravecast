import React from 'react';
import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

interface CtaSectionProps {
  onNavigate: (path: string) => void;
}

export const CtaSection: React.FC<CtaSectionProps> = ({ onNavigate }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <motion.div
        initial={shouldReduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.98, y: 20 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.6 }}
        className="relative rounded-3xl bg-gradient-to-br from-[#18332C] via-[#142823] to-[#0F1F1B] border border-[#2F5D50] p-8 sm:p-14 lg:p-20 overflow-hidden shadow-2xl"
      >
        {/* Animated ambient light spots */}
        <motion.div
          animate={
            shouldReduceMotion
              ? {}
              : {
                  scale: [1, 1.15, 1],
                  opacity: [0.12, 0.22, 0.12],
                }
          }
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#E0A526]/15 blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <motion.div
          animate={
            shouldReduceMotion
              ? {}
              : {
                  scale: [1, 1.2, 1],
                  opacity: [0.15, 0.25, 0.15],
                }
          }
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-[#C8553D]/20 blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <p className="text-xs font-semibold tracking-widest uppercase text-[#E0A526] mb-3">
            Ready For Service
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FBF6EE] leading-tight mb-6">
            Stop guessing what to prep tomorrow morning.
          </h2>
          <p className="text-base sm:text-lg text-[#FBF6EE]/80 max-w-2xl mx-auto mb-10 leading-relaxed font-light">
            Bring your own sales history, set your menu, and generate deterministic forecast ranges and prep sheets designed for line chefs.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => onNavigate('/app')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 text-base font-semibold text-[#FBF6EE] bg-[#C8553D] hover:bg-[#B54832] active:bg-[#9B3C28] rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
            >
              <span>Get started</span>
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              onClick={() => onNavigate('/app')}
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-[#FBF6EE] bg-transparent hover:bg-[#18332C] border border-[#2F5D50] hover:border-[#3D7364] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
            >
              Sign in to kitchen
            </button>
          </div>
        </div>
      </motion.div>
    </section>
  );
};
