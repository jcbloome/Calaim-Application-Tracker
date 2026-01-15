import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  DollarSign, 
  Building, 
  Calendar, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  Info
} from 'lucide-react';

interface AuthorizationRule {
  mco: string;
  t2038: {
    description: string;
    duration: string;
    reauthorization: string;
    status: 'active' | 'pending' | 'unknown';
  };
  h2022: {
    description: string;
    duration: string;
    reauthorization: string;
    status: 'active' | 'pending' | 'unknown';
  };
  notes: string[];
}

const authorizationRules: AuthorizationRule[] = [
  {
    mco: 'Health Net',
    t2038: {
      description: 'ConnectionsILOS Services',
      duration: '6 months',
      reauthorization: 'Every 6 months',
      status: 'active'
    },
    h2022: {
      description: 'RCFE Housing Services',
      duration: '6 months',
      reauthorization: 'Every 6 months',
      status: 'active'
    },
    notes: [
      'Authorizes T2038 and H2022 together for 6 months',
      'Both authorizations renewed simultaneously',
      'Standard reauthorization process established'
    ]
  },
  {
    mco: 'Kaiser Permanente',
    t2038: {
      description: 'ConnectionsILOS Services',
      duration: 'Initial authorization only',
      reauthorization: 'TBD - Not yet established',
      status: 'pending'
    },
    h2022: {
      description: 'RCFE Housing Services',
      duration: '6 months',
      reauthorization: 'Every 6 months',
      status: 'active'
    },
    notes: [
      'Initial T2038 authorization provided',
      'H2022 reauthorization every 6 months (established)',
      'T2038 reauthorization process not yet determined',
      'Monitor for T2038 reauth policy updates'
    ]
  }
];

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'active':
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'pending':
      return <Clock className="h-4 w-4 text-orange-600" />;
    default:
      return <AlertTriangle className="h-4 w-4 text-red-600" />;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'active':
      return <Badge variant="secondary" className="bg-green-100 text-green-800">Active</Badge>;
    case 'pending':
      return <Badge variant="outline" className="bg-orange-100 text-orange-800">Pending</Badge>;
    default:
      return <Badge variant="destructive">Unknown</Badge>;
  }
};

export function AuthorizationRulesDashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Info className="h-5 w-5 text-blue-600" />
        <h2 className="text-xl font-semibold">MCO Authorization Rules</h2>
      </div>
      
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Important:</strong> Authorization rules vary by MCO. Monitor expiration dates 2 weeks in advance to ensure continuous service authorization.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {authorizationRules.map((rule) => (
          <Card key={rule.mco} className="border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                {rule.mco}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* T2038 Authorization */}
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">T2038 - ConnectionsILOS</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(rule.t2038.status)}
                    {getStatusBadge(rule.t2038.status)}
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <p><span className="font-medium">Duration:</span> {rule.t2038.duration}</p>
                  <p><span className="font-medium">Reauth:</span> {rule.t2038.reauthorization}</p>
                </div>
              </div>

              {/* H2022 Authorization */}
              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-purple-600" />
                    <span className="font-medium">H2022 - RCFE Housing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(rule.h2022.status)}
                    {getStatusBadge(rule.h2022.status)}
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <p><span className="font-medium">Duration:</span> {rule.h2022.duration}</p>
                  <p><span className="font-medium">Reauth:</span> {rule.h2022.reauthorization}</p>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Info className="h-3 w-3" />
                  Key Notes:
                </h4>
                <ul className="space-y-1">
                  {rule.notes.map((note, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Authorization Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Authorization Timeline Guidelines
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="font-medium text-green-800">Active (30+ days)</span>
              </div>
              <p className="text-sm text-green-700">Authorization is current and services can continue normally.</p>
            </div>
            
            <div className="p-4 bg-orange-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <span className="font-medium text-orange-800">Expiring (≤14 days)</span>
              </div>
              <p className="text-sm text-orange-700">Submit reauthorization request immediately to avoid service interruption.</p>
            </div>
            
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span className="font-medium text-red-800">Expired</span>
              </div>
              <p className="text-sm text-red-700">Services may be interrupted. Urgent reauthorization required.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}