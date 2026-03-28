# Service Request Form Extraction Example

## Source PDF
**File**: `02.05.26 JIM KOVACICH - ToCF Connections.pdf`  
**Pages**: 2 (only page 1 contains data, page 2 is HIPAA notice)

## Extracted Data (Page 1 Only)

### Member Information Section

| Field | Value |
|-------|-------|
| Member Name | JIM KOVACICH |
| MRN | 000014539648 |
| CIN | 91552389G |
| Plan ID | 000014539648 |
| DOB | 04/06/1948 |
| Age | 77 |
| Preferred Language | English |
| Member Address | 1007 E. CARSON STREET, APT. 6, LONG BEACH, CA 90807 |
| Member Phone | (562) 432-2700 |
| Cell Phone | 5624322700 |
| Email | jmk720@gmail.com |

### Provider Section

| Field | Value |
|-------|-------|
| Name / Address | CONNECTIONS CARE HOME CONSULTANTS |
| Phone | 8003305993 |
| Provider NPI | 1508537325 |
| Provider Tax ID | 872746305 |

### Authorization Section

| Field | Value |
|-------|-------|
| Authorization # | 7944120251124 |
| Service Type | Transition of Care Facility |
| HCPCS Code | T2038 |
| DX Code | R69 |
| Start Date | 02/05/2026 |
| End Date | 03/16/2026 |
| Total Units | 2 |
| Modifiers | U4 |
| Special Instructions | Member is not interested in services. |

### Care Manager Section

| Field | Value |
|-------|-------|
| Name | PR-CS CONNECTIONS CARE HOME CONSULTANTS |
| Phone | (blank) |

## Mapped Fields for Application

```json
{
  "memberFirstName": "Jim",
  "memberLastName": "Kovacich",
  "memberMrn": "000014539648",
  "memberDob": "04/06/1948",
  "memberCustomaryAddress": "1007 E. CARSON STREET, APT. 6",
  "memberCustomaryCity": "LONG BEACH",
  "memberCustomaryState": "CA",
  "memberCustomaryZip": "90807",
  "memberCustomaryCounty": "",
  "memberPhone": "562-432-2700",
  "contactPhone": "5624322700",
  "contactEmail": "jmk720@gmail.com",
  "Authorization_Number_T038": "7944120251124",
  "Authorization_Start_T2038": "02/05/2026",
  "Authorization_End_T2038": "03/16/2026",
  "Diagnostic_Code": "R69"
}
```

## Notes

- **Page 2 is not needed** - it only contains the HIPAA confidentiality notice
- **County field is empty** - not provided on this form
- **Cell Phone** is formatted as digits only for `contactPhone` field
- **Member Phone** retains formatting with dashes
- All dates are in MM/DD/YYYY format
- This is a **scanned PDF** (no text layer), requiring vision/OCR extraction
