import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined>;

function toQueryString(searchParams: SearchParams) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null && String(item).trim()) params.append(key, String(item));
      }
    } else if (value != null && String(value).trim()) {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Legacy alias — SW roster tracking lives on SW ISP Assignments. */
export default async function IspSwRosterRedirectPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams> | SearchParams;
}) {
  const resolved = typeof (searchParams as any)?.then === 'function' ? await searchParams : searchParams;
  redirect(`/admin/tools/isp-assignment${toQueryString(resolved || {})}`);
}
