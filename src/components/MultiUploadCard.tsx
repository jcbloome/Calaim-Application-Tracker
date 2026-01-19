'use client';

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { 
  Upload, 
  FileText, 
  X, 
  CheckCircle2, 
  Loader2,
  AlertCircle 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ApplicationComponent {
  id: string;
  title: string;
  description: string;
  required: boolean;
}

interface UploadedFile {
  file: File;
  components: string[];
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  url?: string;
  error?: string;
}

interface MultiUploadCardProps {
  applicationComponents: ApplicationComponent[];
  onUploadComplete: (files: { file: File; components: string[]; url: string }[]) => void;
  maxFileSize?: number; // in MB
  acceptedFileTypes?: string[];
  className?: string;
}

export function MultiUploadCard({
  applicationComponents,
  onUploadComplete,
  maxFileSize = 10,
  acceptedFileTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'],
  className
}: MultiUploadCardProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    if (files.length === 0) return;

    // Validate files
    const validFiles: File[] = [];
    const errors: string[] = [];

    files.forEach(file => {
      // Check file size
      if (file.size > maxFileSize * 1024 * 1024) {
        errors.push(`${file.name} exceeds ${maxFileSize}MB limit`);
        return;
      }

      // Check file type
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!acceptedFileTypes.includes(fileExtension)) {
        errors.push(`${file.name} is not an accepted file type`);
        return;
      }

      validFiles.push(file);
    });

    if (errors.length > 0) {
      toast({
        title: "File Validation Error",
        description: errors.join(', '),
        variant: "destructive",
      });
      return;
    }

    // Add files to upload queue
    const newFiles: UploadedFile[] = validFiles.map(file => ({
      file,
      components: [],
      progress: 0,
      status: 'uploading' as const,
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);
    
    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleComponentToggle = (fileIndex: number, componentId: string) => {
    setUploadedFiles(prev => prev.map((file, index) => {
      if (index !== fileIndex) return file;
      
      const components = file.components.includes(componentId)
        ? file.components.filter(id => id !== componentId)
        : [...file.components, componentId];
      
      return { ...file, components };
    }));
  };

  const removeFile = (fileIndex: number) => {
    setUploadedFiles(prev => prev.filter((_, index) => index !== fileIndex));
  };

  const simulateUpload = async (fileIndex: number) => {
    // Simulate upload progress
    for (let progress = 0; progress <= 100; progress += 10) {
      await new Promise(resolve => setTimeout(resolve, 100));
      setUploadedFiles(prev => prev.map((file, index) => 
        index === fileIndex ? { ...file, progress } : file
      ));
    }

    // Simulate successful upload
    const mockUrl = `https://example.com/uploads/${Date.now()}-${uploadedFiles[fileIndex].file.name}`;
    setUploadedFiles(prev => prev.map((file, index) => 
      index === fileIndex 
        ? { ...file, status: 'completed' as const, url: mockUrl }
        : file
    ));
  };

  const handleUploadAll = async () => {
    const filesToUpload = uploadedFiles.filter(file => 
      file.status === 'uploading' && file.components.length > 0
    );

    if (filesToUpload.length === 0) {
      toast({
        title: "No Files to Upload",
        description: "Please select files and assign them to application components.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Upload all files (simulate for now)
      await Promise.all(
        uploadedFiles.map((file, index) => {
          if (file.status === 'uploading' && file.components.length > 0) {
            return simulateUpload(index);
          }
          return Promise.resolve();
        })
      );

      // Notify parent component
      const completedFiles = uploadedFiles
        .filter(file => file.status === 'completed' && file.url)
        .map(file => ({
          file: file.file,
          components: file.components,
          url: file.url!
        }));

      onUploadComplete(completedFiles);

      toast({
        title: "Upload Successful",
        description: `${completedFiles.length} file(s) uploaded successfully.`,
      });

      // Clear uploaded files
      setUploadedFiles([]);

    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Some files failed to upload. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const getComponentTitle = (componentId: string) => {
    return applicationComponents.find(comp => comp.id === componentId)?.title || componentId;
  };

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Multi-Document Upload
        </CardTitle>
        <CardDescription>
          Upload multiple documents and assign them to the required application components. 
          This is useful when you have faxed documents or scanned files containing multiple forms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* File Upload Area */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <Input
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptedFileTypes.join(',')}
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="space-y-2">
            <Upload className="h-8 w-8 mx-auto text-gray-400" />
            <div>
              <Button 
                variant="outline" 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                Select Files
              </Button>
            </div>
            <p className="text-sm text-gray-500">
              Accepted: {acceptedFileTypes.join(', ')} • Max size: {maxFileSize}MB per file
            </p>
          </div>
        </div>

        {/* Uploaded Files */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-4">
            <h3 className="font-semibold">Selected Files</h3>
            {uploadedFiles.map((uploadedFile, fileIndex) => (
              <Card key={fileIndex} className="p-4">
                <div className="space-y-4">
                  {/* File Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span className="font-medium">{uploadedFile.file.name}</span>
                      <span className="text-sm text-gray-500">
                        ({(uploadedFile.file.size / 1024 / 1024).toFixed(1)} MB)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {uploadedFile.status === 'completed' && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                      {uploadedFile.status === 'uploading' && (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      )}
                      {uploadedFile.status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(fileIndex)}
                        disabled={isUploading}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Upload Progress */}
                  {uploadedFile.status === 'uploading' && uploadedFile.progress > 0 && (
                    <Progress value={uploadedFile.progress} className="w-full" />
                  )}

                  {/* Component Selection */}
                  <div>
                    <Label className="text-sm font-medium">
                      This file contains the following application components:
                    </Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                      {applicationComponents.map(component => (
                        <div key={component.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`${fileIndex}-${component.id}`}
                            checked={uploadedFile.components.includes(component.id)}
                            onCheckedChange={() => handleComponentToggle(fileIndex, component.id)}
                            disabled={isUploading}
                          />
                          <Label 
                            htmlFor={`${fileIndex}-${component.id}`}
                            className="text-sm cursor-pointer"
                          >
                            {component.title}
                            {component.required && <span className="text-red-500 ml-1">*</span>}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Selected Components Summary */}
                  {uploadedFile.components.length > 0 && (
                    <Alert>
                      <AlertDescription>
                        <strong>Selected components:</strong> {uploadedFile.components.map(getComponentTitle).join(', ')}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </Card>
            ))}

            {/* Upload Button */}
            <div className="flex justify-end">
              <Button 
                onClick={handleUploadAll}
                disabled={isUploading || uploadedFiles.every(file => file.components.length === 0)}
                size="lg"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload All Files
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}