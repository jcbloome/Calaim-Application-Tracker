'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  ChevronDown,
  ChevronRight,
  Upload,
  Loader2,
  Trash2,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  extractMifGeneratedDateKey,
  formatMifGeneratedDateLabel,
  type IlsMifUploadedFileRecord,
  type IlsMifMemberIdentitySummary,
} from '@/lib/ils-mif-parse';
import React, { type Dispatch, type SetStateAction } from 'react';

export interface UploadedFilesCardProps {
  setUploadedFilesSectionExpanded: Dispatch<SetStateAction<boolean>>;
  uploadedFilesSectionExpanded: boolean;
  uploadedFiles: IlsMifUploadedFileRecord[];
  masterListCreatedAtIso: string;
  deletingUploadId: string;
  clearAllUploadedFileRecords: () => Promise<void>;
  toggleMifDateSort: () => void;
  mifDateSortDesc: boolean;
  sortedUploadedFiles: IlsMifUploadedFileRecord[];
  expandedUploadId: string;
  uploadMembersById: Record<string, IlsMifMemberIdentitySummary[]>;
  toggleUploadedMifMembers: (uploadId: string) => Promise<void>;
  loadingUploadMembersId: string;
  deleteUploadedFileRecord: (file: IlsMifUploadedFileRecord) => Promise<void>;
}

export function UploadedFilesCard({
  setUploadedFilesSectionExpanded,
  uploadedFilesSectionExpanded,
  uploadedFiles,
  masterListCreatedAtIso,
  deletingUploadId,
  clearAllUploadedFileRecords,
  toggleMifDateSort,
  mifDateSortDesc,
  sortedUploadedFiles,
  expandedUploadId,
  uploadMembersById,
  toggleUploadedMifMembers,
  loadingUploadMembersId,
  deleteUploadedFileRecord,
}: UploadedFilesCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setUploadedFilesSectionExpanded((prev) => !prev)}
          aria-expanded={uploadedFilesSectionExpanded}
        >
          <CardTitle className="flex items-center gap-2 text-base">
            {uploadedFilesSectionExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <Upload className="h-4 w-4 shrink-0" />
            Uploaded MIF Files (viewable)
            <span className="text-sm font-normal text-muted-foreground">
              · {uploadedFiles.length} file{uploadedFiles.length === 1 ? '' : 's'}
            </span>
          </CardTitle>
          <span className="shrink-0 text-xs font-medium text-blue-700">
            {uploadedFilesSectionExpanded ? 'Hide' : 'Show'}
          </span>
        </button>
        {uploadedFilesSectionExpanded ? (
          <CardDescription>
            Each uploaded MIF is saved with its members. Expand a row to see names and MRNs. Same-date uploads report
            how many members are new before merge.
            {masterListCreatedAtIso
              ? ` Master list last updated ${new Date(masterListCreatedAtIso).toLocaleString()}.`
              : ''}
          </CardDescription>
        ) : null}
      </CardHeader>
      {uploadedFilesSectionExpanded ? (
      <CardContent className="space-y-2">
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-rose-700"
            disabled={!uploadedFiles.length || deletingUploadId === '__all__'}
            onClick={() => void clearAllUploadedFileRecords()}
          >
            {deletingUploadId === '__all__' ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-3.5 w-3.5" />
            )}
            Clear All Upload History
          </Button>
        </div>
        <div className="max-h-[420px] overflow-auto rounded border">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold hover:text-blue-700"
                    onClick={() => toggleMifDateSort()}
                    title="Toggle MIF date sort"
                  >
                    MIF date
                    {mifDateSortDesc ? (
                      <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUpNarrowWide className="h-3.5 w-3.5" />
                    )}
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {mifDateSortDesc ? 'newest' : 'oldest'}
                    </span>
                  </button>
                </th>
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Uploaded</th>
                <th className="px-3 py-2">Members</th>
                <th className="px-3 py-2">Linked run</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUploadedFiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No uploaded MIF files saved yet.
                  </td>
                </tr>
              ) : (
                sortedUploadedFiles.map((file) => {
                  const dateKey = file.mifDateKey || extractMifGeneratedDateKey(file.fileName);
                  const isExpanded = expandedUploadId === file.id;
                  const members = uploadMembersById[file.id] || [];
                  return (
                    <React.Fragment key={file.id}>
                      <tr className="border-t">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {file.mifDateLabel || formatMifGeneratedDateLabel(dateKey) || dateKey || '—'}
                        </td>
                        <td className="px-3 py-2 font-medium">{file.fileName}</td>
                        <td className="px-3 py-2">
                          {file.uploadedAtIso ? new Date(file.uploadedAtIso).toLocaleString() : '—'}
                        </td>
                        <td className="px-3 py-2">{file.rowCount || 0}</td>
                        <td className="px-3 py-2 text-muted-foreground">{file.runId || 'Not linked yet'}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              onClick={() => void toggleUploadedMifMembers(file.id)}
                            >
                              {loadingUploadMembersId === file.id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Eye className="mr-1 h-3.5 w-3.5" />
                              )}
                              {isExpanded ? 'Hide members' : 'View members'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-rose-700"
                              disabled={deletingUploadId === file.id}
                              onClick={() => void deleteUploadedFileRecord(file)}
                            >
                              {deletingUploadId === file.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="border-t bg-slate-50">
                          <td colSpan={6} className="px-3 py-2">
                            {loadingUploadMembersId === file.id ? (
                              <div className="text-xs text-muted-foreground">Loading members…</div>
                            ) : members.length === 0 ? (
                              <div className="text-xs text-muted-foreground">
                                No saved members for this file (older uploads may only have history metadata).
                              </div>
                            ) : (
                              <div className="max-h-[220px] overflow-auto rounded border bg-white">
                                <table className="min-w-full text-xs">
                                  <thead className="sticky top-0 bg-slate-100 text-left">
                                    <tr>
                                      <th className="px-2 py-1">Last</th>
                                      <th className="px-2 py-1">First</th>
                                      <th className="px-2 py-1">MRN</th>
                                      <th className="px-2 py-1">CIN</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {members.map((member, index) => (
                                      <tr
                                        key={`${file.id}-${member.memberMrn || member.memberMediCalNum || index}`}
                                        className="border-t"
                                      >
                                        <td className="px-2 py-1">{member.memberLastName}</td>
                                        <td className="px-2 py-1">{member.memberFirstName}</td>
                                        <td className="px-2 py-1">{member.memberMrn || '—'}</td>
                                        <td className="px-2 py-1">{member.memberMediCalNum || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
      ) : null}
    </Card>
  );
}
