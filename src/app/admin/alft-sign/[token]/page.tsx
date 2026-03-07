import { AlftSignatureClient } from '@/components/alft/AlftSignatureClient';

export const dynamic = 'force-dynamic';

export default async function AdminAlftSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AlftSignatureClient token={token} />;
}

