"use client";

import {
  feedAge,
  feedIsLive,
} from "@/lib/signal-feed-core";

import styles from "./signal-feed-strip.module.css";

/**
 * One thin row of feed chips — YouTube · Instagram · TikTok · WHOOP — each
 * with its mark, how long ago it last synced, and a LIVE pill while the feed
 * is inside its daily cadence. The whole pipeline updates at 05:00 UTC with
 * automatic retries at 06/07/10/11/16/17 UTC, so a healthy feed is never
 * older than ~26 hours; beyond that the chip turns amber (stale) and names
 * its age, and a feed with no sync at all says so.
 *
 * Times come from the same stored sync stamps the cards use — nothing here
 * is invented, and a dead feed is shown honestly rather than hidden.
 */

export type SignalFeedId = "youtube" | "instagram" | "tiktok" | "whoop";

export interface SignalFeed {
  id: SignalFeedId;
  /** ISO timestamp of the last successful sync; null = never synced. */
  syncedAt: string | null;
  /**
   * Per-person segments (WHOOP can carry one band per person): each renders
   * as its own initial + age + live dot inside the same chip, so two states
   * fit without a second chip's worth of text.
   */
  split?: ReadonlyArray<{ key: string; syncedAt: string | null }>;
}

const FEED_LABELS: Record<SignalFeedId, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  whoop: "WHOOP",
};

function FeedMark({ id }: { id: SignalFeedId }) {
  // Simplified single-colour marks drawn in-house; each sits in a 20px tile
  // and inherits the chip's ink so the strip stays one quiet material.
  if (id === "youtube") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="1.5" y="4.5" width="17" height="11" rx="3" className={styles.markFill} />
        <path d="M8.4 7.6v4.8l4.4-2.4z" className={styles.markCut} />
      </svg>
    );
  }
  if (id === "instagram") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="2.5" y="2.5" width="15" height="15" rx="4.4" className={styles.markStroke} />
        <circle cx="10" cy="10" r="3.6" className={styles.markStroke} />
        <circle cx="14.4" cy="5.6" r="1.1" className={styles.markFill} />
      </svg>
    );
  }
  if (id === "tiktok") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M12.1 2.4h2.5c.2 1.9 1.3 3 3.1 3.3v2.6c-1.2 0-2.3-.4-3.2-1v5.6c0 3-2 5-4.9 5-2.8 0-4.8-2-4.8-4.7 0-2.6 2-4.6 4.7-4.6.3 0 .5 0 .8.1v2.7a2 2 0 0 0-.8-.2c-1.2 0-2 .9-2 2 0 1.2.8 2 2 2 1.3 0 2.1-.9 2.1-2.3z"
          className={styles.markFill}
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7.6" className={styles.markStroke} />
      <path
        d="M5.9 7.2l1.5 5.6 1.7-4.2 1.7 4.2 1.5-5.6"
        className={styles.markStrokeThin}
        transform="translate(0.9 0)"
      />
    </svg>
  );
}

export function SignalFeedStrip({
  feeds,
  referenceTimeIso,
}: {
  feeds: readonly SignalFeed[];
  referenceTimeIso: string;
}) {
  if (!feeds.length) return null;
  const ages = feeds.map((feed) => feedAge(feed.syncedAt, referenceTimeIso));
  const staleCount = ages.filter((age) => !feedIsLive(age)).length;

  return (
    <div
      className={styles.strip}
      role="list"
      aria-label={`Signal feeds — daily sync 05:00 UTC · ${feeds.length - staleCount} of ${feeds.length} live`}
    >
      {feeds.map((feed, index) => {
        const age = ages[index];
        const live = feedIsLive(age);
        if (feed.split?.length) {
          const parts = feed.split.map((part) => ({
            ...part,
            age: feedAge(part.syncedAt, referenceTimeIso),
          }));
          return (
            <span
              key={feed.id}
              className={styles.chip}
              data-feed={feed.id}
              data-live={parts.some((part) => feedIsLive(part.age)) ? "true" : "false"}
              role="listitem"
              title={`${FEED_LABELS[feed.id]} · ${parts
                .map((part) => `${part.key}: ${part.age.text}`)
                .join(" · ")} · daily sync 05:00 UTC`}
            >
              <FeedMark id={feed.id} />
              <span className={styles.chipName}>{FEED_LABELS[feed.id]}</span>
              {parts.map((part) => (
                <span
                  key={part.key}
                  className={styles.chipPerson}
                  data-live={feedIsLive(part.age) ? "true" : "false"}
                >
                  <i aria-hidden="true" />
                  <b>{part.key}</b>
                  <span>{part.age.text}</span>
                </span>
              ))}
            </span>
          );
        }
        return (
          <span
            key={feed.id}
            className={styles.chip}
            data-feed={feed.id}
            data-live={live ? "true" : "false"}
            role="listitem"
            title={`${FEED_LABELS[feed.id]} · last synced ${age.text} · daily sync 05:00 UTC`}
          >
            <FeedMark id={feed.id} />
            <span className={styles.chipName}>{FEED_LABELS[feed.id]}</span>
            <span className={styles.chipAge}>{age.text}</span>
            <span className={styles.chipState}>
              <i aria-hidden="true" />
              {live ? "LIVE" : "STALE"}
            </span>
          </span>
        );
      })}
    </div>
  );
}
