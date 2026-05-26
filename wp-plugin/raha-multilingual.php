<?php
/**
 * Plugin Name:     RAHA Multilingual
 * Plugin URI:      https://app.persianatheists.com
 * Description:     Custom bilingual (FA/EN) support — replaces Polylang.
 *                  Stores language in raha_lang taxonomy, links translations
 *                  via shared UUID, exposes REST API, and routes /en/ URLs.
 * Version:         1.0.0
 * Author:          RAHA
 * License:         MIT
 *
 * Place this file at: wp-content/mu-plugins/raha-multilingual.php
 * (mu-plugins auto-activate, no UI needed)
 */

if (!defined('ABSPATH')) exit;

define('RAHA_ML_VERSION',      '1.2.0');
define('RAHA_ML_TAX',          'raha_lang');
define('RAHA_ML_GROUP_META',   '_raha_group_id');
define('RAHA_ML_DEFAULT_LANG', 'fa');

function raha_ml_languages() {
    return apply_filters('raha_ml_languages', [
        'fa' => ['name' => 'فارسی',  'native' => 'فارسی',  'locale' => 'fa_IR', 'rtl' => true,  'flag' => '🇮🇷'],
        'en' => ['name' => 'English','native' => 'English','locale' => 'en_US', 'rtl' => false, 'flag' => '🇬🇧'],
    ]);
}

// ════════════════════════════════════════════════════════════════════════
//  1) TAXONOMY — language tag attached to posts
// ════════════════════════════════════════════════════════════════════════
add_action('init', 'raha_ml_register_taxonomy', 5);
function raha_ml_register_taxonomy() {
    register_taxonomy(RAHA_ML_TAX, ['post'], [
        'label'              => 'زبان',
        'public'             => false,
        'publicly_queryable' => true,
        'show_ui'            => true,
        'show_in_menu'       => false,
        'show_admin_column'  => true,
        'show_in_quick_edit' => true,
        'show_in_rest'       => true,
        'rest_base'          => 'raha-languages',
        'hierarchical'       => false,
        'query_var'          => false,
    ]);

    // Seed language terms
    foreach (raha_ml_languages() as $slug => $info) {
        if (!term_exists($slug, RAHA_ML_TAX)) {
            wp_insert_term($info['name'], RAHA_ML_TAX, ['slug' => $slug]);
        }
    }
}

// ════════════════════════════════════════════════════════════════════════
//  2) REWRITE RULES — /en/ prefix for English content
// ════════════════════════════════════════════════════════════════════════
add_action('init', 'raha_ml_rewrites', 10);
function raha_ml_rewrites() {
    $langs = array_keys(raha_ml_languages());
    foreach ($langs as $lang) {
        if ($lang === RAHA_ML_DEFAULT_LANG) continue;  // default has no prefix
        add_rewrite_rule("^{$lang}/?$",                          "index.php?raha_lang={$lang}",                                  'top');
        add_rewrite_rule("^{$lang}/page/([0-9]+)/?$",            "index.php?raha_lang={$lang}&paged=\$matches[1]",               'top');
        add_rewrite_rule("^{$lang}/category/([^/]+)/?$",         "index.php?raha_lang={$lang}&category_name=\$matches[1]",       'top');
        add_rewrite_rule("^{$lang}/category/([^/]+)/page/([0-9]+)/?$",
                                                                 "index.php?raha_lang={$lang}&category_name=\$matches[1]&paged=\$matches[2]", 'top');
        add_rewrite_rule("^{$lang}/([^/]+)/?$",                  "index.php?name=\$matches[1]&raha_lang={$lang}",                'top');
    }
}

add_filter('query_vars', function ($vars) {
    $vars[] = 'raha_lang';
    return $vars;
});

// Filter front-end queries to the current language
add_action('pre_get_posts', 'raha_ml_filter_main_query');
function raha_ml_filter_main_query($query) {
    if (is_admin() || !$query->is_main_query()) return;
    if ($query->is_singular()) return;  // singular resolves by slug+lang via name query
    if ($query->get('post_type') && $query->get('post_type') !== 'post') return;

    $lang = $query->get('raha_lang') ?: RAHA_ML_DEFAULT_LANG;
    $tq   = (array) $query->get('tax_query');
    $tq[] = [
        'taxonomy' => RAHA_ML_TAX,
        'field'    => 'slug',
        'terms'    => [$lang],
    ];
    $query->set('tax_query', $tq);
}

