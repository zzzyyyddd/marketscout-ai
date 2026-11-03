import type { CompetitorPost, CompetitorProfile } from './types';

type JsonObject = Record<string, unknown>;

function obj(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function count(value: unknown): number {
  return num(obj(value).count);
}

export function normalizeInstagram(raw: unknown): CompetitorProfile {
  const root = obj(raw);
  const output = obj(root.output ?? root);
  const media = obj(output.edge_owner_to_timeline_media);
  const edges = Array.isArray(media.edges) ? media.edges : [];

  const posts: CompetitorPost[] = edges.map((edge) => {
    const node = obj(obj(edge).node);
    const captionEdges = obj(node.edge_media_to_caption).edges;
    const captions = Array.isArray(captionEdges) ? captionEdges : [];
    const caption = captions
      .map((item) => str(obj(obj(item).node).text))
      .filter(Boolean)
      .join('\n');
    const shortcode = str(node.shortcode);

    return {
      shortcode,
      caption,
      timestamp: num(node.taken_at_timestamp),
      likes: count(node.edge_media_preview_like),
      comments: count(node.edge_media_to_comment),
      views: typeof node.video_view_count === 'number'
        ? node.video_view_count : null,
      isVideo: node.is_video === true,
      url: shortcode
        ? `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/`
        : '',
    };
  }).filter((post) => post.shortcode);

  return {
    username: str(output.username),
    name: str(output.full_name),
    biography: str(output.biography),
    followers: count(output.edge_followed_by),
    following: count(output.edge_follow),
    totalPosts: count(media),
    isBusiness: output.is_business_account === true,
    posts,
  };
}

export function analyzeCompetitor(profile: CompetitorProfile) {
  const posts = [...profile.posts].sort(
    (a, b) => (b.likes + b.comments) - (a.likes + a.comments)
  );

  const totalEngagement = posts.reduce(
    (sum, post) => sum + post.likes + post.comments, 0
  );
  const avgEngagement = posts.length
    ? totalEngagement / posts.length : 0;
  const engagementRate = profile.followers > 0
    ? (avgEngagement / profile.followers) * 100
    : null;

  return {
    ...profile,
    sampledPosts: posts.length,
    avgEngagement: Math.round(avgEngagement),
    engagementRate,
    topPosts: posts.slice(0, 5),
    videoPosts: posts.filter((post) => post.isVideo).length,
    imagePosts: posts.filter((post) => !post.isVideo).length,
  };
}
