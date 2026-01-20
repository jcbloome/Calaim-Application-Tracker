'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Map, Copy, ArrowRight, Save, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// CS Summary Form Fields - Empty template for field mapping
const csSummaryFields = {
  // Step 1 - Member Info
  memberFirstName: "",
  memberLastName: "",
  memberDob: "",
  sex: "",
  memberAge: null,
  memberMediCalNum: "",
  confirmMemberMediCalNum: "",
  memberMrn: "",
  confirmMemberMrn: "",
  memberLanguage: "",
  
  // Step 1 - Referrer Info
  referrerFirstName: "",
  referrerLastName: "",
  referrerEmail: "",
  referrerPhone: "",
  referrerRelationship: "",
  agency: "",

  // Step 1 - Primary Contact Person
  bestContactFirstName: "",
  bestContactLastName: "",
  bestContactRelationship: "",
  bestContactPhone: "",
  bestContactEmail: "",
  bestContactLanguage: "",

  // Secondary Contact
  secondaryContactFirstName: "",
  secondaryContactLastName: "",
  secondaryContactRelationship: "",
  secondaryContactPhone: "",
  secondaryContactEmail: "",
  secondaryContactLanguage: "",

  // Step 1 - Legal Rep
  hasLegalRep: "",
  repFirstName: "",
  repLastName: "",
  repRelationship: "",
  repPhone: "",
  repEmail: "",

  // Step 2 - Location
  currentLocation: "",
  currentAddress: "",
  currentCity: "",
  currentState: "",
  currentZip: "",
  currentCounty: "",
  customaryLocationType: "",
  customaryAddress: "",
  customaryCity: "",
  customaryState: "",
  customaryZip: "",
  customaryCounty: "",

  // Step 3 - Health Plan & Pathway
  healthPlan: "",
  existingHealthPlan: "",
  switchingHealthPlan: "",
  pathway: "",
  meetsPathwayCriteria: null,
  snfDiversionReason: "",

  // Step 4 - ISP & RCFE
  ispFirstName: "",
  ispLastName: "",
  ispRelationship: "",
  ispPhone: "",
  ispEmail: "",
  ispLocationType: "",
  ispAddress: "",
  ispFacilityName: "",
  onALWWaitlist: "",
  monthlyIncome: "",
  ackRoomAndBoard: null,
  hasPrefRCFE: "",
  rcfeName: "",
  rcfeAddress: "",
  rcfeAdminName: "",
  rcfeAdminPhone: "",
  rcfeAdminEmail: ""
};

// CalAIM Members Table Field Names (for dropdown selection)
const caspioMembersFieldNames = [
  'client_ID2',
  'Client_ID2', 
  'Senior_First',
  'Senior_Last',
  'memberFirstName',
  'memberLastName',
  'memberMediCalNum',
  'memberMrn',
  'MCP_CIN',
  'MC',
  'memberCounty',
  'Member_County',
  'memberDob',
  'memberAge',
  'sex',
  'memberLanguage',
  'CalAIM_MCO',
  'CalAIM_MCP',
  'HealthPlan',
  'healthPlan',
  'CalAIM_Status',
  'Kaiser_Status',
  'pathway',
  'SNF_Diversion_or_Transition',
  'bestContactFirstName',
  'bestContactLastName',
  'bestContactPhone',
  'bestContactEmail',
  'bestContactRelationship',
  'bestContactLanguage',
  'secondaryContactFirstName',
  'secondaryContactLastName',
  'secondaryContactPhone',
  'secondaryContactEmail',
  'secondaryContactRelationship',
  'referrerFirstName',
  'referrerLastName',
  'referrerPhone',
  'referrerEmail',
  'referrerRelationship',
  'agency',
  'currentLocation',
  'currentAddress',
  'currentCity',
  'currentState',
  'currentZip',
  'currentCounty',
  'ispFirstName',
  'ispLastName',
  'ispPhone',
  'ispEmail',
  'ispFacilityName',
  'rcfeName',
  'rcfeAddress',
  'rcfeAdminName',
  'rcfeAdminPhone',
  'rcfeAdminEmail',
  'Kaiser_T2038_Requested_Date',
  'Kaiser_T2038_Received_Date',
  'Kaiser_Tier_Level_Requested_Date',
  'Kaiser_Tier_Level_Received_Date',
  'ILS_RCFE_Sent_For_Contract_Date',
  'ILS_RCFE_Received_Contract_Date',
  'DateCreated',
  'LastUpdated',
  'created_date',
  'last_updated',
  'next_steps_date',
  'kaiser_user_assignment'
];

