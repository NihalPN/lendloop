"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ToolCard } from "@/components/dashboard/ToolCard";
import { WorkflowTimeline } from "@/components/dashboard/WorkflowTimeline";
import { AddToolForm } from "@/components/dashboard/AddToolForm";
import { ToolsGridSkeleton } from "@/components/ui/Skeleton";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { SkeletonRow } from "@/components/ui/SkeletonRow";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { BorrowedItem, IncomingRequest } from "@/components/types";

export type DashboardTab = "browse" | "listings" | "requests" | "inbox";

export function DashboardClient(props: { initialTab?: DashboardTab } = {}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(api.users.getCurrentUser, isAuthenticated ? {} : "skip");

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center font-mono text-sm text-[#57534E] animate-pulse">
        [ INITIATING SECURE SESSION... ]
      </div>
    );
  }

  console.log("Convex Auth State:", { isAuthenticated, isLoading });

  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center font-mono text-sm text-[#D95D39]">
        [ ERROR: CONVEX SECURE HANDSHAKE FAILED ]
      </div>
    );
  }
  if (currentUser === null) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center font-mono text-sm text-[#57534E] animate-pulse">
        [ BUILDING USER PROFILE IN DATABASE... ]
      </div>
    );
  }
  if (currentUser === undefined) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center font-mono text-sm text-[#57534E] animate-pulse">
        [ LOADING DATA... ]
      </div>
    );
  }

  return <DashboardClientContent {...props} />;
}

