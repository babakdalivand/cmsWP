<?php
if ( ! defined('ABSPATH') ) exit;

/**
 * Global AI Key Manager — syncs with the Mini App (app.persianatheists.com)
 *
 * Adds a "🔑 کلید AI" tab to the YouTube Sync admin page.
 * Admin sets provider + API key here; it saves locally to WP options
 * AND pushes to the Mini App via REST API so all users benefit.
 */

// ── Register tab in admin nav ─────────────────────────────────────────────────

add_filter( 'pays_admin_tabs', function ( array $tabs ): array {
    $tabs['ai_global'] = '🔑 کلید AI';
    return $tabs;
});

// ── Handle form saves ─────────────────────────────────────────────────────────

add_action( 'admin_init', function () {
    if ( ! current_user_can('manage_options') ) return;
    if ( empty($_POST['pays_nonce']) || ! wp_verify_nonce($_POST['pays_nonce'], 'pays_action') ) return;
    if ( ( $_POST['pays_action'] ?? '' ) !== 'save_ai_global' ) return;

    $provider  = sanitize_key( $_POST['ai_global_provider'] ?? 'gemini' );
    $api_key   = sanitize_text_field( $_POST['ai_global_key'] ?? '' );
    $mini_url  = esc_url_raw( trailingslashit( $_POST['miniapp_url'] ?? '' ) );
    $mini_user = sanitize_text_field( $_POST['miniapp_user'] ?? '' );
    $mini_pass = sanitize_text_field( $_POST['miniapp_pass'] ?? '' );

    // Always update local options
    if ( $provider ) update_option( 'pays_ai_provider', $provider );
    if ( $api_key  ) update_option( 'pays_ai_api_key',  $api_key  );
    if ( $mini_url ) update_option( 'pays_miniapp_url', $mini_url );
    if ( $mini_user) update_option( 'pays_miniapp_user',$mini_user);
    if ( $mini_pass) update_option( 'pays_miniapp_pass', pays_encrypt_pass($mini_pass) );

    $sync_result = 'no_key';

    // Push to Mini App if we have credentials and a key
    if ( $mini_url && $mini_user && $api_key && $provider ) {
        $sync_result = pays_sync_ai_key_to_miniapp( $mini_url, $mini_user, $api_key, $provider );
    } elseif ( $api_key && $provider ) {
        $stored_url  = get_option('pays_miniapp_url','');
        $stored_user = get_option('pays_miniapp_user','');
        $stored_pass = pays_decrypt_pass( get_option('pays_miniapp_pass','') );
        if ( $stored_url && $stored_user && $stored_pass ) {
            $sync_result = pays_sync_ai_key_to_miniapp( $stored_url, $stored_user, $api_key, $provider );
        }
    }

    wp_redirect( admin_url('admin.php?page=pa-youtube-sync&tab=ai_global&msg=' . urlencode($sync_result)) );
    exit;
});

// ── Sync helper ───────────────────────────────────────────────────────────────

function pays_sync_ai_key_to_miniapp( string $base_url, string $username, string $api_key, string $provider ): string {
    // Step 1: authenticate
    $login = wp_remote_post( $base_url . 'api/auth/login', [
        'timeout' => 15,
        'headers' => [ 'Content-Type' => 'application/json' ],
        'body'    => wp_json_encode([
            'username' => $username,
            'password' => pays_decrypt_pass( get_option('pays_miniapp_pass','') ),
        ]),
    ]);

    if ( is_wp_error($login) ) return 'auth_error';
    $login_body = json_decode( wp_remote_retrieve_body($login), true );
    $token = $login_body['accessToken'] ?? '';
    if ( ! $token ) return 'auth_failed';

    // Step 2: push global AI config
    $push = wp_remote_post( $base_url . 'api/ai/admin/config', [
        'timeout' => 15,
        'headers' => [
            'Content-Type'  => 'application/json',
            'Authorization' => "Bearer {$token}",
        ],
        'body' => wp_json_encode([
            'provider'     => $provider,
            'apiKey'       => $api_key,
            'setAsDefault' => true,
        ]),
    ]);

    if ( is_wp_error($push) ) return 'push_error';
    $code = wp_remote_retrieve_response_code($push);
    return $code === 200 ? 'synced' : 'push_failed';
}

// ── Load current config from Mini App ────────────────────────────────────────

function pays_get_miniapp_ai_config(): ?array {
    $base_url = get_option('pays_miniapp_url','');
    $username = get_option('pays_miniapp_user','');
    $enc_pass = get_option('pays_miniapp_pass','');
    if ( ! $base_url || ! $username || ! $enc_pass ) return null;

    $login = wp_remote_post( $base_url . 'api/auth/login', [
        'timeout' => 10,
        'headers' => [ 'Content-Type' => 'application/json' ],
        'body'    => wp_json_encode([
            'username' => $username,
            'password' => pays_decrypt_pass($enc_pass),
        ]),
    ]);
    if ( is_wp_error($login) ) return null;
    $token = json_decode( wp_remote_retrieve_body($login), true )['accessToken'] ?? '';
    if ( ! $token ) return null;

    $resp = wp_remote_get( $base_url . 'api/ai/admin/config', [
        'timeout' => 10,
        'headers' => [ 'Authorization' => "Bearer {$token}" ],
    ]);
    if ( is_wp_error($resp) || wp_remote_retrieve_response_code($resp) !== 200 ) return null;
    return json_decode( wp_remote_retrieve_body($resp), true );
}

