"use client";

/**
 * Mobile navigation drawer.
 *
 * On small screens (< md), the sidebar is hidden behind a hamburger button.
 * This component renders a slide-in drawer with the same navigation items.
 */

import { useState } from "react";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/components/providers/locale-provider";

export function MobileDrawer({ children }: { readonly children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = useT();

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label={t("mobile.openMenu")}
        data-testid="mobile-menu-button"
      >
        <Menu className="size-5" />
      </Button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <nav
            className="fixed inset-y-0 left-0 z-50 w-64 bg-background shadow-lg md:hidden overflow-y-auto"
            role="navigation"
            aria-label={t("mobile.navigation")}
            data-testid="mobile-drawer"
          >
            <div className="flex items-center justify-between p-4 border-b">
              <span className="text-sm font-semibold">CIOS</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label={t("mobile.closeMenu")}
              >
                <X className="size-5" />
              </Button>
            </div>
            <div className="p-4" onClick={() => setOpen(false)}>
              {children}
            </div>
          </nav>
        </>
      )}
    </>
  );
}
