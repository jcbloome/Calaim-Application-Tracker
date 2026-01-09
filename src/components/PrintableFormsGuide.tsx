'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Printer, 
  Download, 
  Smartphone, 
  Monitor, 
  CheckCircle,
  Info,
  FileText,
  Upload
} from 'lucide-react';

export function PrintableFormsGuide() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Mobile & Print Optimizations Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Mobile Features */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Mobile-Friendly Features
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Badge variant="outline" className="mb-2">User Experience</Badge>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  <li>Responsive application status cards</li>
                  <li>Touch-friendly buttons and controls</li>
                  <li>Collapsible sections for small screens</li>
                  <li>Auto-save every 3 seconds</li>
                  <li>Offline detection and handling</li>
                </ul>
              </div>
              <div className="space-y-2">
                <Badge variant="outline" className="mb-2">Admin Features</Badge>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  <li>Mobile-optimized quick action panel</li>
                  <li>Responsive notification center</li>
                  <li>Touch-friendly search and filters</li>
                  <li>Stacked layout for narrow screens</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Print Features */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Static Forms for Signature Collection
            </h3>
            
            <Alert className="mb-4 border-yellow-300 bg-yellow-50">
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> Printable forms are <strong>static documents</strong> designed for signature collection only. 
                They are NOT fillable online to encourage proper use of the application portal.
              </AlertDescription>
            </Alert>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Badge variant="outline" className="mb-2">For Referral Agencies</Badge>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  <li>Print forms for member signature collection</li>
                  <li>Professional letterhead and branding</li>
                  <li>Clear instructions for completion</li>
                  <li>Upload signed forms to portal</li>
                  <li>Direct members to online application</li>
                </ul>
              </div>
              <div className="space-y-2">
                <Badge variant="outline" className="mb-2">Static Elements</Badge>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  <li>Empty signature lines (not fillable)</li>
                  <li>Checkbox outlines for hand-marking</li>
                  <li>Proper spacing for handwritten text</li>
                  <li>Black and white print compatibility</li>
                  <li>Warning about online vs print forms</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Usage Examples */}
          <div>
            <h3 className="text-lg font-semibold mb-3">How to Use</h3>
            <div className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>For Users:</strong> All forms automatically adapt to your screen size. 
                  On mobile, buttons stack vertically and text sizes adjust for readability.
                </AlertDescription>
              </Alert>

              <Alert>
                <Printer className="h-4 w-4" />
                <AlertDescription>
                  <strong>For Referral Agencies:</strong> Print static forms for member signature collection. 
                  Forms are designed as blank documents to be completed by hand with black/blue ink.
                </AlertDescription>
              </Alert>

              <Alert>
                <Upload className="h-4 w-4" />
                <AlertDescription>
                  <strong>Workflow:</strong> 1) Print blank forms → 2) Member completes by hand → 
                  3) Upload signed forms to portal → 4) Member completes full application online.
                </AlertDescription>
              </Alert>
            </div>
          </div>

          {/* Component Usage */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Component Integration</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Available Components:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div>• <code>PrintableFormLayout</code></div>
                <div>• <code>PrintableFormFields</code></div>
                <div>• <code>PrintableCsSummaryForm</code></div>
                <div>• <code>ApplicationStatusCard</code></div>
                <div>• <code>SmartFormStep</code></div>
                <div>• <code>NotificationCenter</code></div>
                <div>• <code>QuickActionPanel</code></div>
                <div>• <code>AutoSaveIndicator</code></div>
              </div>
            </div>
          </div>

          {/* CSS Classes */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Responsive Breakpoints</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-medium mb-2">Screen Sizes:</h4>
                  <ul className="space-y-1">
                    <li>• <code>xs:</code> 475px and up</li>
                    <li>• <code>sm:</code> 640px and up</li>
                    <li>• <code>md:</code> 768px and up</li>
                    <li>• <code>lg:</code> 1024px and up</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Print Classes:</h4>
                  <ul className="space-y-1">
                    <li>• <code>print:hidden</code> - Hide on print</li>
                    <li>• <code>print:block</code> - Show on print</li>
                    <li>• <code>print:text-black</code> - Black text</li>
                    <li>• <code>print:bg-white</code> - White background</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}