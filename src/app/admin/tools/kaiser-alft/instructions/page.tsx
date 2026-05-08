'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useFirestore } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const DEFAULT_GUIDE_TITLE = 'Clinical documentation guidance';
const DEFAULT_GUIDE_INTRO =
  'Use these standards when social workers complete ALFT forms for assigned Kaiser members.';
const DEFAULT_GUIDE_BULLETS = [
  'Complete all ALFT sections before submitting. Do not leave required clinical sections blank.',
  'For level-of-care scoring, evaluate the member on their worst day, not their best day, because needs fluctuate.',
  'In the ALFT commentary section, include only pertinent health-care information that supports tier-level decisions.',
  'Commentary must accurately reflect observed conditions and supervision needs (for example: dementia with constant supervision/redirecting needs, or need for awake overnight staff).',
  'Avoid non-clinical commentary (for example, "member seems happy") unless it directly affects care needs or safety.',
];

type GuideVersion = {
  id: string;
  title: string;
  intro: string;
  bullets: string[];
  updatedAtIso: string;
  updatedByName?: string;
  updatedByEmail?: string;
};

export default function KaiserAlftInstructionsPage() {
  const firestore = useFirestore();
  const { user } = useAdmin();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guideTitle, setGuideTitle] = useState(DEFAULT_GUIDE_TITLE);
  const [guideIntro, setGuideIntro] = useState(DEFAULT_GUIDE_INTRO);
  const [guideBulletsText, setGuideBulletsText] = useState(DEFAULT_GUIDE_BULLETS.join('\n'));
  const [history, setHistory] = useState<GuideVersion[]>([]);

  const guideBullets = useMemo(
    () =>
      guideBulletsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [guideBulletsText]
  );

  const normalizeHistory = (raw: any): GuideVersion[] => {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: any, index: number) => {
        const title = String(item?.title || '').trim();
        const intro = String(item?.intro || '').trim();
        const bullets = Array.isArray(item?.bullets)
          ? item.bullets.map((x: any) => String(x || '').trim()).filter(Boolean)
          : [];
        const updatedAtIso = String(item?.updatedAtIso || '').trim();
        const id = String(item?.id || `${updatedAtIso || 'snapshot'}-${index}`).trim();
        if (!title || !intro || bullets.length === 0) return null;
        return {
          id,
          title,
          intro,
          bullets,
          updatedAtIso,
          updatedByName: String(item?.updatedByName || '').trim() || undefined,
          updatedByEmail: String(item?.updatedByEmail || '').trim() || undefined,
        } as GuideVersion;
      })
      .filter(Boolean)
      .slice(0, 10) as GuideVersion[];
  };

  useEffect(() => {
    const loadGuide = async () => {
      if (!firestore) return;
      setLoading(true);
      try {
        const snap = await getDoc(doc(firestore, 'admin-settings', 'alft-guide'));
        if (!snap.exists()) {
          setLoading(false);
          return;
        }
        const data = snap.data() as any;
        const title = String(data?.title || '').trim() || DEFAULT_GUIDE_TITLE;
        const intro = String(data?.intro || '').trim() || DEFAULT_GUIDE_INTRO;
        const bullets = Array.isArray(data?.bullets)
          ? data.bullets.map((x: any) => String(x || '').trim()).filter(Boolean)
          : DEFAULT_GUIDE_BULLETS;
        setGuideTitle(title);
        setGuideIntro(intro);
        setGuideBulletsText(bullets.join('\n'));
        setHistory(normalizeHistory(data?.history));
      } catch {
        // Keep defaults on load failure.
      } finally {
        setLoading(false);
      }
    };
    void loadGuide();
  }, [firestore]);

  const saveGuide = async (override?: { title?: string; intro?: string; bullets?: string[] }) => {
    if (!firestore) return;
    const title = String(override?.title ?? guideTitle ?? '').trim();
    const intro = String(override?.intro ?? guideIntro ?? '').trim();
    const bullets = (override?.bullets || guideBullets)
      .map((line) => String(line || '').trim())
      .filter(Boolean);
    if (!title) {
      toast({ title: 'Title required', description: 'Enter a guide title before saving.', variant: 'destructive' });
      return;
    }
    if (!intro) {
      toast({ title: 'Intro required', description: 'Enter an intro before saving.', variant: 'destructive' });
      return;
    }
    if (bullets.length === 0) {
      toast({ title: 'Bullets required', description: 'Add at least one guidance bullet.', variant: 'destructive' });
      return;
    }
    const updatedByEmail = String((user as any)?.email || '').trim().toLowerCase() || '';
    const updatedByName = String((user as any)?.displayName || '').trim() || '';
    const snapshot: GuideVersion = {
      id: `${Date.now()}`,
      title,
      intro,
      bullets,
      updatedAtIso: new Date().toISOString(),
      updatedByEmail: updatedByEmail || undefined,
      updatedByName: updatedByName || undefined,
    };
    const nextHistory = [snapshot, ...history].slice(0, 10);
    setSaving(true);
    try {
      await setDoc(
        doc(firestore, 'admin-settings', 'alft-guide'),
        {
          title,
          intro,
          bullets,
          history: nextHistory,
          updatedAt: serverTimestamp(),
          updatedByEmail: updatedByEmail || null,
          updatedByName: updatedByName || null,
        },
        { merge: true }
      );
      setGuideTitle(title);
      setGuideIntro(intro);
      setGuideBulletsText(bullets.join('\n'));
      setHistory(nextHistory);
      toast({ title: 'Guide saved', description: 'ALFT guide commentary is now live in SW portal.' });
    } catch (e: any) {
      toast({
        title: 'Save failed',
        description: String(e?.message || 'Could not save ALFT guide commentary.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const restoreGuide = async (version: GuideVersion) => {
    await saveGuide({
      title: version.title,
      intro: version.intro,
      bullets: version.bullets,
    });
  };

  return (
    <div className="container mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Kaiser ALFT Instructions</CardTitle>
            <Badge variant="outline">Tools / Kaiser / ALFT / Instructions</Badge>
          </div>
          <CardDescription>
            Central instruction page used by staff and social workers for ALFT documentation guidance.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit Guide Commentary</CardTitle>
          <CardDescription>
            This content is shared with social workers in the SW portal ALFT instructions page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="alft-guide-title">Guide title</Label>
            <Textarea
              id="alft-guide-title"
              value={guideTitle}
              onChange={(e) => setGuideTitle(e.target.value)}
              rows={2}
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alft-guide-intro">Intro text</Label>
            <Textarea
              id="alft-guide-intro"
              value={guideIntro}
              onChange={(e) => setGuideIntro(e.target.value)}
              rows={3}
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alft-guide-bullets">Bullets (one per line)</Label>
            <Textarea
              id="alft-guide-bullets"
              value={guideBulletsText}
              onChange={(e) => setGuideBulletsText(e.target.value)}
              rows={8}
              disabled={loading}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={saveGuide} disabled={loading || saving}>
              {saving ? 'Saving…' : 'Save ALFT Guide'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Version History</CardTitle>
          <CardDescription>
            Restore a previous guide snapshot. Last 10 saves are kept.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? (
            <div className="text-sm text-muted-foreground">No saved versions yet.</div>
          ) : (
            history.map((entry) => {
              const by = entry.updatedByName || entry.updatedByEmail || 'Unknown';
              const when = entry.updatedAtIso ? new Date(entry.updatedAtIso).toLocaleString() : 'Unknown time';
              return (
                <div key={entry.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{entry.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {when} • {by}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setGuideTitle(entry.title);
                          setGuideIntro(entry.intro);
                          setGuideBulletsText(entry.bullets.join('\n'));
                        }}
                      >
                        Load
                      </Button>
                      <Button type="button" size="sm" onClick={() => void restoreGuide(entry)} disabled={saving}>
                        Restore
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Alert className="border-blue-200 bg-blue-50">
        <AlertDescription className="space-y-3 text-blue-950">
          <div className="font-semibold">{guideTitle}</div>
          <p className="text-sm">{guideIntro}</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {(guideBullets.length ? guideBullets : DEFAULT_GUIDE_BULLETS).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/tools/kaiser-alft">Back to Kaiser ALFT Hub</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sw-portal/alft-instructions" target="_blank" rel="noreferrer">
                Open SW Instructions Page
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
