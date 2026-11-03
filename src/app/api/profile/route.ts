import { NextRequest, NextResponse } from 'next/server';
import snapshot from '../../../../data/instagram-snapshot.json';
import {
  analyzeCompetitor,
  normalizeInstagram,
} from '@/lib/instagram';
import { readCachedProfile } from '@/lib/profile-cache';

const historicalReport = analyzeCompetitor(
  normalizeInstagram(snapshot)
);

export async function GET(request: NextRequest) {
  const username = (
    request.nextUrl.searchParams.get('username') ?? ''
  )
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

if (username === historicalReport.username.toLowerCase()) {
    return NextResponse.json(
      {
        status: 'cached',
        username,
        mode: 'historical_snapshot',
        network: 'celo-sepolia',
        report: historicalReport,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const cached = await readCachedProfile(username);

    if (cached) {
      if (
        !cached.report ||
        typeof cached.report !== 'object' ||
        Array.isArray(cached.report) ||
        cached.username !== username ||
        cached.report.username?.toLowerCase() !== username
      ) {
        throw new Error('Invalid cached report');
      }

      return NextResponse.json(
        {
          status: 'cached',
          username,
          mode: cached.source,
          network: cached.network,
          report: cached.report,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      {
        status: 'not_cached',
        username,
        liveAvailable: false,
        paymentRequired: false,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Profile cache temporarily unavailable' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
