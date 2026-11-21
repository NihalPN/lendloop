export default function Loading() {
  return (
    <div className="min-h-screen bg-[#F7F5F0] flex flex-col items-center justify-center font-mono p-4">
      <div className="border border-[#1C1917] bg-white p-6 w-full max-w-sm space-y-3 shadow-sm">
        <div className="flex items-center justify-between text-xs uppercase tracking-widest text-[#1C1917] font-bold">
          <span>[ LOADING WORKSPACE... ]</span>
          <span className="w-2 h-2 bg-[#D95D39] animate-pulse" />
        </div>
        <div className="h-0.5 w-full bg-[#E2DDD5] overflow-hidden relative">
          <div
            className="absolute top-0 bottom-0 bg-[#1C1917]"
            style={{
              animation: "brutalistBar 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite",
            }}
          />
        </div>
        <p className="text-[10px] text-[#57534E] uppercase tracking-wider">
          Syncing neighborhood registry
        </p>
      </div>
      <style>{`
        @keyframes brutalistBar {
          0% { left: -35%; width: 35%; }
          50% { left: 35%; width: 50%; }
          100% { left: 100%; width: 35%; }
        }
      `}</style>
    </div>
  );
}