// ── Simple XOR encrypt/decrypt for stored password ───────────────────────────

function pays_encrypt_pass( string $pass ): string {
    if ( ! $pass ) return '';
    $key = wp_salt('auth');
    $enc = '';
    for ( $i = 0; $i < strlen($pass); $i++ ) {
        $enc .= chr( ord($pass[$i]) ^ ord($key[ $i % strlen($key) ]) );
    }
    return base64_encode($enc);
}

function pays_decrypt_pass( string $enc ): string {
    if ( ! $enc ) return '';
    $key  = wp_salt('auth');
    $data = base64_decode($enc);
    $dec  = '';
    for ( $i = 0; $i < strlen($data); $i++ ) {
        $dec .= chr( ord($data[$i]) ^ ord($key[ $i % strlen($key) ]) );
    }
    return $dec;
}

// ── Tab HTML ──────────────────────────────────────────────────────────────────

function pays_render_ai_global_tab(): void {
    $msg = sanitize_key( $_GET['msg'] ?? '' );

    $cur_provider  = get_option('pays_ai_provider', 'gemini');
    $cur_mini_url  = get_option('pays_miniapp_url',  '');
    $cur_mini_user = get_option('pays_miniapp_user', '');
    $has_pass      = (bool) get_option('pays_miniapp_pass', '');

    // Try to load live config from miniapp
    $miniapp_cfg = null;
    if ( $cur_mini_url && $cur_mini_user && $has_pass ) {
        $miniapp_cfg = pays_get_miniapp_ai_config();
    }

    $providers = [
        'gemini'   => [ 'name' => 'Google Gemini',  'icon' => '🧠', 'hint' => 'gemini-2.5-flash' ],
        'openai'   => [ 'name' => 'OpenAI GPT-4o',  'icon' => '🤖', 'hint' => 'gpt-4o'           ],
        'claude'   => [ 'name' => 'Claude Sonnet',  'icon' => '✦',  'hint' => 'claude-sonnet-4-6' ],
        'deepseek' => [ 'name' => 'DeepSeek',       'icon' => '🔍', 'hint' => 'deepseek-chat'     ],
        'grok'     => [ 'name' => 'Grok (xAI)',     'icon' => '⚡', 'hint' => 'grok-3-mini'       ],
        'mistral'  => [ 'name' => 'Mistral AI',     'icon' => '🌬️', 'hint' => 'mistral-small'    ],
    ];
    ?>
    <style>
    .pays-ai-cfg { max-width:680px; }
    .pays-ai-cfg .section { background:#fff; border:1px solid #ddd; border-radius:10px; padding:20px; margin-bottom:16px; }
    .pays-ai-cfg h3 { margin:0 0 14px; font-size:15px; }
    .pays-ai-cfg table.form-table th { width:180px; }
    .pays-status-bar { display:flex; gap:8px; align-items:center; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:16px; }
    .pays-status-bar.ok { background:#dcfce7; color:#15803d; border:1px solid #86efac; }
    .pays-status-bar.warn { background:#fef9c3; color:#854d0e; border:1px solid #fde047; }
    .pays-status-bar.err { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; }
    .pays-provider-badge { display:inline-flex; align-items:center; gap:5px; background:#f0f7ff; border:1px solid #93c5fd; color:#1d4ed8; padding:3px 10px; border-radius:20px; font-weight:600; }
    </style>

    <div class="pays-ai-cfg">

        <?php
        if ( $msg ) {
            $labels = [
                'synced'      => [ 'ok',   '✅ کلید AI با موفقیت ذخیره شد و با مینی‌اپ همگام‌سازی شد.' ],
                'no_key'      => [ 'ok',   '✅ تنظیمات محلی ذخیره شد (مینی‌اپ همگام نشد — اطلاعات اتصال ندارید).' ],
                'auth_error'  => [ 'err',  '❌ اتصال به مینی‌اپ ناموفق بود — آدرس یا اطلاعات ورود را بررسی کنید.' ],
                'auth_failed' => [ 'err',  '❌ ورود به مینی‌اپ ناموفق بود — نام کاربری یا رمز عبور اشتباه است.' ],
                'push_failed' => [ 'warn', '⚠️ ذخیره محلی موفق بود اما همگام‌سازی با مینی‌اپ ناموفق بود.' ],
                'push_error'  => [ 'err',  '❌ خطای شبکه هنگام ارسال به مینی‌اپ.' ],
            ];
            [ $cls, $text ] = $labels[$msg] ?? [ 'warn', "وضعیت: {$msg}" ];
            echo "<div class='pays-status-bar {$cls}'>{$text}</div>";
        }
        ?>

        <?php if ( $miniapp_cfg ) : ?>
        <div class="section">
            <h3>وضعیت فعلی مینی‌اپ</h3>
            <?php if ( ! empty($miniapp_cfg['defaultProvider']) ) : ?>
                <p>پروایدر پیش‌فرض فعال:
                    <?php
                    $dp = $miniapp_cfg['defaultProvider'];
                    $info = $providers[$dp] ?? [ 'icon' => '🔑', 'name' => $dp ];
                    echo "<span class='pays-provider-badge'>{$info['icon']} {$info['name']}</span>";
                    ?>
                </p>
                <?php if ( ! empty($miniapp_cfg['globalKeys']) ) : ?>
                <p style="font-size:12px;color:#666;">
                    پروایدرهای جهانی فعال:
                    <?php foreach ( $miniapp_cfg['globalKeys'] as $gk ) :
                        $gi = $providers[$gk['provider']] ?? [ 'icon' => '🔑', 'name' => $gk['provider'] ];
                        echo " <strong>{$gi['icon']} {$gi['name']}</strong>";
                    endforeach; ?>
                </p>
                <?php endif; ?>
            <?php else : ?>
                <p class="pays-status-bar warn">⚠️ هیچ کلید جهانی در مینی‌اپ تنظیم نشده است.</p>
            <?php endif; ?>
        </div>
        <?php endif; ?>

        <form method="post">
            <?php wp_nonce_field('pays_action','pays_nonce'); ?>
            <input type="hidden" name="pays_action" value="save_ai_global">

            <div class="section">
                <h3>🔑 کلید AI جهانی</h3>
                <p style="color:#555;font-size:13px;margin-bottom:14px;">
                    این کلید برای همه کاربران مینی‌اپ و سرویس‌های سایت که کلید شخصی ندارند استفاده می‌شود.
                </p>
                <table class="form-table">
                    <tr>
                        <th><label for="ai_global_provider">پروایدر AI</label></th>
                        <td>
                            <select name="ai_global_provider" id="ai_global_provider" class="regular-text">
                                <?php foreach ( $providers as $id => $info ) :
                                    $sel = selected( $cur_provider, $id, false ); ?>
                                    <option value="<?php echo esc_attr($id); ?>" <?php echo $sel; ?>>
                                        <?php echo esc_html("{$info['icon']} {$info['name']} ({$info['hint']})"); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th><label for="ai_global_key">کلید API</label></th>
                        <td>
                            <input type="password" name="ai_global_key" id="ai_global_key"
                                   class="regular-text" autocomplete="new-password"
                                   placeholder="کلید جدید وارد کنید (خالی = بدون تغییر)" />
                            <p class="description">کلید به‌صورت رمزنگاری‌شده در دیتابیس مینی‌اپ ذخیره می‌شود.</p>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="section">
                <h3>🔗 اتصال به مینی‌اپ</h3>
                <p style="color:#555;font-size:13px;margin-bottom:14px;">
                    اطلاعات ورود ادمین مینی‌اپ را وارد کنید تا کلید AI به‌صورت خودکار همگام‌سازی شود.
                    رمز عبور به‌صورت رمزنگاری‌شده در وردپرس ذخیره می‌شود.
                </p>
                <table class="form-table">
                    <tr>
                        <th><label for="miniapp_url">آدرس مینی‌اپ</label></th>
                        <td>
                            <input type="url" name="miniapp_url" id="miniapp_url"
                                   class="regular-text" dir="ltr"
                                   value="<?php echo esc_attr($cur_mini_url); ?>"
                                   placeholder="https://app.persianatheists.com/" />
                        </td>
                    </tr>
                    <tr>
                        <th><label for="miniapp_user">نام کاربری ادمین</label></th>
                        <td>
                            <input type="text" name="miniapp_user" id="miniapp_user"
                                   class="regular-text" dir="ltr"
                                   value="<?php echo esc_attr($cur_mini_user); ?>"
                                   placeholder="admin" />
                        </td>
                    </tr>
                    <tr>
                        <th><label for="miniapp_pass">رمز عبور ادمین</label></th>
                        <td>
                            <input type="password" name="miniapp_pass" id="miniapp_pass"
                                   class="regular-text" autocomplete="new-password"
                                   placeholder="<?php echo $has_pass ? '(ذخیره شده — برای تغییر وارد کنید)' : 'رمز عبور'; ?>" />
                            <?php if ( $has_pass ) : ?>
                            <p class="description" style="color:#16a34a;">✓ رمز عبور ذخیره شده</p>
                            <?php endif; ?>
                        </td>
                    </tr>
                </table>
            </div>

            <?php submit_button('💾 ذخیره و همگام‌سازی'); ?>
        </form>
    </div>
    <?php
}