// When resolving a singular post by slug, ensure the right language is picked
add_action('parse_request', 'raha_ml_constrain_singular_lang');
function raha_ml_constrain_singular_lang(&$wp) {
    if (empty($wp->query_vars['name']) || empty($wp->query_vars['raha_lang'])) return;

    $slug = $wp->query_vars['name'];
    $lang = $wp->query_vars['raha_lang'];
    $posts = get_posts([
        'name'           => $slug,
        'post_type'      => 'post',
        'posts_per_page' => 1,
        'post_status'    => ['publish', 'private'],
        'tax_query'      => [[
            'taxonomy' => RAHA_ML_TAX,
            'field'    => 'slug',
            'terms'    => [$lang],
        ]],
    ]);

    if (!empty($posts)) {
        $wp->query_vars['p'] = $posts[0]->ID;
        unset($wp->query_vars['name']);
    }
}

// ════════════════════════════════════════════════════════════════════════
//  3) ALLOW DUPLICATE SLUGS ACROSS LANGUAGES
//     A post with slug "hello" can exist in both FA and EN.
// ════════════════════════════════════════════════════════════════════════
add_filter('wp_unique_post_slug', 'raha_ml_unique_slug', 10, 6);
function raha_ml_unique_slug($slug, $post_id, $post_status, $post_type, $post_parent, $original_slug) {
    if ($post_type !== 'post') return $slug;
    if ($slug === $original_slug) return $slug;

    $current_lang = raha_get_post_lang($post_id) ?: (
        isset($_REQUEST['raha_lang']) ? sanitize_text_field($_REQUEST['raha_lang']) : RAHA_ML_DEFAULT_LANG
    );

    global $wpdb;
    $duplicate = $wpdb->get_var($wpdb->prepare(
        "SELECT p.ID FROM {$wpdb->posts} p
           INNER JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
           INNER JOIN {$wpdb->term_taxonomy}      tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
           INNER JOIN {$wpdb->terms}              t  ON tt.term_id = t.term_id
          WHERE p.post_name = %s
            AND p.post_type = %s
            AND p.post_status NOT IN ('trash','auto-draft')
            AND p.ID != %d
            AND tt.taxonomy = %s
            AND t.slug = %s
          LIMIT 1",
        $original_slug, $post_type, $post_id, RAHA_ML_TAX, $current_lang
    ));

    return $duplicate ? $slug : $original_slug;
}

// ════════════════════════════════════════════════════════════════════════
//  4) AUTO-ASSIGN DEFAULT LANGUAGE ON NEW POSTS
// ════════════════════════════════════════════════════════════════════════
add_action('save_post_post', 'raha_ml_auto_assign_lang', 10, 2);
function raha_ml_auto_assign_lang($post_id, $post) {
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
    if (wp_is_post_revision($post_id)) return;
    if ($post->post_status === 'auto-draft') return;

    if (!raha_get_post_lang($post_id)) {
        $hint = isset($_REQUEST['raha_lang']) ? sanitize_text_field($_REQUEST['raha_lang']) : '';
        $lang = ($hint && array_key_exists($hint, raha_ml_languages())) ? $hint : RAHA_ML_DEFAULT_LANG;
        raha_set_post_lang($post_id, $lang);
    }
}

