"""
Deploy cloud-media-manager plugin to production server via SFTP.
Usage:
    pip install paramiko
    python deploy/deploy_plugin.py
"""

import paramiko
import sys
import io
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# ── Server config ──────────────────────────────────────────────────────────────
HOST      = '82.198.229.155'
PORT      = 65002
USER      = 'u775839017'
PASSWORD  = '68120378994Sara@'
REMOTE    = '/home/u775839017/domains/persianatheists.com/public_html/wp-content/plugins/cloud-media-manager'

# ── Local plugin root ──────────────────────────────────────────────────────────
PLUGIN_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Files/dirs to skip when deploying
SKIP_DIRS  = {'vendor', 'node_modules', 'tests', '.git', 'deploy', '__pycache__'}
SKIP_FILES = {'.distignore', '.gitignore', 'phpunit.xml', '.phpunit.result.cache', 'deploy_plugin.py'}


def collect_files(root: str) -> list[tuple[str, str]]:
    """Return list of (local_path, relative_path) pairs to deploy."""
    result = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune skip dirs in-place
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        rel_dir = os.path.relpath(dirpath, root).replace('\\', '/')
        if rel_dir == '.':
            rel_dir = ''
        for filename in filenames:
            if filename in SKIP_FILES:
                continue
            local  = os.path.join(dirpath, filename)
            remote = (rel_dir + '/' + filename).lstrip('/')
            result.append((local, remote))
    return result


def ensure_remote_dirs(sftp: paramiko.SFTPClient, dirs: set[str]) -> None:
    for d in sorted(dirs):
        parts = d.split('/')
        path  = REMOTE
        for part in parts:
            path = path + '/' + part
            try:
                sftp.stat(path)
            except FileNotFoundError:
                sftp.mkdir(path)
                print(f'  mkdir {path}')


def main():
    files = collect_files(PLUGIN_ROOT)
    print(f'Files to deploy: {len(files)}')

    # Collect remote dirs needed
    remote_dirs: set[str] = set()
    for _, rel in files:
        parent = '/'.join(rel.split('/')[:-1])
        if parent:
            remote_dirs.add(parent)

    print(f'Connecting to {HOST}:{PORT} …')
    transport = paramiko.Transport((HOST, PORT))
    transport.connect(username=USER, password=PASSWORD)
    sftp = paramiko.SFTPClient.from_transport(transport)

    # Ensure remote plugin root exists
    try:
        sftp.stat(REMOTE)
    except FileNotFoundError:
        sftp.mkdir(REMOTE)
        print(f'Created {REMOTE}')

    ensure_remote_dirs(sftp, remote_dirs)

    errors = []
    for i, (local, rel) in enumerate(files, 1):
        remote_path = REMOTE + '/' + rel
        try:
            sftp.put(local, remote_path)
            print(f'[{i}/{len(files)}] {rel}')
        except Exception as e:
            errors.append((rel, str(e)))
            print(f'  ERROR: {rel} — {e}')

    sftp.close()
    transport.close()

    if errors:
        print(f'\nDeployment finished with {len(errors)} error(s):')
        for rel, err in errors:
            print(f'  {rel}: {err}')
        sys.exit(1)
    else:
        print(f'\nDone! {len(files)} files deployed.')


if __name__ == '__main__':
    main()
