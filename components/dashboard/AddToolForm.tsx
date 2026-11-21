"use client";

import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/components/ui/Toast";

interface AddToolFormProps {
  onAddTool?: () => void;
}

export function AddToolForm({ onAddTool }: AddToolFormProps) {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("power_tools");
  const [condition, setCondition] = useState<"new" | "good" | "fair" | "worn">("good");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createTool = useMutation(api.tools.create);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);

    try {
      await createTool({
        name: name.trim(),
        category: category as any,
        condition,
        description: description.trim(),
      });

      showToast(
        "Tool Shared with Shed",
        `"${name.trim()}" is now registered and available for neighbors to borrow.`,
        "success"
      );

      if (onAddTool) {
        onAddTool();
      }

      setName("");
      setDescription("");
      setCondition("good");
      setCategory("power_tools");
    } catch (error) {
      showToast("Error", "Failed to add tool. Please try again.", "rust");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-b border-[#E2DDD5] pb-3">
        <span className="bg-[#2D6A4F] text-white font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 font-semibold">
          [ + NEW LISTING ]
        </span>
        <h3 className="font-serif text-xl font-bold tracking-tight text-[#1C1917] mt-2 uppercase">
          Add a Tool to the Shed
        </h3>
        <p className="text-xs text-[#57534E] font-sans mt-1">
          Lend idle equipment to vetted neighbors. 30-day limits strictly enforced.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5 font-mono text-xs">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-[#57534E] mb-1 font-semibold">
            Tool Name
          </label>
          <input
            type="text"
            required
            disabled={isSubmitting}
            placeholder="e.g. Bosch Rotary Hammer"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-[#F7F5F0] border border-[#E2DDD5] px-3.5 py-2.5 text-xs font-mono text-[#1C1917] focus:outline-none focus:border-[#1C1917] focus-visible:ring-2 focus-visible:ring-[#1C1917] focus-visible:ring-offset-1 rounded-none transition-colors disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-[#57534E] mb-1 font-semibold">
            Category
          </label>
          <select
            value={category}
            disabled={isSubmitting}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-[#F7F5F0] border border-[#E2DDD5] px-3.5 py-2.5 text-xs font-mono text-[#1C1917] focus:outline-none focus:border-[#1C1917] focus-visible:ring-2 focus-visible:ring-[#1C1917] focus-visible:ring-offset-1 rounded-none transition-colors disabled:opacity-50"
          >
            <option value="power_tools">Power Tools</option>
            <option value="garden">Garden</option>
            <option value="kitchen">Kitchen</option>
            <option value="camping">Camping</option>
            <option value="cleaning">Cleaning</option>
            <option value="other">Other Equipment</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-[#57534E] mb-1 font-semibold">
            Condition Rating
          </label>
          <select
            value={condition}
            disabled={isSubmitting}
            onChange={(e) =>
              setCondition(e.target.value as "new" | "good" | "fair" | "worn")
            }
            className="w-full bg-[#F7F5F0] border border-[#E2DDD5] px-3.5 py-2.5 text-xs font-mono text-[#1C1917] focus:outline-none focus:border-[#1C1917] focus-visible:ring-2 focus-visible:ring-[#1C1917] focus-visible:ring-offset-1 rounded-none transition-colors disabled:opacity-50"
          >
            <option value="new">Brand New (Pristine condition)</option>
            <option value="good">Good (Fully functional & tested)</option>
            <option value="fair">Fair (Normal cosmetic wear)</option>
            <option value="worn">Well-loved (Heavy duty user)</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-[#57534E] mb-1 font-semibold">
            Usage / Return Notes
          </label>
          <textarea
            rows={3}
            disabled={isSubmitting}
            placeholder="Include accessories, blade guards, safety gear or charging notes..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-[#F7F5F0] border border-[#E2DDD5] p-3 text-xs font-mono text-[#1C1917] focus:outline-none focus:border-[#1C1917] focus-visible:ring-2 focus-visible:ring-[#1C1917] focus-visible:ring-offset-1 rounded-none resize-none transition-colors disabled:opacity-50"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="w-full bg-[#D95D39] text-white hover:bg-[#1C1917] border border-[#D95D39] hover:border-[#1C1917] py-3 font-mono text-xs uppercase tracking-widest font-semibold rounded-none transition-all active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C1917] focus-visible:ring-offset-2"
          >
            {isSubmitting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                <span>[ Listing in Shed... ]</span>
              </>
            ) : (
              <span>[ SHARE THIS TOOL ]</span>
            )}
          </button>
        </div>
      </form>

      <div className="border-t border-[#E2DDD5] pt-3 text-[10px] font-mono text-[#57534E] space-y-1">
        <div className="font-semibold text-[#1C1917]">LENDER GUARANTEE</div>
        <p>Tools in LendLoop remain your property. All borrowers are verified neighbors.</p>
      </div>
    </div>
  );
}