function DashboardClientContent({ initialTab = "browse" }: { initialTab?: DashboardTab } = {}) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Live Convex queries
  const allTools = useQuery(api.tools.listAll, {});
  const myTools = useQuery(api.tools.listMine);
  const incomingLoans = useQuery(api.loans.listIncoming, {});
  const myLoans = useQuery(api.loans.listMine);

  const removeTool = useMutation(api.tools.remove);

  // Adapt LoanProjection to UI types
  const todayStr = new Date().toISOString().slice(0, 10);
  const adaptBorrowedItem = (loan: any): BorrowedItem => ({
    _id: loan._id,
    id: loan._id,
    toolName: loan.toolName,
    ownerName: loan.counterpartyName, // For borrower, counterpartyName is the owner
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    isOverdue:
      loan.status === "approved" &&
      !loan.returnedAt &&
      loan.endDate < todayStr,
    returnedAt: loan.returnedAt ?? undefined,
  });

  const adaptIncomingRequest = (loan: any): IncomingRequest => ({
    _id: loan._id,
    id: loan._id,
    toolName: loan.toolName,
    category: "Unknown", // Would need to join with tools
    borrowerName: loan.counterpartyName, // For owner, counterpartyName is the borrower
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    returnedAt: loan.returnedAt ?? undefined,
    isOverdue:
      loan.status === "approved" &&
      !loan.returnedAt &&
      loan.endDate < todayStr,
    note: undefined,
  });

  const myBorrowedItems = (myLoans ?? []).map(adaptBorrowedItem);
  const myIncomingRequests = (incomingLoans ?? []).map(adaptIncomingRequest);

  // Tools for browse view (all tools)
  const tools = allTools ?? [];
  
  // My listings for "My Listings" tab
  const myListings = myTools ?? [];

  const categories = [
    { id: "all", label: "All Categories" },
    { id: "power_tools", label: "Power Tools" },
    { id: "garden", label: "Garden" },
    { id: "kitchen", label: "Kitchen" },
    { id: "camping", label: "Camping" },
    { id: "cleaning", label: "Cleaning" },
    { id: "other", label: "Other Equipment" },
  ];

  const filteredTools = tools.filter((tool) => {
    const matchesCategory =
      selectedCategory === "all" || tool.category === selectedCategory;
    const matchesSearch =
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tool.ownerName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      tool.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleAddNewTool = async () => {
    // The AddToolForm handles the mutation internally via its own createTool mutation
    // We just show a success toast here if needed (the form already shows its own toast)
  };

  const handleRemoveListing = async (id: string, name: string) => {
    try {
      await removeTool({ toolId: id as Id<"tools"> });
      showToast("Listing Removed", `"${name}" removed from the neighborhood shed.`, "rust");
    } catch {
      showToast("Error", "Failed to remove tool. Please try again.", "rust");
    }
  };

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col lg:flex-row items-start">
      {/* 1. Left Sidebar Navigation (Interactive tabs) */}
      <aside
        className={`w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-[#E2DDD5] bg-white lg:bg-transparent p-4 sm:p-6 shrink-0 ${
          mobileMenuOpen ? "block" : "hidden lg:block"
        }`}
      >
        <div className="space-y-6">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#57534E] mb-3 font-semibold">
              WORKSHOP VIEWS
            </div>

            <nav className="space-y-1 font-mono text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("browse");
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 uppercase tracking-widest transition-all text-left border ${
                  activeTab === "browse"
                    ? "bg-[#1C1917] text-white border-[#1C1917] font-semibold"
                    : "border-transparent text-[#57534E] hover:text-[#1C1917] hover:bg-white/70 hover:border-[#E2DDD5]"
                }`}
              >
                <span>Browse</span>
                <span className="w-5 h-5 border border-[#E2DDD5] rounded-none flex items-center justify-center text-[9px]">B</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("listings");
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 uppercase tracking-widest transition-all text-left border ${
                  activeTab === "listings"
                    ? "bg-[#1C1917] text-white border-[#1C1917] font-semibold"
                    : "border-transparent text-[#57534E] hover:text-[#1C1917] hover:bg-white/70 hover:border-[#E2DDD5]"
                }`}
              >
                <span>My Listings</span>
                <span className="w-5 h-5 border border-[#E2DDD5] rounded-none flex items-center justify-center text-[9px]">L</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("requests");
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 uppercase tracking-widest transition-all text-left border ${
                  activeTab === "requests"
                    ? "bg-[#1C1917] text-white border-[#1C1917] font-semibold"
                    : "border-transparent text-[#57534E] hover:text-[#1C1917] hover:bg-white/70 hover:border-[#E2DDD5]"
                }`}
              >
                <span>My Requests</span>
                <span className="w-5 h-5 border border-[#E2DDD5] rounded-none flex items-center justify-center text-[9px]">R</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("inbox");
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 uppercase tracking-widest transition-all text-left border ${
                  activeTab === "inbox"
                    ? "bg-[#1C1917] text-white border-[#1C1917] font-semibold"
                    : "border-transparent text-[#57534E] hover:text-[#1C1917] hover:bg-white/70 hover:border-[#E2DDD5]"
                }`}
              >
                <span>Inbox</span>
                <span className="w-5 h-5 border border-[#E2DDD5] rounded-none flex items-center justify-center text-[9px]">I</span>
              </button>
            </nav>
          </div>

          {/* Category Filter */}
          <div className="border-t border-[#E2DDD5] pt-4">
            <label className="text-[10px] font-mono uppercase tracking-widest text-[#57534E] font-semibold mb-2">
              FILTER BY CATEGORY
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-[#F7F5F0] border border-[#E2DDD5] px-3 py-2 text-xs font-mono text-[#1C1917] focus:outline-none focus:border-[#1C1917] rounded-none"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </aside>

      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed left-4 top-20 z-50 p-2 bg-white border border-[#E2DDD5] rounded-none text-[10px] font-mono uppercase tracking-widest"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        {mobileMenuOpen ? "✕ Close" : "☰ Menu"}
      </button>

      {/* 2. Main Content Area */}
      <main className="flex-1 w-full lg:w-0 flex-1 p-4 sm:p-6 min-w-0">
        <Suspense fallback={<ToolsGridSkeleton />}>
          {/* TAB 1: BROWSE */}
          {activeTab === "browse" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="font-serif text-2xl font-bold tracking-tight text-[#1C1917]">
                    Browse Available Tools
                  </h2>
                  <p className="text-[#57534E] font-mono text-xs uppercase tracking-widest">
                    {tools.length} tools in the neighborhood shed
                  </p>
                </div>
                <div className="w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="Search tools, owners, categories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#F7F5F0] border border-[#E2DDD5] px-3.5 py-2.5 text-xs font-mono text-[#1C1917] focus:outline-none focus:border-[#1C1917] rounded-none"
                  />
                </div>
              </div>

              {allTools === undefined ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTools.length === 0 && (
                    <div className="col-span-full py-12 text-center text-[#57534E] font-mono text-sm border border-dashed border-[#E2DDD5]">
                      No items found.
                    </div>
                  )}
                  {filteredTools.map((tool) => (
                    <ToolCard key={tool._id} tool={tool} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MY LISTINGS */}
          {activeTab === "listings" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="font-serif text-2xl font-bold tracking-tight text-[#1C1917]">
                    My Listings
                  </h2>
                  <p className="text-[#57534E] font-mono text-xs uppercase tracking-widest">
                    {myListings.length} active listings
                  </p>
                </div>
              </div>

              {myTools === undefined ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myListings.length === 0 && (
                    <div className="col-span-full py-12 text-center text-[#57534E] font-mono text-sm border border-dashed border-[#E2DDD5]">
                      No items found.
                    </div>
                  )}
                  {myListings.map((tool) => (
                    <div
                      key={tool._id}
                      className="border border-[#E2DDD5] bg-white p-5 flex flex-col justify-between hover:border-[#1C1917] transition-colors"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <StatusBadge variant="available" label="ACTIVE IN SHED" />
                          <span className="font-mono text-[10px] uppercase tracking-widest text-[#57534E]">
                            {tool.category.replace("_", " ")}
                          </span>
                        </div>

                        <div>
                          <h3 className="font-serif text-xl font-bold tracking-tight text-[#1C1917] uppercase">
                            {tool.name}
                          </h3>
                          <div className="flex items-center gap-2 font-mono text-xs text-[#57534E] mt-1">
                            <span>
                              Condition: <strong className="text-[#1C1917] capitalize">{tool.condition}</strong>
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-[#57534E] font-sans leading-relaxed border-t border-[#E2DDD5]/60 pt-2.5">
                          Registered to your account. Insured under neighborhood community guidelines.
                        </p>
                      </div>

                      <div className="flex gap-2 pt-4 mt-4 border-t border-[#E2DDD5]">
                        <button
                          onClick={() =>
                            showToast(
                              "Edit Listing",
                              `Opened details editor for ${tool.name}.`,
                              "info"
                            )
                          }
                          className="flex-1 border border-[#E2DDD5] hover:border-[#1C1917] text-[#1C1917] py-2 font-mono text-xs uppercase tracking-widest font-semibold transition-colors active:translate-y-[1px]"
                        >
                          [ Edit Details ]
                        </button>
                        <button
                          onClick={() => handleRemoveListing(tool._id, tool.name)}
                          className="flex-1 border border-[#E2DDD5] hover:border-[#D95D39] text-[#57534E] hover:text-[#D95D39] py-2 font-mono text-xs uppercase tracking-widest transition-colors active:translate-y-[1px]"
                        >
                          [ Remove Tool ]
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3 & 4: WORKFLOW TIMELINE (REQUESTS & INBOX) */}
          {activeTab === "requests" && (
            myLoans === undefined ? (
              <div className="border border-[#E2DDD5] bg-white p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </div>
            ) : (
              <WorkflowTimeline
                myLoans={myBorrowedItems}
                incomingLoans={myIncomingRequests}
                activeTab={activeTab}
              />
            )
          )}
          {activeTab === "inbox" && (
            incomingLoans === undefined ? (
              <div className="border border-[#E2DDD5] bg-white p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </div>
            ) : (
              <WorkflowTimeline
                myLoans={myBorrowedItems}
                incomingLoans={myIncomingRequests}
                activeTab={activeTab}
              />
            )
          )}
        </Suspense>
      </main>

      {/* 3. Right Aside Panel: Add Tool to Shed Form */}
      <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-[#E2DDD5] bg-white p-6 shrink-0">
        <AddToolForm onAddTool={handleAddNewTool} />
      </aside>
    </div>
  );
}
