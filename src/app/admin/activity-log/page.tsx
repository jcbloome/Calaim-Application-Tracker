
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { activities } from '@/lib/data';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { User, Clock, ArrowRight } from 'lucide-react';

const getUserInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('');
}

export default function ActivityLogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity Log</h1>
        <p className="text-muted-foreground">A real-time feed of all system actions performed by staff.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent Actions</CardTitle>
          <CardDescription>Showing the latest activities across all applications.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{getUserInitials(activity.user)}</AvatarFallback>
                  </Avatar>
                  <div className="grid gap-1 text-sm">
                    <p className="font-medium leading-none">
                      <span className="font-semibold">{activity.user}</span> performed action <span className="font-semibold text-primary">{activity.action}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {activity.details}
                    </p>
                    <p className="text-xs text-muted-foreground/80 flex items-center gap-1.5"><Clock className="h-3 w-3" /> {activity.timestamp}</p>
                  </div>
                </div>
                {activity.applicationId && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/application/${activity.applicationId}`}>
                      View App <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
