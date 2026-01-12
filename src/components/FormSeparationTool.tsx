'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { 
  Scissors, 
  FileText, 
  Download, 
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  Eye,
  Trash2
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface SeparatedForm {
  id: string;
  name: string;
  type: 'CS Member Summary' | 'Waivers & Authorizations' | 'LIC 602A' | 'Declaration of Eligibility' | 'SNF Facesheet' | 'Proof of Income' | 'Other';
  pages: number[];
  confidence: number;
  previewUrl?: string;
  downloadUrl?: string;
}

interface FormSeparationToolProps {
  uploadedFile?: File;
  onSeparationComplete?: (forms: SeparatedForm[]) => void;
}

export function FormSeparationTool({ uploadedFile, onSeparationComplete }: FormSeparationToolProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [separatedForms, setSeparatedForms] = useState<SeparatedForm[]>([]);
  const [file, setFile] = useState<File | null>(uploadedFile || null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setSeparatedForms([]);
    } else {
      toast({
        variant: 'destructive',
        title: 'Invalid File Type',
        description: 'Please upload a PDF file.',
      });
    }
  };

  const processPdfSeparation = async () => {
    if (!file) return;

    setIsProcessing(true);
    
    try {
      // Simulate PDF processing - in production this would use a PDF processing library
      // like PDF-lib, pdf2pic, or a server-side service
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Mock separated forms based on common patterns
      const mockSeparatedForms: SeparatedForm[] = [
        {
          id: '1',
          name: 'CS Member Summary Form',
          type: 'CS Member Summary',
          pages: [1, 2, 3],
          confidence: 0.95,
          previewUrl: '/mock-preview-1.jpg',
          downloadUrl: '/mock-download-1.pdf'
        },
        {
          id: '2', 
          name: 'Waivers & Authorizations',
          type: 'Waivers & Authorizations',
          pages: [4, 5],
          confidence: 0.92,
          previewUrl: '/mock-preview-2.jpg',
          downloadUrl: '/mock-download-2.pdf'
        },
        {
          id: '3',
          name: 'LIC 602A - Physician\'s Report',
          type: 'LIC 602A',
          pages: [6, 7, 8],
          confidence: 0.88,
          previewUrl: '/mock-preview-3.jpg',
          downloadUrl: '/mock-download-3.pdf'
        }
      ];

      setSeparatedForms(mockSeparatedForms);
      onSeparationComplete?.(mockSeparatedForms);
      
      toast({
        title: 'Separation Complete',
        description: `Successfully separated ${mockSeparatedForms.length} forms from the PDF package.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });

    } catch (error: any) {
      console.error('PDF separation error:', error);
      toast({
        variant: 'destructive',
        title: 'Separation Failed',
        description: 'Could not process the PDF file. Please try again.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = (form: SeparatedForm) => {
    // In production, this would download the actual separated PDF
    toast({
      title: 'Download Started',
      description: `Downloading ${form.name}...`,
    });
  };

  const handlePreview = (form: SeparatedForm) => {
    // In production, this would open a preview modal
    toast({
      title: 'Preview',
      description: `Opening preview for ${form.name}...`,
    });
  };

  const handleRemove = (formId: string) => {
    setSeparatedForms(prev => prev.filter(form => form.id !== formId));
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-green-100 text-green-800';
    if (confidence >= 0.8) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            PDF Form Separation Tool
          </CardTitle>
          <CardDescription>
            Upload a PDF package containing multiple forms, and we'll automatically separate them into individual documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!file && (
            <div>
              <Input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="mb-4"
              />
              <p className="text-sm text-gray-500">
                Supported format: PDF files only
              </p>
            </div>
          )}

          {file && !isProcessing && separatedForms.length === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium">{file.name}</span>
                <Badge variant="secondary">{(file.size / 1024 / 1024).toFixed(2)} MB</Badge>
              </div>
              
              <div className="flex gap-3">
                <Button onClick={processPdfSeparation} className="flex-1">
                  <Scissors className="h-4 w-4 mr-2" />
                  Separate Forms
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setFile(null);
                    setSeparatedForms([]);
                  }}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Choose Different File
                </Button>
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mr-3" />
              <div>
                <p className="font-medium">Processing PDF...</p>
                <p className="text-sm text-gray-500">Analyzing document structure and separating forms</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {separatedForms.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Separated Forms ({separatedForms.length})
            </CardTitle>
            <CardDescription>
              Review the automatically separated forms below. You can download individual forms or make adjustments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Form Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Pages</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {separatedForms.map((form) => (
                    <TableRow key={form.id}>
                      <TableCell className="font-medium">{form.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{form.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {form.pages.join(', ')} ({form.pages.length} pages)
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={getConfidenceColor(form.confidence)}>
                          {(form.confidence * 100).toFixed(0)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePreview(form)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleDownload(form)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRemove(form.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-1">Beta Feature Notice</p>
                  <p>
                    This form separation tool is currently in beta. Please review all separated forms carefully 
                    and verify they contain the correct content before using them in your application process.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}