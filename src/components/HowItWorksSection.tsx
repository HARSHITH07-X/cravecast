import React from 'react';
import { UploadCloud, LineChart, FileSpreadsheet } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

export const HowItWorksSection: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();

  const steps = [
    {
      step: '01',
      title: 'Add your sales (even a photo of your ledger)',
      subtitle: 'Upload POS exports, CSVs, or a photo of your handwritten ledger',
      description:
        'Import your raw sales records effortlessly. CraveCast parses dish names, categories, and historical daily volumes directly from spreadsheets or photo snapshots of your register with zero manual setup.',
      icon: UploadCloud,
      badgeText: 'Step 1: Input Data',
    },
    {
      step: '02',
      title: 'We forecast each dish with a range',
      subtitle: 'Deterministic models generate expected low and high bounds',
      description:
        'Our algorithms compute demand bounds for every menu item, evaluating weekday rhythms, recent trend velocity, and environmental patterns so your team prepares for realistic upper and lower limits.',
      icon: LineChart,
      badgeText: 'Step 2: Statistical Modeling',
    },
    {
      step: '03',
      title: 'You get a prep and order sheet with reasons',
      subtitle: 'A one-page kitchen plan backed by plain-language context',
      description:
        'Receive an actionable daily guide detailing exact batch prep targets and supplier orders. Every target is accompanied by clear, human explanations so your kitchen leads make confident calls.',
      icon: FileSpreadsheet,
      badgeText: 'Step 3: Daily Execution',
    },
  ];

  return (
    <section
      id="how-it-works"
      className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto scroll-mt-20 border-t border-[#24463D]/50"
    >
      <motion.div
        initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-3xl mx-auto mb-20"
      >
        <p className="text-xs font-semibold tracking-widest uppercase text-[#E0A526] mb-3">
          Predictable Workflow
        </p>
        <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FBF6EE] leading-tight">
          How CraveCast turns sales records into daily kitchen prep
        </h2>
        <p className="mt-4 text-base sm:text-lg text-[#FBF6EE]/70 font-light">
          No algorithmic black boxes and no fabricated guesswork. A direct three-stage workflow built for fast-paced kitchen mornings.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative">
        {/* Decorative connecting line on desktop */}
        <div
          className="hidden lg:block absolute top-28 left-[15%] right-[15%] h-[1px] bg-gradient-to-r from-[#2F5D50] via-[#E0A526]/50 to-[#2F5D50] -z-0"
          aria-hidden="true"
        />

        {steps.map((item, idx) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.step}
              initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 35 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.55, delay: shouldReduceMotion ? 0 : idx * 0.2 }}
              whileHover={shouldReduceMotion ? {} : { y: -6, transition: { duration: 0.2 } }}
              className="relative z-10 rounded-2xl bg-[#142823] border border-[#24463D] p-8 shadow-lg flex flex-col justify-between hover:border-[#E0A526]/60 transition-colors duration-300"
            >
              <div>
                <div className="flex items-center justify-between mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-[#0F1F1B] border border-[#2F5D50] flex items-center justify-center text-[#E0A526] shadow-inner group-hover:border-[#E0A526] transition-colors">
                    <Icon className="w-6 h-6 text-[#E0A526]" aria-hidden="true" />
                  </div>
                  <span className="font-serif text-3xl font-extrabold text-[#FBF6EE]/20 tracking-wider">
                    {item.step}
                  </span>
                </div>

                <div className="text-xs font-medium text-[#E0A526] mb-2 tracking-wide">
                  {item.badgeText}
                </div>

                <h3 className="font-serif text-2xl font-bold text-[#FBF6EE] mb-2 leading-snug">
                  {item.title}
                </h3>

                <p className="text-xs text-[#FBF6EE]/50 mb-4 font-medium italic">
                  {item.subtitle}
                </p>

                <p className="text-sm sm:text-base text-[#FBF6EE]/75 leading-relaxed font-normal">
                  {item.description}
                </p>
              </div>

              <div className="mt-8 pt-4 border-t border-[#24463D]/60 flex items-center justify-between text-xs text-[#FBF6EE]/40">
                <span>Deterministic pipeline</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#2F5D50]" />
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
};
