
'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { applications } from '@/lib/data';
import { CheckCircle2, XCircle, BookOpen } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const allForms = [
    { name: 'CS Member Summary', initial: 'CS' },
    { name: 'Program Information', initial: 'PI' },
    { name: 'HIPAA Authorization', initial: 'HP' },
    { name: 'Liability Waiver', initial: 'LW' },
    { name: 'Freedom of Choice Waiver', initial: 'FC' },
    { name: 'Proof of Income', initial: 'PoI' },
    { name: 'Physician\'s Report', initial: 'PR' },
    { name: 'Declaration of Eligibility', initial: 'DE' },
    { name: 'SNF Facesheet', initial: 'SF' },
    { name: 'Medicine List', initial: 'ML' },
];

function LegendDialog() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <BookOpen className="mr-2 h-4 w-4" />
                    View Legend
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Form Legend</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-72">
                    <div className="p-4">
                        <dl>
                            {allForms.map((item, index) => (
                                <div key={item.name}>
                                    <div className="flex items-baseline gap-4 py-2">
                                        <dt className="w-8 text-center font-bold text-primary">{item.initial}</dt>
                                        <dd className="text-muted-foreground">{item.name}</dd>
                                    </div>
                                    {index < allForms.length - 1 && <Separator />}
                                </div>
                            ))}
                        </dl>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}


export default function TrackerPage() {
  return (
    <div className="space-y-6">
       <div>
        <h1 className="text-2xl font-bold tracking-tight">Application Tracker</h1>
        <p className="text-muted-foreground">A high-level overview of form completion for all applications.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
            <div>
                <CardTitle>Completion Grid</CardTitle>
                <CardDescription>Quickly identify bottlenecks in the application process.</CardDescription>
            </div>
            <LegendDialog />
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead className="w-[150px]">Member Name</TableHead>
                    {allForms.map(form => (
                        <TableHead key={form.name} className="text-center w-[60px]">
                             <Tooltip>
                                <TooltipTrigger>
                                    <span className="font-bold">{form.initial}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{form.name}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TableHead>
                    ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {applications.map(app => (
                        <TableRow key={app.id}>
                            <TableCell className="font-medium">{app.memberName}</TableCell>
                            {allForms.map(form => {
                                const formStatus = app.forms.find(f => f.name === form.name)?.status;
                                const isCompleted = formStatus === 'Completed';

                                return (
                                    <TableCell key={form.name} className="text-center">
                                         <Tooltip>
                                            <TooltipTrigger>
                                                {isCompleted ? (
                                                    <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto" />
                                                ) : (
                                                    <XCircle className="h-5 w-5 text-red-500 mx-auto opacity-50" />
                                                )}
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>{isCompleted ? 'Completed' : 'Pending'}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TableCell>
                                )
                            })}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
          </TooltipProvider>
        </CardContent>
      </Card>
    </div>
  );
}
