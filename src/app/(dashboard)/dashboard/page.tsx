import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDownRight,
  ArrowUpRight,
  Factory,
  Gauge,
  Leaf,
  Target,
  TrendingDown,
  Zap,
} from "lucide-react";

const kpiCards = [
  {
    title: "Total Emissions",
    value: "12,450",
    unit: "tCO2e",
    change: -8.2,
    trend: "down" as const,
    icon: Factory,
    description: "Year to date",
  },
  {
    title: "Emission Intensity",
    value: "0.42",
    unit: "tCO2e/M$",
    change: -12.5,
    trend: "down" as const,
    icon: Gauge,
    description: "Per million revenue",
  },
  {
    title: "Scope 1 (Direct)",
    value: "3,280",
    unit: "tCO2e",
    change: -5.1,
    trend: "down" as const,
    icon: Zap,
    description: "Owned sources",
  },
  {
    title: "Scope 2 (Indirect)",
    value: "4,120",
    unit: "tCO2e",
    change: -15.3,
    trend: "down" as const,
    icon: Zap,
    description: "Purchased energy",
  },
  {
    title: "Scope 3 (Value Chain)",
    value: "5,050",
    unit: "tCO2e",
    change: 2.1,
    trend: "up" as const,
    icon: Zap,
    description: "Upstream & downstream",
  },
  {
    title: "Reduction Rate",
    value: "8.2",
    unit: "%",
    change: 3.1,
    trend: "down" as const,
    icon: TrendingDown,
    description: "Year over year",
  },
  {
    title: "Target Achievement",
    value: "72",
    unit: "%",
    change: 5.0,
    trend: "down" as const,
    icon: Target,
    description: "2030 SBTi target",
  },
  {
    title: "Net Zero Progress",
    value: "34",
    unit: "%",
    change: 4.2,
    trend: "down" as const,
    icon: Leaf,
    description: "2050 pathway",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Carbon Intelligence Operating System overview and key performance indicators.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.title}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between">
                  <span>{kpi.title}</span>
                  <Icon className="size-4 text-muted-foreground" />
                </CardDescription>
                <CardTitle className="text-2xl">
                  {kpi.value}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    {kpi.unit}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1 text-xs">
                  {kpi.trend === "down" ? (
                    <ArrowDownRight className="size-3 text-emerald-600" />
                  ) : (
                    <ArrowUpRight className="size-3 text-red-500" />
                  )}
                  <span
                    className={
                      kpi.trend === "down"
                        ? "text-emerald-600"
                        : "text-red-500"
                    }
                  >
                    {Math.abs(kpi.change)}%
                  </span>
                  <span className="text-muted-foreground">
                    {kpi.description}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Chart Placeholders */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Emissions Trend</CardTitle>
            <CardDescription>
              Monthly emissions by scope over the past 12 months
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-md border border-dashed bg-muted/50">
              <p className="text-sm text-muted-foreground">
                Emissions trend chart placeholder
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scope Breakdown</CardTitle>
            <CardDescription>
              Emission distribution across Scope 1, 2, and 3
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-md border border-dashed bg-muted/50">
              <p className="text-sm text-muted-foreground">
                Scope breakdown chart placeholder
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest emissions data and system events</CardDescription>
            </div>
            <Badge variant="secondary">Live</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { action: "Emission data validated", source: "Facility A - Natural Gas", time: "2 min ago" },
              { action: "AI anomaly detected", source: "Scope 2 - Electricity usage spike", time: "15 min ago" },
              { action: "Report submitted", source: "CDP Climate Change 2024", time: "1 hour ago" },
              { action: "Factor updated", source: "Grid emission factor - Region B", time: "3 hours ago" },
              { action: "Verification completed", source: "Q3 2024 - Scope 1 & 2", time: "1 day ago" },
            ].map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{item.action}</p>
                  <p className="text-xs text-muted-foreground">{item.source}</p>
                </div>
                <span className="text-xs text-muted-foreground">{item.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
