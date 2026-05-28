"""
deploy.py — SFTP deploy script for bot.persianatheists.com
Usage:
  python deploy.py server          # upload server patch files only
  python deploy.py client          # build + upload React frontend only
  python deploy.py all             # build client + upload everything
  python deploy.py restart         # restart server only
"""
import sys, os, subprocess
sys.stdout.reconfigure(encoding='utf-8')
import paramiko

HOST     = '82.198.229.155'
PORT     = 65002
USER     = 'u775839017'
PASS     = '68120378994Sara@'
NODEJS   = f'/home/{USER}/domains/app.persianatheists.com/nodejs'
FRONTEND = f'{NODEJS}/client/dist'

# Map local file -> remote file for server-side patches (TypeScript compiled files)
SERVER_FILES = {
    'server/dist/ai/aiController.js':           f'{NODEJS}/server/dist/ai/aiController.js',
    'server/dist/ai/aiRouter.js':               f'{NODEJS}/server/dist/ai/aiRouter.js',
    'server/dist/ai/encryption.js':             f'{NODEJS}/server/dist/ai/encryption.js',
    'server/dist/storage/storageController.js': f'{NODEJS}/server/dist/storage/storageController.js',
    'server/dist/routes/index.js':              f'{NODEJS}/server/dist/routes/index.js',
}

def connect():
    t = paramiko.Transport((HOST, PORT))
    t.connect(username=USER, password=PASS)
    return t, paramiko.SFTPClient.from_transport(t)

def ensure_remote_dir(sftp, path):
    try: sftp.stat(path)
    except FileNotFoundError: sftp.mkdir(path)

def upload_server():
    t, sftp = connect()
    ensure_remote_dir(sftp, f'{NODEJS}/server/dist/storage')
    for local, remote in SERVER_FILES.items():
        sftp.put(local, remote)
        print(f'  ✓ {os.path.basename(local)}')
    sftp.close(); t.close()

def build_client():
    print('Building React frontend...')
    npm = 'npm.cmd' if sys.platform == 'win32' else 'npm'
    r = subprocess.run([npm, 'run', 'build'], cwd='client', capture_output=True, text=True)
    if r.returncode != 0:
        print('Build FAILED:', r.stderr[-500:])
        sys.exit(1)
    print('  ✓ Build complete')

def upload_client():
    local_dist = os.path.join('client', 'dist')
    t, sftp = connect()
    def ensure(path):
        try: sftp.stat(path)
        except FileNotFoundError: sftp.mkdir(path)
    def upload_dir(ldir, rdir):
        ensure(rdir)
        for item in os.listdir(ldir):
            lp, rp = os.path.join(ldir, item), rdir + '/' + item
            if os.path.isfile(lp):
                sftp.put(lp, rp)
                print(f'  ✓ {item}')
            elif os.path.isdir(lp):
                upload_dir(lp, rp)
    upload_dir(local_dist, FRONTEND)
    sftp.close(); t.close()

def restart_server():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASS)
    client.exec_command(f'touch {NODEJS}/tmp/restart.txt 2>/dev/null || true')
    client.close()
    print('  ✓ Restart triggered')

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if mode in ('server', 'all'):
        print('Uploading server files...')
        upload_server()
    if mode in ('client', 'all'):
        build_client()
        print('Uploading frontend...')
        upload_client()
    if mode in ('server', 'all', 'restart'):
        print('Restarting server...')
        restart_server()
    print('\nDone.')