// ════════════════════════════════════════════════════════════════════════
//  5) REST API EXTENSIONS
// ════════════════════════════════════════════════════════════════════════
add_action('rest_api_init', 'raha_ml_rest_init');
function raha_ml_rest_init() {

    // Read/write language on posts
    register_rest_field('post', 'raha_lang', [
        'get_callback'    => fn($post) => raha_get_post_lang($post['id']),
        'update_callback' => function ($value, $post) {
            if (!array_key_exists($value, raha_ml_languages())) {
                return new WP_Error('invalid_lang', 'Unsupported language code');
            }
            return raha_set_post_lang($post->ID, $value);
        },
        'schema'          => ['type' => 'string', 'description' => 'Post language slug (fa|en)'],
    ]);

    // Read/write group id
    register_rest_field('post', 'raha_group_id', [
        'get_callback'    => fn($post) => get_post_meta($post['id'], RAHA_ML_GROUP_META, true) ?: null,
        'update_callback' => function ($value, $post) {
            update_post_meta($post->ID, RAHA_ML_GROUP_META, sanitize_text_field($value));
        },
        'schema'          => ['type' => 'string', 'description' => 'Translation group UUID'],
    ]);

    // Read-only translations map
    register_rest_field('post', 'raha_translations', [
        'get_callback' => fn($post) => raha_get_translations($post['id']),
        'schema'       => ['type' => 'object', 'description' => 'Map of lang -> {id, link, title}'],
    ]);

    // POST /raha/v1/link-translation  body: { posts: { fa: 31, en: 32 } }
    register_rest_route('raha/v1', '/link-translation', [
        'methods'             => 'POST',
        'callback'            => 'raha_ml_rest_link_translation',
        'permission_callback' => fn() => current_user_can('edit_posts'),
        'args'                => [
            'posts' => ['required' => true, 'type' => 'object'],
        ],
    ]);

    // POST /raha/v1/unlink-translation  body: { post: 31 }
    register_rest_route('raha/v1', '/unlink-translation', [
        'methods'             => 'POST',
        'callback'            => function ($req) {
            $pid = (int) $req['post'];
            delete_post_meta($pid, RAHA_ML_GROUP_META);
            return ['ok' => true];
        },
        'permission_callback' => fn() => current_user_can('edit_posts'),
    ]);

    // GET /raha/v1/translations/{id}
    register_rest_route('raha/v1', '/translations/(?P<id>\d+)', [
        'methods'             => 'GET',
        'callback'            => fn($req) => raha_get_translations((int) $req['id']),
        'permission_callback' => '__return_true',
    ]);

    // GET /raha/v1/languages
    register_rest_route('raha/v1', '/languages', [
        'methods'             => 'GET',
        'callback'            => fn() => raha_ml_languages(),
        'permission_callback' => '__return_true',
    ]);

    // POST /raha/v1/migrate  -- one-shot Polylang → raha_lang import
    register_rest_route('raha/v1', '/migrate', [
        'methods'             => 'POST',
        'callback'            => 'raha_ml_rest_migrate',
        'permission_callback' => fn() => current_user_can('manage_options'),
    ]);
}

function raha_ml_rest_link_translation($req) {
    $posts = (array) $req['posts'];   // ['fa' => 31, 'en' => 32]
    if (count($posts) < 2) {
        return new WP_Error('too_few', 'حداقل دو پست برای پیوند ترجمه لازم است', ['status' => 400]);
    }

    // Reuse existing group id if any of the posts has one
    $group_id = null;
    foreach ($posts as $pid) {
        $g = get_post_meta((int) $pid, RAHA_ML_GROUP_META, true);
        if ($g) { $group_id = $g; break; }
    }
    if (!$group_id) $group_id = wp_generate_uuid4();

    foreach ($posts as $lang => $pid) {
        $pid = (int) $pid;
        if (!$pid) continue;
        update_post_meta($pid, RAHA_ML_GROUP_META, $group_id);
        if (array_key_exists($lang, raha_ml_languages())) {
            raha_set_post_lang($pid, $lang);
        }
    }

    return [
        'group_id'     => $group_id,
        'posts'        => $posts,
        'translations' => raha_get_translations((int) reset($posts)),
    ];
}

// ════════════════════════════════════════════════════════════════════════
//  6) HELPERS — public API for themes
// ════════════════════════════════════════════════════════════════════════

/** Returns 'fa' | 'en' | null */
function raha_get_post_lang($post_id) {
    $terms = wp_get_object_terms((int) $post_id, RAHA_ML_TAX, ['fields' => 'slugs']);
    if (is_wp_error($terms) || empty($terms)) return null;
    return $terms[0];
}

function raha_set_post_lang($post_id, $lang) {
    if (!array_key_exists($lang, raha_ml_languages())) return false;
    return wp_set_object_terms((int) $post_id, $lang, RAHA_ML_TAX, false);
}

function raha_get_post_group($post_id) {
    return get_post_meta((int) $post_id, RAHA_ML_GROUP_META, true) ?: null;
}

/**
 * Map of [lang_slug => ['id' => ..., 'link' => ..., 'title' => ...]]
 * Includes the source post itself.
 */
