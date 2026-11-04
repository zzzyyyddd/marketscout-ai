import {
  analyzeCompetitor,
  normalizeInstagram,
} from './instagram';
import { isCompetitorReport } from './report';
import { validateInstagramUsername } from './payment-policy';

export function validateScanReport(
  raw: unknown,
  requestedUsername: string
) {
  const requested = validateInstagramUsername(
    requestedUsername
  ).toLowerCase();

  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw)
  ) {
    throw new Error('Invalid gateway response');
  }

  const root = raw as Record<string, unknown>;
  const output = root.output ?? root;

  if (
    !output ||
    typeof output !== 'object' ||
    Array.isArray(output)
  ) {
    throw new Error('Invalid Instagram profile structure');
  }

  const data = output as Record<string, unknown>;

  const hasCount = (value: unknown): boolean => {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return false;
    }

    const count = (value as Record<string, unknown>).count;

    return (
      typeof count === 'number' &&
      Number.isSafeInteger(count) &&
      count >= 0
    );
  };

  const media = data.edge_owner_to_timeline_media;

  if (
    typeof data.username !== 'string' ||
    !hasCount(data.edge_followed_by) ||
    !hasCount(data.edge_follow) ||
    !hasCount(media) ||
    !Array.isArray(
      (media as Record<string, unknown>).edges
    )
  ) {
    throw new Error('Incomplete Instagram profile data');
  }

  const validNonNegativeInteger = (value: unknown): boolean =>
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0;

  const edges = (media as {
    edges: unknown[];
  }).edges;

  for (const edge of edges) {
    if (
      !edge ||
      typeof edge !== 'object' ||
      Array.isArray(edge)
    ) {
      throw new Error('Invalid Instagram post edge');
    }

    const node = (edge as Record<string, unknown>).node;

    if (
      !node ||
      typeof node !== 'object' ||
      Array.isArray(node)
    ) {
      throw new Error('Invalid Instagram post node');
    }

    const post = node as Record<string, unknown>;

    if (
      typeof post.shortcode !== 'string' ||
      !/^[A-Za-z0-9_-]+$/.test(post.shortcode) ||
      !validNonNegativeInteger(post.taken_at_timestamp) ||
      !hasCount(post.edge_media_preview_like) ||
      !hasCount(post.edge_media_to_comment)
    ) {
      throw new Error('Invalid Instagram post data');
    }

    if (
      post.video_view_count !== undefined &&
      post.video_view_count !== null &&
      !validNonNegativeInteger(post.video_view_count)
    ) {
      throw new Error('Invalid Instagram video views');
    }
  }

  const profile = normalizeInstagram(raw);

  if (
    !profile.username ||
    profile.username.toLowerCase() !== requested
  ) {
    throw new Error('Gateway returned a different account');
  }

  const report = analyzeCompetitor(profile);

  if (!isCompetitorReport(report)) {
    throw new Error('Invalid competitor report');
  }

  return report;
}
