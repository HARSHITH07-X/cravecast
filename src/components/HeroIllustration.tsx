import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

export const HeroIllustration: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="relative w-full aspect-[4/3] sm:aspect-square max-w-[540px] mx-auto flex items-center justify-center select-none">
      {/* Animated ambient background aura */}
      <motion.div
        animate={
          shouldReduceMotion
            ? {}
            : {
                scale: [1, 1.08, 1],
                opacity: [0.35, 0.5, 0.35],
              }
        }
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#2F5D50]/40 via-[#E0A526]/20 to-[#C8553D]/25 blur-3xl -z-10"
        aria-hidden="true"
      />

      {/* Main SVG Composition */}
      <svg
        viewBox="0 0 540 500"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-2xl overflow-visible"
        role="img"
        aria-label="Abstract geometric illustration representing culinary plates, a planning calendar, and demand forecast ranges"
      >
        <defs>
          <linearGradient id="plateGrad" x1="60" y1="60" x2="280" y2="280" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1E3D35" />
            <stop offset="0.5" stopColor="#152B24" />
            <stop offset="1" stopColor="#0D1C17" />
          </linearGradient>

          <linearGradient id="rimGrad" x1="70" y1="70" x2="270" y2="270" gradientUnits="userSpaceOnUse">
            <stop stopColor="#E0A526" stopOpacity="0.85" />
            <stop offset="0.5" stopColor="#C8553D" stopOpacity="0.45" />
            <stop offset="1" stopColor="#2F5D50" stopOpacity="0.65" />
          </linearGradient>

          <linearGradient id="calGrad" x1="260" y1="180" x2="480" y2="400" gradientUnits="userSpaceOnUse">
            <stop stopColor="#18342D" />
            <stop offset="1" stopColor="#10241E" />
          </linearGradient>

          <linearGradient id="bandGrad" x1="60" y1="360" x2="480" y2="360" gradientUnits="userSpaceOnUse">
            <stop stopColor="#E0A526" stopOpacity="0.25" />
            <stop offset="0.5" stopColor="#C8553D" stopOpacity="0.32" />
            <stop offset="1" stopColor="#2F5D50" stopOpacity="0.35" />
          </linearGradient>

          <linearGradient id="curveLine" x1="60" y1="380" x2="480" y2="300" gradientUnits="userSpaceOnUse">
            <stop stopColor="#E0A526" />
            <stop offset="0.6" stopColor="#FBF6EE" />
            <stop offset="1" stopColor="#C8553D" />
          </linearGradient>

          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Subtle decorative architectural grid lines */}
        <line x1="40" y1="240" x2="500" y2="240" stroke="#24463D" strokeWidth="1" strokeDasharray="4 8" opacity="0.4" />
        <line x1="270" y1="30" x2="270" y2="470" stroke="#24463D" strokeWidth="1" strokeDasharray="4 8" opacity="0.4" />

        {/* Outer orbital rotating ring */}
        <motion.circle
          cx="210"
          cy="210"
          r="175"
          stroke="#2F5D50"
          strokeWidth="1"
          strokeDasharray="6 6"
          opacity="0.5"
          animate={shouldReduceMotion ? {} : { rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
          style={{ originX: '210px', originY: '210px' }}
        />
        <circle cx="210" cy="210" r="195" stroke="#E0A526" strokeWidth="1" opacity="0.2" />

        {/* 1. PLATE SHAPE WITH SUBTLE HOVER & BREATHING */}
        <motion.g
          id="plate-shape"
          animate={
            shouldReduceMotion
              ? {}
              : {
                  y: [0, -6, 0],
                }
          }
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {/* Cast shadow */}
          <circle cx="215" cy="218" r="140" fill="#0A1512" opacity="0.75" />

          {/* Outer plate rim */}
          <circle cx="210" cy="210" r="140" fill="url(#plateGrad)" stroke="url(#rimGrad)" strokeWidth="3" />

          {/* Inner plate well */}
          <circle cx="210" cy="210" r="96" fill="#11241E" stroke="#24463D" strokeWidth="2" />

          {/* Center culinary accent circle */}
          <circle cx="210" cy="210" r="58" fill="#162E27" stroke="#3D7364" strokeWidth="1.5" />

          {/* Rotating delicacy concentric dashed circle */}
          <motion.circle
            cx="210"
            cy="210"
            r="28"
            fill="none"
            stroke="#E0A526"
            strokeWidth="1"
            strokeDasharray="2 4"
            opacity="0.7"
            animate={shouldReduceMotion ? {} : { rotate: -360 }}
            transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
            style={{ originX: '210px', originY: '210px' }}
          />
          <circle cx="210" cy="210" r="12" fill="#C8553D" opacity="0.85" />
        </motion.g>

        {/* 2. CALENDAR TABLET SHAPE */}
        <motion.g
          id="calendar-shape"
          animate={
            shouldReduceMotion
              ? {}
              : {
                  y: [0, 8, 0],
                }
          }
          transition={{
            duration: 7,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 0.5,
          }}
        >
          {/* Shadow behind calendar */}
          <rect x="272" y="142" width="210" height="230" rx="20" fill="#091410" opacity="0.8" />

          {/* Calendar Card Frame */}
          <rect
            x="264"
            y="134"
            width="210"
            height="230"
            rx="20"
            fill="url(#calGrad)"
            stroke="#2F5D50"
            strokeWidth="2"
          />

          {/* Calendar Header Bar */}
          <rect x="264" y="134" width="210" height="48" rx="20" fill="#1C3C32" />
          <rect x="264" y="162" width="210" height="20" fill="#1C3C32" />

          {/* Calendar Pegs */}
          <rect x="304" y="122" width="12" height="24" rx="6" fill="#E0A526" />
          <rect x="424" y="122" width="12" height="24" rx="6" fill="#E0A526" />

          {/* Calendar Header Line */}
          <line x1="288" y1="158" x2="350" y2="158" stroke="#FBF6EE" strokeWidth="3" strokeLinecap="round" opacity="0.8" />

          {/* Calendar Day Grid Slots (Geometric slots - no numbers) */}
          {/* Row 1 */}
          <rect x="288" y="196" width="30" height="26" rx="6" fill="#132720" stroke="#24463D" strokeWidth="1" />
          <rect x="328" y="196" width="30" height="26" rx="6" fill="#132720" stroke="#24463D" strokeWidth="1" />
          <rect x="368" y="196" width="30" height="26" rx="6" fill="#132720" stroke="#24463D" strokeWidth="1" />
          <motion.rect
            x="408"
            y="196"
            width="30"
            height="26"
            rx="6"
            fill="#C8553D"
            fillOpacity="0.3"
            stroke="#C8553D"
            strokeWidth="1.5"
            animate={shouldReduceMotion ? {} : { opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 3, repeat: Infinity }}
          />

          {/* Row 2 */}
          <rect x="288" y="234" width="30" height="26" rx="6" fill="#132720" stroke="#24463D" strokeWidth="1" />
          <motion.rect
            x="328"
            y="234"
            width="30"
            height="26"
            rx="6"
            fill="#E0A526"
            fillOpacity="0.3"
            stroke="#E0A526"
            strokeWidth="1.5"
            animate={shouldReduceMotion ? {} : { opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 3.5, repeat: Infinity, delay: 0.7 }}
          />
          <rect x="368" y="234" width="30" height="26" rx="6" fill="#132720" stroke="#24463D" strokeWidth="1" />
          <rect x="408" y="234" width="30" height="26" rx="6" fill="#132720" stroke="#24463D" strokeWidth="1" />

          {/* Row 3 */}
          <rect x="288" y="272" width="30" height="26" rx="6" fill="#132720" stroke="#24463D" strokeWidth="1" />
          <rect x="328" y="272" width="30" height="26" rx="6" fill="#132720" stroke="#24463D" strokeWidth="1" />
          <rect x="368" y="272" width="30" height="26" rx="6" fill="#2F5D50" fillOpacity="0.45" stroke="#3D7364" strokeWidth="1.5" />
          <rect x="408" y="272" width="30" height="26" rx="6" fill="#132720" stroke="#24463D" strokeWidth="1" />

          {/* Row 4 */}
          <rect x="288" y="310" width="30" height="26" rx="6" fill="#132720" stroke="#24463D" strokeWidth="1" />
          <rect x="328" y="310" width="30" height="26" rx="6" fill="#132720" stroke="#24463D" strokeWidth="1" />
          <rect x="368" y="310" width="30" height="26" rx="6" fill="#132720" stroke="#24463D" strokeWidth="1" />
          <rect x="408" y="310" width="30" height="26" rx="6" fill="#132720" stroke="#24463D" strokeWidth="1" />
        </motion.g>

        {/* 3. DEMAND RANGE & FORECAST RIBBON (Animated Floating Flow) */}
        <g id="chart-shapes">
          {/* Upper & Lower Demand Envelope Ribbon (Range Band - no numbers) */}
          <path
            d="M 50 400
               C 120 370, 180 320, 240 330
               C 300 340, 360 270, 420 280
               C 460 285, 490 270, 510 260
               L 510 320
               C 480 335, 450 350, 410 350
               C 350 350, 290 410, 230 405
               C 170 400, 110 440, 50 450
               Z"
            fill="url(#bandGrad)"
          />

          {/* Upper Envelope Edge */}
          <path
            d="M 50 400
               C 120 370, 180 320, 240 330
               C 300 340, 360 270, 420 280
               C 460 285, 490 270, 510 260"
            fill="none"
            stroke="#E0A526"
            strokeWidth="2"
            strokeDasharray="4 4"
            opacity="0.8"
          />

          {/* Lower Envelope Edge */}
          <path
            d="M 50 450
               C 110 440, 170 400, 230 405
               C 290 410, 350 350, 410 350
               C 450 350, 480 335, 510 320"
            fill="none"
            stroke="#2F5D50"
            strokeWidth="2"
            strokeDasharray="4 4"
            opacity="0.8"
          />

          {/* Center Expected Trajectory Line */}
          <path
            d="M 50 425
               C 115 405, 175 360, 235 365
               C 295 370, 355 310, 415 315
               C 455 318, 485 295, 510 285"
            fill="none"
            stroke="url(#curveLine)"
            strokeWidth="4"
            strokeLinecap="round"
            filter="url(#softGlow)"
          />

          {/* Animated pulsing trajectory geometric nodes (no numbers) */}
          <motion.circle
            cx="115"
            cy="405"
            r="5"
            fill="#E0A526"
            stroke="#0F1F1B"
            strokeWidth="2"
            animate={shouldReduceMotion ? {} : { scale: [1, 1.25, 1] }}
            transition={{ duration: 2.8, repeat: Infinity, delay: 0 }}
            style={{ originX: '115px', originY: '405px' }}
          />
          <motion.circle
            cx="235"
            cy="365"
            r="6"
            fill="#FBF6EE"
            stroke="#C8553D"
            strokeWidth="2.5"
            animate={shouldReduceMotion ? {} : { scale: [1, 1.3, 1] }}
            transition={{ duration: 3.1, repeat: Infinity, delay: 0.8 }}
            style={{ originX: '235px', originY: '365px' }}
          />
          <motion.circle
            cx="355"
            cy="310"
            r="5.5"
            fill="#E0A526"
            stroke="#0F1F1B"
            strokeWidth="2"
            animate={shouldReduceMotion ? {} : { scale: [1, 1.25, 1] }}
            transition={{ duration: 2.6, repeat: Infinity, delay: 1.4 }}
            style={{ originX: '355px', originY: '310px' }}
          />
          <motion.circle
            cx="455"
            cy="318"
            r="6.5"
            fill="#C8553D"
            stroke="#FBF6EE"
            strokeWidth="2"
            animate={shouldReduceMotion ? {} : { scale: [1, 1.3, 1] }}
            transition={{ duration: 3.4, repeat: Infinity, delay: 2.1 }}
            style={{ originX: '455px', originY: '318px' }}
          />
        </g>

        {/* Corner Crosshairs */}
        <g stroke="#E0A526" strokeWidth="1.5" opacity="0.6">
          <path d="M 40 40 L 52 40 M 40 40 L 40 52" />
          <path d="M 500 40 L 488 40 M 500 40 L 500 52" />
          <path d="M 40 460 L 52 460 M 40 460 L 40 448" />
          <path d="M 500 460 L 488 460 M 500 460 L 500 448" />
        </g>
      </svg>
    </div>
  );
};
