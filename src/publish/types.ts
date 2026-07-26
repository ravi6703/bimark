/** Per-brand publish credential override (multi-brand support follow-up) —
 * lets each brand post through its own connected social accounts instead of
 * one shared set. Undefined/absent means "use the shared/global config." */
export interface PublishCredentials {
  apiKeyOverride?: string;
  profileKey?: string;
}

export interface PublishRequest extends PublishCredentials {
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
  fetchMetrics(externalId: string, creds?: PublishCredentials): Promise<PostMetrics | null>;
}
