
'use client';

import { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { applications as mockApplications } from '@/lib/data';
import type { FormStatus, ApplicationStatus } from '@/lib/definitions';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, Circle, FileQuestion, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { Application } from '@/lib/definitions';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

// Get a list of all unique form names across all applications
const allFormNames = Array.from(new Set(mockApplications.flatMap(app => app.forms.map(form => form.name))));

// Add any other forms that might not be in the initial mock data but should have a column
const additionalForms = ['SNF Facesheet', 'Proof of Income', "LIC 602A - Physician's Report", "Medicine List", 'Declaration of Eligibility', 'Program Information'];
additionalForms.forEach(formName => {
    if (!allFormNames.includes(formName)) {
        allFormNames.push(formName);
    }
});

const formInitialsMap: Record<string, string> = {
    'CS Member Summary': 'CS',
    'Program Information': 'PI',
    'HIPAA Authorization': 'HP',
    'Liability Waiver': 'LW',
    'Freedom of Choice Waiver': 'FC',
    'Declaration of Eligibility': 'DoE',
    'Proof of Income': 'POI',
    "LIC 602A - Physician's Report": 'PR',
    "Medicine List": 'ML',
    'SNF Facesheet': 'SF',
};

// Filter the map to only include forms that actually exist in our data + logic
const legendItems = allFormNames.map(name => ({
    initial: formInitialsMap[name] || name.substring(0, 2).toUpperCase(),
    fullName: name
})).sort((a, b) => a.initial.localeCompare(b.initial));


const getRequiredFormsForPathway = (pathway: Application['pathway']): string[] => {
  const baseForms = [
    'CS Member Summary', 
    'Program Information', 
    'HIPAA Authorization', 
    'Liability Waiver', 
    'Freedom of Choice Waiver',
    'Proof of Income',
    "LIC 602A - Physician's Report",
    "Medicine List"
  ];
  
  if (pathway === 'SNF Diversion') {
    return [...baseForms, 'Declaration of Eligibility'];
  }
  if (pathway === 'SNF Transition') {
    return [...baseForms, 'SNF Facesheet'];
  }
  return baseForms; // Default
};


const FormStatusIcon = ({ status }: { status: FormStatus['status'] | undefined }) => {
  if (status === 'Completed') {
    return <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto" />;
  }
  if (status === 'Pending') {
    return <Circle className="h-5 w-5 text-yellow-500 mx-auto" />;
  }
  return <FileQuestion className="h-5 w-5 text-gray-400 mx-auto" />;
};


export default function FormTrackerPage() {
    const [filters, setFilters] = useState({
        status: 'all',
        healthPlan: 'all',
        pathway: 'all',
        formName: 'all',
        formStatus: 'all'
    });
    
    const [sortBy, setSortBy] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const handleFilterChange = (filterName: keyof typeof filters, value: string) => {
        setFilters(prev => ({ ...prev, [filterName]: value }));
    };

    const handleSort = (columnName: string) => {
        if (sortBy === columnName) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(columnName);
            setSortDirection('asc');
        }
    };
    
    const filteredApplications = useMemo(() => {
        let filtered = [...mockApplications];

        if (filters.status !== 'all') {
            filtered = filtered.filter(app => app.status === filters.status);
        }
        if (filters.healthPlan !== 'all') {
            filtered = filtered.filter(app => app.healthPlan === filters.healthPlan);
        }
        if (filters.pathway !== 'all') {
            filtered = filtered.filter(app => app.pathway === filters.pathway);
        }
        if (filters.formName !== 'all' && filters.formStatus !== 'all') {
            filtered = filtered.filter(app => {
                const form = app.forms.find(f => f.name === filters.formName);
                if (filters.formStatus === 'Completed') return form?.status === 'Completed';
                if (filters.formStatus === 'Pending') return !form || form.status === 'Pending';
                return false;
            });
        }
        
        if (sortBy) {
            filtered.sort((a, b) => {
                const formStatusA = a.forms.find(f => f.name === sortBy)?.status || 'Pending';
                const formStatusB = b.forms.find(f => f.name === sortBy)?.status || 'Pending';

                const valueA = formStatusA === 'Completed' ? 1 : 0;
                const valueB = formStatusB === 'Completed' ? 1 : 0;

                if (valueA < valueB) return sortDirection === 'asc' ? -1 : 1;
                if (valueA > valueB) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }


        return filtered;
    }, [filters, sortBy, sortDirection]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Form Tracker</h1>
        <p className="text-muted-foreground">An at-a-glance overview of form completion for all applications.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>All Application Form Status</CardTitle>
              <CardDescription>
                A compact view of form statuses. Green means completed, yellow means pending. Click column headers to sort.
              </CardDescription>
            </div>
             <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline"><BookOpen className="mr-2 h-4 w-4" /> View Legend</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Form Legend</DialogTitle>
                </DialogHeader>
                 <div className="space-y-2 py-2">
                    {legendItems.map((item, index) => (
                      <>
                        <div key={item.initial} className="flex justify-between items-center text-sm">
                            <span className="font-bold text-primary">{item.initial}</span>
                            <span>{item.fullName}</span>
                        </div>
                        {index < legendItems.length - 1 && <Separator />}
                      </>
                    ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
            <div className="flex flex-wrap gap-4 mb-6 p-4 border rounded-lg">
                <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v)}>
                    <SelectTrigger className="w-full sm:w-auto"><SelectValue placeholder="Filter by Status" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Requires Revision">Requires Revision</SelectItem>
                        <SelectItem value="Completed & Submitted">Submitted</SelectItem>
                        <SelectItem value="Approved">Approved</SelectItem>
                    </SelectContent>
                </Select>
                 <Select value={filters.healthPlan} onValueChange={(v) => handleFilterChange('healthPlan', v)}>
                    <SelectTrigger className="w-full sm:w-auto"><SelectValue placeholder="Filter by Health Plan" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Health Plans</SelectItem>
                        <SelectItem value="Kaiser Permanente">Kaiser Permanente</SelectItem>
                        <SelectItem value="Health Net">Health Net</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={filters.pathway} onValueChange={(v) => handleFilterChange('pathway', v)}>
                    <SelectTrigger className="w-full sm:w-auto"><SelectValue placeholder="Filter by Pathway" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Pathways</SelectItem>
                        <SelectItem value="SNF Transition">SNF Transition</SelectItem>
                        <SelectItem value="SNF Diversion">SNF Diversion</SelectItem>
                    </SelectContent>
                </Select>
                 <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Select value={filters.formName} onValueChange={(v) => handleFilterChange('formName', v)}>
                        <SelectTrigger className="w-full sm:w-[220px]"><SelectValue placeholder="Filter by Form" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Any Form</SelectItem>
                            {allFormNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={filters.formStatus} onValueChange={(v) => handleFilterChange('formStatus', v)} disabled={filters.formName === 'all'}>
                        <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Form Status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Any Status</SelectItem>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="Completed">Completed</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

          <TooltipProvider>
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px] font-bold">Member / App ID</TableHead>
                  {legendItems.map(item => (
                     <TableHead key={item.initial} className="text-center w-[50px] p-0">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => handleSort(item.fullName)} className="font-bold w-full">
                                    {item.initial}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>{item.fullName}</p></TooltipContent>
                        </Tooltip>
                     </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApplications.map(app => {
                  const formStatusMap = new Map(app.forms.map(form => [form.name, form.status]));
                  const requiredForms = getRequiredFormsForPathway(app.pathway);
                  return (
                    <TableRow key={app.id}>
                      <TableCell>
                        <Link href={`/admin/application/${app.id}`} className="font-medium hover:underline text-primary">
                          {app.memberName}
                        </Link>
                        <div className="text-xs text-muted-foreground font-mono">{app.id}</div>
                        <div className="text-xs text-muted-foreground">{app.healthPlan} &ndash; {app.pathway}</div>
                      </TableCell>
                       {legendItems.map(item => {
                            const isRequired = requiredForms.includes(item.fullName);
                            return (
                                <TableCell key={item.initial} className="text-center p-2">
                                    {isRequired ? (
                                        <FormStatusIcon status={formStatusMap.get(item.fullName)} />
                                    ) : (
                                        <span aria-hidden="true"></span>
                                    )}
                                </TableCell>
                            );
                        })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
        </CardContent>
      </Card>
    </div>
  );
}

    