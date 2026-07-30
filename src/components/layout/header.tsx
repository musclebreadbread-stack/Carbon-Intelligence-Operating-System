"use client";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  Search,
  Bell,
  ChevronDown,
} from "lucide-react";

export function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      {/* Left: Organization Switcher */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" className="gap-2">
          <Building2 className="size-4" />
          <span className="hidden sm:inline">Acme Corporation</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </div>

      {/* Right: Search, Notifications, User */}
      <div className="flex items-center gap-2">
        {/* Search Trigger */}
        <Button variant="ghost" size="icon-sm" aria-label="Search">
          <Search className="size-4" />
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon-sm" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          <span className="absolute top-1 right-1 size-2 rounded-full bg-emerald-500" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* User Avatar */}
        <Button variant="ghost" size="sm" className="gap-2">
          <Avatar className="size-6">
            <AvatarFallback className="text-xs">JD</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm sm:inline">John Doe</span>
        </Button>
      </div>
    </header>
  );
}
