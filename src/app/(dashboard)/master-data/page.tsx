"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";

const tabs = [
  { value: "products", label: "Products", count: 156 },
  { value: "materials", label: "Materials", count: 89 },
  { value: "fuels", label: "Fuels", count: 34 },
  { value: "vehicles", label: "Vehicles", count: 42 },
  { value: "refrigerants", label: "Refrigerants", count: 18 },
  { value: "suppliers", label: "Suppliers", count: 230 },
];

const sampleData = [
  { name: "Steel Grade A", category: "Raw Material", unit: "tonnes", status: "active" },
  { name: "Aluminum Alloy 6061", category: "Raw Material", unit: "tonnes", status: "active" },
  { name: "HDPE Pellets", category: "Polymer", unit: "kg", status: "active" },
  { name: "Natural Gas", category: "Fuel", unit: "m3", status: "active" },
  { name: "Recycled Paper", category: "Packaging", unit: "tonnes", status: "review" },
];

export default function MasterDataPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Master Data</h1>
          <p className="text-sm text-muted-foreground">
            Manage reference data for products, materials, fuels, vehicles, refrigerants, and suppliers.
          </p>
        </div>
        <Button size="sm">
          <Plus className="size-4" />
          Add Record
        </Button>
      </div>

      {/* Tabs Content */}
      <Tabs defaultValue="products">
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {tab.count}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{tab.label}</CardTitle>
                    <CardDescription>
                      {tab.count} records in the {tab.label.toLowerCase()} registry
                    </CardDescription>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                    <Input placeholder="Search..." className="pl-9 w-64" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <div className="grid grid-cols-4 gap-4 border-b bg-muted/50 p-3 text-xs font-medium text-muted-foreground">
                    <span>Name</span>
                    <span>Category</span>
                    <span>Unit</span>
                    <span>Status</span>
                  </div>
                  {sampleData.map((item, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-4 gap-4 border-b p-3 text-sm last:border-0"
                    >
                      <span className="font-medium">{item.name}</span>
                      <span className="text-muted-foreground">{item.category}</span>
                      <span className="text-muted-foreground">{item.unit}</span>
                      <Badge
                        variant={item.status === "active" ? "secondary" : "outline"}
                        className="w-fit"
                      >
                        {item.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
