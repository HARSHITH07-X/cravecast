import React, { useState } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NavbarProps {
  onNavigate: (path: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onNavigate }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (href: string) => {
    setMobileMenuOpen(false);
    if (href.startsWith('#')) {
      const element = document.querySelector(href);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      onNavigate(href);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-[#0F1F1B]/90 border-b border-[#24463D]/70 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={() => handleNavClick('/')}
          className="flex items-center gap-3 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526] rounded-lg p-1"
          aria-label="CraveCast home"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2F5D50] to-[#18332C] border border-[#3D7364] flex items-center justify-center shadow-sm group-hover:border-[#E0A526] transition-colors">
            <svg
              className="w-5 h-5 text-[#FBF6EE]"
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
              <path d="M8 12c1.5-2 2.5-2 4 0s2.5 2 4 0" />
            </svg>
          </div>
          <div>
            <span className="font-serif text-2xl font-bold tracking-tight text-[#FBF6EE] group-hover:text-[#E0A526] transition-colors">
              CraveCast
            </span>
            <span className="block text-[10px] tracking-widest uppercase font-medium text-[#FBF6EE]/60">
              Kitchen Intelligence
            </span>
          </div>
        </button>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium" aria-label="Main Navigation">
          <a
            href="#problem"
            onClick={(e) => {
              e.preventDefault();
              handleNavClick('#problem');
            }}
            className="text-[#FBF6EE]/80 hover:text-[#FBF6EE] transition-colors py-1 relative hover:after:w-full after:w-0 after:h-0.5 after:bg-[#E0A526] after:absolute after:bottom-0 after:left-0 after:transition-all"
          >
            Problem
          </a>
          <a
            href="#how-it-works"
            onClick={(e) => {
              e.preventDefault();
              handleNavClick('#how-it-works');
            }}
            className="text-[#FBF6EE]/80 hover:text-[#FBF6EE] transition-colors py-1 relative hover:after:w-full after:w-0 after:h-0.5 after:bg-[#E0A526] after:absolute after:bottom-0 after:left-0 after:transition-all"
          >
            How it works
          </a>
          <a
            href="#features"
            onClick={(e) => {
              e.preventDefault();
              handleNavClick('#features');
            }}
            className="text-[#FBF6EE]/80 hover:text-[#FBF6EE] transition-colors py-1 relative hover:after:w-full after:w-0 after:h-0.5 after:bg-[#E0A526] after:absolute after:bottom-0 after:left-0 after:transition-all"
          >
            Features
          </a>
        </nav>

        {/* Action Buttons */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={() => onNavigate('/app')}
            className="px-4 py-2.5 text-sm font-medium text-[#FBF6EE] hover:text-[#E0A526] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526] rounded-xl"
          >
            Sign in
          </button>
          <button
            onClick={() => onNavigate('/app')}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#FBF6EE] bg-[#C8553D] hover:bg-[#B54832] active:bg-[#9B3C28] rounded-xl shadow-sm transition-all transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
          >
            <span>Get started</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden flex items-center">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-[#FBF6EE] hover:text-[#E0A526] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526] rounded-lg"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer with AnimatePresence */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="md:hidden border-t border-[#24463D] bg-[#0F1F1B] px-4 pt-3 pb-6 space-y-3 shadow-xl overflow-hidden"
          >
            <nav className="flex flex-col space-y-2 text-base font-medium" aria-label="Mobile Navigation">
              <a
                href="#problem"
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick('#problem');
                }}
                className="px-3 py-2 text-[#FBF6EE] hover:bg-[#18332C] rounded-lg"
              >
                Problem
              </a>
              <a
                href="#how-it-works"
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick('#how-it-works');
                }}
                className="px-3 py-2 text-[#FBF6EE] hover:bg-[#18332C] rounded-lg"
              >
                How it works
              </a>
              <a
                href="#features"
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick('#features');
                }}
                className="px-3 py-2 text-[#FBF6EE] hover:bg-[#18332C] rounded-lg"
              >
                Features
              </a>
            </nav>
            <div className="pt-3 border-t border-[#24463D] flex flex-col gap-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigate('/app');
                }}
                className="w-full text-center py-2.5 text-sm font-medium text-[#FBF6EE] hover:bg-[#18332C] rounded-xl"
              >
                Sign in
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigate('/app');
                }}
                className="w-full inline-flex justify-center items-center gap-2 py-3 text-sm font-semibold text-[#FBF6EE] bg-[#C8553D] hover:bg-[#B54832] rounded-xl shadow"
              >
                <span>Get started</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
