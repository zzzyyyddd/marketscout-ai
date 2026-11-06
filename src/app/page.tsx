import ConnectWallet from './connect-wallet';
import MarketIntelligence from './market-intelligence';
import snapshot from '../../data/instagram-snapshot.json';
import { analyzeCompetitor, normalizeInstagram } from '@/lib/instagram';
import { BarChart3 } from 'lucide-react';

const report = analyzeCompetitor(normalizeInstagram(snapshot));
export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-400/15 p-3 text-emerald-400"><BarChart3 /></div>
            <div><h1 className="text-2xl font-bold">MarketScout <span className="text-emerald-400">AI</span></h1><p className="text-sm text-slate-400">Autonomous Market Intelligence</p></div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <ConnectWallet />
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-300">Saved Reports · Celo x402 Live Scans</span>
          </div>
        </header>

        <section className="py-12">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-400">Competitor Intelligence</p>
          <h2 className="max-w-3xl text-4xl font-bold tracking-tight md:text-5xl">Understand competitors. <span className="text-slate-400">Make smarter moves.</span></h2>
          <p className="mt-5 max-w-2xl text-slate-400">Explore Instagram competitor intelligence. The @instagram demo uses a historical x402 testnet dataset. Request a fresh scan for 0.005 USDC on Celo Mainnet. Live purchases require wallet authorization.</p>
        </section>

        <MarketIntelligence initialReport={report} />
        <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-slate-500">MarketScout AI · Instagram competitor intelligence · Powered by Celo x402</footer>
      </div>
    </main>
  );
}
