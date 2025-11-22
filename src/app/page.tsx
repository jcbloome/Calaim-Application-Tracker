'use client';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Header } from '@/components/Header';

export default function Home() {
  const mascot = PlaceHolderImages.find(p => p.id === 'fox-mascot');

  return (
    <>
      <Header />
      <main className="flex-grow flex items-center justify-center p-4 sm:p-6 md:p-8">
        <Card className="w-full max-w-lg shadow-2xl">
          <CardHeader className="items-center text-center p-6">
            {mascot && (
              <Image
                src={mascot.imageUrl}
                alt={mascot.description}
                width={200}
                height={200}
                data-ai-hint={mascot.imageHint}
                className="w-48 h-48 object-contain rounded-full mb-4"
              />
            )}
            <CardTitle className="text-4xl font-bold">Connect CalAIM</CardTitle>
            <CardDescription className="text-base max-w-md">
              The Connections Care Home Consultants application portal for the California
              Advancing and Innovating Medi-Cal (CalAIM) Community Support for Assisted
              Transitions (SNF Diversion/Transition) for Health Net and Kaiser.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center p-6 pt-0">
             <Button asChild size="lg">
                <Link href="/info">Let's Go! <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
