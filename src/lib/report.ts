import { analyzeCompetitor } from './instagram';

export type CompetitorReport = ReturnType<
  typeof analyzeCompetitor
> & { generatedAt?: string };

export type ReportSource = {
  mode: string;
  network?: string;
};

export type DisplayReport = {
  report: CompetitorReport;
  source: ReportSource;
};

export function isCompetitorReport(
  value: unknown
): value is CompetitorReport {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) return false;

  const r = value as Record<string, unknown>;
  // Old historical reports have no generation timestamp. Never invent one.
  if (r.generatedAt !== undefined && (
    typeof r.generatedAt !== 'string' || !Number.isFinite(Date.parse(r.generatedAt)) ||
    new Date(r.generatedAt).toISOString() !== r.generatedAt
  )) return false;

  const numeric = [
    'followers',
    'following',
    'totalPosts',
    'sampledPosts',
    'avgEngagement',
    'videoPosts',
    'imagePosts',
  ];

  if (
    typeof r.username !== 'string' ||
    !r.username ||
    typeof r.name !== 'string' ||
    typeof r.biography !== 'string' ||
    typeof r.isBusiness !== 'boolean' ||
    !numeric.every(
      key =>
        typeof r[key] === 'number' &&
        Number.isFinite(r[key])
    ) ||
    !Array.isArray(r.posts) ||
    !Array.isArray(r.topPosts)
  ) return false;

  if (
    r.engagementRate !== null &&
    (
      typeof r.engagementRate !== 'number' ||
      !Number.isFinite(r.engagementRate)
    )
  ) return false;

  const validPost = (value: unknown) => {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) return false;

    const p = value as Record<string, unknown>;

    return (
      typeof p.shortcode === 'string' &&
      typeof p.caption === 'string' &&
      typeof p.url === 'string' &&
      typeof p.isVideo === 'boolean' &&
      ['timestamp', 'likes', 'comments'].every(
        key =>
          typeof p[key] === 'number' &&
          Number.isFinite(p[key])
      ) &&
      (
        p.views === null ||
        (
          typeof p.views === 'number' &&
          Number.isFinite(p.views)
        )
      )
    );
  };

  return (
    r.posts.every(validPost) &&
    r.topPosts.every(validPost)
  );
}
