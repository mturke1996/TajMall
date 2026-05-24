"use client";

import { BrandGlyph } from "@/components/brand/logo";

export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-background/50 backdrop-blur-sm" dir="rtl">
      <div className="flex flex-col items-center gap-4">
        {/* Pulsing Logo */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-sage-500/20 blur-md animate-ping" style={{ animationDuration: '2s' }} />
          <BrandGlyph size={60} className="relative z-10 border border-border/80 shadow-lg" />
        </div>
        
        {/* Clean, thin loading bar */}
        <div className="w-32 h-[3px] bg-canvas-sunken rounded-full overflow-hidden relative">
          <div 
            className="absolute inset-y-0 bg-sage-700 w-12 rounded-full" 
            style={{
              animation: 'progress-slide 1.5s infinite ease-in-out',
            }}
          />
        </div>
        
        <span className="text-xs font-semibold text-ink-mute">جاري تحميل المنظومة...</span>
      </div>
      <style>{`
        @keyframes progress-slide {
          0% { left: -33%; }
          50% { left: 100%; }
          100% { left: -33%; }
        }
      `}</style>
    </div>
  );
}
