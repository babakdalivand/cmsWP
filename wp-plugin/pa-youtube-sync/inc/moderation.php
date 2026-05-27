<?php
if ( ! defined('ABSPATH') ) exit;

/**
 * Auto-moderation hooks: runs on every newly enqueued video.
 * - Duplicate detection
 * - Toxicity check
 * - Rule engine evaluation
 * - Notifications
 */

// Hook fires after a video is inserted into pays_queue
add_action( 'pays_video_enqueued', 'pays_auto_moderate', 10, 1 );

function pays_auto_moderate( array $item ): void {
    $queue_id = (int) ( $item['id'] ?? 0 );
    if ( ! $queue_id ) return;

    $yt_id       = $item['yt_id']        ?? '';
    $title       = $item['title']        ?? '';
    $description = $item['description']  ?? '';

    // ── 1. Duplicate detection ───────────────────────────────────
    $duplicate = PAYS_Duplicate_Detector::check( $yt_id, $title );
    if ( $duplicate ) {
        PAYS_Mod_Log::add( $queue_id, 0, 'duplicate_detected',
            "Possible duplicate: {$duplicate['type']} (score {$duplicate['score']}%)",
            $duplicate
        );
        // Store flag as queue notes via direct update
        global $wpdb;
        $wpdb->update(
            $wpdb->prefix . 'pays_queue',
            [ 'notes' => 'duplicate:' . $duplicate['type'] ],
            [ 'id'    => $queue_id ]
        );
    }

    // ── 2. Toxicity detection ────────────────────────────────────
    $tox = PAYS_Toxicity::analyze( $title, $description );
    if ( ! $tox['safe'] ) {
        PAYS_Mod_Log::add( $queue_id, 0, 'toxicity_flagged',
            'Content warning: ' . implode( ', ', $tox['flags'] ) . " (score {$tox['score']})",
            $tox
        );
        global $wpdb;
        $current_notes = $wpdb->get_var(
            $wpdb->prepare( "SELECT notes FROM {$wpdb->prefix}pays_queue WHERE id=%d", $queue_id )
        );
        $new_notes = $current_notes ? $current_notes . '|toxicity' : 'toxicity';
        $wpdb->update(
            $wpdb->prefix . 'pays_queue',
            [ 'notes' => $new_notes ],
            [ 'id'    => $queue_id ]
        );
    }

    // ── 3. Rule engine ───────────────────────────────────────────
    $applied = PAYS_Rule_Engine::evaluate( $item );

    // ── 4. Notification for new pending items ────────────────────
    if ( get_option( 'pays_notify_new_queue', false ) && empty( $applied ) ) {
        // Only notify if no rule auto-approved/rejected (avoid double notifications)
        PAYS_Notification::send_queue_item( $item, 'New video pending review' );
    }
}

/* ── Bulk moderation ────────────────────────────────────────────── */

function pays_bulk_moderate( array $ids, string $action ): array {
    $results = [ 'approved' => 0, 'rejected' => 0, 'errors' => [] ];

    foreach ( $ids as $id ) {
        $id = (int) $id;
        if ( $action === 'approve' ) {
            $post_id = PAYS_Importer::approve( $id, [] );
            if ( $post_id !== false ) {
                $results['approved']++;
                PAYS_Mod_Log::add( $id, (int) $post_id, 'bulk_approve', 'Bulk approved' );
            } else {
                $results['errors'][] = $id;
            }
        } elseif ( $action === 'reject' ) {
            if ( PAYS_Importer::reject( $id ) ) {
                $results['rejected']++;
                PAYS_Mod_Log::add( $id, 0, 'bulk_reject', 'Bulk rejected' );
            } else {
                $results['errors'][] = $id;
            }
        }
    }

    // Send summary notification
    if ( $results['approved'] + $results['rejected'] > 0 ) {
        PAYS_Notification::send_bulk_result( $results['approved'], $results['rejected'] );
    }

    return $results;
}
