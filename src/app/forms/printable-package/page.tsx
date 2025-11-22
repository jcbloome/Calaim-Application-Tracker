'use client';

import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Printer, Square, Circle } from 'lucide-react';

const PrintableField = ({ label, className }: { label: string, className?: string }) => (
  <div className={`space-y-1 ${className}`}>
    <label className="text-sm font-medium text-muted-foreground">{label}</label>
    <div className="h-8 border-b border-gray-300"></div>
  </div>
);

const PrintableCheckbox = ({ label }: { label: string }) => (
    <div className="flex items-center space-x-2">
        <Square className="h-4 w-4 text-gray-400" />
        <span className="text-sm">{label}</span>
    </div>
)

const PrintableRadio = ({ label }: { label: string }) => (
     <div className="flex items-center space-x-2">
        <Circle className="h-4 w-4 text-gray-400" />
        <span className="text-sm">{label}</span>
    </div>
)


export default function PrintablePackage() {

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-8 print:space-y-4">
          <div className="flex justify-between items-center print:hidden">
            <div>
                <h1 className="text-3xl font-bold">Printable Forms Package</h1>
                <p className="text-muted-foreground">All necessary forms in one place for easy printing.</p>
            </div>
            <Button onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Print
            </Button>
          </div>
          
          {/* CS Member Summary */}
          <Card className="print:shadow-none print:border-none">
            <CardHeader>
              <CardTitle>CS Member Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Member Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Member Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  <PrintableField label="First Name" />
                  <PrintableField label="Last Name" />
                  <PrintableField label="Date of Birth (MM/DD/YYYY)" />
                  <PrintableField label="Age" />
                  <PrintableField label="Medi-Cal Number" />
                  <PrintableField label="Confirm Medi-Cal Number" />
                  <PrintableField label="Medical Record Number (MRN)" />
                  <PrintableField label="Confirm Medical Record Number" />
                  <PrintableField label="Preferred Language" className="md:col-span-2"/>
                </div>
              </div>
              <Separator />

              {/* Your Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Your Information (Person Filling Out Form)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    <PrintableField label="First Name" />
                    <PrintableField label="Last Name" />
                    <PrintableField label="Relationship to Member" />
                    <PrintableField label="Referral Source Name" />
                    <PrintableField label="Your Phone" />
                    <PrintableField label="Your Email" />
                </div>
              </div>
              <Separator />

              {/* Member Contact */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Member Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    <PrintableField label="Member Phone" />
                    <PrintableField label="Member Email" />
                </div>
                <div className="pt-2">
                    <PrintableCheckbox label="Member is the best contact person." />
                </div>
                <div className="p-4 border rounded-md space-y-4">
                    <h4 className="font-medium">Best Contact Person</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                        <PrintableField label="First Name" />
                        <PrintableField label="Last Name" />
                        <PrintableField label="Relationship to Member" />
                        <PrintableField label="Phone" />
                        <PrintableField label="Email" />
                        <PrintableField label="Best Contact's Preferred Language" />
                    </div>
                </div>
              </div>
              <Separator />

              {/* Legal Representative */}
              <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Legal Representative</h3>
                  <div className="space-y-2">
                      <label className="text-sm">Does member have capacity to make own health care decisions?</label>
                      <div className="flex space-x-4 pt-1"><PrintableRadio label="Yes" /><PrintableRadio label="No" /></div>
                  </div>
                   <div className="space-y-2">
                      <label className="text-sm">If no capacity, does he/she have a legal Authorized Rep (AR)?</label>
                      <div className="flex space-x-4 pt-1"><PrintableRadio label="Yes" /><PrintableRadio label="No" /><PrintableRadio label="N/A" /></div>
                  </div>
                  <div className="pt-2">
                    <PrintableCheckbox label="POA/AR is the same as the Best Contact." />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                      <PrintableField label="POA/AR First Name" />
                      <PrintableField label="POA/AR Last Name" />
                      <PrintableField label="POA/AR Relationship to Member" />
                      <PrintableField label="POA/AR Phone" />
                      <PrintableField label="POA/AR Email" className="md:col-span-2" />
                  </div>
              </div>

            </CardContent>
          </Card>

           <Card className="print:shadow-none print:border-none print:break-before-page">
            <CardHeader>
              <CardTitle>HIPAA Authorization Form</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground">This form, when completed and signed by you, authorizes the use and/or disclosure of your protected health information. The information authorized for release may include information related to HIV/AIDS, mental health, and substance use, unless specified otherwise.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 items-end">
                     <PrintableField label="Patient Name" />
                     <PrintableField label="Medi-Cal Number" />
                </div>
                <div className="space-y-4 text-sm">
                    <div><p className="font-medium">Person(s) or organization(s) authorized to make the disclosure:</p><p className="text-muted-foreground">any health care related agency or person providing information for the purpose of applying for the CalAIM CS for Assisted Living Transitions</p></div>
                    <div><p className="font-medium">Person(s) or organization(s) authorized to receive the information:</p><p className="text-muted-foreground">Connections Care Home Consultants, LLC</p></div>
                     <div><p className="font-medium">Specific information to be disclosed:</p><p className="text-muted-foreground">All medical records necessary for Community Supports (CS) application.</p></div>
                </div>
                <div className="space-y-2">
                    <label className="text-sm">Do you authorize the release of sensitive information?</label>
                     <div className="flex space-x-4 pt-1"><PrintableRadio label="Yes" /><PrintableRadio label="No" /></div>
                </div>
                <div className="space-y-2">
                    <label className="text-sm">Who is signing this form?</label>
                    <div className="flex space-x-4 pt-1"><PrintableRadio label="I am (the member)" /><PrintableRadio label="An authorized representative" /></div>
                </div>
                 <div className="grid grid-cols-3 gap-4 border-t pt-6 mt-6">
                    <div className="col-span-2"><PrintableField label="Signature (Full Name)" /></div>
                    <div><PrintableField label="Date" /></div>
                </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
