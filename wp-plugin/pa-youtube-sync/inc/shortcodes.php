<?php
if ( ! defined('ABSPATH') ) exit;

/**
 * [pa_live_stream] — نمایش لایو و لایوهای برنامه‌ریزی‌شده
 *
 * Attributes:
 *   channel_id=""   — نمایش فقط یک کانال خاص
 *   show_upcoming="1" — نمایش لایوهای آینده (پیش‌فرض: ۱)
 */
add_shortcode( 'pa_live_stream', 'pays_live_shortcode' );

function pays_live_shortcode( $atts ): string {
    $atts = shortcode_atts([
        'channel_id'    => '',
        'show_upcoming' => '1',
    ], $atts);

    $live_data = get_transient('pays_live_streams');

    // Cache miss — fetch fresh
    if ( $live_data === false ) {
        pays_refresh_live_cache();
        $live_data = get_transient('pays_live_streams') ?: [];
    }

    if ( $atts['channel_id'] ) {
        $live_data = isset($live_data[ $atts['channel_id'] ])
            ? [ $atts['channel_id'] => $live_data[ $atts['channel_id'] ] ]
            : [];
    }

    if ( ! $live_data ) return '';

    ob_start();
    foreach ( $live_data as $ch_id => $data ) {
        // Active live streams
        foreach ( $data['live'] as $item ) {
            $yt_id = $item['id']['videoId'] ?? '';
            $title = esc_html($item['snippet']['title'] ?? '');
            if ( ! $yt_id ) continue;
            ?>
            <div class="pays-live-wrap">
                <div class="pays-live-badge">🔴 پخش زنده</div>
                <div class="pays-embed-wrap">
                    <iframe src="https://www.youtube.com/embed/<?=esc_attr($yt_id)?>?autoplay=0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen loading="lazy" title="<?=$title?>"></iframe>
                </div>
                <p class="pays-live-title"><?=$title?></p>
            </div>
            <?php
        }

        // Upcoming
        if ( $atts['show_upcoming'] !== '0' ) {
            foreach ( $data['upcoming'] as $item ) {
                $yt_id      = $item['id']['videoId'] ?? '';
                $title      = esc_html($item['snippet']['title'] ?? '');
                $sched_time = $item['snippet']['scheduledStartTime'] ?? '';
                if ( ! $yt_id ) continue;
                $thumb = $item['snippet']['thumbnails']['high']['url']
                    ?? "https://img.youtube.com/vi/{$yt_id}/hqdefault.jpg";
                ?>
                <div class="pays-upcoming-wrap">
                    <div class="pays-upcoming-badge">📅 لایو برنامه‌ریزی‌شده</div>
                    <img src="<?=esc_url($thumb)?>" alt="<?=$title?>" class="pays-upcoming-thumb" loading="lazy">
                    <p class="pays-upcoming-title"><?=$title?></p>
                    <?php if ( $sched_time ): ?>
                    <p class="pays-upcoming-time"
                       data-ts="<?=esc_attr(strtotime($sched_time))?>">
                        <?=esc_html(date_i18n('j F Y — H:i', strtotime($sched_time)))?>
                    </p>
                    <?php endif; ?>
                    <a href="https://www.youtube.com/watch?v=<?=esc_attr($yt_id)?>"
                       class="pays-upcoming-btn" target="_blank" rel="noopener">
                        یادآوری در یوتیوب
                    </a>
                </div>
                <?php
            }
        }
    }
    pays_live_styles();
    return ob_get_clean();
}

function pays_live_styles(): void {
    static $printed = false;
    if ( $printed ) return;
    $printed = true;
    ?>
    <style>
    .pays-live-wrap, .pays-upcoming-wrap {
        max-width: 800px; margin: 1.5em auto;
        border-radius: 12px; overflow: hidden;
        box-shadow: 0 4px 20px rgba(0,0,0,.15);
        background: #0f0f0f; color: #fff;
    }
    .pays-live-badge {
        background: #ff0000; color: #fff;
        font-weight: 700; font-size: 13px;
        padding: 6px 14px; display: inline-block;
    }
    .pays-upcoming-badge {
        background: #1a73e8; color: #fff;
        font-weight: 700; font-size: 13px;
        padding: 6px 14px; display: inline-block;
    }
    .pays-embed-wrap {
        position: relative; padding-bottom: 56.25%; height: 0;
    }
    .pays-embed-wrap iframe {
        position: absolute; top: 0; left: 0;
        width: 100%; height: 100%; border: 0;
    }
    .pays-live-title, .pays-upcoming-title {
        padding: 10px 16px; margin: 0;
        font-size: 15px; font-weight: 600;
    }
    .pays-upcoming-thumb {
        width: 100%; display: block;
        max-height: 350px; object-fit: cover;
    }
    .pays-upcoming-time { padding: 4px 16px; margin: 0; font-size: 13px; opacity: .8; }
    .pays-upcoming-btn {
        display: inline-block; margin: 10px 16px 14px;
        background: #ff0000; color: #fff;
        padding: 8px 20px; border-radius: 6px;
        text-decoration: none; font-size: 13px; font-weight: 600;
    }
    </style>
    <?php
}
