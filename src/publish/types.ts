export interface PublishRequest {
  platform: string; // 'linkedin'
  text: string;
  mediaUrls?: string[];
  scheduledAt?: Date | null; // null/undefined = publish now
}

export interface PublishResult {
  externalId: string | null;
  url: string | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
}

export interface PostMetrics {
  impressions: number;
  engagements: number;
  clicks: number;
  saves: number;
  shares: number;
  comments: number;
}

/**
 * Publishing adapter (§8 "buy, don't build"). One interface over Buffer /
 * Ayrshare so the workflows never touch a platform API directly.
 */
export interface Publisher {
  readonly name: string;
  publish(req: PublishRequest): Promise<PublishResult>;
  fetchMetrics(externalId: string): Promise<PostMetrics | null>;
}
