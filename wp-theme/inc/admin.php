<?php
/**
 * Admin Panel Customizations
 */

if ( ! defined('ABSPATH') ) exit;

/* ============================================
   FIX ADMIN SIDEBAR OVERLAP (RTL / right-side menu)
   ============================================ */
add_action('admin_head', function() { ?>
<style id="pa-admin-ltr-fix">
/* Force LTR on entire admin — theme RTL must not bleed in */
html, body { direction: ltr !important; }

/* Desktop: sidebar on LEFT */
@media (min-width: 783px) {
    #adminmenuwrap,
    #adminmenuback {
        left:  0    !important;
        right: auto !important;
    }
    #wpcontent, #wpfooter {
        margin-left:  160px !important;
        margin-right: 0     !important;
    }
    body.folded #wpcontent,
    body.folded #wpfooter {
        margin-left:  36px !important;
        margin-right: 0    !important;
    }
}
/* Mobile: full-width content, sidebar as WP overlay */
@media (max-width: 782px) {
    #wpcontent, #wpfooter {
        margin-left:  0 !important;
        margin-right: 0 !important;
    }
}
</style>
<?php });

/* ============================================
   ADMIN COLUMNS — VIDEOS
   ============================================ */
function pa_video_columns($cols) {
    return [
        'cb'           => $cols['cb'],
        'title'        => 'عنوان ویدیو',
        'thumbnail'    => 'تصویر',
        'youtube_id'   => 'شناسه یوتیوب',
        'duration'     => 'مدت زمان',
        'date'         => 'تاریخ',
    ];
}
add_filter('manage_pa_video_posts_columns', 'pa_video_columns');

function pa_video_column_data($col, $post_id) {
    switch ($col) {
        case 'thumbnail':
            $yt_id = get_post_meta($post_id, 'pa_youtube_id', true);
            if ($yt_id) echo '<img src="https://img.youtube.com/vi/' . esc_attr($yt_id) . '/default.jpg" width="80" style="border-radius:4px;">';
            elseif (has_post_thumbnail($post_id)) echo get_the_post_thumbnail($post_id, [80, 60]);
            break;
        case 'youtube_id':
            $yt_id = get_post_meta($post_id, 'pa_youtube_id', true);
            echo $yt_id ? '<code>' . esc_html($yt_id) . '</code>' : '—';
            break;
        case 'duration':
            $d = get_post_meta($post_id, 'pa_duration', true);
            echo $d ? esc_html($d) : '—';
            break;
    }
}
add_action('manage_pa_video_posts_custom_column', 'pa_video_column_data', 10, 2);

/* ============================================
   ADMIN COLUMNS — PODCASTS
   ============================================ */
function pa_podcast_columns($cols) {
    return [
        'cb'      => $cols['cb'],
        'title'   => 'عنوان پادکست',
        'episode' => 'اپیزود',
        'duration'=> 'مدت زمان',
        'audio'   => 'فایل صوتی',
        'date'    => 'تاریخ',
    ];
}
add_filter('manage_pa_podcast_posts_columns', 'pa_podcast_columns');

function pa_podcast_column_data($col, $post_id) {
    switch ($col) {
        case 'episode':
            $ep = get_post_meta($post_id, 'pa_episode_number', true);
            echo $ep ? '<strong>#' . esc_html($ep) . '</strong>' : '—';
            break;
        case 'duration':
            $d = get_post_meta($post_id, 'pa_duration', true);
            echo $d ? esc_html($d) : '—';
            break;
        case 'audio':
            $url = get_post_meta($post_id, 'pa_audio_url', true);
            echo $url ? '<a href="' . esc_url($url) . '" target="_blank" class="button button-small">🎵 پخش</a>' : '—';
            break;
    }
}
add_action('manage_pa_podcast_posts_custom_column', 'pa_podcast_column_data', 10, 2);

/* ============================================
   ADMIN COLUMNS — MEMBER APPLICATIONS
   ============================================ */
function pa_member_app_columns($cols) {
    return [
        'cb'          => $cols['cb'],
        'title'       => 'نام متقاضی',
        'email'       => 'ایمیل',
        'country'     => 'کشور',
        'age'         => 'سن',
        'id_upload'   => 'شناسنامه',
        'post_status' => 'وضعیت',
        'date'        => 'تاریخ ارسال',
    ];
}
add_filter('manage_pa_member_app_posts_columns', 'pa_member_app_columns');

