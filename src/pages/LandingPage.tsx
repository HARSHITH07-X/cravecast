import React from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Navbar } from '../components/Navbar';
import { HeroIllustration } from '../components/HeroIllustration';
import { ProblemSection } from '../components/ProblemSection';
import { HowItWorksSection } from '../components/HowItWorksSection';
import { FeaturesSection } from '../components/FeaturesSection';
import { CtaSection } from '../components/CtaSection';
import { Footer } from '../components/Footer';

interface LandingPageProps {
  onNavigate: (path: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const shouldReduceMotion = useReducedMotion();

  const scrollToHowItWorks = () => {
    const el = document.querySelector('#how-it-works');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#0F1F1B] text-[#FBF6EE] flex flex-col selection:bg-[#C8553D] selection:text-[#FBF6EE]">
      {/* Sticky Navbar */}
      <Navbar onNavigate={onNavigate} />

      <main className="flex-1">
        {/* HERO SECTION */}
        <section className="relative pt-12 pb-20 md:pt-20 md:pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto overflow-hidden">
          {/* Subtle ambient light */}
          <div
            className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-[#2F5D50]/20 via-[#E0A526]/10 to-transparent rounded-full blur-3xl pointer-events-none -z-10"
            aria-hidden="true"
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Left Column: Value Proposition with Motion Stagger */}
            <div className="lg:col-span-7 flex flex-col items-start text-left">
              {/* Quiet editorial kicker */}
              <motion.div
                initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex items-center gap-2 mb-6 text-xs uppercase tracking-widest text-[#E0A526] font-semibold"
              >
                <span className="w-2 h-2 rounded-full bg-[#E0A526] animate-pulse" aria-hidden="true" />
                <span>Deterministic Kitchen Intelligence</span>
              </motion.div>

              {/* Primary Headline */}
              <motion.h1
                initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: shouldReduceMotion ? 0 : 0.1 }}
                className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-[#FBF6EE] leading-[1.08] mb-6"
              >
                Stop guessing <br className="hidden sm:inline" />
                what to prep.
              </motion.h1>

              {/* Subheadline */}
              <motion.p
                initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: shouldReduceMotion ? 0 : 0.2 }}
                className="text-lg sm:text-xl text-[#FBF6EE]/80 max-w-2xl font-light leading-relaxed mb-10"
              >
                CraveCast forecasts demand for every dish and turns it into a simple daily prep and
                order sheet, so you waste less and never run out of bestsellers.
              </motion.p>

              {/* Action Buttons */}
              <motion.div
                initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: shouldReduceMotion ? 0 : 0.3 }}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto"
              >
                <button
                  onClick={() => onNavigate('/app')}
                  className="inline-flex items-center justify-center gap-3 px-8 py-4 text-base font-semibold text-[#FBF6EE] bg-[#C8553D] hover:bg-[#B54832] active:bg-[#9B3C28] rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
                >
                  <span>Get started</span>
                  <ArrowRight className="w-5 h-5" aria-hidden="true" />
                </button>

                <button
                  onClick={scrollToHowItWorks}
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 text-base font-semibold text-[#FBF6EE] bg-[#18332C]/80 hover:bg-[#18332C] border border-[#2F5D50] hover:border-[#3D7364] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
                >
                  <span>See how it works</span>
                  <ChevronDown className="w-4 h-4 text-[#E0A526]" aria-hidden="true" />
                </button>
              </motion.div>

              {/* Core Guarantees note */}
              <motion.div
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, delay: shouldReduceMotion ? 0 : 0.45 }}
                className="mt-10 pt-6 border-t border-[#24463D]/70 w-full flex flex-wrap items-center gap-y-2 gap-x-6 text-xs text-[#FBF6EE]/60"
              >
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E0A526]" />
                  <span>Deterministic range calculations</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2F5D50]" />
                  <span>No mock numbers or hallucinated prep</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C8553D]" />
                  <span>Explainable daily reasons</span>
                </div>
              </motion.div>
            </div>

            {/* Right Column: Abstract Geometric Illustration with entrance motion */}
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: shouldReduceMotion ? 0 : 0.2 }}
              className="lg:col-span-5 w-full flex justify-center items-center"
            >
              <HeroIllustration />
            </motion.div>
          </div>
        </section>

        {/* PROBLEM SECTION */}
        <ProblemSection />

        {/* HOW IT WORKS SECTION */}
        <HowItWorksSection />

        {/* FEATURES SECTION */}
        <FeaturesSection />

        {/* CLOSING CALL TO ACTION */}
        <CtaSection onNavigate={onNavigate} />
      </main>

      {/* FOOTER */}
      <Footer onNavigate={onNavigate} />
    </div>
  );
};
