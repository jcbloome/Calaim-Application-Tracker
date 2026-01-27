'use client';

import { useState, useEffect } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Settings, Database, TestTube, FileText, Upload, RefreshCw, HardDrive, Globe, Zap, Code, Bug, Wrench, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

interface ToolCard {
    title: string;
    description: string;
    icon: React.ReactNode;
    href: string;
    category: 'testing' | 'integration' | 'migration' | 'system';
    status?: 'active' | 'beta' | 'maintenance';
}

const tools: ToolCard[] = [
    // Testing Tools
    {
        title: 'Caspio API Test',
        description: 'Test Caspio database connections and API endpoints',
        icon: <TestTube className="h-6 w-6" />,
        href: '/admin/caspio-test',
        category: 'testing',
        status: 'active'
    },
    {
        title: 'Google Drive Test',
        description: 'Test Google Drive API integration and folder scanning',
        icon: <HardDrive className="h-6 w-6" />,
        href: '/admin/migrate-drive',
        category: 'testing',
        status: 'active'
    },
    {
        title: 'Email Test',
        description: 'Test email notification system and templates',
        icon: <FileText className="h-6 w-6" />,
        href: '/admin/email-test',
        category: 'testing',
        status: 'beta'
    },
    {
        title: 'RCFE Bulk Email',
        description: 'Send bulk messages to registered RCFE contacts',
        icon: <Mail className="h-6 w-6" />,
        href: '/admin/rcfe-bulk-email',
        category: 'testing',
        status: 'beta'
    },

    // Integration Tools
    {
        title: 'Caspio Sync',
        description: 'Synchronize member data between Caspio tables',
        icon: <RefreshCw className="h-6 w-6" />,
        href: '/admin/caspio-sync',
        category: 'integration',
        status: 'active'
    },
    {
        title: 'Smart Sync System',
        description: 'Intelligent data synchronization with conflict resolution',
        icon: <RefreshCw className="h-6 w-6" />,
        href: '/admin/smart-sync',
        category: 'integration',
        status: 'beta'
    },
    {
        title: 'Webhook Management',
        description: 'Configure and test Caspio webhooks',
        icon: <Globe className="h-6 w-6" />,
        href: '/admin/webhook-test',
        category: 'integration',
        status: 'active'
    },

    // Migration Tools
    {
        title: 'Document Migration',
        description: 'Migrate documents from Google Drive to Firebase',
        icon: <Upload className="h-6 w-6" />,
        href: '/admin/document-migration',
        category: 'migration',
        status: 'beta'
    },

    // System Tools
    {
        title: 'Database Management',
        description: 'Manage Firestore collections and documents',
        icon: <Database className="h-6 w-6" />,
        href: '/admin/database-management',
        category: 'system',
        status: 'maintenance'
    },
    {
        title: 'System Diagnostics',
        description: 'Run system health checks and diagnostics',
        icon: <Bug className="h-6 w-6" />,
        href: '/admin/diagnostics',
        category: 'system',
        status: 'beta'
    },
    {
        title: 'Configuration Manager',
        description: 'Manage system configuration and secrets',
        icon: <Settings className="h-6 w-6" />,
        href: '/admin/config-manager',
        category: 'system',
        status: 'beta'
    },
    {
        title: 'API Explorer',
        description: 'Test and explore all system APIs',
        icon: <Code className="h-6 w-6" />,
        href: '/admin/api-explorer',
        category: 'system',
        status: 'beta'
    }
];

const categoryConfig = {
    testing: {
        title: 'Testing & Debugging',
        description: 'Tools for testing API connections and debugging issues',
        color: 'bg-blue-50 border-blue-200',
        iconColor: 'text-blue-600'
    },
    integration: {
        title: 'Data Integration',
        description: 'Tools for syncing and integrating external data sources',
        color: 'bg-green-50 border-green-200',
        iconColor: 'text-green-600'
    },
    migration: {
        title: 'Data Migration',
        description: 'Tools for migrating and processing documents and data',
        color: 'bg-purple-50 border-purple-200',
        iconColor: 'text-purple-600'
    },
    system: {
        title: 'System Administration',
        description: 'Advanced system management and configuration tools',
        color: 'bg-orange-50 border-orange-200',
        iconColor: 'text-orange-600'
    }
};

