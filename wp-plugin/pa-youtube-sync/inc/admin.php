<?php
if ( ! defined('ABSPATH') ) exit;

add_action('admin_menu', function() {
    add_menu_page('یوتیوب سینک','یوتیوب سینک','manage_options','pa-youtube-sync','pays_admin_page','dashicons-youtube',25);
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
        $api_key=$api_key=get_option('pays_api_key',''); $pl_id=sanitize_text_field($_POST['pl_id']??''); $ch_id=sanitize_text_field($_POST['ch_id']??'');
        if ($api_key && $pl_id) {
            $api=$api=new PAYS_API($api_key); $items=$api->playlist_videos($pl_id,50);
            $ids=array_filter(array_map(fn($i)=>$i['snippet']['resourceId']['videoId']??null,$items));
            $details=$api->video_details(array_values($ids)); $q=0;
            foreach ($details as $yt_id=>$v) { $iso=$v['contentDetails']['duration']??'PT0S'; if(PAYS_Importer::enqueue($yt_id,$ch_id,$v['snippet'],$iso))$q++; }
            wp_redirect(admin_url('admin.php?page=pa-youtube-sync&tab=playlists&msg=queued&n='.$q)); exit;
        }
        wp_redirect(admin_url('admin.php?page=pa-youtube-sync&tab=playlists&msg=error')); exit;
    }
});

function pays_admin_page(): void {
    $tab  = sanitize_key($_GET['tab']??'channels');
    $msg  = sanitize_key($_GET['msg']??'');
    $msgs = [
        'saved'=>['success','ذخیره شد.'],'added'=>['success','کانال اضافه شد.'],'removed'=>['warning','حذف شد.'],
        'exists'=>['warning','این کانال قبلاً هست.'],'error'=>['error','کانال یافت نشد.'],
        'synced'=>['success','همگام‌سازی انجام شد.'],'approved'=>['success','ویدیو منتشر شد.'],
        'rejected'=>['warning','ویدیو رد شد.'],'queued'=>['success',(absint($_GET['n']??0)).' ویدیو به صف اضافه شد.'],
    ];
    $tabs=['channels'=>'📺 کانال‌ها','queue'=>'📋 صف انتظار','playlists'=>'🎵 پلی‌لیست','analytics'=>'📊 آنالیتیکس','sync'=>'🔄 سینک','settings'=>'⚙️ تنظیمات'];
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
        'settings'  => pays_tab_settings(),
        'sync'      => pays_tab_sync(),
        'queue'     => pays_tab_queue(),
        'playlists' => pays_tab_playlists(),
        'analytics' => pays_tab_analytics(),
        default     => pays_tab_channels(),
    };
    ?></div><?php
}