function raha_get_translations($post_id) {
    $post_id = (int) $post_id;
    if (!$post_id) return new stdClass();

    $self_lang = raha_get_post_lang($post_id);
    $group     = raha_get_post_group($post_id);

    $result = [];
    if ($self_lang) {
        $result[$self_lang] = [
            'id'    => $post_id,
            'link'  => raha_localize_url(get_permalink($post_id), $self_lang),
            'title' => get_the_title($post_id),
        ];
    }

    if ($group) {
        $sibling_ids = get_posts([
            'post_type'      => 'post',
            'posts_per_page' => -1,
            'post_status'    => 'publish',
            'fields'         => 'ids',
            'meta_key'       => RAHA_ML_GROUP_META,
            'meta_value'     => $group,
            'post__not_in'   => [$post_id],
        ]);
        foreach ($sibling_ids as $sid) {
            $lang = raha_get_post_lang($sid);
            if (!$lang) continue;
            $result[$lang] = [
                'id'    => $sid,
                'link'  => raha_localize_url(get_permalink($sid), $lang),
                'title' => get_the_title($sid),
            ];
        }
    }

    return (object) $result;   // object so JSON shows {} not [] when empty
}

function raha_get_translation($post_id, $lang) {
    $t = (array) raha_get_translations($post_id);
    return isset($t[$lang]) ? $t[$lang]['id'] : null;
}

function raha_get_current_lang() {
    $q = get_query_var('raha_lang');
    return $q ?: RAHA_ML_DEFAULT_LANG;
}

/** Convert a permalink into the lang-prefixed variant */
function raha_localize_url($url, $lang) {
    $home = trailingslashit(home_url('/'));
    // Strip any existing lang prefix
    foreach (array_keys(raha_ml_languages()) as $l) {
        if ($l === RAHA_ML_DEFAULT_LANG) continue;
        if (strpos($url, $home . $l . '/') === 0) {
            $url = $home . substr($url, strlen($home . $l . '/'));
        }
    }
    // Add prefix for non-default
    if ($lang !== RAHA_ML_DEFAULT_LANG && strpos($url, $home) === 0) {
        $url = $home . $lang . '/' . substr($url, strlen($home));
    }
    return $url;
}

/**
 * Render a simple language switcher.
 *   raha_language_switcher();
 *   raha_language_switcher(['echo' => false]) returns HTML.
 */
function raha_language_switcher($args = []) {
    $args = wp_parse_args($args, [
        'echo'        => true,
        'class'       => 'raha-lang-switcher',
        'show_native' => true,
        'show_flag'   => true,
    ]);

    $current = raha_get_current_lang();
    $langs   = raha_ml_languages();
    $items   = [];

    if (is_singular('post')) {
        $trans = (array) raha_get_translations(get_the_ID());
        foreach ($langs as $slug => $info) {
            $active = ($slug === $current) ? ' active' : '';
            if (!empty($trans[$slug])) {
                $items[] = sprintf(
                    '<li class="lang-%s%s"><a href="%s" hreflang="%s">%s%s</a></li>',
                    esc_attr($slug), $active,
                    esc_url($trans[$slug]['link']),
                    esc_attr($slug),
                    $args['show_flag']   ? $info['flag'] . ' ' : '',
                    $args['show_native'] ? esc_html($info['native']) : esc_html($info['name'])
                );
            }
        }
    } else {
        foreach ($langs as $slug => $info) {
            $active = ($slug === $current) ? ' active' : '';
            $url    = ($slug === RAHA_ML_DEFAULT_LANG) ? home_url('/') : home_url('/' . $slug . '/');
            $items[] = sprintf(
                '<li class="lang-%s%s"><a href="%s" hreflang="%s">%s%s</a></li>',
                esc_attr($slug), $active,
                esc_url($url), esc_attr($slug),
                $args['show_flag']   ? $info['flag'] . ' ' : '',
                $args['show_native'] ? esc_html($info['native']) : esc_html($info['name'])
            );
        }
    }

    $html = '<ul class="' . esc_attr($args['class']) . '">' . implode('', $items) . '</ul>';
    if ($args['echo']) echo $html;
    return $html;
}

