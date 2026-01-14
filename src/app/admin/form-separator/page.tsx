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
  Trash2,
  Edit3,
  Save,
  X
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface SeparatedForm {
  id: string;
  name: string;
  type: 'CS Member Summary' | 'Waivers & Authorizations' | 'LIC 602A' | 'Declaration of Eligibility' | 'SNF Facesheet' | 'Proof of Income' | 'Other';
  pages: number[];
  confidence: number;
  previewUrl?: string;
  downloadUrl?: string;
}

export default function FormSeparatorPage() {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [separatedForms, setSeparatedForms] = useState<SeparatedForm[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [editingForm, setEditingForm] = useState<string | null>(null);
  const [editPages, setEditPages] = useState<string>('');
  const [previewForm, setPreviewForm] = useState<SeparatedForm | null>(null);

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
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Mock separated forms based on common patterns
      const mockSeparatedForms: SeparatedForm[] = [
        {
          id: '1',
          name: 'CS Member Summary',
          type: 'CS Member Summary',
          pages: [1, 2, 3],
          confidence: 95,
          previewUrl: '/mock-preview-1.pdf',
          downloadUrl: '/mock-download-1.pdf'
        },
        {
          id: '2',
          name: 'Waivers & Authorizations',
          type: 'Waivers & Authorizations',
          pages: [4, 5],
          confidence: 88,
          previewUrl: '/mock-preview-2.pdf',
          downloadUrl: '/mock-download-2.pdf'
        },
        {
          id: '3',
          name: "LIC 602A - Physician's Report",
          type: 'LIC 602A',
          pages: [6, 7, 8],
          confidence: 92,
          previewUrl: '/mock-preview-3.pdf',
          downloadUrl: '/mock-download-3.pdf'
        },
        {
          id: '4',
          name: 'Proof of Income',
          type: 'Proof of Income',
          pages: [9],
          confidence: 78,
          previewUrl: '/mock-preview-4.pdf',
          downloadUrl: '/mock-download-4.pdf'
        }
      ];

      setSeparatedForms(mockSeparatedForms);
      
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
    setPreviewForm(form);
  };

  const handleRemove = (formId: string) => {
    setSeparatedForms(prev => prev.filter(form => form.id !== formId));
    toast({
      title: 'Form Removed',
      description: 'The form has been removed from the separation results.',
    });
  };

  const handleEditPages = (form: SeparatedForm) => {
    setEditingForm(form.id);
    setEditPages(form.pages.join(', '));
  };

  const handleSavePages = (formId: string) => {
    const newPages = editPages.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p));
    setSeparatedForms(prev => 
      prev.map(form => 
        form.id === formId 
          ? { ...form, pages: newPages }
          : form
      )
    );
    setEditingForm(null);
    setEditPages('');
    toast({
      title: 'Pages Updated',
      description: 'Form page range has been updated successfully.',
    });
  };

  const handleCancelEdit = () => {
    setEditingForm(null);
    setEditPages('');
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 90) return <Badge className="bg-green-100 text-green-800">High ({confidence}%)</Badge>;
    if (confidence >= 75) return <Badge className="bg-yellow-100 text-yellow-800">Medium ({confidence}%)</Badge>;
    return <Badge className="bg-red-100 text-red-800">Low ({confidence}%)</Badge>;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Scissors className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Form Separation Tool</h1>
          <p className="text-muted-foreground">Upload PDF packages and separate them into individual forms with manual page control</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload PDF Package
            </CardTitle>
            <CardDescription>
              Upload a multi-form PDF package to automatically separate individual forms
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="mb-4"
              />
              {file && (
                <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </div>
              )}
            </div>
            
            <Button 
              onClick={processPdfSeparation}
              disabled={!file || isProcessing}
              className="w-full"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing PDF...
                </>
              ) : (
                <>
                  <Scissors className="mr-2 h-4 w-4" />
                  Separate Forms
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              How It Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold">1</div>
              <div>
                <strong>Upload PDF Package:</strong> Select a multi-form PDF file containing various CalAIM forms
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold">2</div>
              <div>
                <strong>Automatic Detection:</strong> AI analyzes the document and identifies individual forms
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold">3</div>
              <div>
                <strong>Review & Edit:</strong> Review detected forms and manually adjust page ranges if needed
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold">4</div>
              <div>
                <strong>Download:</strong> Download individual forms as separate PDF files
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results Section */}
      {separatedForms.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Separated Forms ({separatedForms.length})
            </CardTitle>
            <CardDescription>
              Review the automatically detected forms and adjust page ranges as needed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Form Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Pages</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {separatedForms.map((form) => (
                  <TableRow key={form.id}>
                    <TableCell className="font-medium">{form.name}</TableCell>
                    <TableCell>{form.type}</TableCell>
                    <TableCell>
                      {editingForm === form.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editPages}
                            onChange={(e) => setEditPages(e.target.value)}
                            placeholder="1, 2, 3"
                            className="w-24"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSavePages(form.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleCancelEdit}
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{form.pages.join(', ')}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditPages(form)}
                            className="h-6 w-6 p-0"
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{getConfidenceBadge(form.confidence)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handlePreview(form)}
                          className="h-8 w-8 p-0"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownload(form)}
                          className="h-8 w-8 p-0"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemove(form.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewForm} onOpenChange={() => setPreviewForm(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Preview: {previewForm?.name}</DialogTitle>
            <DialogDescription>
              Pages: {previewForm?.pages.join(', ')} | Confidence: {previewForm?.confidence}%
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 bg-gray-100 rounded-lg p-4 flex items-center justify-center min-h-[400px]">
            <div className="text-center text-gray-500">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">PDF Preview</p>
              <p className="text-sm">Preview functionality would be implemented here</p>
              <p className="text-xs mt-2">Pages: {previewForm?.pages.join(', ')}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}