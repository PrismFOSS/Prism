import React, { useState, useEffect } from 'react';
import { Loader2 } from "lucide-react";

export default function LoadingScreen() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setProgress(100);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 bg-neutral-950 z-50 flex flex-col items-center justify-center">
      {/* Top Progress Bar */}
      <div className="fixed top-0 left-0 w-full h-0.5 bg-neutral-900">
        <div 
          className="h-full bg-white transition-all duration-1000 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Center Content */}
      <div className="flex flex-col items-center gap-8">
        <Loader2 className="h-10 w-10 text-white animate-spin" />
        <div className="font-mono text-xs text-neutral-500">Prism 0.5.0 (Adelante)</div>
      </div>
    </div>
  );
}