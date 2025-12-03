
'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, BarChart, FileCheck2, Activity } from 'lucide-react';

const dashboardItems = [
  {
    href: "/admin/applications",
    title: "Application Portal",
    description: "View, manage, and process all incoming CalAIM applications.",
    icon: Users,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    borderColor: "hover:border-blue-500",
  },
  {
    href: "/admin/application-statistics",
    title: "Application Statistics",
    description: "View graphical statistics and breakdowns of all applications.",
    icon: BarChart,
    color: "text-purple-600",
    bgColor: "bg-purple-100",
    borderColor: "hover:border-purple-500",
  },
  {
    href: "/admin/form-tracker",
    title: "Form Tracker",
    description: "Get an at-a-glance overview of form completion for all applications.",
    icon: FileCheck2,
    color: "text-green-600",
    bgColor: "bg-green-100",
    borderColor: "hover:border-green-500",
  },
  {
    href: "/admin/activity-log",
    title: "Activity Log",
    description: "See a real-time feed of all system actions performed by staff.",
    icon: Activity,
    color: "text-orange-600",
    bgColor: "bg-orange-100",
    borderColor: "hover:border-orange-500",
  }
];

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-lg text-muted-foreground mt-2">Welcome to the central backend for CalAIM Pathfinder.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto pt-8">
        {dashboardItems.map((item) => (
           <Link key={item.href} href={item.href} className="group">
            <Card className={`h-full hover:shadow-lg transition-shadow border-2 border-transparent ${item.borderColor}`}>
                <CardHeader className="flex flex-col items-center text-center space-y-4">
                <div className={`p-4 ${item.bgColor} rounded-lg`}>
                    <item.icon className={`h-8 w-8 ${item.color}`} />
                </div>
                <CardTitle className="text-xl">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                <CardDescription className="text-center">
                    {item.description}
                </CardDescription>
                </CardContent>
            </Card>
           </Link>
        ))}
      </div>
    </div>
  );
}
