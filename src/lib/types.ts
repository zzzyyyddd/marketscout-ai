export type CompetitorPost = {
  shortcode: string;
  caption: string;
  timestamp: number;
  likes: number;
  comments: number;
  views: number | null;
  isVideo: boolean;
  url: string;
};

export type CompetitorProfile = {
  username: string;
  name: string;
  biography: string;
  followers: number;
  following: number;
  totalPosts: number;
  isBusiness: boolean;
  posts: CompetitorPost[];
};
