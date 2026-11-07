'use client';

import { useMemo, useState } from 'react';
import type { CompetitorPost } from '@/lib/types';
import { ExternalLink, Filter, TrendingUp } from 'lucide-react';

type FilterMode = 'all' | 'video' | 'nonvideo';
type SortMode = 'interactions' | 'likes' | 'comments';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US').format(n);

const compact = (n: number) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);

export default function IntelligenceExplorer({
  posts,
  historical = true,
}: {
  posts: CompetitorPost[];
  historical?: boolean;
}) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [sort, setSort] = useState<SortMode>('interactions');

  const filtered = useMemo(() => {
    const selected = posts.filter((post) => {
      if (filter === 'video') return post.isVideo;
      if (filter === 'nonvideo') return !post.isVideo;
      return true;
    });

    return selected.sort((a, b) => {
      if (sort === 'likes') return b.likes - a.likes;
      if (sort === 'comments') return b.comments - a.comments;
      return (b.likes + b.comments) - (a.likes + a.comments);
    });
  }, [posts, filter, sort]);

  const average = filtered.length
    ? Math.round(
        filtered.reduce(
          (sum, p) => sum + p.likes + p.comments,
          0
        ) / filtered.length
      )
    : 0;

  const maximum = Math.max(
    1,
    ...filtered.map((p) =>
      sort === 'likes'
        ? p.likes
        : sort === 'comments'
          ? p.comments
          : p.likes + p.comments
    )
  );

  const top = filtered[0];

  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-emerald-400">
            <Filter size={18} />
            <span className="text-xs font-semibold uppercase tracking-widest">
              Interactive Intelligence
            </span>
          </div>
          <h2 className="text-2xl font-bold">
            Content Performance Explorer
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {historical
              ? 'Explore the historical x402 dataset. Filters and rankings are calculated locally; no new data is purchased.'
              : 'Explore the saved account report. Filters and rankings are calculated locally; no new data is purchased.'}
          </p>
        </div>
        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
          {historical ? 'Historical snapshot · Not live' : 'Cached report · Not a live scan'}
        </span>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <div className="flex flex-wrap gap-2">
          {([
            ['all', 'All posts'],
            ['video', 'Videos'],
            ['nonvideo', 'Non-video'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`rounded-lg border px-4 py-2 text-sm transition ${
                filter === value
                  ? 'border-emerald-400 bg-emerald-400/15 text-emerald-300'
                  : 'border-white/15 text-slate-300 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          aria-label="Sort posts by"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded-lg border border-white/15 bg-slate-900 px-4 py-2 text-sm text-white"
        >
          <option value="interactions">Most interactions</option>
          <option value="likes">Most likes</option>
          <option value="comments">Most comments</option>
        </select>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-900/70 p-4">
          <p className="text-xs text-slate-400">Matching posts</p>
          <p className="mt-2 text-2xl font-bold">{filtered.length}</p>
        </div>
        <div className="rounded-xl bg-slate-900/70 p-4">
          <p className="text-xs text-slate-400">Average interactions</p>
          <p className="mt-2 text-2xl font-bold">{filtered.length ? compact(average) : 'Unavailable'}</p>
        </div>
        <div className="rounded-xl bg-slate-900/70 p-4">
          <p className="text-xs text-slate-400">Top post</p>
          <p className="mt-2 truncate text-lg font-bold">
            {top ? top.shortcode : 'No data'}
          </p>
        </div>
      </div>

      <div className="mt-7 space-y-5">
        {filtered.map((post, index) => {
          const value =
            sort === 'likes'
              ? post.likes
              : sort === 'comments'
                ? post.comments
                : post.likes + post.comments;

          return (
            <div
              key={post.shortcode}
              className="rounded-xl border border-white/10 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500">
                    #{index + 1}
                  </span>
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium hover:text-emerald-400"
                  >
                    {post.shortcode}
                    <ExternalLink size={13} />
                  </a>
                  <span className="rounded-md bg-white/10 px-2 py-1 text-xs text-slate-300">
                    {post.isVideo ? 'Video' : 'Non-video'}
                  </span>
                </div>
                <span className="font-semibold">
                  {compact(value)}
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-400"
                  style={{ width: `${(value / maximum) * 100}%` }}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                <span>{fmt(post.likes)} likes</span>
                <span>{fmt(post.comments)} comments</span>
                <span>
                  {post.views === null
                    ? 'Views unavailable'
                    : `${fmt(post.views)} views`}
                </span>
              </div>

              {post.caption && (
                <p className="mt-3 line-clamp-2 text-sm text-slate-400">
                  {post.caption}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-start gap-2 border-t border-white/10 pt-4 text-xs text-slate-400">
        <TrendingUp size={15} className="mt-0.5 shrink-0" />
        <p>
          Interactions = likes + comments. These are descriptive
          statistics from a limited sample, not predictions
          or live competitor monitoring.
        </p>
      </div>
    </section>
  );
}
