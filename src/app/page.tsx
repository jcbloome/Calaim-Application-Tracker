import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/Header';
import { ArrowRight } from 'lucide-react';

export default function HomePage() {
  // Force cache bust - timestamp: 2026-01-21-16:30
  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-white/20 backdrop-blur-3xl"></div>
        <div className="absolute top-0 left-0 w-72 h-72 bg-blue-400/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>
        
        <div className="container mx-auto px-4 py-8 sm:py-16 text-center relative z-10">
          {/* Wolf Mascot with enhanced styling */}
          <div className="flex justify-center mb-6 sm:mb-8">
            <div className="relative group">
              <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full flex items-center justify-center shadow-2xl overflow-hidden bg-white ring-4 ring-blue-100 transition-all duration-300 group-hover:ring-blue-200 group-hover:shadow-3xl group-hover:scale-105">
                <Image
                  src="/wolf mascotsmall.jpg"
                  alt="CalAIM Wolf Mascot"
                  width={160}
                  height={160}
                  className="w-full h-full object-cover rounded-full transition-transform duration-300 group-hover:scale-110"
                  priority
                />
              </div>
              {/* Animated ring */}
              <div className="absolute inset-0 rounded-full border-2 border-blue-300 animate-pulse opacity-50"></div>
            </div>
          </div>

          {/* Main Title with enhanced typography */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-2 px-2 leading-tight">
              Connect <span className="text-blue-600">CalAIM</span>
            </h1>
            <div className="w-24 h-1 bg-blue-500 mx-auto rounded-full"></div>
          </div>

          {/* Subtitle with better styling */}
          <p className="text-lg sm:text-xl md:text-2xl text-gray-700 mb-6 sm:mb-8 max-w-4xl mx-auto px-2 font-medium">
            California Advancing and Innovating Medi-Cal
          </p>

          {/* Description in a card */}
          <div className="max-w-4xl mx-auto mb-8 sm:mb-12 px-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 sm:p-8">
              <p className="text-base sm:text-lg md:text-xl text-gray-700 leading-relaxed">
                Your <span className="font-semibold text-blue-700">Connections Care Home Consultants</span> streamlined portal for applying to the CalAIM Community Support for Assisted Transitions for Health Net and Kaiser.
              </p>
            </div>
          </div>

          {/* Enhanced Let's Go Button */}
          <div className="mb-12">
            <Link href="/info">
              <Button 
                size="lg" 
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 sm:px-12 py-4 text-lg font-semibold w-full sm:w-auto max-w-xs mx-auto rounded-full shadow-2xl transition-all duration-300 hover:scale-105 hover:shadow-3xl group"
              >
                Let's Go!
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>

        </div>
      </main>
    </>
  );
}