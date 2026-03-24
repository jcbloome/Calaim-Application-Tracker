import { RoomBoardAgreementSignatureClient } from '@/components/agreements/RoomBoardAgreementSignatureClient';

export const dynamic = 'force-dynamic';

export default async function AgreementSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <RoomBoardAgreementSignatureClient token={token} />;
}
