import IntelligenceExplorer from './intelligence-explorer';
import UsernameSearch from './username-search';
import snapshot from '../../data/instagram-snapshot.json';
import { analyzeCompetitor, normalizeInstagram } from '@/lib/instagram';
import { BarChart3, ExternalLink, ShieldCheck, TrendingUp, Users, Video } from 'lucide-react';

const report = analyzeCompetitor(normalizeInstagram(snapshot));
const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);
const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export default function Home() {
  const metrics = [
    { label: 'Followers', value: compact(report.followers), icon: Users },
    { label: 'Sampled posts', value: fmt(report.sampledPosts), icon: BarChart3 },
    { label: 'Average interactions', value: compact(report.avgEngagement), icon: TrendingUp },
    { label: 'Video posts', value: fmt(report.videoPosts), icon: Video },
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-400/15 p-3 text-emerald-400"><BarChart3 /></div>
            <div><h1 className="text-2xl font-bold">MarketScout <span className="text-emerald-400">AI</span></h1><p className="text-sm text-slate-400">Autonomous Market Intelligence</p></div>
          </div>
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-300">Historical x402 Sandbox Snapshot</span>
        </header>

        <section className="py-12">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-400">Competitor Intelligence</p>
          <h2 className="max-w-3xl text-4xl font-bold tracking-tight md:text-5xl">Understand competitors. <span className="text-slate-400">Make smarter moves.</span></h2>
          <p className="mt-5 max-w-2xl text-slate-400">Explore real Instagram data previously purchased through an x402 payment on Celo Sepolia. This is a saved snapshot, not a live scan.</p>
        </section>

        <UsernameSearch cachedUsername={report.username} />

        <div id="competitor-report">
        <section className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs uppercase tracking-widest text-slate-400">Analyzed account</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <div><h3 className="text-2xl font-semibold">@{report.username}</h3><p className="text-slate-400">{report.name}</p></div>
            <a href={`https://www.instagram.com/${encodeURIComponent(report.username)}/`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/10">Instagram profile <ExternalLink size={15}/></a>
          </div>
        </section>

        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="mb-4 flex items-center justify-between text-slate-400"><span className="text-sm">{label}</span><Icon size={18}/></div>
              <p className="text-3xl font-bold">{value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 lg:col-span-2">
            <h3 className="text-xl font-semibold">Top-performing posts</h3>
            <p className="mt-1 text-sm text-slate-400">Ranked by likes + comments in the available sample</p>
            <div className="mt-7 space-y-6">
              {report.topPosts.map((post, i) => {
                const engagement = post.likes + post.comments;
                const maximum = Math.max(1, ...report.topPosts.map(p => p.likes + p.comments));
                return <div key={post.shortcode}>
                  <div className="mb-2 flex justify-between gap-3 text-sm">
                    <a href={post.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-emerald-400">#{i + 1} {post.shortcode} <ExternalLink size={13}/></a>
                    <span className="font-semibold">{compact(engagement)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${engagement / maximum * 100}%` }}/></div>
                  <p className="mt-2 text-xs text-slate-400">{fmt(post.likes)} likes · {fmt(post.comments)} comments</p>
                </div>;
              })}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h3 className="text-xl font-semibold">Content mix</h3>
              <div className="mt-6 flex h-3 overflow-hidden rounded-full bg-slate-800">
                <div className="bg-emerald-400" style={{ width: `${report.sampledPosts ? report.videoPosts / report.sampledPosts * 100 : 0}%` }}/>
                <div className="bg-indigo-400" style={{ width: `${report.sampledPosts ? report.imagePosts / report.sampledPosts * 100 : 0}%` }}/>
              </div>
              <p className="mt-4 text-sm text-slate-300">{report.videoPosts} videos · {report.imagePosts} nonvideo posts</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-6">
              <div className="flex items-center gap-2 text-emerald-400"><ShieldCheck size={20}/><h3 className="font-semibold">x402 Payment Proof</h3></div>
              <p className="mt-3 text-sm text-slate-300">0.005 test USDC · Celo Sepolia · previously confirmed</p>
              <a href="https://celo-sepolia.blockscout.com/tx/0xe02aa5ce58a261683e062d22c62f67c567f0aead9617f073ff8dea73609f7f92" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-400 hover:underline">View transaction <ExternalLink size={14}/></a>
            </div>
          </div>
        </section>
        </div>
        <IntelligenceExplorer posts={report.posts} />
        <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-slate-500">MarketScout AI · Historical sandbox data · Live mainnet integration pending</footer>
      </div>
    </main>
  );
}
