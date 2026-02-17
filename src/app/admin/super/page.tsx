'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight, Users, Wrench } from 'lucide-react';
import Link from 'next/link';

export default function SuperAdminRedirectPage() {
    const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
    const router = useRouter();

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

    return (
        <div className="container mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="text-center space-y-4">
                <h1 className="text-3xl font-bold">Super Admin Portal Reorganized</h1>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                    The Super Admin portal has been reorganized into two focused areas for better navigation and functionality.
                </p>
            </div>

            {/* New Structure Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3 text-blue-900">
                            <Users className="h-6 w-6" />
                            Staff Management
                        </CardTitle>
                        <CardDescription className="text-blue-700">
                            Manage staff assignments, notifications, and permissions
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2 text-sm text-blue-800">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                Staff role management and permissions
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                Email notification settings
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                ILS note permissions
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                Staff assignment and rotation system
                            </div>
                        </div>
                        <Link href="/admin/staff-management">
                            <Button className="w-full bg-blue-600 hover:bg-blue-700">
                                Go to Staff Management
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3 text-green-900">
                            <Wrench className="h-6 w-6" />
                            Super Admin Tools
                        </CardTitle>
                        <CardDescription className="text-green-700">
                            Technical tools for system administration and testing
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2 text-sm text-green-800">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                Caspio API testing and integration
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                Google Drive migration tools
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                Form separator and document processing
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                System diagnostics and configuration
                            </div>
                        </div>
                        <Link href="/admin/super-admin-tools">
                            <Button className="w-full bg-green-600 hover:bg-green-700">
                                Go to Super Admin Tools
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Navigation */}
            <Card className="max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle className="text-center">Quick Navigation</CardTitle>
                    <CardDescription className="text-center">
                        Access the most commonly used features directly
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Link href="/admin/staff-management">
                            <Button variant="outline" className="w-full justify-start">
                                <Users className="mr-2 h-4 w-4" />
                                Staff & Notifications
                            </Button>
                        </Link>
                        <Link href="/admin/caspio-test">
                            <Button variant="outline" className="w-full justify-start">
                                <Wrench className="mr-2 h-4 w-4" />
                                Caspio API Test
                            </Button>
                        </Link>
                        <Link href="/admin/global-task-tracker">
                            <Button variant="outline" className="w-full justify-start">
                                <Wrench className="mr-2 h-4 w-4" />
                                Global Task Tracker
                            </Button>
                        </Link>
                        <Link href="/admin/migrate-drive">
                            <Button variant="outline" className="w-full justify-start">
                                <Wrench className="mr-2 h-4 w-4" />
                                Google Drive Test
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}