import { NextResponse } from 'next/server';
import snapshot from '../../../../data/instagram-snapshot.json';
import {
  normalizeInstagram,
  analyzeCompetitor
} from '@/lib/instagram';
import { isAuthorized } from '@/lib/auth';

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const report = analyzeCompetitor(
    normalizeInstagram(snapshot)
  );

  return NextResponse.json({
    mode: 'snapshot',
    network: 'celo-sepolia',
    source: 'buy x402 / instagram.profile',
    report,
  });
}
