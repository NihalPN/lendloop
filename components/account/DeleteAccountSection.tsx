"use client";

import React, { useState } from "react";
import { useMutation } from "convex/react";
import { useClerk } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { ConvexError } from "convex/values";
import { useToast } from "@/components/ui/Toast";

export function DeleteAccountSection() {
  const { showToast } = useToast();
  const { signOut } = useClerk();
  const deleteMyAccount = useMutation(api.users.deleteMyAccount);

  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await deleteMyAccount({});
      showToast("Account Deleted", "Your account has been anonymized.", "info");
      await signOut({ redirectUrl: "/login?reason=deleted" });
    } catch (error: unknown) {
      let errMsg = "Failed to delete account. Ensure all active loans are returned first.";
      if (error instanceof ConvexError) {
        const data = error.data as { message?: string } | undefined;
        errMsg = data?.message ?? error.message;
      } else if (error instanceof Error) {
        errMsg = error.message;
      }
      setErrorMessage(errMsg);
      showToast("Cannot Delete Account", errMsg, "rust");
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 text-[#1C1917] bg-[#F7F5F0] border border-[#E2DDD5]">
      {/* Header */}
      <div className="space-y-1">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#D95D39] font-semibold flex items-center gap-1.5">
          <span className="w-2 h-2 bg-[#D95D39] inline-block" />
          [ DANGER ZONE · IRREVERSIBLE ACTION ]
        </div>
        <h2 className="font-serif text-2xl font-bold tracking-tight text-[#1C1917]">
          Delete Member Account
        </h2>
        <p className="font-sans text-xs text-[#57534E] leading-relaxed">
          Permanent self-service profile deletion and personal data scrub for LendLoop members.
        </p>
      </div>

      {/* Explanation Box */}
      <div className="bg-white border border-[#E2DDD5] p-4 space-y-3 font-sans text-xs">
        <p className="text-[#1C1917] font-medium leading-relaxed">
          Deleting your account will scrub your personal data, unpin your email, and anonymize your profile as <strong>&ldquo;Deleted User&rdquo;</strong>.
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#57534E]">
          <li>All active tool listings in the neighborhood shed will be archived.</li>
          <li>Any pending loan requests will be automatically cancelled.</li>
          <li>
            <strong className="text-[#1C1917]">Requirement:</strong> All active and approved loans must be returned and resolved before deletion.
          </li>
          <li>Historical lending logs remain preserved anonymously for neighborhood audit integrity.</li>
          <li>You can register a clean, brand new account with your email in the future.</li>
        </ul>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="border border-[#D95D39] bg-[#D95D39]/10 p-3 font-mono text-xs text-[#D95D39] space-y-1">
          <div className="font-semibold uppercase tracking-wider">[ DELETION BLOCKED ]</div>
          <div className="font-sans text-xs">{errorMessage}</div>
        </div>
      )}

      {/* Action / Confirmation Step */}
      <div className="pt-2 border-t border-[#E2DDD5]">
        {!isConfirming ? (
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setIsConfirming(true);
            }}
            className="border border-[#D95D39] text-[#D95D39] hover:bg-[#D95D39] hover:text-white px-4 py-2 font-mono text-xs uppercase tracking-widest font-semibold transition-colors active:translate-y-[1px]"
          >
            [ Delete My Account ]
          </button>
        ) : (
          <div className="bg-white border border-[#D95D39] p-4 space-y-3">
            <div className="font-mono text-xs uppercase tracking-widest text-[#D95D39] font-bold">
              [ FINAL CONFIRMATION ]
            </div>
            <p className="font-sans text-xs text-[#1C1917]">
              Are you absolutely sure? This will immediately terminate your session and anonymize your account records. This action cannot be undone.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1 font-mono text-xs">
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDelete}
                className="bg-[#D95D39] text-white hover:bg-[#1C1917] border border-[#D95D39] px-4 py-2 uppercase tracking-wider font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 active:translate-y-[1px]"
              >
                {isDeleting ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                    <span>[ Deleting Account... ]</span>
                  </>
                ) : (
                  <span>[ Confirm &amp; Delete Account ]</span>
                )}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setIsConfirming(false);
                  setErrorMessage(null);
                }}
                className="border border-[#E2DDD5] bg-white hover:border-[#1C1917] text-[#1C1917] px-4 py-2 uppercase tracking-wider transition-colors disabled:opacity-50 active:translate-y-[1px]"
              >
                [ Cancel ]
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
