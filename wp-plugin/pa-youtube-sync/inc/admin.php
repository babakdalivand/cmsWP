<?php
if ( ! defined('ABSPATH') ) exit;

add_action('admin_menu', function() {
    add_menu_page('یوتیوب سینک','یوتیوب سینک','manage_options','pa-youtube-sync','pays_admin_page','dashicons-youtube',25);
});

add_action('admin_head', function() {
    if ( !isset($_GET['page']) || $_GET['page'] !== 'pa-youtube-sync' ) return;
    ?>
    <style>
    .pays-stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
    .pays-stat-card{background:#fff;border:1px solid #ddd;border-radius:10px;padding:16px;text-align:center}
    .pays-stat-card .num{font-size:32px;font-weight:800;line-height:1.1}
    .pays-stat-card .lbl{font-size:12px;color:#666;margin-top:4px}
    .pays-card{background:#fff;border:1px solid #ddd;border-radius:10px;padding:20px;margin-bottom:16px}
    .pays-badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700}
    .pays-badge-orange{background:#fef3c7;color:#d97706}
    .pays-badge-green{background:#dcfce7;color:#16a34a}
    .pays-badge-red{background:#fee2e2;color:#dc2626}
    .pays-badge-blue{background:#dbeafe;color:#2563eb}
    .pays-video-thumb{width:80px;height:45px;object-fit:cover;border-radius:4px}
    .pays-sort-bar{display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap}
    .pays-sort-bar a{padding:4px 12px;border-radius:6px;font-size:12px;text-decoration:none;border:1px solid #ddd;color:#444}
    .pays-sort-bar a.active{background:#2271b1;color:#fff;border-color:#2271b1}
    </style>
    <?php
});

add_action('admin_init', function() {
    if (!current_user_can('manage_options')) return;
    if (empty($_POST['pays_nonce']) || !wp_verify_nonce($_POST['pays_nonce'],'pays_action')) return;
    $action = sanitize_key($_POST['pays_action']??'');

    if ($action==='save_settings') {
        update_option('pays_api_key',       sanitize_text_field($_POST['pays_api_key']??''));
        update_option('pays_sync_interval', sanitize_key($_POST['pays_sync_interval']??'hourly'));
        wp_redirect(admin_url('admin.php?page=pa-youtube-sync&tab=settings&msg=saved')); exit;
    }
    if ($action==='add_channel') {
        $api_key = get_option('pays_api_key','');
        $input   = sanitize_text_field($_POST['channel_input']??'');
        if ($api_key && $input) {
            $api   = new PAYS_API($api_key);
            $ch_id = $api->resolve_channel($input);
            if ($ch_id) {
                $info     = $api->channel_info($ch_id) ?: ['id'=>$ch_id,'name'=>$ch_id,'thumbnail'=>'','subscribers'=>0,'video_count'=>0];
                $channels = get_option('pays_channels',[]);
                foreach ($channels as $c) if ($c['id']===$ch_id) { wp_redirect(admin_url('admin.php?page=pa-youtube-sync&tab=channels&msg=exists')); exit; }
                $channels[] = array_merge($info, ['enabled'=>true,'import_videos'=>true,'import_shorts'=>true,'show_live'=>true,'lang'=>'fa','max_videos'=>20]);
                update_option('pays_channels',$channels);
                pays_subscribe_channel($ch_id);
                wp_redirect(admin_url('admin.php?page=pa-youtube-sync&tab=channels&msg=added')); exit;
            }
        }
        wp_redirect(admin_url('admin.php?page=pa-youtube-sync&tab=channels&msg=error')); exit;
    }
    if ($action==='update_channel') {
        $idx=$idx=(int)($_POST['ch_index']??-1); $channels=get_option('pays_channels',[]);
        if (isset($channels[$idx])) {
            $channels[$idx]['enabled']=$channels[$idx]['import_videos']=false;
            $channels[$idx]['import_shorts']=$channels[$idx]['show_live']=false;
            foreach (['enabled','import_videos','import_shorts','show_live'] as $b) if (!empty($_POST[$b])) $channels[$idx][$b]=true;
            $channels[$idx]['lang']       = in_array($_POST['lang']??'fa',['fa','en'],true)?$_POST['lang']:'fa';
            $channels[$idx]['max_videos'] = max(1,min(50,(int)($_POST['max_videos']??20)));
            update_option('pays_channels',$channels);
        }
        wp_redirect(admin_url('admin.php?page=pa-youtube-sync&tab=channels&msg=saved')); exit;
    }
    if ($action==='remove_channel') {
        $idx=(int)($_POST['ch_index']??-1); $channels=get_option('pays_channels',[]);
        if (isset($channels[$idx])) { pays_subscribe_channel($channels[$idx]['id'],'unsubscribe'); array_splice($channels,$idx,1); update_option('pays_channels',array_values($channels)); }
        wp_redirect(admin_url('admin.php?page=pa-youtube-sync&tab=channels&msg=removed')); exit;
    }
    if ($action==='run_sync') {
        PAYS_Importer::run_sync();
        wp_redirect(admin_url('admin.php?page=pa-youtube-sync&tab=sync&msg=synced')); exit;
    }
    if ($action==='approve_queue') {
        PAYS_Importer::approve((int)($_POST['queue_id']??0));
        wp_redirect(admin_url('admin.php?page=pa-youtube-sync&tab=queue&msg=approved')); exit;
    }
    if ($action==='reject_queue') {
        PAYS_Importer::reject((int)($_POST['queue_id']??0));
        wp_redirect(admin_url('admin.php?page=pa-youtube-sync&tab=queue&msg=rejected')); exit;
    }
    if ($action==='import_playlist') {
        $api_key=get_option('pays_api_key',''); $pl_id=sanitize_text_field($_POST['pl_id']??''); $ch_id=sanitize_text_field($_POST['ch_id']??'');
        if ($api_key && $pl_id) {
            $api=new PAYS_API($api_key); $items=$api->playlist_videos($pl_id,50);
            $ids=array_filter(array_map(fn($i)=>$i['snippet']['resourceId']['videoId']??null,$items));
            $details=$api->video_details(array_values($ids)); $q=0;
            foreach ($details as $yt_id=>$v) { $iso=$v['contentDetails']['duration']??'PT0S'; if(PAYS_Importer::enqueue($yt_id,$ch_id,$v['snippet'],$iso))$q++; }
            wp_redirect(admin_url('admin.php?page=pa-youtube-sync&tab=playlists&msg=queued&n='.$q)); exit;
        }
        wp_redirect(admin_url('admin.php?page=pa-youtube-sync&tab=playlists&msg=error')); exit;
    }
    if ($action==='reclassify') {
        global $wpdb;
        $q = $wpdb->prefix.'pays_queue';
        $rows = $wpdb->get_results("SELECT id, yt_id, duration_sec, title, description FROM $q WHERE status='pending'", ARRAY_A);
        $api_key = get_option('pays_api_key','');
        $shorts_map = [];
        if ($api_key && $rows) {
            $api = new PAYS_API($api_key);
            $channel_ids = array_unique(array_column($rows, 'channel_id'));
            foreach ($channel_ids as $ch_id) {
                if (!$ch_id) continue;
                foreach ($api->get_shorts_ids($ch_id, 500) as $vid) $shorts_map[$vid] = true;
            }
        }
        foreach ($rows as $row) {
            $iso = 'PT'.(int)$row['duration_sec'].'S';
            $is_short = isset($shorts_map[$row['yt_id']]) || PAYS_API::is_short($iso, $row['title'], $row['description']);
            $wpdb->update($q, ['type' => $is_short ? 'short' : 'video'], ['id' => $row['id']]);
        }
        wp_redirect(admin_url('admin.php?page=pa-youtube-sync&tab=queue&msg=reclassified')); exit;
    }
});

function pays_admin_page(): void {
    $tab  = sanitize_key($_GET['tab']??'dashboard');
    $msg  = sanitize_key($_GET['msg']??'');
    $msgs = [
        'saved'        =>['success','ذخیره شد.'],
        'added'        =>['success','کانال اضافه شد.'],
        'removed'      =>['warning','حذف شد.'],
        'exists'       =>['warning','این کانال قبلاً هست.'],
        'error'        =>['error','کانال یافت نشد.'],
        'synced'       =>['success','همگام‌سازی انجام شد.'],
        'approved'     =>['success','ویدیو منتشر شد.'],
        'rejected'     =>['warning','ویدیو رد شد.'],
        'reclassified' =>['success','بازطبقه‌بندی انجام شد.'],
        'queued'       =>['success',(absint($_GET['n']??0)).' ویدیو به صف اضافه شد.'],
    ];
    $tabs=[
        'dashboard' => '🏠 داشبورد',
        'channels'  => '📺 کانال‌ها',
        'queue'     => '📋 صف انتظار',
        'playlists' => '🎵 پلی‌لیست',
        'analytics' => '📊 آنالیتیکس',
        'sync'      => '🔄 سینک',
        'settings'  => '⚙️ تنظیمات',
    ];
    ?>
    <div class="wrap" dir="rtl">
    <h1>یوتیوب سینک <span style="font-size:13px;color:#888;font-weight:400;">v2.0</span></h1>
    <?php if ($msg&&isset($msgs[$msg])): ?><div class="notice notice-<?=$msgs[$msg][0]?> is-dismissible"><p><?=esc_html($msgs[$msg][1])?></p></div><?php endif; ?>
    <nav class="nav-tab-wrapper" style="margin-bottom:20px;">
        <?php foreach ($tabs as $slug=>$label): ?>
        <a href="<?=admin_url('admin.php?page=pa-youtube-sync&tab='.$slug)?>" class="nav-tab <?=$tab===$slug?'nav-tab-active':''?>"><?=$label?></a>
        <?php endforeach; ?>
    </nav>
    <?php
    match($tab){
        'dashboard' => pays_tab_dashboard(),
        'settings'  => pays_tab_settings(),
        'sync'      => pays_tab_sync(),
        'queue'     => pays_tab_queue(),
        'playlists' => pays_tab_playlists(),
        'analytics' => pays_tab_analytics(),
        default     => pays_tab_channels(),
    };
    ?></div><?php
}

/* ── Tab: Dashboard ────────────────────────────────────────────── */
function pays_tab_dashboard(): void {
    global $wpdb;
    $q = $wpdb->prefix.'pays_queue';

    $yt_videos   = (int)wp_count_posts('pa_video')->publish;
    $yt_shorts   = (int)wp_count_posts('pa_short')->publish;
    $wp_books    = post_type_exists('pa_book')    ? (int)wp_count_posts('pa_book')->publish    : 0;
    $wp_podcasts = post_type_exists('pa_podcast') ? (int)wp_count_posts('pa_podcast')->publish : 0;
    $pending  = (int)$wpdb->get_var("SELECT COUNT(*) FROM $q WHERE status='pending'");
    $approved = (int)$wpdb->get_var("SELECT COUNT(*) FROM $q WHERE status='approved'");
    $rejected = (int)$wpdb->get_var("SELECT COUNT(*) FROM $q WHERE status='rejected'");
    $shorts_pending = (int)$wpdb->get_var("SELECT COUNT(*) FROM $q WHERE status='pending' AND type='short'");
    $videos_pending = (int)$wpdb->get_var("SELECT COUNT(*) FROM $q WHERE status='pending' AND type='video'");

    $api_key  = get_option('pays_api_key','');
    $channels = get_option('pays_channels',[]);
    $last_sync = get_option('pays_last_sync','');
    ?>
    <!-- Stats grid -->
    <div class="pays-stat-grid">
        <div class="pays-stat-card" style="border-top:4px solid #ef4444">
            <div class="num" style="color:#ef4444"><?=number_format($yt_videos)?></div>
            <div class="lbl">🎬 ویدیوهای منتشر‌شده</div>
        </div>
        <div class="pays-stat-card" style="border-top:4px solid #f59e0b">
            <div class="num" style="color:#f59e0b"><?=number_format($yt_shorts)?></div>
            <div class="lbl">📱 شورت‌های منتشرشده</div>
        </div>
        <div class="pays-stat-card" style="border-top:4px solid #3b82f6">
            <div class="num" style="color:#3b82f6"><?=number_format($pending)?></div>
            <div class="lbl">⏳ در صف انتظار</div>
        </div>
        <div class="pays-stat-card" style="border-top:4px solid #22c55e">
            <div class="num" style="color:#22c55e"><?=number_format($approved)?></div>
            <div class="lbl">✓ تایید شده</div>
        </div>
        <?php if ($wp_books): ?>
        <div class="pays-stat-card" style="border-top:4px solid #8b5cf6">
            <div class="num" style="color:#8b5cf6"><?=number_format($wp_books)?></div>
            <div class="lbl">📚 کتاب‌ها</div>
        </div>
        <?php endif; ?>
        <?php if ($wp_podcasts): ?>
        <div class="pays-stat-card" style="border-top:4px solid #06b6d4">
            <div class="num" style="color:#06b6d4"><?=number_format($wp_podcasts)?></div>
            <div class="lbl">🎙 پادکست‌ها</div>
        </div>
        <?php endif; ?>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:900px">

    <!-- Queue breakdown -->
    <div class="pays-card">
        <h3 style="margin:0 0 12px;font-size:14px">📋 وضعیت صف</h3>
        <table style="width:100%;font-size:13px;border-collapse:collapse">
            <tr><td style="padding:6px 0">ویدیو در انتظار</td><td style="text-align:left"><span class="pays-badge pays-badge-blue"><?=$videos_pending?></span></td></tr>
            <tr><td style="padding:6px 0">شورت در انتظار</td><td style="text-align:left"><span class="pays-badge pays-badge-orange"><?=$shorts_pending?></span></td></tr>
            <tr><td style="padding:6px 0">منتشرشده</td><td style="text-align:left"><span class="pays-badge pays-badge-green"><?=$approved?></span></td></tr>
            <tr><td style="padding:6px 0">ردشده</td><td style="text-align:left"><span class="pays-badge pays-badge-red"><?=$rejected?></span></td></tr>
        </table>
        <div style="margin-top:12px;display:flex;gap:8px">
            <a href="<?=admin_url('admin.php?page=pa-youtube-sync&tab=queue&qtype=video')?>" class="button button-small">مشاهده ویدیوها</a>
            <a href="<?=admin_url('admin.php?page=pa-youtube-sync&tab=queue&qtype=short')?>" class="button button-small">مشاهده شورت‌ها</a>
        </div>
    </div>

    <!-- System status -->
    <div class="pays-card">
        <h3 style="margin:0 0 12px;font-size:14px">⚙️ وضعیت سیستم</h3>
        <table style="width:100%;font-size:13px;border-collapse:collapse">
            <tr><td style="padding:6px 0">کلید API</td><td style="text-align:left">
                <span class="pays-badge <?=$api_key?'pays-badge-green':'pays-badge-red'?>"><?=$api_key?'✓ تنظیم شده':'✗ تنظیم نشده'?></span>
            </td></tr>
            <tr><td style="padding:6px 0">تعداد کانال</td><td style="text-align:left"><strong><?=count($channels)?></strong></td></tr>
            <tr><td style="padding:6px 0">آخرین سینک</td><td style="text-align:left" style="font-size:11px"><?=esc_html($last_sync ?: '—')?></td></tr>
            <tr><td style="padding:6px 0">سینک بعدی</td><td style="text-align:left" style="font-size:11px"><?php $next=wp_next_scheduled('pays_sync_event'); echo $next ? esc_html(date_i18n('Y/m/d H:i',$next)) : '—'; ?></td></tr>
        </table>
        <div style="margin-top:12px;display:flex;gap:8px">
            <form method="post" style="display:inline">
                <?php wp_nonce_field('pays_action','pays_nonce'); ?>
                <input type="hidden" name="pays_action" value="run_sync">
                <input type="submit" class="button button-primary button-small" value="▶ سینک الان" onclick="return confirm('سینک اجرا شود؟')">
            </form>
            <form method="post" style="display:inline">
                <?php wp_nonce_field('pays_action','pays_nonce'); ?>
                <input type="hidden" name="pays_action" value="reclassify">
                <input type="submit" class="button button-small" value="↺ بازطبقه‌بندی" onclick="return confirm('بازطبقه‌بندی شورت‌ها انجام شود؟')">
            </form>
        </div>
    </div>

    </div>

    <!-- Channels overview -->
    <?php if ($channels): ?>
    <div class="pays-card" style="max-width:900px">
        <h3 style="margin:0 0 12px;font-size:14px">📺 کانال‌ها</h3>
        <div style="display:flex;flex-wrap:wrap;gap:12px">
        <?php foreach ($channels as $ch): ?>
        <div style="display:flex;align-items:center;gap:8px;background:#f9f9f9;border-radius:8px;padding:10px 14px;min-width:200px">
            <?php if ($ch['thumbnail']): ?><img src="<?=esc_url($ch['thumbnail'])?>" width="32" height="32" style="border-radius:50%;object-fit:cover"><?php endif; ?>
            <div>
                <div style="font-weight:600;font-size:13px"><?=esc_html($ch['name'])?></div>
                <?php if (!empty($ch['subscribers'])): ?><div style="font-size:11px;color:#666"><?=number_format($ch['subscribers'])?> مشترک</div><?php endif; ?>
            </div>
            <span class="pays-badge <?=!empty($ch['enabled'])?'pays-badge-green':'pays-badge-red'?>" style="margin-right:auto"><?=!empty($ch['enabled'])?'فعال':'غیرفعال'?></span>
        </div>
        <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>

    <!-- Recent queue items -->
    <?php
    $recent = $wpdb->get_results("SELECT * FROM $q ORDER BY queued_at DESC LIMIT 10", ARRAY_A);
    if ($recent):
    ?>
    <div class="pays-card" style="max-width:900px">
        <h3 style="margin:0 0 12px;font-size:14px">🕐 آخرین ورودی‌های صف</h3>
        <table class="wp-list-table widefat fixed striped">
            <thead><tr><th width="70">تصویر</th><th>عنوان</th><th width="80">نوع</th><th width="100">وضعیت</th><th width="100">تاریخ</th></tr></thead>
            <tbody>
            <?php foreach ($recent as $r): ?>
            <tr>
                <td><?php if($r['thumbnail']): ?><img src="<?=esc_url($r['thumbnail'])?>" class="pays-video-thumb"><?php endif; ?></td>
                <td><a href="https://youtu.be/<?=esc_attr($r['yt_id'])?>" target="_blank"><?=esc_html(mb_substr($r['title'],0,60))?>…</a></td>
                <td><?=$r['type']==='short'?'<span class="pays-badge pays-badge-orange">📱 شورت</span>':'<span class="pays-badge pays-badge-blue">🎬 ویدیو</span>'?></td>
                <td><?php
                    $badge = match($r['status']) {
                        'pending'  => '<span class="pays-badge pays-badge-orange">در انتظار</span>',
                        'approved' => '<span class="pays-badge pays-badge-green">منتشر</span>',
                        'rejected' => '<span class="pays-badge pays-badge-red">رد شده</span>',
                        default    => esc_html($r['status']),
                    };
                    echo $badge;
                ?></td>
                <td style="font-size:11px"><?=esc_html(substr($r['published_at']??'',0,10))?></td>
            </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <?php endif; ?>
    <?php
}

/* ── Tab: Channels ─────────────────────────────────────────────────── */
function pays_tab_channels(): void {
    $channels=get_option('pays_channels',[]); $api_key=get_option('pays_api_key','');
    ?>
    <h2>افزودن کانال</h2>
    <?php if (!$api_key): ?><div class="notice notice-warning inline"><p>ابتدا API Key را در تب تنظیمات وارد کنید.</p></div>
    <?php else: ?>
    <form method="post">
        <?php wp_nonce_field('pays_action','pays_nonce'); ?>
        <input type="hidden" name="pays_action" value="add_channel">
        <input type="text" name="channel_input" class="regular-text" placeholder="https://youtube.com/@channel یا UCxxxx">
        <input type="submit" class="button button-primary" value="افزودن کانال">
    </form>
    <?php endif; ?>
    <h2 style="margin-top:24px;">کانال‌ها (<?=count($channels)?>)</h2>
    <?php foreach ($channels as $idx=>$ch): ?>
    <div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:16px;margin-bottom:12px;max-width:720px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <?php if($ch['thumbnail']): ?><img src="<?=esc_url($ch['thumbnail'])?>" width="36" height="36" style="border-radius:50%;object-fit:cover;"><?php endif; ?>
            <div><strong><?=esc_html($ch['name'])?></strong>
            <?php if(!empty($ch['subscribers'])): ?><span style="font-size:11px;color:#666;margin-right:6px;"><?=number_format($ch['subscribers'])?> مشترک</span><?php endif; ?><br>
            <code style="font-size:10px;"><?=esc_html($ch['id'])?></code></div>
            <div style="margin-right:auto;">
                <a href="https://youtube.com/channel/<?=esc_attr($ch['id'])?>" target="_blank" class="button button-small">یوتیوب</a>
            </div>
        </div>
        <form method="post" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">
            <?php wp_nonce_field('pays_action','pays_nonce'); ?>
            <input type="hidden" name="pays_action" value="update_channel">
            <input type="hidden" name="ch_index" value="<?=$idx?>">
            <label><input type="checkbox" name="enabled" value="1" <?=checked($ch['enabled']??true,true,false)?>> فعال</label>
            <label><input type="checkbox" name="import_videos" value="1" <?=checked($ch['import_videos']??true,true,false)?>> ویدیوها</label>
            <label><input type="checkbox" name="import_shorts" value="1" <?=checked($ch['import_shorts']??true,true,false)?>> شورت‌ها</label>
            <label><input type="checkbox" name="show_live" value="1" <?=checked($ch['show_live']??true,true,false)?>> لایو</label>
            <label>زبان: <select name="lang" style="font-size:12px;"><option value="fa" <?=selected($ch['lang']??'fa','fa',false)?>>FA</option><option value="en" <?=selected($ch['lang']??'fa','en',false)?>>EN</option></select></label>
            <label>حداکثر: <input type="number" name="max_videos" value="<?=(int)($ch['max_videos']??20)?>" min="1" max="50" style="width:55px;"></label>
            <input type="submit" class="button" value="ذخیره">
        </form>
        <form method="post" style="margin-top:6px;" onsubmit="return confirm('حذف شود؟')">
            <?php wp_nonce_field('pays_action','pays_nonce'); ?>
            <input type="hidden" name="pays_action" value="remove_channel">
            <input type="hidden" name="ch_index" value="<?=$idx?>">
            <input type="submit" class="button-link-delete button" value="حذف">
        </form>
    </div>
    <?php endforeach; ?>
    <?php
}

/* ── Tab: Queue ────────────────────────────────────────────────────── */
function pays_tab_queue(): void {
    global $wpdb;
    $q       = $wpdb->prefix.'pays_queue';
    $status  = sanitize_key($_GET['qstatus'] ?? 'pending');
    $qtype   = sanitize_key($_GET['qtype']   ?? '');
    $sort    = in_array($_GET['qsort']??'', ['published_at','yt_views','queued_at','duration_sec'], true) ? $_GET['qsort'] : 'published_at';
    $order   = strtoupper($_GET['qorder']??'DESC') === 'ASC' ? 'ASC' : 'DESC';

    $allowed_sort = ['published_at', 'yt_views', 'queued_at', 'duration_sec'];

    $where_parts = [$wpdb->prepare("status=%s", $status)];
    if ($qtype) $where_parts[] = $wpdb->prepare("type=%s", $qtype);
    $where = 'WHERE ' . implode(' AND ', $where_parts);

    $rows   = $wpdb->get_results("SELECT * FROM $q $where ORDER BY $sort $order LIMIT 50", ARRAY_A);
    $counts = [];
    foreach (['pending','approved','rejected'] as $s) {
        $counts[$s]=(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $q WHERE status=%s",$s));
    }
    $type_counts = [];
    foreach (['video','short'] as $t) {
        $type_counts[$t] = (int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $q WHERE status=%s AND type=%s", $status, $t));
    }

    $base_url = admin_url('admin.php?page=pa-youtube-sync&tab=queue');
    ?>
    <!-- Status pills -->
    <div style="display:flex;gap:12px;margin-bottom:16px;">
        <?php foreach (['pending'=>['#f59e0b','در انتظار'],'approved'=>['#22c55e','منتشر'],'rejected'=>['#ef4444','رد شده']] as $s=>[$col,$lbl]): ?>
        <a href="<?=$base_url?>&qstatus=<?=$s?>" style="text-decoration:none;">
            <div style="background:<?=$col?>20;border:2px solid <?=$s===$status?$col:'#ddd'?>;border-radius:8px;padding:10px 18px;text-align:center;">
                <div style="font-size:22px;font-weight:800;color:<?=$col?>"><?=$counts[$s]?></div>
                <div style="font-size:12px;color:<?=$col?>"><?=$lbl?></div>
            </div>
        </a>
        <?php endforeach; ?>
    </div>

    <!-- Type + Sort filters -->
    <div class="pays-sort-bar">
        <strong style="font-size:12px">نوع:</strong>
        <a href="<?=$base_url?>&qstatus=<?=$status?>&qsort=<?=$sort?>&qorder=<?=$order?>" class="<?=$qtype===''?'active':''?>">همه (<?=$counts[$status]?>)</a>
        <a href="<?=$base_url?>&qstatus=<?=$status?>&qtype=video&qsort=<?=$sort?>&qorder=<?=$order?>" class="<?=$qtype==='video'?'active':''?>">🎬 ویدیو (<?=$type_counts['video']?>)</a>
        <a href="<?=$base_url?>&qstatus=<?=$status?>&qtype=short&qsort=<?=$sort?>&qorder=<?=$order?>" class="<?=$qtype==='short'?'active':''?>">📱 شورت (<?=$type_counts['short']?>)</a>
        &nbsp;&nbsp;
        <strong style="font-size:12px">مرتب‌سازی:</strong>
        <a href="<?=$base_url?>&qstatus=<?=$status?>&qtype=<?=$qtype?>&qsort=published_at&qorder=DESC" class="<?=$sort==='published_at'?'active':''?>">📅 تاریخ</a>
        <a href="<?=$base_url?>&qstatus=<?=$status?>&qtype=<?=$qtype?>&qsort=yt_views&qorder=DESC" class="<?=$sort==='yt_views'?'active':''?>">👁 بازدید</a>
        <a href="<?=$base_url?>&qstatus=<?=$status?>&qtype=<?=$qtype?>&qsort=duration_sec&qorder=DESC" class="<?=$sort==='duration_sec'?'active':''?>">⏱ مدت</a>
    </div>

    <?php if ($status==='pending'): ?>
    <div style="margin-bottom:12px">
        <form method="post" style="display:inline">
            <?php wp_nonce_field('pays_action','pays_nonce'); ?>
            <input type="hidden" name="pays_action" value="reclassify">
            <input type="submit" class="button" value="↺ بازطبقه‌بندی شورت‌ها" onclick="return confirm('بازطبقه‌بندی شورت‌ها انجام شود؟')">
        </form>
    </div>
    <?php endif; ?>

    <?php if (!$rows): ?><p>موردی وجود ندارد.</p><?php return; endif; ?>
    <table class="wp-list-table widefat fixed striped">
        <thead><tr>
            <th width="80">تصویر</th>
            <th>عنوان</th>
            <th width="70">نوع</th>
            <th width="80">بازدید</th>
            <th width="70">مدت</th>
            <th width="100">تاریخ</th>
            <?php if($status==='pending'): ?><th width="130">عملیات</th><?php endif; ?>
        </tr></thead>
        <tbody>
        <?php foreach ($rows as $r): ?>
        <tr>
            <td><?php if($r['thumbnail']): ?><img src="<?=esc_url($r['thumbnail'])?>" class="pays-video-thumb"><?php endif; ?></td>
            <td>
                <strong><a href="https://youtu.be/<?=esc_attr($r['yt_id'])?>" target="_blank"><?=esc_html(mb_substr($r['title'],0,70))?></a></strong><br>
                <code style="font-size:10px;"><?=esc_html($r['channel_id'])?></code>
            </td>
            <td><?=$r['type']==='short'?'<span class="pays-badge pays-badge-orange">شورت</span>':'<span class="pays-badge pays-badge-blue">ویدیو</span>'?></td>
            <td style="font-size:12px"><?=$r['yt_views']>0?number_format($r['yt_views']):'—'?></td>
            <td style="font-size:12px"><?=$r['duration_sec']>0?PAYS_API::format_duration((int)$r['duration_sec']):'—'?></td>
            <td style="font-size:11px"><?=esc_html(substr($r['published_at']??'',0,10))?></td>
            <?php if($status==='pending'): ?>
            <td>
                <form method="post" style="display:inline;">
                    <?php wp_nonce_field('pays_action','pays_nonce'); ?>
                    <input type="hidden" name="pays_action" value="approve_queue">
                    <input type="hidden" name="queue_id" value="<?=$r['id']?>">
                    <input type="submit" class="button button-primary button-small" value="✓ منتشر">
                </form>
                <form method="post" style="display:inline;margin-right:4px;">
                    <?php wp_nonce_field('pays_action','pays_nonce'); ?>
                    <input type="hidden" name="pays_action" value="reject_queue">
                    <input type="hidden" name="queue_id" value="<?=$r['id']?>">
                    <input type="submit" class="button button-small" value="✗ رد">
                </form>
            </td>
            <?php endif; ?>
        </tr>
        <?php endforeach; ?>
        </tbody>
    </table>
    <?php
}

/* ── Tab: Playlists ────────────────────────────────────────────────── */
function pays_tab_playlists(): void {
    $channels=get_option('pays_channels',[]); $api_key=get_option('pays_api_key','');
    if (!$api_key||!$channels) { echo '<p>ابتدا API Key و کانال اضافه کنید.</p>'; return; }
    $sel_ch = sanitize_text_field($_GET['ch']??($channels[0]['id']??''));
    ?>
    <form method="get" style="margin-bottom:16px;">
        <input type="hidden" name="page" value="pa-youtube-sync">
        <input type="hidden" name="tab" value="playlists">
        <select name="ch" onchange="this.form.submit()">
            <?php foreach ($channels as $c): ?><option value="<?=esc_attr($c['id'])?>" <?=selected($sel_ch,$c['id'],false)?>><?=esc_html($c['name'])?></option><?php endforeach; ?>
        </select>
    </form>
    <?php
    if (!$sel_ch) return;
    $api = new PAYS_API($api_key);
    $pls = $api->channel_playlists($sel_ch, 20);
    if (!$pls) { echo '<p>پلی‌لیستی یافت نشد.</p>'; return; }
    ?>
    <table class="wp-list-table widefat fixed striped" style="max-width:700px;">
        <thead><tr><th>عنوان پلی‌لیست</th><th width="80">ویدیو</th><th width="150">عملیات</th></tr></thead>
        <tbody>
        <?php foreach ($pls as $pl): ?>
        <tr>
            <td><strong><?=esc_html($pl['snippet']['title']??'')?></strong><br><code style="font-size:10px;"><?=esc_html($pl['id']??'')?></code></td>
            <td><?=(int)($pl['contentDetails']['itemCount']??0)?></td>
            <td>
                <form method="post">
                    <?php wp_nonce_field('pays_action','pays_nonce'); ?>
                    <input type="hidden" name="pays_action" value="import_playlist">
                    <input type="hidden" name="pl_id" value="<?=esc_attr($pl['id']??'')?>">
                    <input type="hidden" name="ch_id" value="<?=esc_attr($sel_ch)?>">
                    <input type="submit" class="button button-small" value="افزودن به صف">
                </form>
            </td>
        </tr>
        <?php endforeach; ?>
        </tbody>
    </table>
    <?php
}

/* ── Tab: Analytics ────────────────────────────────────────────────── */
function pays_tab_analytics(): void {
    global $wpdb;
    $api_key  = get_option('pays_api_key','');
    $channels = get_option('pays_channels',[]);
    $mode     = sanitize_key($_GET['amode'] ?? 'live');
    $base_url = admin_url('admin.php?page=pa-youtube-sync&tab=analytics');

    ?>
    <div class="pays-sort-bar" style="margin-bottom:20px">
        <a href="<?=$base_url?>&amode=live" class="<?=$mode==='live'?'active':''?>">📡 آمار زنده یوتیوب</a>
        <a href="<?=$base_url?>&amode=db" class="<?=$mode==='db'?'active':''?>">🗄 پست‌های منتشرشده</a>
    </div>

    <?php if ($mode === 'live'): ?>
    <?php pays_analytics_live($api_key, $channels); ?>
    <?php else: ?>
    <?php pays_analytics_db($api_key); ?>
    <?php endif; ?>
    <?php
}

function pays_analytics_live(string $api_key, array $channels): void {
    if (!$api_key) { echo '<div class="notice notice-warning inline"><p>برای دیدن آمار زنده، ابتدا API Key را تنظیم کنید.</p></div>'; return; }
    if (!$channels) { echo '<p>هیچ کانالی اضافه نشده.</p>'; return; }

    $sel_ch = sanitize_text_field($_GET['ch'] ?? ($channels[0]['id'] ?? ''));
    ?>
    <form method="get" style="margin-bottom:16px;">
        <input type="hidden" name="page" value="pa-youtube-sync">
        <input type="hidden" name="tab" value="analytics">
        <input type="hidden" name="amode" value="live">
        <select name="ch" onchange="this.form.submit()">
            <?php foreach ($channels as $c): ?>
            <option value="<?=esc_attr($c['id'])?>" <?=selected($sel_ch,$c['id'],false)?>><?=esc_html($c['name'])?></option>
            <?php endforeach; ?>
        </select>
        <input type="submit" class="button" value="نمایش">
    </form>
    <?php
    if (!$sel_ch) return;

    $api  = new PAYS_API($api_key);
    $data = $api->live_channel_stats($sel_ch);

    if (isset($data['error'])) { echo '<div class="notice notice-error inline"><p>'.esc_html($data['error']).'</p></div>'; return; }

    $ch  = $data['channel'] ?? [];
    $sum = $data['summary'] ?? [];
    $top = $data['top']     ?? [];
    ?>

    <!-- Channel card -->
    <div class="pays-card" style="max-width:700px;display:flex;align-items:center;gap:16px">
        <?php if (!empty($ch['thumbnail'])): ?><img src="<?=esc_url($ch['thumbnail'])?>" width="64" height="64" style="border-radius:50%"><?php endif; ?>
        <div>
            <h2 style="margin:0 0 4px;font-size:18px"><?=esc_html($ch['name']??'')?></h2>
            <div style="display:flex;gap:16px;font-size:13px;color:#555">
                <span>👥 <?=number_format($ch['subscribers']??0)?> مشترک</span>
                <span>👁 <?=number_format($ch['total_views']??0)?> بازدید کل</span>
                <span>🎬 <?=number_format($ch['video_count']??0)?> ویدیو</span>
            </div>
        </div>
    </div>

    <!-- Summary stats -->
    <div class="pays-stat-grid" style="max-width:700px;margin-top:16px">
        <div class="pays-stat-card">
            <div class="num" style="color:#3b82f6"><?=number_format($sum['total_videos']??0)?></div>
            <div class="lbl">🎬 ویدیوهای آنالیز شده</div>
        </div>
        <div class="pays-stat-card">
            <div class="num" style="color:#ef4444"><?=number_format($sum['total_views']??0)?></div>
            <div class="lbl">👁 کل بازدید</div>
        </div>
        <div class="pays-stat-card">
            <div class="num" style="color:#22c55e"><?=number_format($sum['avg_views']??0)?></div>
            <div class="lbl">📊 میانگین بازدید</div>
        </div>
        <div class="pays-stat-card">
            <div class="num" style="color:#f59e0b"><?=($sum['like_rate']??0).'%'?></div>
            <div class="lbl">👍 نرخ لایک</div>
        </div>
        <div class="pays-stat-card">
            <div class="num" style="color:#8b5cf6"><?=number_format($sum['total_likes']??0)?></div>
            <div class="lbl">👍 کل لایک</div>
        </div>
        <div class="pays-stat-card">
            <div class="num" style="color:#06b6d4"><?=number_format($sum['total_comments']??0)?></div>
            <div class="lbl">💬 کل کامنت</div>
        </div>
    </div>

    <!-- Top videos -->
    <?php if ($top): ?>
    <div class="pays-card" style="max-width:900px;margin-top:16px">
        <h3 style="margin:0 0 12px;font-size:14px">🏆 ۱۰ ویدیوی پربازدید</h3>
        <table class="wp-list-table widefat fixed striped">
            <thead><tr>
                <th width="90">تصویر</th>
                <th>عنوان</th>
                <th width="80">نوع</th>
                <th width="100">👁 بازدید</th>
                <th width="80">👍 لایک</th>
                <th width="80">💬 کامنت</th>
                <th width="70">نرخ لایک</th>
            </tr></thead>
            <tbody>
            <?php foreach ($top as $v): ?>
            <tr>
                <td><?php if(!empty($v['thumbnail'])): ?><img src="<?=esc_url($v['thumbnail'])?>" class="pays-video-thumb"><?php endif; ?></td>
                <td><a href="https://youtu.be/<?=esc_attr($v['yt_id'])?>" target="_blank"><?=esc_html(mb_substr($v['title'],0,60))?></a></td>
                <td><?=$v['type']==='short'?'<span class="pays-badge pays-badge-orange">شورت</span>':'<span class="pays-badge pays-badge-blue">ویدیو</span>'?></td>
                <td><strong><?=number_format($v['views'])?></strong></td>
                <td><?=number_format($v['likes'])?></td>
                <td><?=number_format($v['comments'])?></td>
                <td><?=$v['like_rate'].'%'?></td>
            </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <?php endif; ?>
    <?php
}

function pays_analytics_db(string $api_key): void {
    global $wpdb;
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT p.ID,p.post_title,pm.meta_value as yt_id,p.post_type FROM {$wpdb->posts} p
         JOIN {$wpdb->postmeta} pm ON pm.post_id=p.ID AND pm.meta_key='pa_youtube_id'
         WHERE p.post_type IN ('pa_video','pa_short') AND p.post_status='publish'
         ORDER BY p.post_date DESC LIMIT %d",20
    ),ARRAY_A);
    if (!$rows) { echo '<p>هنوز ویدیویی منتشر نشده.</p>'; return; }
    $yt_stats=[];
    if ($api_key) { $api=new PAYS_API($api_key); $yt_stats=$api->video_stats(array_column($rows,'yt_id')); }
    ?>
    <table class="wp-list-table widefat fixed striped" style="max-width:900px">
        <thead><tr>
            <th>عنوان</th>
            <th width="70">نوع</th>
            <th width="110">👁 بازدید YT</th>
            <th width="80">👍 لایک</th>
            <th width="80">💬 کامنت</th>
        </tr></thead>
        <tbody>
        <?php foreach ($rows as $r):
            $yt=$yt_stats[$r['yt_id']]??[];
        ?>
        <tr>
            <td>
                <a href="<?=get_permalink($r['ID'])?>" target="_blank"><?=esc_html($r['post_title'])?></a><br>
                <a href="https://youtu.be/<?=esc_attr($r['yt_id'])?>" target="_blank" style="font-size:11px;color:#666;"><?=esc_html($r['yt_id'])?></a>
            </td>
            <td><?=$r['post_type']==='pa_short'?'<span class="pays-badge pays-badge-orange">شورت</span>':'<span class="pays-badge pays-badge-blue">ویدیو</span>'?></td>
            <td><strong><?=$yt?number_format($yt['views']):'—'?></strong></td>
            <td><?=$yt?number_format($yt['likes']):'—'?></td>
            <td><?=$yt?number_format($yt['comments']):'—'?></td>
        </tr>
        <?php endforeach; ?>
        </tbody>
    </table>
    <?php
}

/* ── Tab: Settings ─────────────────────────────────────────────────── */
function pays_tab_settings(): void {
    $api_key=get_option('pays_api_key',''); $interval=get_option('pays_sync_interval','hourly');
    ?>
    <div class="pays-card" style="max-width:600px">
    <form method="post">
        <?php wp_nonce_field('pays_action','pays_nonce'); ?>
        <input type="hidden" name="pays_action" value="save_settings">
        <table class="form-table">
            <tr><th>وضعیت API Key</th>
                <td><span class="pays-badge <?=$api_key?'pays-badge-green':'pays-badge-red'?>"><?=$api_key?'✓ تنظیم شده':'✗ تنظیم نشده'?></span></td></tr>
            <tr><th>YouTube Data API v3 Key</th>
                <td><input type="text" name="pays_api_key" value="<?=esc_attr($api_key)?>" class="regular-text" placeholder="AIza...">
                <p class="description">از <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud Console</a> — YouTube Data API v3 را فعال کنید.</p></td></tr>
            <tr><th>بازه همگام‌سازی</th>
                <td><select name="pays_sync_interval">
                    <option value="hourly" <?=selected($interval,'hourly',false)?>>هر ساعت</option>
                    <option value="twicedaily" <?=selected($interval,'twicedaily',false)?>>هر ۱۲ ساعت</option>
                    <option value="daily" <?=selected($interval,'daily',false)?>>روزانه</option>
                </select></td></tr>
            <tr><th>Webhook URL</th>
                <td><input type="text" value="<?=esc_attr(rest_url('pa-yt/v1/webhook'))?>" class="regular-text" readonly onclick="this.select()">
                <p class="description">این آدرس به‌صورت خودکار در PubSubHubbub ثبت می‌شود.</p></td></tr>
        </table>
        <input type="submit" class="button button-primary" value="ذخیره تنظیمات">
    </form>
    </div>
    <?php
}

/* ── Tab: Sync ─────────────────────────────────────────────────────── */
function pays_tab_sync(): void {
    $last=get_option('pays_last_sync',''); $results=get_option('pays_last_sync_results',[]); $next=wp_next_scheduled('pays_sync_event');
    ?>
    <div style="display:flex;gap:12px;margin-bottom:20px">
    <form method="post">
        <?php wp_nonce_field('pays_action','pays_nonce'); ?>
        <input type="hidden" name="pays_action" value="run_sync">
        <input type="submit" class="button button-primary" value="▶ همگام‌سازی الان" onclick="return confirm('ادامه؟')">
    </form>
    <form method="post">
        <?php wp_nonce_field('pays_action','pays_nonce'); ?>
        <input type="hidden" name="pays_action" value="reclassify">
        <input type="submit" class="button" value="↺ بازطبقه‌بندی شورت‌ها" onclick="return confirm('بازطبقه‌بندی شورت‌ها انجام شود؟')">
    </form>
    </div>
    <table class="form-table" style="max-width:500px;margin-top:16px;">
        <tr><th>آخرین سینک</th><td><?=esc_html($last?:'هنوز اجرا نشده')?></td></tr>
        <tr><th>سینک بعدی</th><td><?=$next?esc_html(date_i18n('Y/m/d H:i',$next)):'—'?></td></tr>
    </table>
    <?php if ($results): ?>
    <h2>نتیجه</h2>
    <table class="wp-list-table widefat fixed striped" style="max-width:500px;">
        <thead><tr><th>کانال</th><th>به صف اضافه شد</th><th>تکراری/رد شده</th></tr></thead>
        <tbody>
        <?php foreach ($results as $ch=>$r): ?>
        <tr><td><code><?=esc_html($ch)?></code></td><td style="color:#22c55e;font-weight:700;"><?=(int)($r['queued']??0)?></td><td><?=(int)($r['skipped']??0)?></td></tr>
        <?php endforeach; ?>
        </tbody>
    </table>
    <?php endif;
}