const statusConfig = {
    active: {
        label: 'Active',
        color: 'bg-green-100 text-green-800 border-green-200'
    },
    beta: {
        label: 'Beta',
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200'
    },
    maintenance: {
        label: 'Maintenance',
        color: 'bg-red-100 text-red-800 border-red-200'
    }
};

export default function SuperAdminToolsPage() {
    const { isSuperAdmin, isAdmin, isLoading: isAdminLoading } = useAdmin();
    const router = useRouter();
    const { toast } = useToast();

    // Redirect if not super admin
    useEffect(() => {
        if (!isAdminLoading && !isSuperAdmin) {
            router.push('/admin');
        }
    }, [isSuperAdmin, isAdminLoading, router]);

    if (isAdminLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (!isSuperAdmin) {
        return null;
    }

    const toolsByCategory = tools.reduce((acc, tool) => {
        if (!acc[tool.category]) {
            acc[tool.category] = [];
        }
        acc[tool.category].push(tool);
        return acc;
    }, {} as Record<string, ToolCard[]>);

    return (
        <div className="container mx-auto p-6 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Wrench className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-3xl font-bold">Super Admin Tools</h1>
                        <p className="text-muted-foreground">
                            Advanced tools for system administration, testing, and data management
                        </p>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-900">
                        <Zap className="h-5 w-5" />
                        Quick Actions
                    </CardTitle>
                    <CardDescription className="text-blue-700">
                        Frequently used administrative tasks
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Link href="/admin/caspio-test">
                            <Button className="w-full h-16 bg-green-600 hover:bg-green-700 text-white">
                                <TestTube className="mr-2 h-5 w-5" />
                                Direct API Test
                            </Button>
                        </Link>
                        <Link href="/admin/migrate-drive">
                            <Button variant="outline" className="w-full h-16 border-blue-600 text-blue-600 hover:bg-blue-50">
                                <HardDrive className="mr-2 h-5 w-5" />
                                Google Drive Scan
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>

            {/* Tool Categories */}
            {Object.entries(categoryConfig).map(([categoryKey, categoryInfo]) => {
                const categoryTools = toolsByCategory[categoryKey as keyof typeof toolsByCategory] || [];
                
                if (categoryTools.length === 0) return null;

                return (
                    <div key={categoryKey} className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${categoryInfo.color}`}>
                                <Wrench className={`h-5 w-5 ${categoryInfo.iconColor}`} />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold">{categoryInfo.title}</h2>
                                <p className="text-sm text-muted-foreground">{categoryInfo.description}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {categoryTools.map((tool) => (
                                <Link key={tool.href} href={tool.href}>
                                    <Card className={`h-full transition-all duration-200 hover:shadow-lg hover:scale-105 cursor-pointer ${categoryInfo.color}`}>
                                        <CardHeader className="pb-3">
                                            <div className="flex items-start justify-between">
                                                <div className={`p-2 rounded-lg bg-white/50 ${categoryInfo.iconColor}`}>
                                                    {tool.icon}
                                                </div>
                                                {tool.status && (
                                                    <span className={`px-2 py-1 text-xs rounded-full border ${statusConfig[tool.status].color}`}>
                                                        {statusConfig[tool.status].label}
                                                    </span>
                                                )}
                                            </div>
                                            <CardTitle className="text-lg">{tool.title}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <CardDescription className="text-sm">
                                                {tool.description}
                                            </CardDescription>
                                        </CardContent>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    </div>
                );
            })}

            {/* System Status */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        System Status
                    </CardTitle>
                    <CardDescription>
                        Current system health and configuration status
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 border rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                <span className="font-medium">Firebase</span>
                            </div>
                            <p className="text-sm text-muted-foreground">Connected and operational</p>
                        </div>
                        <div className="p-4 border rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                <span className="font-medium">Caspio API</span>
                            </div>
                            <p className="text-sm text-muted-foreground">Connected and operational</p>
                        </div>
                        <div className="p-4 border rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                <span className="font-medium">Google Drive</span>
                            </div>
                            <p className="text-sm text-muted-foreground">Service account configured</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}