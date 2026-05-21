import cron from 'node-cron';
import { query } from '../db/pool';
import { createPost } from '../wp/wpProxy';
import { dbLog } from '../monitoring/logger';
import { logger } from '../monitoring/logger';

async function publishScheduledPosts() {
  const due = await query<any>(
    `SELECT * FROM content_staging
     WHERE status = 'scheduled' AND scheduled_at <= NOW()
     LIMIT 20`
  );

  for (const row of due) {
    try {
      const cats = row.categories
        ? (typeof row.categories === 'string' ? JSON.parse(row.categories) : row.categories)
        : [];

      const wpData: Record<string, any> = {
        title:   row.title_fa || row.title_en,
        content: row.content_fa || row.content_en,
        status:  'publish',
      };
      if (cats.length)        wpData.categories     = cats;
      if (row.featured_media) wpData.featured_media = row.featured_media;

      const wpPost = await createPost(wpData);

      await query(
        `UPDATE content_staging
         SET status='published', wp_post_id=?, published_at=NOW(), updated_at=NOW()
         WHERE id=?`,
        [wpPost.id, row.id]
      );

      await dbLog('info', 'scheduler', 'Scheduled post published', {
        contentId: row.id,
        wpPostId: wpPost.id,
        title: row.title_fa || row.title_en,
      });
    } catch (err: any) {
      await dbLog('error', 'scheduler', 'Failed to publish scheduled post', {
        contentId: row.id,
        error: err.message,
      });
    }
  }
}

export function startScheduler() {
  // Check every minute for posts due to publish
  cron.schedule('* * * * *', async () => {
    try {
      await publishScheduledPosts();
    } catch (err: any) {
      logger.error('Scheduler error', { error: err.message });
    }
  });

  logger.info('Scheduler started — checking scheduled posts every minute');
}
