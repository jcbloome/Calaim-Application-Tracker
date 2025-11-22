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
        <Card className="w-full max-w-4xl shadow-2xl">
          <CardHeader className="items-center text-center p-6 sm:p-10">
            {mascot && (
              <Image
                src={mascot.imageUrl}
                alt={mascot.description}
                width={200}
                height={200}
                data-ai-hint={mascot.imageHint}
                className="w-48 h-48 object-contain rounded-full mb-6"
              />
            )}
            <CardTitle className="text-5xl font-bold">Connect CalAIM</CardTitle>
            <CardDescription className="text-lg max-w-2xl mt-2">
              The Connections Care Home Consultants application portal for the California
              Advancing and Innovating Medi-Cal (CalAIM) Community Support for Assisted
              Transitions (SNF Diversion/Transition) for Health Net and Kaiser.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center p-6 pt-0 sm:pb-10">
             <Button asChild size="lg" className="text-lg py-7 px-8">
                <Link href="/info">Let's Go! <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