// ════════════════════════════════════════════════════════════════════════
//  7) PERMALINKS — auto-prefix /en/ for non-default-language posts
// ════════════════════════════════════════════════════════════════════════
add_filter('post_link', 'raha_ml_filter_permalink', 10, 2);
add_filter('post_type_link', 'raha_ml_filter_permalink', 10, 2);
function raha_ml_filter_permalink($url, $post) {
    if (!$post || (is_object($post) && $post->post_type !== 'post')) return $url;
    $pid = is_object($post) ? $post->ID : (int) $post;
    $lang = raha_get_post_lang($pid);
    if (!$lang || $lang === RAHA_ML_DEFAULT_LANG) return $url;
    return raha_localize_url($url, $lang);
}

// ════════════════════════════════════════════════════════════════════════
//  8) <html lang dir> on the front-end
// ════════════════════════════════════════════════════════════════════════
add_filter('language_attributes', function ($output) {
    $lang  = raha_get_current_lang();
    $langs = raha_ml_languages();
    if (!isset($langs[$lang])) return $output;

    $locale  = str_replace('_', '-', $langs[$lang]['locale']);
    $is_rtl  = !empty($langs[$lang]['rtl']);
    return sprintf('lang="%s" dir="%s"', esc_attr($locale), $is_rtl ? 'rtl' : 'ltr');
});

// hreflang link tags in <head>
add_action('wp_head', function () {
    if (!is_singular('post')) return;
    $trans = (array) raha_get_translations(get_the_ID());
    foreach ($trans as $slug => $t) {
        printf('<link rel="alternate" hreflang="%s" href="%s" />' . "\n",
            esc_attr($slug), esc_url($t['link'])
        );
    }
}, 5);

// ════════════════════════════════════════════════════════════════════════
//  8) ONE-SHOT MIGRATION from Polylang  (run via REST or admin notice)
// ════════════════════════════════════════════════════════════════════════
function raha_ml_rest_migrate($req) {
    return raha_ml_run_migration();
}

function raha_ml_run_migration() {
    if (!taxonomy_exists('language')) {
        return ['ok' => true, 'migrated' => 0, 'note' => 'no Polylang data to migrate'];
    }

    $posts = get_posts([
        'post_type'      => 'post',
        'posts_per_page' => -1,
        'post_status'    => 'any',
        'fields'         => 'ids',
    ]);

    $groups = [];
    $count  = 0;
    foreach ($posts as $pid) {
        $pll = wp_get_object_terms($pid, 'language', ['fields' => 'slugs']);
        if (!is_wp_error($pll) && !empty($pll) && !raha_get_post_lang($pid)) {
            raha_set_post_lang($pid, $pll[0]);
            $count++;
        }

        $pll_trans = get_post_meta($pid, '_translations', true);
        if (is_array($pll_trans) && count($pll_trans) > 1) {
            $key = implode('-', array_map('intval', array_values($pll_trans)));
            if (!isset($groups[$key])) $groups[$key] = wp_generate_uuid4();
            if (!get_post_meta($pid, RAHA_ML_GROUP_META, true)) {
                update_post_meta($pid, RAHA_ML_GROUP_META, $groups[$key]);
            }
        }
    }

    update_option('raha_ml_migrated', time());
    flush_rewrite_rules();
    return ['ok' => true, 'migrated' => $count, 'groups' => count($groups)];
}

add_action('admin_notices', function () {
    if (get_option('raha_ml_migrated')) return;
    if (!current_user_can('manage_options')) return;
    if (!taxonomy_exists('language')) return;
    $url = rest_url('raha/v1/migrate');
    ?>
    <div class="notice notice-info">
        <p><strong>RAHA Multilingual:</strong> داده‌های Polylang شناسایی شد. برای انتقال خودکار به raha_lang، روی دکمه زیر کلیک کنید (یک‌بار).</p>
        <p><button class="button button-primary" id="raha-ml-migrate">انجام مهاجرت</button> <span id="raha-ml-migrate-status"></span></p>
        <script>
        document.getElementById('raha-ml-migrate').addEventListener('click', async () => {
            const btn = document.getElementById('raha-ml-migrate');
            const out = document.getElementById('raha-ml-migrate-status');
            btn.disabled = true; out.textContent = 'در حال مهاجرت...';
            try {
                const res = await fetch(<?php echo wp_json_encode($url); ?>, {
                    method: 'POST',
                    headers: { 'X-WP-Nonce': '<?php echo wp_create_nonce('wp_rest'); ?>' },
                    credentials: 'same-origin',
                });
                const data = await res.json();
                out.textContent = '✓ ' + data.migrated + ' پست منتقل شد. صفحه را refresh کنید.';
            } catch (e) { out.textContent = 'خطا: ' + e.message; }
        });
        </script>
    </div>
    <?php
});

