import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, DollarSign, TrendingDown, Calendar } from "lucide-react";

const milestones = [
  {
    year: 2030,
    target: "42% reduction",
    description: "Near-term SBTi aligned target. Scope 1 & 2 absolute reduction.",
    status: "in_progress" as const,
    progress: 34,
    initiatives: ["Renewable electricity transition", "Fleet electrification", "Process optimization"],
  },
  {
    year: 2035,
    target: "60% reduction",
    description: "Mid-term target with Scope 3 engagement milestones.",
    status: "planned" as const,
    progress: 12,
    initiatives: ["Supplier engagement program", "Circular economy transition", "Green hydrogen pilot"],
  },
  {
    year: 2040,
    target: "80% reduction",
    description: "Deep decarbonization across value chain. Carbon capture deployment.",
    status: "planned" as const,
    progress: 5,
    initiatives: ["CCUS implementation", "Full value chain decarbonization", "Advanced material substitution"],
  },
  {
    year: 2050,
    target: "Net Zero",
    description: "Net-zero emissions across all scopes with residual neutralization.",
    status: "planned" as const,
    progress: 0,
    initiatives: ["Residual emission neutralization", "Carbon removal portfolio", "Nature-based solutions"],
  },
];

const financialSummary = [
  { label: "Total CAPEX Required", value: "$45.2M", period: "2024-2050" },
  { label: "Annual OPEX Savings", value: "$8.7M", period: "By 2030" },
  { label: "Payback Period", value: "5.2 years", period: "Weighted average" },
  { label: "Carbon Price Exposure", value: "$12.4M", period: "Avoided by 2030" },
];

export default function AIRoadmapPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Roadmap</h1>
          <p className="text-sm text-muted-foreground">
            AI-generated decarbonization pathway with milestones, initiatives, and financial projections.
          </p>
        </div>
        <Badge variant="secondary" className="bg-purple-100 text-purple-700">
          AI Generated
        </Badge>
      </div>

      {/* CAPEX/OPEX Summary */}
      <div className="grid gap-4 sm:grid-cols-4">
        {financialSummary.map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <DollarSign className="size-3" />
                {item.label}
              </CardDescription>
              <CardTitle className="text-xl">{item.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{item.period}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="size-4" />
            <CardTitle>Decarbonization Timeline</CardTitle>
          </div>
          <CardDescription>
            Key milestones on the path to net zero
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-8 top-0 bottom-0 w-px bg-border" />

            <div className="space-y-8">
              {milestones.map((milestone) => (
                <div key={milestone.year} className="relative flex gap-6">
                  {/* Timeline dot */}
                  <div className="relative z-10 flex size-16 shrink-0 items-center justify-center rounded-full border-2 bg-background">
                    <span className="text-sm font-bold">{milestone.year}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Target className="size-4 text-emerald-600" />
                        <h3 className="font-semibold">{milestone.target}</h3>
                      </div>
                      <Badge
                        variant={milestone.status === "in_progress" ? "secondary" : "outline"}
                      >
                        {milestone.status === "in_progress" ? "In Progress" : "Planned"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {milestone.description}
                    </p>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{milestone.progress}%</span>
                      </div>
                      <Progress value={milestone.progress} className="mt-1 h-1.5" />
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-medium text-muted-foreground">Key Initiatives:</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {milestone.initiatives.map((init) => (
                          <Badge key={init} variant="outline" className="text-xs">
                            {init}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reduction Pathway Chart Placeholder */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingDown className="size-4" />
            <CardTitle>Emission Reduction Pathway</CardTitle>
          </div>
          <CardDescription>
            Projected emissions trajectory vs. baseline and target
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center rounded-md border border-dashed bg-muted/50">
            <p className="text-sm text-muted-foreground">
              Emission reduction pathway chart placeholder
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
