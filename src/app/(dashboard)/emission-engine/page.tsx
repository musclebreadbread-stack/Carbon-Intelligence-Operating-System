import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Calculator, Flame, Zap, Truck, Play } from "lucide-react";

const scopeCards = [
  {
    title: "Scope 1 - Direct Emissions",
    icon: Flame,
    total: "3,280 tCO2e",
    categories: [
      { name: "Stationary Combustion", value: 1850, percent: 56 },
      { name: "Mobile Combustion", value: 890, percent: 27 },
      { name: "Process Emissions", value: 340, percent: 10 },
      { name: "Fugitive Emissions", value: 200, percent: 7 },
    ],
    status: "calculated",
  },
  {
    title: "Scope 2 - Indirect Emissions",
    icon: Zap,
    total: "4,120 tCO2e",
    categories: [
      { name: "Purchased Electricity", value: 3400, percent: 83 },
      { name: "Purchased Steam", value: 520, percent: 13 },
      { name: "Purchased Cooling", value: 200, percent: 4 },
    ],
    status: "calculated",
  },
  {
    title: "Scope 3 - Value Chain",
    icon: Truck,
    total: "5,050 tCO2e",
    categories: [
      { name: "Purchased Goods & Services", value: 2100, percent: 42 },
      { name: "Business Travel", value: 850, percent: 17 },
      { name: "Employee Commuting", value: 620, percent: 12 },
      { name: "Upstream Transportation", value: 980, percent: 19 },
      { name: "Waste Generated", value: 500, percent: 10 },
    ],
    status: "in_progress",
  },
];

const recentCalculations = [
  { name: "Q1 2024 - Scope 1", method: "GHG Protocol", result: "820 tCO2e", date: "2024-03-15", status: "verified" },
  { name: "Q1 2024 - Scope 2 (Market)", method: "Market-based", result: "1,030 tCO2e", date: "2024-03-14", status: "verified" },
  { name: "Q1 2024 - Scope 2 (Location)", method: "Location-based", result: "1,150 tCO2e", date: "2024-03-14", status: "verified" },
  { name: "Q1 2024 - Scope 3 Cat 6", method: "Spend-based", result: "210 tCO2e", date: "2024-03-12", status: "draft" },
  { name: "Q1 2024 - Scope 3 Cat 1", method: "Hybrid", result: "525 tCO2e", date: "2024-03-10", status: "in_review" },
];

export default function EmissionEnginePage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Emission Engine</h1>
          <p className="text-sm text-muted-foreground">
            Calculate and track greenhouse gas emissions across all scopes using GHG Protocol methodologies.
          </p>
        </div>
        <Button size="sm">
          <Play className="size-4" />
          Run Calculation
        </Button>
      </div>

      {/* Calculation Status */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="size-4" />
              <CardTitle>Calculation Status - FY2024</CardTitle>
            </div>
            <Badge variant="secondary">78% Complete</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={78} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            14 of 18 emission categories calculated. 4 categories pending activity data.
          </p>
        </CardContent>
      </Card>

      {/* Scope Breakdown Cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        {scopeCards.map((scope) => {
          const Icon = scope.icon;
          return (
            <Card key={scope.title}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardDescription className="flex items-center gap-1.5">
                    <Icon className="size-4" />
                    {scope.title}
                  </CardDescription>
                  <Badge
                    variant={scope.status === "calculated" ? "secondary" : "outline"}
                    className="text-xs"
                  >
                    {scope.status === "calculated" ? "Complete" : "In Progress"}
                  </Badge>
                </div>
                <CardTitle className="text-xl">{scope.total}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {scope.categories.map((cat) => (
                    <div key={cat.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{cat.name}</span>
                        <span className="font-medium">{cat.percent}%</span>
                      </div>
                      <Progress value={cat.percent} className="h-1" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Calculations */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Calculations</CardTitle>
          <CardDescription>Latest emission calculation runs and results</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <div className="grid grid-cols-5 gap-4 border-b bg-muted/50 p-3 text-xs font-medium text-muted-foreground">
              <span>Calculation</span>
              <span>Method</span>
              <span>Result</span>
              <span>Date</span>
              <span>Status</span>
            </div>
            {recentCalculations.map((calc, index) => (
              <div
                key={index}
                className="grid grid-cols-5 gap-4 border-b p-3 text-sm last:border-0"
              >
                <span className="font-medium">{calc.name}</span>
                <span className="text-muted-foreground">{calc.method}</span>
                <span className="font-mono text-muted-foreground">{calc.result}</span>
                <span className="text-muted-foreground">{calc.date}</span>
                <Badge
                  variant={calc.status === "verified" ? "secondary" : "outline"}
                  className="w-fit"
                >
                  {calc.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
