'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Users } from 'lucide-react';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { PortalAccessPerson } from '@/lib/portal-access';

type PortalAccessManagerProps = {
  applicationId: string;
  userId?: string;
  primaryContactEmail?: string;
};

export function PortalAccessManager({
  applicationId,
  userId = '',
  primaryContactEmail = '',
}: PortalAccessManagerProps) {
  const auth = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [people, setPeople] = useState<PortalAccessPerson[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newCanUpload, setNewCanUpload] = useState(true);

  const load = useCallback(async () => {
    if (!auth?.currentUser || !applicationId) return;
    setIsLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const params = new URLSearchParams({ applicationId });
      if (userId) params.set('userId', userId);
      const res = await fetch(`/api/admin/applications/portal-access?${params.toString()}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load portal access');
      }
      setEmails(Array.isArray(data.portalAuthorizedEmails) ? data.portalAuthorizedEmails : []);
      setPeople(Array.isArray(data.portalAccessPeople) ? data.portalAccessPeople : []);
    } catch (error: any) {
      toast({
        title: 'Could not load portal access',
        description: error?.message || 'Try refreshing the page.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [applicationId, auth?.currentUser, toast, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = async (action: 'add' | 'remove', email: string, name = '', canUpload = true) => {
    if (!auth?.currentUser) return;
    setIsSaving(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/applications/portal-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          applicationId,
          userId: userId || undefined,
          action,
          email,
          name,
          canUpload,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Update failed');
      }
      setEmails(Array.isArray(data.portalAuthorizedEmails) ? data.portalAuthorizedEmails : []);
      setPeople(Array.isArray(data.portalAccessPeople) ? data.portalAccessPeople : []);
      if (action === 'add') {
        setNewEmail('');
        setNewName('');
        setNewCanUpload(true);
      }
      toast({
        title: action === 'add' ? 'Access granted' : 'Access removed',
        description:
          action === 'add'
            ? `${email} can now sign in and ${canUpload ? 'upload documents' : 'view this application'}.`
            : `${email} can no longer open this application in the portal.`,
      });
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error?.message || 'Could not update portal access.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const primary = String(primaryContactEmail || '').trim().toLowerCase();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" />
          Who can access this application
        </CardTitle>
        <CardDescription>
          More than one person can sign into the family portal and upload documents. Login is by{' '}
          <strong>email address</strong>, not by the member&apos;s name. Add each person&apos;s email
          here (or include them on the invite &quot;To&quot; line).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading access list…
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {emails.length === 0 ? (
                <p className="text-sm text-muted-foreground">No authorized portal emails yet.</p>
              ) : (
                emails.map((email) => {
                  const person = people.find((row) => row.email === email);
                  const isPrimary = email === primary;
                  return (
                    <div
                      key={email}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="truncate font-medium">{email}</div>
                        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                          {person?.name ? <span>{person.name}</span> : null}
                          {isPrimary ? <Badge variant="secondary">Primary contact</Badge> : null}
                          <Badge variant="outline">
                            {person?.canUpload === false ? 'View only' : 'Can upload'}
                          </Badge>
                        </div>
                      </div>
                      {!isPrimary ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isSaving}
                          onClick={() => void mutate('remove', email)}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            <div className="grid gap-3 rounded-md border border-dashed p-3 md:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-1">
                <Label htmlFor="portal-access-email">Add email</Label>
                <Input
                  id="portal-access-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="son@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="portal-access-name">Name (optional)</Label>
                <Input
                  id="portal-access-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Who is this?"
                />
              </div>
              <div className="flex flex-col justify-end gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={newCanUpload}
                    onCheckedChange={(checked) => setNewCanUpload(checked !== false)}
                  />
                  Can upload documents
                </label>
                <Button
                  type="button"
                  disabled={isSaving || !newEmail.includes('@')}
                  onClick={() => void mutate('add', newEmail, newName, newCanUpload)}
                >
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Add access
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
