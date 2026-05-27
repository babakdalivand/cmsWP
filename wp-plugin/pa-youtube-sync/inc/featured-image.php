<?php
if ( ! defined('ABSPATH') ) exit;

class PAYS_Featured_Image {

    public static function set_from_youtube( int $post_id, string $yt_id, bool $overwrite = false ): bool {
        if ( ! $overwrite && has_post_thumbnail( $post_id ) ) return true;
        if ( empty( $yt_id ) ) return false;

        $url = self::best_thumbnail_url( $yt_id );
        if ( ! $url ) return false;

        return self::sideload( $post_id, $url, "yt-{$yt_id}" );
    }

    private static function best_thumbnail_url( string $yt_id ): string {
        $sizes = [ 'maxresdefault', 'sddefault', 'hqdefault', 'mqdefault' ];

        foreach ( $sizes as $size ) {
            $url  = "https://img.youtube.com/vi/{$yt_id}/{$size}.jpg";
            $resp = wp_remote_head( $url, [ 'timeout' => 5, 'redirection' => 2 ] );

            if ( is_wp_error( $resp ) ) continue;
            $code = wp_remote_retrieve_response_code( $resp );
            if ( $code === 200 ) return $url;
        }

        return '';
    }

    private static function sideload( int $post_id, string $url, string $name ): bool {
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        $tmp = download_url( $url, 10 );
        if ( is_wp_error( $tmp ) ) return false;

        $file = [
            'name'     => "{$name}.jpg",
            'type'     => 'image/jpeg',
            'tmp_name' => $tmp,
            'error'    => 0,
            'size'     => filesize( $tmp ),
        ];

        $attach_id = media_handle_sideload( $file, $post_id, null, [ 'post_title' => $name ] );
        @unlink( $tmp );

        if ( is_wp_error( $attach_id ) ) return false;

        return (bool) set_post_thumbnail( $post_id, $attach_id );
    }
}
