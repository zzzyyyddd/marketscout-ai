import { NextRequest, NextResponse } from 'next/server';
import snapshot from '../../../../data/instagram-snapshot.json';
import { analyzeCompetitor, normalizeInstagram } from '@/lib/instagram';

const cachedReport = analyzeCompetitor(normalizeInstagram(snapshot));

export async function GET(request: NextRequest) {
  const username = (request.nextUrl.searchParams.get('username') ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();

  if (
    !/^[a-z0-9._]{1,30}$/.test(username) ||
    username.startsWith('.') ||
    username.endsWith('.') ||
    username.includes('..')
  ) {
    return NextResponse.json(
      { error: 'Invalid Instagram username' },
      { status: 400 }
    );
  }

  if (username !== cachedReport.username.toLowerCase()) {
    return NextResponse.json(
      {
        status: 'not_cached',
        username,
        liveAvailable: false,
        paymentRequired: false,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  return NextResponse.json(
    {
      status: 'cached',
      username,
      mode: 'historical_snapshot',
      network: 'celo-sepolia',
      report: cachedReport,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300',
      },
    }
  );
}
