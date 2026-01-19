'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, Mail, Globe, MapPin, Clock, Users } from 'lucide-react';
import { Header } from '@/components/Header';
import Link from 'next/link';
import Image from 'next/image';

export default function ContactPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="container mx-auto px-4 py-8 sm:py-16">
          {/* Header Section */}
          <div className="text-center space-y-6 mb-12">
            <div className="flex justify-center mb-6">
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full flex items-center justify-center shadow-xl overflow-hidden">
                <Image
                  src="/wolf mascotsmall.jpg"
                  alt="CalAIM Wolf Mascot"
                  width={128}
                  height={128}
                  className="w-full h-full object-cover rounded-full"
                  priority
                />
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900">
              Contact <span className="text-blue-600">Connect CalAIM</span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
              We're here to help you with your CalAIM Community Support for Assisted Transitions
            </p>
          </div>

          {/* Contact Information Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {/* Phone */}
            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Phone className="w-8 h-8 text-blue-600" />
                </div>
                <CardTitle className="text-xl">Call Us</CardTitle>
                <CardDescription>Speak with our CalAIM specialists</CardDescription>
              </CardHeader>
              <CardContent>
                <a 
                  href="tel:800-330-5993" 
                  className="text-2xl font-bold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  800-330-5993
                </a>
                <p className="text-sm text-gray-600 mt-2">
                  Monday - Friday, 8:00 AM - 5:00 PM PST
                </p>
              </CardContent>
            </Card>

            {/* Email */}
            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-green-600" />
                </div>
                <CardTitle className="text-xl">Email Us</CardTitle>
                <CardDescription>Send us your questions anytime</CardDescription>
              </CardHeader>
              <CardContent>
                <a 
                  href="mailto:calaim@carehomefinders.com" 
                  className="text-lg font-semibold text-green-600 hover:text-green-800 transition-colors break-all"
                >
                  calaim@carehomefinders.com
                </a>
                <p className="text-sm text-gray-600 mt-2">
                  We respond within 24 hours
                </p>
              </CardContent>
            </Card>

            {/* Website */}
            <Card className="text-center hover:shadow-lg transition-shadow md:col-span-2 lg:col-span-1">
              <CardHeader>
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Globe className="w-8 h-8 text-purple-600" />
                </div>
                <CardTitle className="text-xl">Visit Our Website</CardTitle>
                <CardDescription>CalAIM referral package and resources</CardDescription>
              </CardHeader>
              <CardContent>
                <a 
                  href="https://carehomefinders.com/calaimreferralpackage" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:text-purple-800 transition-colors font-semibold break-all"
                >
                  carehomefinders.com/calaimreferralpackage
                </a>
                <p className="text-sm text-gray-600 mt-2">
                  Download forms and resources
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Additional Information */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Business Hours */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  Business Hours
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="font-medium">Monday - Friday:</span>
                  <span>8:00 AM - 5:00 PM PST</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Saturday - Sunday:</span>
                  <span className="text-gray-600">Closed</span>
                </div>
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Emergency Support:</strong> For urgent matters outside business hours, 
                    please email us and we'll respond as soon as possible.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* About Our Services */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-green-600" />
                  How We Can Help
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>CalAIM Community Support applications</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Assisted Transitions for Kaiser and Health Net</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Application status tracking and updates</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Technical support with the portal</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>General CalAIM program questions</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Call to Action */}
          <div className="text-center mt-12">
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-gray-900">Ready to Get Started?</h2>
              <p className="text-gray-600">
                Access your CalAIM application portal or learn more about our services
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Link href="/login">
                  <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3">
                    Access Portal
                  </Button>
                </Link>
                <Link href="/info">
                  <Button variant="outline" size="lg" className="border-blue-600 text-blue-600 hover:bg-blue-50 px-8 py-3">
                    Program Information
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}