<?php

namespace CMM;

use CMM\Database\Schema;
use CMM\Security\JwtAuthenticator;
use CMM\Security\CredentialEncryptor;
use CMM\Http\AwsSignatureV4;
use CMM\Repository\ProviderRepository;
use CMM\Repository\FileRepository;
use CMM\Repository\LogRepository;
use CMM\Services\StorageService;
use CMM\Services\CmsWPClientService;
use CMM\Queue\Queue;
use CMM\Queue\Worker;
use CMM\Api\RestRegistrar;
use CMM\Admin\AdminRegistrar;
use CMM\Admin\Ajax\AjaxRegistrar;
use CMM\Cron\CronRegistrar;
use CMM\Cron\CronRunner;

class Plugin {
    private Container $container;

    public function __construct() {
        $this->container = new Container();
        $this->register();
    }

    private function register(): void {
        $c = $this->container;

        $c->singleton(CredentialEncryptor::class, function () {
            $salt = defined('AUTH_SALT') ? AUTH_SALT : wp_generate_uuid4();
            $key  = substr(hash('sha256', $salt . get_site_url(), true), 0, 32);
            return new CredentialEncryptor($key);
        });

        $c->singleton(ProviderRepository::class, fn() => new ProviderRepository());
        $c->singleton(FileRepository::class,     fn() => new FileRepository());
        $c->singleton(LogRepository::class,      fn() => new LogRepository());

        $c->singleton(StorageService::class, fn($c) => new StorageService(
            $c->make(ProviderRepository::class),
            $c->make(FileRepository::class),
            $c->make(LogRepository::class),
            $c->make(CredentialEncryptor::class)
        ));

        $c->singleton(CmsWPClientService::class, fn() => new CmsWPClientService());

        $c->singleton(Queue::class, fn() => new Queue());
        $c->singleton(Worker::class, fn($c) => new Worker(
            $c->make(Queue::class),
            $c->make(StorageService::class)
        ));

        $c->singleton(JwtAuthenticator::class, fn() => new JwtAuthenticator());
        $c->singleton(RestRegistrar::class,    fn($c) => new RestRegistrar($c->make(StorageService::class)));
        $c->singleton(AdminRegistrar::class,   fn($c) => new AdminRegistrar($c));
        $c->singleton(AjaxRegistrar::class,    fn($c) => new AjaxRegistrar($c));
        $c->singleton(CronRegistrar::class,    fn() => new CronRegistrar());
        $c->singleton(CronRunner::class,       fn($c) => new CronRunner(
            $c->make(Worker::class),
            $c->make(ProviderRepository::class)
        ));
    }

    public function boot(): void {
        $this->loadIncludes();

        $this->container->make(JwtAuthenticator::class)->register();
        $this->container->make(RestRegistrar::class)->register();
        $this->container->make(AdminRegistrar::class)->register();
        $this->container->make(AjaxRegistrar::class)->register();
        $this->container->make(CronRegistrar::class)->register();
        $this->container->make(CronRunner::class)->register();

        if (is_multisite()) {
            $this->bootMultisite();
        }

        if (defined('WP_CLI') && WP_CLI) {
            $this->bootCli();
        }

        add_filter('wp_handle_upload', [$this, 'handleUpload'], 10, 2);
        add_action('delete_attachment',  [$this, 'handleDelete']);
    }

    private function loadIncludes(): void {
        // database/ directory is outside src/
        foreach (glob(CMM_DIR . 'database/*.php') ?: [] as $file) {
            require_once $file;
        }

        $dirs = [
            'Security', 'Http', 'Adapters',
            'Repository', 'Services', 'Api', 'Api/Endpoints',
            'Admin', 'Admin/Ajax', 'Queue', 'Queue/Jobs',
            'Cron', 'Cli/Commands', 'Multisite',
        ];
        foreach ($dirs as $dir) {
            foreach (glob(CMM_DIR . "src/$dir/*.php") ?: [] as $file) {
                require_once $file;
            }
        }
    }

    private function bootMultisite(): void {
        require_once CMM_DIR . 'src/Multisite/NetworkAdmin.php';
        $this->container->make(\CMM\Multisite\NetworkAdmin::class)->register();
    }

    private function bootCli(): void {
        \WP_CLI::add_command('cmm migrate',  \CMM\Cli\Commands\MigrateCommand::class);
        \WP_CLI::add_command('cmm queue',    \CMM\Cli\Commands\QueueCommand::class);
        \WP_CLI::add_command('cmm logs',     \CMM\Cli\Commands\LogsCommand::class);
        \WP_CLI::add_command('cmm network',  \CMM\Cli\Commands\NetworkCommand::class);
    }

    public function handleUpload(array $upload, string $context): array {
        if ($context !== 'upload') return $upload;
        $settings = get_option('cmm_settings', []);
        if (empty($settings['auto_upload'])) return $upload;

        $queue = $this->container->make(Queue::class);
        $queue->dispatch(\CMM\Queue\Jobs\UploadJob::class, [
            'file_path' => $upload['file'],
            'file_url'  => $upload['url'],
            'mime_type' => $upload['type'],
        ]);
        return $upload;
    }

    public function handleDelete(int $postId): void {
        $fileRepo = $this->container->make(FileRepository::class);
        $record   = $fileRepo->findByPostId($postId);
        if (!$record) return;

        $storage = $this->container->make(StorageService::class);
        try {
            $storage->deleteFile($record->remote_key, $record->provider_id);
        } catch (\Throwable) {
        }
        $fileRepo->deleteByPostId($postId);
    }

    public function activate(): void {
        $this->loadIncludes();
        Schema::install();
        $this->container->make(CronRegistrar::class)->scheduleAll();
    }

    public function deactivate(): void {
        $this->container->make(CronRegistrar::class)->unscheduleAll();
    }

    public function getContainer(): Container {
        return $this->container;
    }
}
