import React from 'react';
import { Trash2, TrendingDown, CloudRain } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

export const ProblemSection: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();

  const problems = [
    {
      number: '01',
      title: 'Food waste eats margin',
      description:
        'Prepping on assumptions leaves unsold pans and spoiled mise en place in the bin every night. When batch sizes are based on routine rather than real demand, kitchen profit evaporates before dinner service concludes.',
      icon: Trash2,
      accentColor: '#C8553D', // Terracotta
    },
    {
      number: '02',
      title: 'Bestsellers sell out at peak hour',
      description:
        'Running out of your signature dish at 8:00 PM leaves prime tables disappointed and kitchen line rhythms broken. Under-prepping caps your busiest nights and permanently damages guest return visits.',
      icon: TrendingDown,
      accentColor: '#E0A526', // Mustard
    },
    {
      number: '03',
      title: "Gut feel can't track weather, festivals and moods",
      description:
        'Even veteran chefs cannot mentally balance rain forecasts, neighborhood concerts, day-of-week patterns, and shifting dining cravings at once. Human intuition misses the multi-variable shifts that dictate what diners actually order.',
      icon: CloudRain,
      accentColor: '#3D7364', // Deep green accent
    },
  ];

  return (
    <section id="problem" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto scroll-mt-20">
      <motion.div
        initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.6 }}
        className="max-w-3xl mb-16"
      >
        <p className="text-xs font-semibold tracking-widest uppercase text-[#E0A526] mb-3">
          The Kitchen Dilemma
        </p>
        <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FBF6EE] leading-tight">
          Every evening, kitchens make high-stakes bets on the wrong numbers.
        </h2>
        <p className="mt-4 text-base sm:text-lg text-[#FBF6EE]/70 font-light leading-relaxed">
          Operating a restaurant is hard enough without playing a daily guessing game at the prep station.
          Traditional kitchens rely on yesterday’s gut feel, resulting in identical recurring friction.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {problems.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.article
              key={item.number}
              initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: shouldReduceMotion ? 0 : index * 0.15 }}
              whileHover={shouldReduceMotion ? {} : { y: -6, transition: { duration: 0.2 } }}
              className="group relative rounded-2xl bg-[#142823] border border-[#24463D] p-8 shadow-lg hover:border-[#3D7364] hover:shadow-2xl transition-colors duration-300 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-6">
                  <span className="font-serif text-2xl font-bold text-[#FBF6EE]/30 group-hover:text-[#E0A526] transition-colors">
                    {item.number}
                  </span>
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center border transition-all duration-300 group-hover:scale-110 shadow-sm"
                    style={{
                      backgroundColor: 'rgba(15, 31, 27, 0.7)',
                      borderColor: item.accentColor,
                    }}
                  >
                    <Icon className="w-5 h-5" style={{ color: item.accentColor }} aria-hidden="true" />
                  </div>
                </div>

                <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#FBF6EE] mb-4 leading-snug">
                  {item.title}
                </h3>

                <p className="text-sm sm:text-base text-[#FBF6EE]/75 leading-relaxed font-normal">
                  {item.description}
                </p>
              </div>

              <div className="mt-8 pt-4 border-t border-[#24463D]/60 flex items-center text-xs text-[#FBF6EE]/50">
                <span>Direct kitchen operational risk</span>
              </div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
};
