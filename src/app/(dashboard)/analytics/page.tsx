import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingDown, PieChart, LineChart } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Advanced analytics, trends, and comparative analysis across your carbon data.
          </p>
        </div>
        <Badge variant="secondary">Live Data</Badge>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>YoY Change</CardDescription>
            <CardTitle className="text-2xl text-emerald-600">-8.2%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Total emissions reduction</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Best Performer</CardDescription>
            <CardTitle className="text-xl">Berlin Factory</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">-22% vs baseline</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Data Points</CardDescription>
            <CardTitle className="text-2xl">24,580</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Collected this period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Forecasted EOY</CardDescription>
            <CardTitle className="text-2xl">11,200</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">tCO2e (below target)</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart Placeholders */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <LineChart className="size-4" />
              <CardTitle>Emission Trends</CardTitle>
            </div>
            <CardDescription>Monthly emission trends by scope (24 months)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-md border border-dashed bg-muted/50">
              <div className="text-center">
                <LineChart className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Emission trends chart
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <PieChart className="size-4" />
              <CardTitle>Scope Distribution</CardTitle>
            </div>
            <CardDescription>Breakdown by scope and category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-md border border-dashed bg-muted/50">
              <div className="text-center">
                <PieChart className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Scope distribution chart
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4" />
              <CardTitle>Facility Comparison</CardTitle>
            </div>
            <CardDescription>Emissions by facility with benchmarking</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-md border border-dashed bg-muted/50">
              <div className="text-center">
                <BarChart3 className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Facility comparison chart
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingDown className="size-4" />
              <CardTitle>Reduction Trajectory</CardTitle>
            </div>
            <CardDescription>Actual vs. target reduction pathway</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-md border border-dashed bg-muted/50">
              <div className="text-center">
                <TrendingDown className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Reduction trajectory chart
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Intensity Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Intensity Metrics</CardTitle>
          <CardDescription>Emissions normalized by business metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { metric: "Per Revenue", value: "0.42 tCO2e/$M", change: "-12.5%" },
              { metric: "Per Employee", value: "2.8 tCO2e/FTE", change: "-8.2%" },
              { metric: "Per Unit Produced", value: "0.015 tCO2e/unit", change: "-5.7%" },
              { metric: "Per Sq. Meter", value: "0.032 tCO2e/m2", change: "-9.1%" },
            ].map((item) => (
              <div key={item.metric} className="rounded-md border p-3 text-center">
                <p className="text-xs text-muted-foreground">{item.metric}</p>
                <p className="mt-1 text-lg font-semibold">{item.value}</p>
                <p className="text-xs text-emerald-600">{item.change} YoY</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
