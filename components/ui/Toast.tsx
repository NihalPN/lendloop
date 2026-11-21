"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export type ToastType = "success" | "warning" | "info" | "rust";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type?: ToastType;
}

interface ToastContextValue {
  showToast: (title: string, description?: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (title: string, description?: string, type: ToastType = "info") => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const newToast: ToastMessage = { id, title, description, type };
      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Container */}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((toast) => {
          const isSuccess = toast.type === "success";
          const isRust = toast.type === "rust" || toast.type === "warning";

          return (
            <div
              key={toast.id}
              role="alert"
              className={`pointer-events-auto border p-3.5 bg-white shadow-none transition-all duration-150 animate-in fade-in slide-in-from-bottom-2 ${
                isSuccess
                  ? "border-[#2D6A4F] text-[#1C1917]"
                  : isRust
                  ? "border-[#D95D39] text-[#1C1917]"
                  : "border-[#1C1917] text-[#1C1917]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 inline-block ${
                        isSuccess
                          ? "bg-[#2D6A4F]"
                          : isRust
                          ? "bg-[#D95D39]"
                          : "bg-[#1C1917]"
                      }`}
                    />
                    <h5 className="font-mono text-xs uppercase tracking-widest font-semibold">
                      {toast.title}
                    </h5>
                  </div>
                  {toast.description && (
                    <p className="font-mono text-[11px] text-[#57534E] leading-relaxed pl-3">
                      {toast.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="text-[#57534E] hover:text-[#1C1917] font-mono text-xs uppercase px-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1C1917] active:translate-y-[1px]"
                  aria-label="Dismiss notification"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