export default function CaspioFieldMappingPage() {
  const [fieldMappings, setFieldMappings] = useState<{[key: string]: string}>({});
  const [mappingName, setMappingName] = useState('');
  const { toast } = useToast();

  const handleSaveMapping = () => {
    if (!mappingName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Mapping Name Required',
        description: 'Please enter a name for this field mapping configuration.',
      });
      return;
    }

    // Save to localStorage for now (in production, save to database)
    const savedMappings = JSON.parse(localStorage.getItem('caspioFieldMappings') || '{}');
    savedMappings[mappingName] = fieldMappings;
    localStorage.setItem('caspioFieldMappings', JSON.stringify(savedMappings));

    toast({
      title: 'Mapping Saved Successfully',
      description: `Field mapping "${mappingName}" has been saved.`,
      className: 'bg-green-100 text-green-900 border-green-200',
    });
  };

  const handleLoadMapping = (name: string) => {
    const savedMappings = JSON.parse(localStorage.getItem('caspioFieldMappings') || '{}');
    if (savedMappings[name]) {
      setFieldMappings(savedMappings[name]);
      setMappingName(name);
      toast({
        title: 'Mapping Loaded',
        description: `Field mapping "${name}" has been loaded.`,
        className: 'bg-blue-100 text-blue-900 border-blue-200',
      });
    }
  };

  const savedMappings = JSON.parse(localStorage.getItem('caspioFieldMappings') || '{}');

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Map className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Caspio Field Mapping Configuration</h1>
          <p className="text-muted-foreground">Configure field mappings between CS Summary forms and CalAIM Members table</p>
        </div>
      </div>

      {/* Mapping Management */}
      <Card>
        <CardHeader>
          <CardTitle>Mapping Configuration Management</CardTitle>
          <CardDescription>Save, load, and manage field mapping configurations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Mapping Name</Label>
              <Input
                value={mappingName}
                onChange={(e) => setMappingName(e.target.value)}
                placeholder="Enter mapping name..."
              />
            </div>
            <div className="space-y-2">
              <Label>Actions</Label>
              <div className="flex gap-2">
                <Button onClick={handleSaveMapping} size="sm">
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const mappingJson = JSON.stringify(fieldMappings, null, 2);
                    const blob = new Blob([mappingJson], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${mappingName || 'caspio-field-mapping'}.json`;
                    a.click();
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Load Saved Mapping</Label>
              <Select onValueChange={handleLoadMapping}>
                <SelectTrigger>
                  <SelectValue placeholder="Select saved mapping..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(savedMappings).map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Field Mapping Interface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5" />
            CS Summary Form → CalAIM Members Table Field Mapping
          </CardTitle>
          <CardDescription>
            Map each CS Summary form field to its corresponding CalAIM Members table field
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Mapping Controls */}
            <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div>
                <h4 className="font-medium text-blue-900">Field Mapping Progress</h4>
                <p className="text-sm text-blue-700">
                  {Object.keys(fieldMappings).length} of {Object.keys(csSummaryFields).length} fields mapped
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setFieldMappings({})}
                >
                  Clear All
                </Button>
                <Button 
                  size="sm"
                  onClick={() => {
                    // Auto-map obvious matches
                    const autoMappings: {[key: string]: string} = {};
                    Object.keys(csSummaryFields).forEach(csField => {
                      if (caspioMembersFieldNames.includes(csField)) {
                        autoMappings[csField] = csField;
                      }
                    });
                    setFieldMappings(autoMappings);
                    toast({
                      title: "Auto-mapping Complete",
                      description: `Mapped ${Object.keys(autoMappings).length} obvious matches`,
                      className: 'bg-green-100 text-green-900 border-green-200',
                    });
                  }}
                >
                  Auto-Map Matches
                </Button>
              </div>
            </div>

            {/* Field Mapping Grid */}
            <div className="grid grid-cols-1 gap-4 max-h-96 overflow-y-auto border rounded-lg p-4">
              {Object.entries(csSummaryFields).map(([csField, sampleValue]) => (
                <div key={csField} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 border rounded-lg bg-gray-50">
                  {/* CS Summary Field */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-blue-700">CS Summary Field</Label>
                    <div className="p-2 bg-blue-100 rounded border">
                      <div className="font-mono text-sm font-medium">{csField}</div>
                      <div className="text-xs text-blue-600 mt-1 truncate">
                        Sample: {sampleValue?.toString() || 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Mapping Arrow */}
                  <div className="flex items-center justify-center">
                    <ArrowRight className="h-5 w-5 text-gray-400" />
                  </div>

                  {/* CalAIM Members Field Selection */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-green-700">CalAIM Members Field</Label>
                    <Select 
                      value={fieldMappings[csField] || 'no-mapping'} 
                      onValueChange={(value) => {
                        if (value === 'no-mapping') {
                          // Remove the mapping if "No Mapping" is selected
                          setFieldMappings(prev => {
                            const newMappings = { ...prev };
                            delete newMappings[csField];
                            return newMappings;
                          });
                        } else {
                          setFieldMappings(prev => ({
                            ...prev,
                            [csField]: value
                          }));
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select CalAIM field..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no-mapping">-- No Mapping --</SelectItem>
                        {caspioMembersFieldNames.map(fieldName => (
                          <SelectItem key={fieldName} value={fieldName}>
                            {fieldName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldMappings[csField] && (
                      <div className="text-xs text-green-600 font-mono">
                        ✓ Mapped to: {fieldMappings[csField]}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Export Mappings */}
            <div className="p-4 bg-gray-50 border rounded-lg">
              <h4 className="font-medium mb-2">Export Field Mappings</h4>
              <div className="flex gap-2">
                <Button 
                  variant="outline"
                  onClick={() => {
                    const mappingJson = JSON.stringify(fieldMappings, null, 2);
                    navigator.clipboard.writeText(mappingJson);
                    toast({
                      title: "Mappings Copied",
                      description: "Field mappings copied to clipboard as JSON",
                    });
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy as JSON
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    const mappingCode = Object.entries(fieldMappings)
                      .map(([cs, caspio]) => `  ${caspio}: formData.${cs},`)
                      .join('\n');
                    navigator.clipboard.writeText(`const memberData = {\n${mappingCode}\n};`);
                    toast({
                      title: "Code Copied",
                      description: "Field mappings copied as JavaScript object",
                    });
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy as Code
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}