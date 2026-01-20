'use client';

import React, { useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
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
  X,
  Plus,
  Minus
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PDFDocument } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';

// Set up PDF.js worker with proper error handling - only on client side
if (typeof window !== 'undefined') {
  try {
    // Use the same version as the installed package to avoid conflicts
    const pdfVersion = pdfjs.version || '3.11.174';
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfVersion}/build/pdf.worker.min.js`;
    
    // Disable some PDF.js features that can cause Object.defineProperty errors
    pdfjs.GlobalWorkerOptions.isEvalSupported = false;
    
  } catch (error) {
    console.warn('PDF.js worker setup failed:', error);
    // Multiple fallback options
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      pdfjs.GlobalWorkerOptions.isEvalSupported = false;
    } catch (fallbackError) {
      console.warn('Fallback PDF.js worker setup failed:', fallbackError);
      // Force fallback viewer if all else fails
      if (typeof window !== 'undefined') {
        (window as any).PDF_JS_FAILED = true;
      }
    }
  }
}

interface SeparatedForm {
  id: string;
  name: string;
  type: 'CS Member Summary' | 'Waivers & Authorizations' | 'LIC 602A' | 'Declaration of Eligibility' | 'SNF Facesheet' | 'Proof of Income' | 'Medi-Cal Forms' | 'Other';
  pages: number[];
  confidence?: number;
  previewUrl?: string;
  downloadUrl?: string;
  pdfBlob?: Blob;
}

const FORM_TYPES = [
  'CS Member Summary',
  'Waivers & Authorizations', 
  'LIC 602A',
  'Declaration of Eligibility',
  'SNF Facesheet',
  'Proof of Income',
  'Medi-Cal Forms',
  'Other'
] as const;

// Error Boundary Component for PDF rendering
class PDFErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('PDF rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex items-center justify-center p-8 text-red-600 border border-red-200 rounded-lg bg-red-50">
          <AlertCircle className="h-8 w-8 mr-2" />
          <div>
            <p className="font-medium">PDF Rendering Error</p>
            <p className="text-sm">Unable to display PDF. Please try refreshing or use a different file.</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function FormSeparatorPage() {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [separatedForms, setSeparatedForms] = useState<SeparatedForm[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocument | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [editingForm, setEditingForm] = useState<string | null>(null);
  const [editPages, setEditPages] = useState<string>('');
  const [previewForm, setPreviewForm] = useState<SeparatedForm | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [newFormType, setNewFormType] = useState<string>('');
  const [useFallbackViewer, setUseFallbackViewer] = useState(false);
  const [newFormName, setNewFormName] = useState<string>('');
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize PDF.js worker on component mount
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      // Check if PDF.js failed to initialize
      if ((window as any).PDF_JS_FAILED) {
        setUseFallbackViewer(true);
        return;
      }
      
      // Ensure worker is set up
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        try {
          const pdfVersion = pdfjs.version || '3.11.174';
          pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfVersion}/build/pdf.worker.min.js`;
          pdfjs.GlobalWorkerOptions.isEvalSupported = false;
        } catch (error) {
          console.warn('Failed to set PDF.js worker:', error);
          setUseFallbackViewer(true);
        }
      }
    }
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setSeparatedForms([]);
      setSelectedPages(new Set());
      
      try {
        // Load PDF for processing
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        setPdfDocument(pdf);
        setNumPages(pdf.getPageCount());
        
        toast({
          title: 'PDF Loaded',
          description: `Successfully loaded PDF with ${pdf.getPageCount()} pages`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } catch (error) {
        console.error('Error loading PDF:', error);
        toast({
          variant: 'destructive',
          title: 'PDF Load Error',
          description: 'Could not load the PDF file. Please try again.',
        });
      }
    } else {
      toast({
        variant: 'destructive',
        title: 'Invalid File Type',
        description: 'Please upload a PDF file.',
      });
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  // Enhanced fallback PDF viewer with image conversion
  const FallbackPDFViewer = ({ file }: { file: File }) => {
    const [pdfUrl, setPdfUrl] = useState<string>('');
    const [pageImages, setPageImages] = useState<{ [key: number]: string }>({});
    const [loadingImages, setLoadingImages] = useState<Set<number>>(new Set());

    React.useEffect(() => {
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      return () => URL.revokeObjectURL(url);
    }, [file]);

    // Convert PDF page to image for better preview
    const convertPageToImage = async (pageNum: number) => {
      // Ensure we're running in the browser to avoid DOMMatrix/canvas SSR errors
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        console.warn('convertPageToImage called on server side, skipping');
        return;
      }

      // pdfjs is now statically imported, so no need to check

      if (pageImages[pageNum] || loadingImages.has(pageNum)) return;

      setLoadingImages(prev => new Set([...prev, pageNum]));
      
      try {
        // Use PDF.js to render page as canvas, then convert to image
        const loadingTask = pdfjs.getDocument({
          data: file,
          // Use conservative options to avoid Object.defineProperty errors
          disableFontFace: true,
          disableRange: true,
          disableStream: true,
          isEvalSupported: false
        });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(pageNum);
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Could not get canvas context');
        }
        
        const viewport = page.getViewport({ scale: 1.5 });
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({ canvasContext: context, viewport }).promise;
        
        const imageUrl = canvas.toDataURL('image/jpeg', 0.8);
        setPageImages(prev => ({ ...prev, [pageNum]: imageUrl }));
        
      } catch (error) {
        console.error(`Failed to convert page ${pageNum} to image:`, error);
        // Set a placeholder for failed pages
        setPageImages(prev => ({ ...prev, [pageNum]: 'failed' }));
      } finally {
        setLoadingImages(prev => {
          const newSet = new Set(prev);
          newSet.delete(pageNum);
          return newSet;
        });
      }
    };

    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-blue-600 mr-2" />
            <p className="text-blue-800">
              Using enhanced page viewer. Click pages to select them for form creation.
            </p>
          </div>
        </div>
        
        {/* Page Grid with Image Previews */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <div
              key={pageNum}
              className={`relative border-2 rounded cursor-pointer transition-all ${
                selectedPages.has(pageNum)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
              onClick={() => togglePageSelection(pageNum)}
              onMouseEnter={() => convertPageToImage(pageNum)}
            >
              <div className="aspect-[3/4] bg-gray-100 rounded flex items-center justify-center relative overflow-hidden">
                {pageImages[pageNum] && pageImages[pageNum] !== 'failed' ? (
                  <img
                    src={pageImages[pageNum]}
                    alt={`Page ${pageNum}`}
                    className="w-full h-full object-contain"
                  />
                ) : pageImages[pageNum] === 'failed' ? (
                  <div className="flex flex-col items-center text-red-500">
                    <AlertCircle className="h-8 w-8 mb-2" />
                    <span className="text-xs">Page {pageNum}</span>
                    <span className="text-xs opacity-75">Preview failed</span>
                  </div>
                ) : loadingImages.has(pageNum) ? (
                  <div className="flex flex-col items-center">
                    <Loader2 className="h-6 w-6 animate-spin mb-2" />
                    <span className="text-xs">Loading...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-gray-500">
                    <FileText className="h-8 w-8 mb-2" />
                    <span className="text-xs">Page {pageNum}</span>
                    <span className="text-xs opacity-75">Hover to preview</span>
                  </div>
                )}
              </div>
              
              <div className="absolute top-2 left-2 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-xs">
                {pageNum}
              </div>
              
              {selectedPages.has(pageNum) && (
                <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Manual Selection Buttons */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Or select pages manually:
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <Button
                key={pageNum}
                variant={selectedPages.has(pageNum) ? "default" : "outline"}
                size="sm"
                onClick={() => togglePageSelection(pageNum)}
              >
                {pageNum}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const togglePageSelection = (pageNum: number) => {
    const newSelection = new Set(selectedPages);
    if (newSelection.has(pageNum)) {
      newSelection.delete(pageNum);
    } else {
      newSelection.add(pageNum);
    }
    setSelectedPages(newSelection);
  };

  const selectPageRange = (start: number, end: number) => {
    const newSelection = new Set(selectedPages);
    for (let i = start; i <= end; i++) {
      newSelection.add(i);
    }
    setSelectedPages(newSelection);
  };

  const clearSelection = () => {
    setSelectedPages(new Set());
  };

  const createFormFromSelection = async () => {
    if (selectedPages.size === 0 || !newFormType || !newFormName || !pdfDocument) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please select pages, form type, and provide a form name.',
      });
      return;
    }

    try {
      setIsProcessing(true);

      // Create new PDF with selected pages
      const newPdf = await PDFDocument.create();
      const pages = Array.from(selectedPages).sort((a, b) => a - b);
      
      for (const pageNum of pages) {
        const [copiedPage] = await newPdf.copyPages(pdfDocument, [pageNum - 1]);
        newPdf.addPage(copiedPage);
      }

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const newForm: SeparatedForm = {
        id: Date.now().toString(),
        name: newFormName,
        type: newFormType as any,
        pages: pages,
        previewUrl: url,
        downloadUrl: url,
        pdfBlob: blob
      };

      setSeparatedForms(prev => [...prev, newForm]);
      
      // Clear selection and form inputs
      setSelectedPages(new Set());
      setNewFormName('');
      setNewFormType('');

      toast({
        title: 'Form Created',
        description: `Successfully created "${newFormName}" with ${pages.length} pages.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });

    } catch (error) {
      console.error('Error creating form:', error);
      toast({
        variant: 'destructive',
        title: 'Creation Failed',
        description: 'Could not create the form. Please try again.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = (form: SeparatedForm) => {
    if (form.pdfBlob) {
      const url = URL.createObjectURL(form.pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.name.replace(/[^a-z0-9]/gi, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Download Started',
        description: `Downloading ${form.name}...`,
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Download Error',
        description: 'PDF file not available for download.',
      });
    }
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

      <div className="grid gap-6">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload PDF Package
            </CardTitle>
            <CardDescription>
              Upload a multi-form PDF package to manually separate into individual forms
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="mb-4"
              />
              {file && (
                <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB) - {numPages} pages
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* PDF Viewer and Page Selection */}
        {file && numPages > 0 && (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* PDF Viewer */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  PDF Preview & Page Selection
                </CardTitle>
                <CardDescription>
                  Click pages to select them for form creation. Selected pages: {selectedPages.size}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={clearSelection} variant="outline">
                      Clear Selection
                    </Button>
                    <Button size="sm" onClick={() => selectPageRange(1, numPages)} variant="outline">
                      Select All
                    </Button>
                  </div>
                  
                  <div className="max-h-96 overflow-y-auto border rounded-lg p-4">
                    {useFallbackViewer ? (
                      <FallbackPDFViewer file={file} />
                    ) : (
                      <PDFErrorBoundary
                        fallback={
                          <div className="text-center p-8">
                            <AlertCircle className="h-12 w-12 text-yellow-600 mx-auto mb-4" />
                            <p className="text-lg font-medium mb-2">PDF Viewer Error</p>
                            <p className="text-muted-foreground mb-4">
                              The advanced PDF viewer encountered an error.
                            </p>
                            <Button onClick={() => setUseFallbackViewer(true)}>
                              Use Simple Viewer
                            </Button>
                          </div>
                        }
                      >
                        <Document
                            file={file}
                            onLoadSuccess={(pdf) => {
                              try {
                                setNumPages(pdf.numPages);
                                setPdfLoadError(null);
                              console.log('PDF loaded successfully:', pdf.numPages, 'pages');
                            } catch (error) {
                              console.error('Error processing loaded PDF:', error);
                              setUseFallbackViewer(true);
                            }
                          }}
                          onLoadError={(error) => {
                            console.error('PDF load error:', error);
                            setPdfLoadError(error.message || 'Failed to load PDF');
                            setUseFallbackViewer(true);
                            toast({
                              title: "PDF Load Error",
                              description: "Switching to fallback viewer. You can still select pages manually.",
                              variant: "destructive"
                            });
                          }}
                          options={{
                            // Disable problematic features that can cause Object.defineProperty errors
                            disableFontFace: true,
                            disableRange: true,
                            disableStream: true,
                            isEvalSupported: false,
                            // Use a more conservative worker configuration
                            workerSrc: pdfjs.GlobalWorkerOptions.workerSrc
                          }}
                          className="space-y-4"
                          loading={
                            <div className="flex items-center justify-center p-8">
                              <Loader2 className="h-8 w-8 animate-spin" />
                              <span className="ml-2">Loading PDF...</span>
                            </div>
                          }
                          error={
                            <div className="flex flex-col items-center justify-center p-8 text-red-600">
                              <AlertCircle className="h-8 w-8 mb-2" />
                              <span className="mb-4">Failed to load PDF: {pdfLoadError}</span>
                              <Button onClick={() => setUseFallbackViewer(true)} variant="outline">
                                Use Manual Page Selection
                              </Button>
                            </div>
                          }
                        >
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                          <div
                            key={pageNum}
                            className={`relative border-2 rounded cursor-pointer transition-all ${
                              selectedPages.has(pageNum)
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-400'
                            }`}
                            onClick={() => togglePageSelection(pageNum)}
                          >
                            <Page
                                pageNumber={pageNum}
                                width={150}
                                renderTextLayer={false}
                                renderAnnotationLayer={false}
                                onLoadError={(error) => {
                                  console.warn(`Failed to load page ${pageNum}:`, error);
                                  // Don't switch to fallback for individual page errors
                                }}
                                loading={
                                  <div className="flex items-center justify-center h-32 bg-gray-100">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  </div>
                                }
                                error={
                                  <div className="flex items-center justify-center h-32 bg-red-50 text-red-600">
                                    <AlertCircle className="h-4 w-4" />
                                    <span className="ml-1 text-xs">Page {pageNum}</span>
                                  </div>
                                }
                            />
                            <div className="absolute top-2 left-2 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-xs">
                              Page {pageNum}
                            </div>
                            {selectedPages.has(pageNum) && (
                              <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
                                <CheckCircle className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                        </Document>
                      </PDFErrorBoundary>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Form Creation Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Create Form
                </CardTitle>
                <CardDescription>
                  Create a new form from selected pages
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Form Name</label>
                  <Input
                    value={newFormName}
                    onChange={(e) => setNewFormName(e.target.value)}
                    placeholder="Enter form name..."
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium">Form Type</label>
                  <Select value={newFormType} onValueChange={setNewFormType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select form type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {FORM_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="text-sm text-gray-600">
                  Selected Pages: {Array.from(selectedPages).sort((a, b) => a - b).join(', ') || 'None'}
                </div>

                <Button
                  onClick={createFormFromSelection}
                  disabled={selectedPages.size === 0 || !newFormType || !newFormName || isProcessing}
                  className="w-full"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Form
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Instructions */}
        {!file && (
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
                  <strong>Review Pages:</strong> View all pages in the PDF and select which pages belong together
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold">3</div>
                <div>
                  <strong>Assign Form Types:</strong> Group selected pages and assign them to form categories (CS Summary, Waivers, etc.)
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold">4</div>
                <div>
                  <strong>Download Separated Forms:</strong> Download each form as a separate PDF file
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Created Forms Section */}
      {separatedForms.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Created Forms ({separatedForms.length})
            </CardTitle>
            <CardDescription>
              Forms you've created from the PDF package
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Form Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Pages</TableHead>
                  <TableHead>Page Count</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                      {editingForm === form.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editPages}
                            onChange={(e) => setEditPages(e.target.value)}
                            placeholder="1, 2, 3"
                            className="w-32"
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
                          <span className="text-sm">{form.pages.join(', ')}</span>
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
                    <TableCell>{form.pages.length} pages</TableCell>
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

// Export as dynamic component to prevent SSR issues
export default dynamic(() => Promise.resolve(FormSeparatorPage), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading Form Separator...</p>
      </div>
    </div>
  )
});