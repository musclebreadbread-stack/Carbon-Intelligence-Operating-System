"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Building2,
  Database,
  Activity,
  Flame,
  BookOpen,
  Brain,
  Map,
  FlaskConical,
  Bot,
  Shield,
  FileCheck,
  FileText,
  Coins,
  LayoutDashboard,
  BarChart3,
  Globe,
  Lock,
  Settings,
  Bell,
  ChevronLeft,
  ChevronRight,
  Leaf,
} from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigationSections: NavSection[] = [
  {
    title: "Core Operations",
    items: [
      { title: "Organization", href: "/organization", icon: Building2 },
      { title: "Master Data", href: "/master-data", icon: Database },
      { title: "Activity Data", href: "/activity-data", icon: Activity },
      { title: "Emission Engine", href: "/emission-engine", icon: Flame },
      { title: "Emission Factors", href: "/emission-factors", icon: BookOpen },
    ],
  },
  {
    title: "AI & Intelligence",
    items: [
      { title: "AI Engine", href: "/ai-engine", icon: Brain },
      { title: "AI Roadmap", href: "/ai-roadmap", icon: Map },
      { title: "AI Simulator", href: "/ai-simulator", icon: FlaskConical },
      { title: "AI Agents", href: "/ai-agents", icon: Bot },
    ],
  },
  {
    title: "Reporting & Compliance",
    items: [
      { title: "Digital MRV", href: "/digital-mrv", icon: Shield },
      { title: "Verification", href: "/verification", icon: FileCheck },
      { title: "ESG Disclosure", href: "/esg-disclosure", icon: FileText },
      { title: "Carbon Finance", href: "/carbon-finance", icon: Coins },
    ],
  },
  {
    title: "System",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Notifications", href: "/notifications", icon: Bell },
      { title: "Analytics", href: "/analytics", icon: BarChart3 },
      { title: "API Gateway", href: "/api-gateway", icon: Globe },
      { title: "Security", href: "/security", icon: Lock },
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

function getInitialCollapsed() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("sidebar-collapsed") === "true";
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(getInitialCollapsed);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  return (
    <TooltipProvider delay={0}>
      <aside
        className={cn(
          "relative flex h-full flex-col border-r bg-background transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo / Brand */}
        <div className="flex h-14 items-center border-b px-4">
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <Leaf className="size-5 text-emerald-600" />
              <span className="text-sm font-semibold">CIOS</span>
            </Link>
          )}
          {collapsed && (
            <Link href="/dashboard" className="mx-auto">
              <Leaf className="size-5 text-emerald-600" />
            </Link>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <nav className="flex flex-col gap-1 px-2">
            {navigationSections.map((section, sectionIndex) => (
              <div key={section.title}>
                {sectionIndex > 0 && <Separator className="my-2" />}
                {!collapsed && (
                  <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {section.title}
                  </p>
                )}
                <div className="flex flex-col gap-0.5">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    if (collapsed) {
                      return (
                        <Tooltip key={item.href}>
                          <TooltipTrigger
                            render={
                              <Link
                                href={item.href}
                                className={cn(
                                  "flex h-9 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                                  isActive && "bg-muted text-foreground"
                                )}
                              />
                            }
                          >
                            <Icon className="size-4" />
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            {item.title}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex h-9 items-center gap-3 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                          isActive && "bg-muted text-foreground font-medium"
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span>{item.title}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Collapse Toggle */}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleCollapsed}
            className="w-full"
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
