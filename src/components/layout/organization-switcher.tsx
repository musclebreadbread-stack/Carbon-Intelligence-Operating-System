"use client";

/**
 * Tenant switcher.
 *
 * The list comes from `listOrganizations()` through the session provider, and the
 * selection is persisted by `setActiveOrganizationAction` in a cookie that
 * `resolveActiveOrganization()` validates on the next read. With a single
 * organisation (the demo tenant) the control renders as a static label rather than
 * a dropdown that cannot do anything.
 */

import * as React from "react";
import { Building2, Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/components/providers/session-provider";
import { setActiveOrganizationAction } from "@/lib/actions/auth";

export function OrganizationSwitcher() {
  const { session, organizations, dataMode } = useSession();
  const [pending, startTransition] = React.useTransition();

  const activeId = session?.organizationId ?? organizations[0]?.id ?? null;
  const activeName =
    organizations.find((organization) => organization.id === activeId)?.name ??
    session?.organizationName ??
    "No organization";

  if (organizations.length <= 1) {
    return (
      <div
        className="flex h-7 items-center gap-2 rounded-lg border border-border px-2.5 text-sm"
        data-testid="organization-switcher-static"
      >
        <Building2 className="size-4 text-muted-foreground" />
        <span className="hidden sm:inline">{activeName}</span>
        {dataMode === "demo" && (
          <span className="text-xs text-muted-foreground">(sample)</span>
        )}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="gap-2" disabled={pending}>
            <Building2 className="size-4" />
            <span className="hidden sm:inline">{activeName}</span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((organization) => (
          <DropdownMenuItem
            key={organization.id}
            onClick={() => {
              if (organization.id === activeId) return;
              startTransition(async () => {
                await setActiveOrganizationAction(organization.id);
              });
            }}
          >
            <span className="flex-1 truncate">{organization.name}</span>
            {organization.id === activeId && <Check className="size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
