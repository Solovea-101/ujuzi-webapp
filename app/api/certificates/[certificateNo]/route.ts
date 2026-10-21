import type { NextRequest } from 'next/server';
import { requirePartner } from '@/lib/auth/guards';
import { getStore } from '@/lib/db';
import { fail, guarded, json } from '@/lib/http';
import { toCertificateCheck, type CertificateCheck } from '@/lib/mappers';
import { parseCertificateNo } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// Endpoint 3 (S2): GET /api/certificates/{certificateNo}
export async function GET(req: NextRequest, { params }: { params: Promise<{ certificateNo: string }> }) {
  return guarded(async () => {
    const guard = requirePartner(req);
    if (!guard.ok) return guard.response;
    const parsed = parseCertificateNo((await params).certificateNo);
    if (!parsed.ok) return fail(400, parsed.message);
    const row = await (await getStore()).getCertificate(parsed.value);
    if (!row) return fail(404, `Certificate ${parsed.value} not found`);
    return json<CertificateCheck>(200, toCertificateCheck(row));
  });
}
