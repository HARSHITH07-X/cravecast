import React from 'react';
import { SlidersHorizontal, MessageSquareHeart, MessageSquareQuote, History, ClipboardCheck, RefreshCw } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

export const FeaturesSection: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();

  const features = [
    {
      title: 'Forecast ranges',
      description:
        'Single-number predictions break the moment service deviates. CraveCast computes lower, expected, and upper bounds for every item so your kitchen can buffer rush hours and protect bottom-line food cost.',
      icon: SlidersHorizontal,
      category: 'Statistical Rigor',
    },
    {
      title: 'Mood-based ordering',
      description:
        'Guests talk with a frictionless public chat about what they crave. CraveCast routes real-time patron flavor cravings and weather mood sentiments directly back to your kitchen dashboard.',
      icon: MessageSquareHeart,
      category: 'Guest Sentiment',
    },
    {
      title: 'Plain-language reasons',
      description:
        'No mysterious algorithms or unexplained shifts. Every single recommendation is accompanied by an operational explanation detailing weekday factors, seasonal patterns, and trending momentum.',
      icon: MessageSquareQuote,
      category: 'Explainability',
    },
    {
      title: 'Measured accuracy',
      description:
        'Deterministic forecasting routines run against your historical logs to assess variance. Your kitchen sees exactly how past predictions measured against actual register receipts.',
      icon: History,
      category: 'Model Reliability',
    },
    {
      title: 'Supplier-ready order list',
      description:
        'Dish forecasts automatically translate into batch prep volumes and supplier order units on a unified one-page sheet, structured specifically for morning line checks and storage walk-ins.',
      icon: ClipboardCheck,
      category: 'Kitchen Operations',
    },
    {
      title: 'Feedback that learns',
      description:
        'Log end-of-day waste and item 86 timings with one tap. CraveCast automatically refines ingredient safety buffers and batch minimums based on your kitchen’s real service outcomes.',
      icon: RefreshCw,
      category: 'Continuous Tuning',
    },
  ];

  return (
    <section
      id="features"
      className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto scroll-mt-20 border-t border-[#24463D]/50"
    >
      <motion.div
        initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.6 }}
        className="max-w-3xl mb-16"
      >
        <p className="text-xs font-semibold tracking-widest uppercase text-[#E0A526] mb-3">
          Built For Real Kitchens
        </p>
        <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FBF6EE] leading-tight">
          Engineered for line precision, not tech speculation
        </h2>
        <p className="mt-4 text-base sm:text-lg text-[#FBF6EE]/70 font-light">
          Six foundational capabilities created to eliminate morning prep anxiety and eliminate 86ed bestsellers.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {features.map((feature, idx) => {
          const Icon = feature.icon;
          return (
            <motion.article
              key={idx}
              initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: shouldReduceMotion ? 0 : (idx % 3) * 0.15 }}
              whileHover={shouldReduceMotion ? {} : { y: -6, transition: { duration: 0.2 } }}
              className="group relative rounded-2xl bg-[#142823] border border-[#24463D] p-8 shadow-md hover:border-[#3D7364] hover:shadow-xl transition-colors duration-300 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div className="w-12 h-12 rounded-xl bg-[#0F1F1B] border border-[#2F5D50] flex items-center justify-center text-[#E0A526] group-hover:border-[#E0A526] transition-colors">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <span className="text-xs font-medium text-[#FBF6EE]/40 uppercase tracking-wider">
                    {feature.category}
                  </span>
                </div>

                <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#FBF6EE] mb-3 leading-snug group-hover:text-[#E0A526] transition-colors">
                  {feature.title}
                </h3>

                <p className="text-sm sm:text-base text-[#FBF6EE]/75 leading-relaxed font-normal">
                  {feature.description}
                </p>
              </div>

              <div className="mt-8 pt-4 border-t border-[#24463D]/50 flex items-center text-xs text-[#E0A526]/70">
                <span>Production ready</span>
              </div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
};
