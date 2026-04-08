'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export function WelcomeBanner() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const dismissed = localStorage.getItem('welcomeBannerDismissed');
    if (dismissed) {
      setIsVisible(false);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('welcomeBannerDismissed', 'true');
  };

  if (!isVisible) return null;

  return (
    <div className="bg-[#111111] border border-[#3B82F6] rounded-md p-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[#F5F5F5] text-sm font-medium mb-1">
            Welcome to Jarvis!
          </div>
          <div className="text-[#A3A3A3] text-sm">
            Your academic command center is ready. Connect your data sources in Settings to get started.
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