// ════════════════════════════════════════════════════════════════════════
//  8.5) POST-FORMAT SUPPORT — video/audio/image get distinct layouts
//       (no duplicated featured image on single video/podcast pages)
// ════════════════════════════════════════════════════════════════════════
add_action('after_setup_theme', function () {
    add_theme_support('post-formats', ['video', 'audio', 'image', 'gallery', 'link', 'quote']);
}, 11);

// Hide the giant featured-image hero on single video/audio posts.
// The actual embed inside .entry-content is the real "hero". Archive
// thumbnails still work because we only target .single body class.
add_action('wp_head', function () {
    if (!is_single()) return;
    $fmt = get_post_format() ?: 'standard';
    if (!in_array($fmt, ['video', 'audio'], true)) return;
    echo "<style id=\"raha-hide-thumb-on-{$fmt}\">
  body.single-format-{$fmt} .post-thumbnail,
  body.single-format-{$fmt} .featured-image,
  body.single-format-{$fmt} .entry-thumbnail,
  body.single-format-{$fmt} .ct-featured-image,
  body.single-format-{$fmt} .hero-section[data-type=\"type-1\"] .ct-image-container,
  body.single-format-{$fmt} > article > .wp-post-image,
  body.single-format-{$fmt} > article > figure.wp-block-post-featured-image,
  body.single-format-{$fmt} .raha-card-hero img.wp-post-image {
    display: none !important;
  }
  body.single-format-{$fmt} .raha-embed-youtube,
  body.single-format-{$fmt} .entry-content > iframe:first-child,
  body.single-format-{$fmt} .entry-content > audio:first-child {
    margin-top: 0.5em;
    margin-bottom: 1.5em;
  }
</style>";
}, 99);

// Add raha-fmt-{format} body class so the future custom theme can style
// on top of post-format conditions easily.
add_filter('body_class', function ($classes) {
    if (is_single()) {
        $fmt = get_post_format() ?: 'standard';
        $classes[] = 'raha-fmt-' . sanitize_html_class($fmt);
    }
    return $classes;
});

// ════════════════════════════════════════════════════════════════════════
//  9) FLUSH REWRITE RULES (one-shot per plugin version)
// ════════════════════════════════════════════════════════════════════════
add_action('init', function () {
    if (get_option('raha_ml_flushed') !== RAHA_ML_VERSION) {
        flush_rewrite_rules();
        update_option('raha_ml_flushed', RAHA_ML_VERSION);
    }
}, 999);

// ════════════════════════════════════════════════════════════════════════
//  10) ADMIN: show language in posts list, quick edit dropdown
// ════════════════════════════════════════════════════════════════════════
add_filter('manage_posts_columns', function ($cols) {
    // Replace the auto-injected taxonomy column with a nicer label
    if (isset($cols['taxonomy-' . RAHA_ML_TAX])) {
        unset($cols['taxonomy-' . RAHA_ML_TAX]);
    }
    $new = [];
    foreach ($cols as $k => $v) {
        $new[$k] = $v;
        if ($k === 'title') $new['raha_lang_col'] = '🌐 زبان';
    }
    return $new;
});
add_action('manage_posts_custom_column', function ($col, $post_id) {
    if ($col !== 'raha_lang_col') return;
    $lang  = raha_get_post_lang($post_id);
    $langs = raha_ml_languages();
    if ($lang && isset($langs[$lang])) {
        echo esc_html($langs[$lang]['flag'] . ' ' . $langs[$lang]['native']);
    } else {
        echo '<span style="color:#999">—</span>';
    }
    $group = raha_get_post_group($post_id);
    if ($group) {
        $siblings = (array) raha_get_translations($post_id);
        unset($siblings[$lang]);
        if ($siblings) {
            echo '<br><small style="color:#666">↔ ' . count($siblings) . ' ترجمه</small>';
        }
    }
}, 10, 2);
