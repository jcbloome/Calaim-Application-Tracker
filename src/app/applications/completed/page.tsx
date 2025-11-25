'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Header } from '@/components/Header';
import Confetti from 'react-confetti';
import { useWindowSize } from '@/hooks/use-window-size';

export default function ApplicationCompletedPage() {
  const mascot = PlaceHolderImages.find(p => p.id === 'fox-mascot');
  const { width, height } = useWindowSize();
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    // Delay confetti to make it feel more impactful after page load
    const timer = setTimeout(() => setShowConfetti(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {showConfetti && <Confetti width={width} height={height} recycle={false} numberOfPieces={500} />}
      <Header />
      <main className="flex-grow flex items-center justify-center p-4 sm:p-6 md:p-8">
        <Card className="w-full max-w-2xl shadow-2xl text-center">
          <CardHeader className="items-center p-6 sm:p-10">
            {mascot && (
              <Image
                src={mascot.imageUrl}
                alt={mascot.description}
                width={150}
                height={150}
                data-ai-hint={mascot.imageHint}
                className="w-40 h-40 object-contain rounded-full mb-6 animate-bounce"
              />
            )}
            <CardTitle className="text-4xl font-bold text-primary">Congratulations!</CardTitle>
            <CardDescription className="text-lg max-w-xl mt-2 text-foreground">
              Great job! We'll get to work on compiling the application and get back to you shortly with the progress.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center p-6 pt-0 sm:pb-10">
             <Button asChild size="lg">
                <Link href="/applications">View My Applications <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
