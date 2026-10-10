import React from 'react';
import { LucideIcon, ArrowRight } from 'lucide-react';

interface PlaceholderViewProps {
  title: string;
  subtitle: string;
  description: string;
  icon: LucideIcon;
  actionText?: string;
  onAction?: () => void;
  badge?: string;
}

export const PlaceholderView: React.FC<PlaceholderViewProps> = ({
  title,
  subtitle,
  description,
  icon: Icon,
  actionText,
  onAction,
  badge,
}) => {
  return (
    <div className="max-w-4xl mx-auto py-12 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#142823] border border-[#2F5D50] flex items-center justify-center text-[#E0A526] mb-6 shadow-inner">
        <Icon className="w-8 h-8" />
      </div>

      {badge && (
        <span className="text-[11px] font-semibold tracking-widest uppercase text-[#E0A526] mb-2">
          {badge}
        </span>
      )}

      <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-[#FBF6EE] mb-3">
        {title}
      </h1>

      <p className="text-sm font-medium text-[#E0A526] mb-4">{subtitle}</p>

      <p className="text-xs sm:text-sm text-[#FBF6EE]/70 max-w-xl mb-8 leading-relaxed">
        {description}
      </p>

      <div className="rounded-2xl bg-[#142823] border border-[#24463D] p-6 max-w-lg w-full text-left space-y-2 mb-8">
        <div className="text-xs font-semibold uppercase tracking-wider text-[#FBF6EE]/50">
          Deterministic Standards
        </div>
        <p className="text-xs text-[#FBF6EE]/80 leading-relaxed">
          CraveCast does not generate mock numbers, synthetic chart lines, or placeholder orders. All records displayed here are derived exclusively from your verified kitchen inputs.
        </p>
      </div>

      {actionText && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-xs sm:text-sm font-semibold bg-[#C8553D] hover:bg-[#B54832] text-[#FBF6EE] transition-colors shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
        >
          <span>{actionText}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
