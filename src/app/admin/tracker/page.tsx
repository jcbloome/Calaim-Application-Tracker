
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
import { CheckCircle2, XCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const allForms = [
    'CS Member Summary',
    'HIPAA Authorization',
    'Liability Waiver',
    'Proof of Income',
    'Physician\'s Report'
];

export default function TrackerPage() {
  return (
    <div className="space-y-6">
       <div>
        <h1 className="text-2xl font-bold tracking-tight">Application Tracker</h1>
        <p className="text-muted-foreground">A high-level overview of form completion for all applications.</p>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>Completion Grid</CardTitle>
            <CardDescription>Quickly identify bottlenecks in the application process.</CardDescription>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Member Name</TableHead>
                    {allForms.map(formName => (
                        <TableHead key={formName} className="text-center">{formName}</TableHead>
                    ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {applications.map(app => (
                        <TableRow key={app.id}>
                            <TableCell className="font-medium">{app.memberName}</TableCell>
                            {allForms.map(formName => {
                                const formStatus = app.forms.find(f => f.name === formName)?.status;
                                const isCompleted = formStatus === 'Completed';

                                return (
                                    <TableCell key={formName} className="text-center">
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
