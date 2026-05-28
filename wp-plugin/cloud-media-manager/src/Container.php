<?php

namespace CMM;

class Container {
    private array $bindings  = [];
    private array $instances = [];

    public function bind(string $abstract, callable $factory): void {
        $this->bindings[$abstract] = $factory;
    }

    public function singleton(string $abstract, callable $factory): void {
        $this->bindings[$abstract] = function () use ($abstract, $factory) {
            if (!isset($this->instances[$abstract])) {
                $this->instances[$abstract] = $factory($this);
            }
            return $this->instances[$abstract];
        };
    }

    public function make(string $abstract): mixed {
        if (isset($this->bindings[$abstract])) {
            return ($this->bindings[$abstract])($this);
        }
        return new $abstract();
    }
}
