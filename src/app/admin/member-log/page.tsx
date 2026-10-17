'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { adminFetch } from '@/lib/admin-fetch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

type LogItem = { at: string; item: string; detail: string; by: string };
type MemberLog = {
  id: string;
  name: string;
  mrn: string;
  pathway: string;
  healthPlan: string;
  status: string;
  items: LogItem[];
};

export default function MemberLogPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<MemberLog[]>([]);
  const [statusById, setStatusById] = useState<Record<string, string>>({});
  const [pullingId, setPullingId] = useState('');

  const search = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setLoading(true);
    try {
      const data = await adminFetch<{ members: MemberLog[] }>(`/api/admin/member-log?q=${encodeURIComponent(q)}`);
      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Search failed', description: String(error?.message || error) });
    } finally {
      setLoading(false);
    }
  };

  const pullKaiserStatus = async (member: MemberLog) => {
    setPullingId(member.id);
    try {
      const data = await adminFetch<{ kaiserStatus: string }>('/api/admin/member-log', {
        method: 'POST',
        json: { mrn: member.mrn, name: member.name },
      });
      setStatusById((prev) => ({ ...prev, [member.id]: String(data.kaiserStatus || '') }));
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not pull Kaiser status', description: String(error?.message || error) });
    } finally {
      setPullingId('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Member log</h1>
        <p className="text-muted-foreground">
          Every application item recorded for a member, plus the latest Kaiser status from Caspio.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void search();
          }}
          placeholder="Search member name or MRN"
          className="max-w-md"
        />
        <Button type="button" onClick={() => void search()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Search
        </Button>
      </div>
      {members.map((member) => (
        <Card key={member.id}>
          <CardHeader>
            <CardTitle>{member.name}</CardTitle>
            <CardDescription>
              {[member.mrn ? `MRN ${member.mrn}` : '', member.healthPlan, member.pathway, member.status]
                .filter(Boolean)
                .join(' · ')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" asChild>
                <Link href={`/admin/applications/${member.id}`}>Open application</Link>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pullingId === member.id}
                onClick={() => void pullKaiserStatus(member)}
              >
                {pullingId === member.id ? 'Pulling…' : 'Pull latest Kaiser status'}
              </Button>
              {statusById[member.id] ? (
                <span className="text-sm font-medium">Kaiser status: {statusById[member.id]}</span>
              ) : null}
            </div>
            {member.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No application items recorded yet.</p>
            ) : (
              <div className="divide-y rounded-md border">
                {member.items.map((item, index) => (
                  <div key={`${member.id}-${index}`} className="grid gap-1 px-3 py-2 text-sm md:grid-cols-[11rem_1fr]">
                    <div className="text-xs text-muted-foreground">
                      {item.at ? new Date(item.at).toLocaleString() : 'No date'}
                    </div>
                    <div>
                      <div className="font-medium">{item.item}</div>
                      <div className="text-muted-foreground">
                        {[item.detail, item.by].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
