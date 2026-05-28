<?php

namespace CMM\Adapters;

class GoogleDriveAdapter implements AdapterInterface {
    private ?string $accessToken  = null;
    private int     $tokenExpires = 0;

    public function __construct(private readonly array $creds) {}

    public function upload(string $localPath, string $remotePath, string $mimeType): string {
        $token    = $this->getAccessToken();
        $body     = file_get_contents($localPath);
        $filename = basename($remotePath);
        $meta     = json_encode(['name' => $filename, 'parents' => [$this->creds['folder_id']]]);
        $boundary = 'cmm_gdrive_' . wp_generate_uuid4();

        $multipart  = "--$boundary\r\n";
        $multipart .= "Content-Type: application/json; charset=UTF-8\r\n\r\n";
        $multipart .= $meta . "\r\n";
        $multipart .= "--$boundary\r\n";
        $multipart .= "Content-Type: $mimeType\r\n\r\n";
        $multipart .= $body . "\r\n";
        $multipart .= "--$boundary--";

        $response = wp_remote_post(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
            [
                'headers' => [
                    'Authorization' => "Bearer $token",
                    'Content-Type'  => "multipart/related; boundary=$boundary",
                ],
                'body'    => $multipart,
                'timeout' => 120,
            ]
        );
        $this->assertOk($response, 'GDrive upload');
        $data   = json_decode(wp_remote_retrieve_body($response), true);
        $fileId = $data['id'];

        if (!empty($this->creds['make_public'])) {
            $this->makeFilePublic($fileId, $token);
        }
        return $this->getUrl($fileId);
    }

    public function delete(string $remotePath): bool {
        $token    = $this->getAccessToken();
        $response = wp_remote_request(
            "https://www.googleapis.com/drive/v3/files/$remotePath",
            ['method' => 'DELETE', 'headers' => ['Authorization' => "Bearer $token"], 'timeout' => 30]
        );
        $code = wp_remote_retrieve_response_code($response);
        return $code === 204 || $code === 200;
    }

    public function exists(string $remotePath): bool {
        $token    = $this->getAccessToken();
        $response = wp_remote_get(
            "https://www.googleapis.com/drive/v3/files/$remotePath?fields=id",
            ['headers' => ['Authorization' => "Bearer $token"], 'timeout' => 15]
        );
        return wp_remote_retrieve_response_code($response) === 200;
    }

    public function getUrl(string $fileId): string {
        return "https://drive.google.com/uc?export=view&id=$fileId";
    }

    public function ping(): bool {
        try {
            $this->getAccessToken();
            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    private function makeFilePublic(string $fileId, string $token): void {
        wp_remote_post(
            "https://www.googleapis.com/drive/v3/files/$fileId/permissions",
            [
                'headers' => [
                    'Authorization' => "Bearer $token",
                    'Content-Type'  => 'application/json',
                ],
                'body'    => json_encode(['role' => 'reader', 'type' => 'anyone']),
                'timeout' => 15,
            ]
        );
    }

    private function getAccessToken(): string {
        if ($this->accessToken && time() < $this->tokenExpires - 60) {
            return $this->accessToken;
        }
        $now    = time();
        $claim  = base64_encode(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $payload = base64_encode(json_encode([
            'iss'   => $this->creds['client_email'],
            'scope' => 'https://www.googleapis.com/auth/drive',
            'aud'   => 'https://oauth2.googleapis.com/token',
            'iat'   => $now,
            'exp'   => $now + 3600,
        ]));
        $claim   = strtr($claim, '+/', '-_');
        $payload = strtr($payload, '+/', '-_');

        $privateKey = $this->creds['private_key'];
        openssl_sign("$claim.$payload", $sig, $privateKey, OPENSSL_ALGO_SHA256);
        $sigB64 = strtr(base64_encode($sig), '+/', '-_');
        $jwt    = "$claim.$payload.$sigB64";

        $response = wp_remote_post('https://oauth2.googleapis.com/token', [
            'body' => [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion'  => $jwt,
            ],
            'timeout' => 15,
        ]);
        $this->assertOk($response, 'GDrive token');
        $data = json_decode(wp_remote_retrieve_body($response), true);

        $this->accessToken  = $data['access_token'];
        $this->tokenExpires = $now + ($data['expires_in'] ?? 3600);
        return $this->accessToken;
    }

    private function assertOk(mixed $response, string $ctx): void {
        if (is_wp_error($response)) throw new \RuntimeException("$ctx: " . $response->get_error_message());
        $code = wp_remote_retrieve_response_code($response);
        if ($code < 200 || $code >= 300) throw new \RuntimeException("$ctx HTTP $code: " . wp_remote_retrieve_body($response));
    }
}