function pa_member_app_column_data($col, $post_id) {
    switch ($col) {
        case 'email':
            echo esc_html(get_post_meta($post_id, 'pa_email', true) ?: '—');
            break;
        case 'country':
            echo esc_html(get_post_meta($post_id, 'pa_country', true) ?: '—');
            break;
        case 'age':
            echo esc_html(get_post_meta($post_id, 'pa_age', true) ?: '—');
            break;
        case 'id_upload':
            $url = get_post_meta($post_id, 'pa_id_upload', true);
            echo $url ? '<a href="' . esc_url($url) . '" target="_blank" class="button button-small">مشاهده</a>' : '—';
            break;
        case 'post_status':
            $s = get_post_status($post_id);
            $labels = ['pending' => ['در انتظار', '#f59e0b'], 'publish' => ['تأیید شده', '#22c55e'], 'trash' => ['رد شده', '#ef4444']];
            if (isset($labels[$s])) {
                echo '<span style="background:' . $labels[$s][1] . '20;color:' . $labels[$s][1] . ';padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">' . $labels[$s][0] . '</span>';
            }
            break;
    }
}
add_action('manage_pa_member_app_posts_custom_column', 'pa_member_app_column_data', 10, 2);

/* ============================================
   POSTS COLUMN — FEATURED FLAG
   ============================================ */
function pa_add_post_column($cols) {
    $cols['pa_featured']    = '⭐ ویژه';
    $cols['pa_recommended'] = '🔥 منتخب';
    return $cols;
}
add_filter('manage_post_posts_columns', 'pa_add_post_column');

function pa_post_column_data($col, $post_id) {
    if ($col === 'pa_featured')    echo get_post_meta($post_id, 'pa_featured', true)    ? '⭐' : '—';
    if ($col === 'pa_recommended') echo get_post_meta($post_id, 'pa_recommended', true) ? '🔥' : '—';
}
add_action('manage_post_posts_custom_column', 'pa_post_column_data', 10, 2);

/* ============================================
   ADMIN NOTICES
   ============================================ */
function pa_admin_notices() {
    if (!isset($_GET['pa_notice'])) return;
    $notices = [
        'approved' => ['تأیید شد! درخواست عضویت با موفقیت تأیید و ایمیل تأیید ارسال شد.', 'success'],
        'rejected' => ['رد شد! درخواست عضویت رد و به سطل زباله منتقل شد.', 'warning'],
    ];
    $key = sanitize_key($_GET['pa_notice']);
    if (isset($notices[$key])) {
        echo '<div class="notice notice-' . $notices[$key][1] . ' is-dismissible"><p>' . esc_html($notices[$key][0]) . '</p></div>';
    }
}
add_action('admin_notices', 'pa_admin_notices');

/* ============================================
   DASHBOARD WIDGET
   ============================================ */
function pa_dashboard_widget() {
    wp_add_dashboard_widget('pa_stats_widget', '📊 آمار Persian Atheists', 'pa_stats_widget_cb');
}
add_action('wp_dashboard_setup', 'pa_dashboard_widget');

function pa_stats_widget_cb() {
    $counts = [
        'مقالات'        => wp_count_posts('post')->publish,
        'ویدیوها'       => wp_count_posts('pa_video')->publish,
        'پادکست‌ها'     => wp_count_posts('pa_podcast')->publish,
        'شورت‌ها'       => wp_count_posts('pa_short')->publish,
        'درخواست‌های عضویت' => wp_count_posts('pa_member_app')->pending,
    ];
    echo '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">';
    foreach ($counts as $label => $count) {
        echo '<div style="background:#f8f9fa;border-radius:8px;padding:12px;text-align:center;">';
        echo '<div style="font-size:24px;font-weight:800;color:#D4A017;">' . esc_html($count) . '</div>';
        echo '<div style="font-size:12px;color:#6B7280;margin-top:2px;">' . esc_html($label) . '</div>';
        echo '</div>';
    }
    echo '</div>';
    echo '<p style="margin-top:12px;text-align:center;"><a href="' . admin_url('edit.php?post_type=pa_member_app') . '" class="button button-primary">مدیریت درخواست‌های عضویت</a></p>';
}

/* ============================================
   LOGIN PAGE BRANDING
   ============================================ */
function pa_login_logo() { ?>
    <style>
    .login h1 a {
        background-image: none !important;
        background-color: #D4A017;
        border-radius: 50%;
        width: 60px !important;
        height: 60px !important;
        display: flex !important;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 28px;
        font-weight: 900;
        margin: 0 auto;
    }
    .login h1 a::before { content: 'A'; }
    .login h1 a * { display: none; }
    .login #login_error { border-right: 4px solid #D4A017; }
    .login .submit .button-primary { background: #D4A017; border-color: #B8880F; }
    .login .submit .button-primary:hover { background: #B8880F; }
    </style>
<?php }
add_action('login_enqueue_scripts', 'pa_login_logo');
add_filter('login_headerurl', fn() => home_url('/'));
add_filter('login_headertext', fn() => get_bloginfo('name'));
