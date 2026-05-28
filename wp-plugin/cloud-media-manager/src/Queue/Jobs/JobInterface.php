<?php

namespace CMM\Queue\Jobs;

interface JobInterface {
    public function handle(): void;
    public function maxAttempts(): int;
    public function retryDelay(int $attempt): int;
}
