'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default function SwAlftInstructionsPage() {
  const firestore = useFirestore();
  const [guideTitle, setGuideTitle] = useState('Clinical documentation guidance');
  const [guideIntro, setGuideIntro] = useState(
    'Use this guidance when completing ALFT forms for assigned Kaiser members.'
  );
  const [guideBulletsText, setGuideBulletsText] = useState(
    [
      'Complete all ALFT sections before submitting. Do not leave required clinical sections blank.',
      'For level-of-care scoring, evaluate the member on their worst day, not their best day, because needs fluctuate.',
      'In the ALFT commentary section, include only pertinent health-care information that supports tier-level decisions.',
      'Commentary must accurately reflect observed conditions and supervision needs (for example: dementia with constant supervision/redirecting needs, or need for awake overnight staff).',
      'Avoid non-clinical commentary (for example, "member seems happy") unless it directly affects care needs or safety.',
    ].join('\n')
  );

  const guideBullets = useMemo(
    () =>
      guideBulletsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [guideBulletsText]
  );

  useEffect(() => {
    const loadGuide = async () => {
      if (!firestore) return;
      try {
        const snap = await getDoc(doc(firestore, 'admin-settings', 'alft-guide'));
        if (!snap.exists()) return;
        const data = snap.data() as any;
        const title = String(data?.title || '').trim();
        const intro = String(data?.intro || '').trim();
        const bullets = Array.isArray(data?.bullets)
          ? data.bullets.map((x: any) => String(x || '').trim()).filter(Boolean)
          : [];
        if (title) setGuideTitle(title);
        if (intro) setGuideIntro(intro);
        if (bullets.length > 0) setGuideBulletsText(bullets.join('\n'));
      } catch {
        // Fallback to bundled defaults.
      }
    };
    void loadGuide();
  }, [firestore]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle>ALFT Instructions (SW Portal)</CardTitle>
          <CardDescription>
            Use this guidance when completing ALFT forms for assigned Kaiser members.
          </CardDescription>
        </CardHeader>
      </Card>

      <Alert className="border-blue-200 bg-blue-50">
        <AlertDescription className="space-y-3 text-blue-950">
          <div className="font-semibold">{guideTitle}</div>
          <p className="text-sm">{guideIntro}</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {guideBullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/sw-portal/alft-upload">Open ALFT Queue</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/sw-portal/home">Back to Home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
