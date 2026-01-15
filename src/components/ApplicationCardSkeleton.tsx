import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function ApplicationCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="space-y-3">
        {/* Header with member name and status */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>

        {/* Health plan and pathway */}
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-28" />
        </div>

        {/* Submitted by and dates */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
    </Card>
  );
}

export function ApplicationTableSkeleton() {
  return (
    <div className="rounded-md border">
      <div className="p-4">
        {/* Table header */}
        <div className="flex items-center space-x-4 mb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-24" />
          ))}
        </div>
        
        {/* Table rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center space-x-4 py-3 border-t">
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-4 w-20" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}