/* ── Tab: Channels ─────────────────────────────────────────────────── */
function pays_tab_channels(): void {
    $channels=get_option('pays_channels',[]); $api_key=get_option('pays_api_key','');
    ?>
    <h2>افزودن کانال</h2>
    <?php if (!$api_key): ?><div class="notice notice-warning inline"><p>ابتدا API Key را در تب تنظیمات وارد کنید.</p></div>
    <?php else: ?>
    <form method="post"><<?php wp_nonce_field('pays_action','pays_nonce'); ?>
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
    $q      = $wpdb->prefix.'pays_queue';
    $status = sanitize_key($_GET['qstatus']??'pending');
    $rows   = $wpdb->get_results($wpdb->prepare("SELECT * FROM $q WHERE status=%s ORDER BY published_at DESC LIMIT 50",$status),ARRAY_A);
    $counts = [];
    foreach (['pending','approved','rejected'] as $s) {
        $counts[$s]=(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $q WHERE status=%s",$s));
    }
    ?>
    <div style="display:flex;gap:12px;margin-bottom:20px;">
        <?php foreach (['pending'=>['#f59e0b','در انتظار'],'approved'=>['#22c55e','منتشر'],'rejected'=>['#ef4444','رد شده']] as $s=>[$col,$lbl]): ?>
        <a href="?page=pa-youtube-sync&tab=queue&qstatus=<?=$s?>" style="text-decoration:none;">
            <div style="background:<?=$col?>20;border:2px solid <?=$col?>;border-radius:8px;padding:10px 18px;text-align:center;">
                <div style="font-size:22px;font-weight:800;color:<?=$col?>"><?=$counts[$s]?></div>
                <div style="font-size:12px;color:<?=$col?>"><?=$lbl?></div>
            </div>
        </a>
        <?php endforeach; ?>
    </div>
    <?php if (!$rows): ?><p>موردی وجود ندارد.</p><?php return; endif; ?>
    <table class="wp-list-table widefat fixed striped">
        <thead><tr><th width="80">تصویر</th><th>عنوان</th><th width="80">نوع</th><th width="100">تاریخ</th><?php if($status==='pending'): ?><th width="130">عملیات</th><?php endif; ?></tr></thead>
        <tbody>
        <?php foreach ($rows as $r): ?>
        <tr>
            <td><?php if($r['thumbnail']): ?><img src="<?=esc_url($r['thumbnail'])?>" width="70" style="border-radius:4px;"><?php endif; ?></td>
            <td>
                <strong><a href="https://youtu.be/<?=esc_attr($r['yt_id'])?>" target="_blank"><?=esc_html($r['title'])?></a></strong><br>
                <code style="font-size:10px;"><?=esc_html($r['channel_id'])?></code>
                <?php if($r['duration_sec']>0): ?>&nbsp;<span style="font-size:11px;color:#666;"><?=PAYS_API::format_duration((int)$r['duration_sec'])?></span><?php endif; ?>
            </td>
            <td><?=$r['type']==='short'?'📱 شورت':'🎬 ویدیو'?></td>
            <td><?=$r['published_at']?esc_html(substr($r['published_at'],0,10)):'—'?></td>
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
    $api_key = get_option('pays_api_key','');
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT p.ID,p.post_title,pm.meta_value as yt_id FROM {$wpdb->posts} p
         JOIN {$wpdb->postmeta} pm ON pm.post_id=p.ID AND pm.meta_key='pa_youtube_id'
         WHERE p.post_type IN ('pa_video','pa_short') AND p.post_status='publish'
         ORDER BY p.post_date DESC LIMIT %d",20
    ),ARRAY_A);
    if (!$rows) { echo '<p>هنوز ویدیویی منتشر نشده.</p>'; return; }
    $yt_stats=[];
    if ($api_key) { $api=new PAYS_API($api_key); $yt_stats=$api->video_stats(array_column($rows,'yt_id')); }
    ?>
    <table class="wp-list-table widefat fixed striped">
        <thead><tr><th>عنوان</th><th width="100">👁 بازدید YT</th><th width="80">👍 لایک</th><th width="80">💬 کامنت</th></tr></thead>
        <tbody>
        <?php foreach ($rows as $r):
            $yt=$yt_stats[$r['yt_id']]??[];
        ?>
        <tr>
            <td><a href="<?=get_permalink($r['ID'])?>" target="_blank"><?=esc_html($r['post_title'])?></a><br>
                <a href="https://youtu.be/<?=esc_attr($r['yt_id'])?>" target="_blank" style="font-size:11px;color:#666;"><?=esc_html($r['yt_id'])?></a></td>
            <td><?=$yt?number_format($yt['views']):'—'?></td>
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
    <form method="post">
        <?php wp_nonce_field('pays_action','pays_nonce'); ?>
        <input type="hidden" name="pays_action" value="save_settings">
        <table class="form-table" style="max-width:600px;">
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
    <?php
}

/* ── Tab: Sync ─────────────────────────────────────────────────────── */
function pays_tab_sync(): void {
    $last=get_option('pays_last_sync',''); $results=get_option('pays_last_sync_results',[]); $next=wp_next_scheduled('pays_sync_event');
    ?>
    <form method="post">
        <?php wp_nonce_field('pays_action','pays_nonce'); ?>
        <input type="hidden" name="pays_action" value="run_sync">
        <input type="submit" class="button button-primary" value="▶ همگام‌سازی الان" onclick="return confirm('ادامه؟')">
    </form>
    <table class="form-table" style="max-width:500px;margin-top:16px;">
        <tr><th>آخرین سینک</th><td><?=esc_html($last?:'هنوز اجرا نشده')?></td></tr>
        <tr><th>سینک بعدی</th><td><?=$next?esc_html(date_i18n('Y/m/d H:i',$next)):'—'?></td></tr>
    </table>
    <?php if ($results): ?>
    <h2>نتیجه</h2>
    <table class="wp-list-table widefat fixed striped" style="max-width:500px;">
        <thead><tr><th>کانال</th><th>به صف اضافه شد</th><th>تکراری</th></tr></thead>
        <tbody>
        <?php foreach ($results as $ch=>$r): ?>
        <tr><td><code><?=esc_html($ch)?></code></td><td style="color:#22c55e;font-weight:700;"><?=(int)($r['queued']??0)?></td><td><?=(int)($r['skipped']??0)?></td></tr>
        <?php endforeach; ?>
        </tbody>
    </table>
    <?php endif;
}
