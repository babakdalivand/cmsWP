<?php

namespace CMM\Http;

class AwsSignatureV4 {
    public function __construct(
        private readonly string $accessKey,
        private readonly string $secretKey,
        private readonly string $region,
        private readonly string $service = 's3'
    ) {}

    public function sign(string $method, string $url, array $headers = [], string $payload = ''): array {
        $parsed    = parse_url($url);
        $host      = $parsed['host'];
        $path      = $parsed['path'] ?? '/';
        $query     = $parsed['query'] ?? '';
        $amzDate   = gmdate('Ymd\THis\Z');
        $dateStamp = gmdate('Ymd');

        $headers = array_merge($headers, [
            'host'            => $host,
            'x-amz-date'      => $amzDate,
            'x-amz-content-sha256' => hash('sha256', $payload),
        ]);

        ksort($headers);
        $canonicalHeaders = '';
        $signedHeaderKeys  = [];
        foreach ($headers as $k => $v) {
            $k                  = strtolower($k);
            $canonicalHeaders   .= $k . ':' . trim($v) . "\n";
            $signedHeaderKeys[]  = $k;
        }
        $signedHeaders = implode(';', $signedHeaderKeys);

        $canonicalRequest = implode("\n", [
            strtoupper($method),
            $path,
            $query,
            $canonicalHeaders,
            $signedHeaders,
            hash('sha256', $payload),
        ]);

        $credentialScope = "$dateStamp/$this->region/$this->service/aws4_request";
        $stringToSign    = implode("\n", [
            'AWS4-HMAC-SHA256',
            $amzDate,
            $credentialScope,
            hash('sha256', $canonicalRequest),
        ]);

        $signingKey = $this->getSigningKey($dateStamp);
        $signature  = hash_hmac('sha256', $stringToSign, $signingKey);

        $headers['Authorization'] = sprintf(
            'AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s',
            $this->accessKey, $credentialScope, $signedHeaders, $signature
        );

        return $headers;
    }

    public function presign(string $url, int $expiresIn = 3600): string {
        $parsed    = parse_url($url);
        $host      = $parsed['host'];
        $path      = $parsed['path'] ?? '/';
        $dateStamp = gmdate('Ymd');
        $amzDate   = gmdate('Ymd\THis\Z');
        $credScope = "$dateStamp/$this->region/$this->service/aws4_request";

        $queryParams = [
            'X-Amz-Algorithm'     => 'AWS4-HMAC-SHA256',
            'X-Amz-Credential'    => $this->accessKey . '/' . $credScope,
            'X-Amz-Date'          => $amzDate,
            'X-Amz-Expires'       => (string) $expiresIn,
            'X-Amz-SignedHeaders' => 'host',
        ];
        ksort($queryParams);
        $queryString = http_build_query($queryParams);

        $canonicalRequest = implode("\n", [
            'GET', $path, $queryString,
            "host:$host\n", 'host',
            'UNSIGNED-PAYLOAD',
        ]);
        $stringToSign = implode("\n", [
            'AWS4-HMAC-SHA256', $amzDate, $credScope, hash('sha256', $canonicalRequest),
        ]);

        $sig = hash_hmac('sha256', $stringToSign, $this->getSigningKey($dateStamp));
        return "$url?$queryString&X-Amz-Signature=$sig";
    }

    private function getSigningKey(string $dateStamp): string {
        $kDate    = hash_hmac('sha256', $dateStamp,         'AWS4' . $this->secretKey, true);
        $kRegion  = hash_hmac('sha256', $this->region,      $kDate,    true);
        $kService = hash_hmac('sha256', $this->service,     $kRegion,  true);
        return      hash_hmac('sha256', 'aws4_request',     $kService, true);
    }
}
