import React from "react";

export interface MetricItem {
  label: string;
  value: string | number;
  highlight?: "rust" | "trust" | false;
}

interface AdminMetricsProps {
  metrics: MetricItem[];
}

export function AdminMetrics({ metrics }: AdminMetricsProps) {
  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {metrics.map((stat) => {
        const isRust = stat.highlight === "rust";
        const isTrust = stat.highlight === "trust";

        return (
          <div
            key={stat.label}
            className={`bg-white p-4 flex flex-col justify-between transition-colors ${
              isRust
                ? "border-2 border-[#D95D39]"
                : isTrust
                ? "border border-[#2D6A4F]"
                : "border border-[#E2DDD5]"
            }`}
          >
            <div
              className={`font-mono text-[10px] uppercase tracking-widest font-semibold mb-2 ${
                isRust
                  ? "text-[#D95D39]"
                  : isTrust
                  ? "text-[#2D6A4F]"
                  : "text-[#57534E]"
              }`}
            >
              {stat.label}
            </div>
            <div
              className={`font-serif text-3xl font-bold tracking-tight ${
                isRust
                  ? "text-[#D95D39]"
                  : isTrust
                  ? "text-[#2D6A4F]"
                  : "text-[#1C1917]"
              }`}
            >
              {stat.value}
            </div>
          </div>
        );
      })}
    </section>
  );
}
