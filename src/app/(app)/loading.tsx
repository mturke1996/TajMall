/**
 * Route transition indicator. Seen on almost every navigation, so it stays quiet:
 * a thin line under the top bar instead of a full-screen loader.
 */
export default function Loading() {
  return (
    <div className="relative h-[calc(100vh-4rem)]" dir="rtl" aria-busy="true">
      <span className="sr-only">جارٍ تحميل الصفحة</span>
      <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-transparent">
        <div className="route-progress h-full w-1/3 bg-foreground/70" />
      </div>
      <style>{`
        .route-progress { animation: route-progress 1.1s cubic-bezier(0.77, 0, 0.175, 1) infinite; }
        @keyframes route-progress {
          from { transform: translateX(110%); }
          to   { transform: translateX(-330%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .route-progress { animation: none; width: 100%; opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
