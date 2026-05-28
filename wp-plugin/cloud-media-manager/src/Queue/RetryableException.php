<?php

namespace CMM\Queue;

class RetryableException extends \RuntimeException {
    public function __construct(
        string $message,
        private readonly int $retryDelay = 60
    ) {
        parent::__construct($message);
    }

    public function getRetryDelay(): int {
        return $this->retryDelay;
    }
}
