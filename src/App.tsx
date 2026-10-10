import React, { useState, useEffect } from 'react';
import { AuthProvider } from './lib/authContext';
import { LandingPage } from './pages/LandingPage';
import { AppPage } from './pages/AppPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { CustomerChatPage } from './pages/CustomerChatPage';

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname || '/';
    }
    return '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    if (path !== currentPath) {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (currentPath === '/privacy') {
    return <PrivacyPage onNavigate={navigate} />;
  }

  if (currentPath.startsWith('/r/')) {
    const restaurantId = decodeURIComponent(currentPath.slice(3).split('/')[0] || '');
    return <CustomerChatPage restaurantId={restaurantId} onNavigate={navigate} />;
  }

  if (currentPath.startsWith('/app')) {
    return (
      <AuthProvider>
        <AppPage onNavigate={navigate} />
      </AuthProvider>
    );
  }

  return <LandingPage onNavigate={navigate} />;
}
