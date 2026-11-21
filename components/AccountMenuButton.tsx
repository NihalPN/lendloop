"use client";

import { UserButton } from "@clerk/nextjs";
import { Trash2 } from "lucide-react";
import { DeleteAccountSection } from "@/components/account/DeleteAccountSection";

export function AccountMenuButton() {
  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: "bg-[#F7F5F0] border border-[#E2DDD5]",
          userPreviewMainIdentifier: "text-[#1C1917] font-mono text-xs uppercase tracking-widest",
        },
      }}
    >
      <UserButton.UserProfilePage
        label="Delete Account"
        url="delete-account"
        labelIcon={<Trash2 className="w-4 h-4 text-[#D95D39]" />}
      >
        <DeleteAccountSection />
      </UserButton.UserProfilePage>
    </UserButton>
  );
}
