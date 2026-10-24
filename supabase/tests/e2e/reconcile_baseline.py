"""Build the full source-based YOUMBIA QA schema in a fresh local PostgreSQL DB.

This is a schema bootstrap, not a certified replay of production migration history.
It never links to or accepts a non-loopback database URL and never writes migration
history rows. Personal/admin SQL from the Web tree is explicitly excluded.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time
from typing import Optional
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[3]
E2E = Path(__file__).resolve().parent
WEB_REF = 'c0de54189ad9cb6a6968e186e387731a4a759f7d'
MARKETING_SOURCE_COMMIT = 'f39fbf4765352c7ce279e543ac814bff7fd60b2f'
ENUM_FIX_VERSION = '2026_04_28_reports_status_align_open_reviewed_action_taken_dismissed.sql'
ENUM_FIX_SHA256 = 'f65985464a6a6d26400c34820090e7a12fd92bbcae554b5082b18b2fd074c759'
EXCLUDED_WEB = {
    '2026_03_02_delete_user_admin_vendora_cm.sql',
    '2026_03_02_grant_admin_tommy.sql',
}
PUSH_VERSIONS = {
    '20261023200527_transactional_push_outbox.sql',
    '20261023202544_conversation_identity_security.sql',
    '20261023205854_explicit_push_token_grants.sql',
}
MARKETING_PROVENANCE = E2E / 'provenance/20261019000100_mobile_marketing_consent_prompt.sql'
MARKETING_SHA256 = '272606a51e048b5bb952689e7c248b58264e92df4826a7f4ed06fdf5071d809e'


def run_psql(db_url: str, content: bytes, label: str, tmp_path: Optional[Path] = None) -> None:
    try:
        if tmp_path is None:
            result = subprocess.run(
                ['psql', db_url, '-X', '-q', '-v', 'ON_ERROR_STOP=1'],
                input=content, capture_output=True, check=False,
            )
        else:
            tmp_path.write_bytes(content)
            result = subprocess.run(
                ['psql', db_url, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', str(tmp_path)],
                capture_output=True, check=False,
            )
    except FileNotFoundError as error:
        raise SystemExit('psql is required and must be on PATH') from error
    if result.returncode:
        stderr = result.stderr.decode('utf-8', 'replace').splitlines()
        raise SystemExit(f'FAIL {label}\n' + '\n'.join(stderr[-24:]))
    print(f'PASS {label}', flush=True)


def git_bytes(repo: Path, ref_path: str) -> bytes:
    return subprocess.check_output(['git', 'show', f'{WEB_REF}:{ref_path}'], cwd=repo)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web-root', type=Path, required=True)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument('--db-url', help='Local Supabase PostgreSQL URL; loopback only')
    target.add_argument('--credentials', type=Path,
                        help='Private JSON output from supabase status -o json; API/DB endpoints are strictly checked')
    parser.add_argument(
        '--manifest-out', type=Path, required=True,
        help='Write source hashes and local corrections to this local evidence file',
    )
    args = parser.parse_args()
    if args.manifest_out.exists():
        raise SystemExit('STOP: manifest output already exists; choose a new path rather than overwriting evidence')
    web_root = args.web_root.resolve()
    if args.credentials:
        try:
            credentials = json.loads(args.credentials.read_text())
            if credentials.get('API_URL') != 'http://127.0.0.1:55421':
                raise SystemExit('STOP: credentials API_URL must be the fixed local QA API 127.0.0.1:55421')
            args.db_url = credentials['DB_URL']
        except (OSError, ValueError, KeyError) as error:
            raise SystemExit(f'STOP: could not read local Supabase credentials file: {error}') from error
    parsed = urlparse(args.db_url)
    if parsed.scheme not in {'postgres', 'postgresql'} or parsed.hostname not in {'127.0.0.1', 'localhost', '::1'}:
        raise SystemExit('STOP: --db-url must target a loopback-only PostgreSQL endpoint')
    if args.credentials and (parsed.hostname != '127.0.0.1' or parsed.port != 55422):
        raise SystemExit('STOP: credentials DB_URL must target the fixed local QA database 127.0.0.1:55422')
    if subprocess.check_output(['git', 'rev-parse', WEB_REF], cwd=web_root, text=True).strip() != WEB_REF:
        raise SystemExit('STOP: pinned Web commit is unavailable in this checkout')
    if subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=web_root, text=True).strip() != WEB_REF:
        raise SystemExit('STOP: Web checkout HEAD must equal the pinned reference commit')

    preflight = [
        'psql', args.db_url, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c',
        "select current_setting('server_version_num')::int / 10000, "
        "to_regclass('public.profiles') is null and to_regclass('public.listings') is null, "
        "to_regprocedure('auth.jwt()') is not null",
    ]
    ready_deadline = time.monotonic() + 60
    while True:
        try:
            check = subprocess.check_output(preflight, text=True, stderr=subprocess.DEVNULL).strip()
        except subprocess.CalledProcessError:
            check = ''
        if check == '17|t|t':
            break
        if check.startswith('17|f|'):
            raise SystemExit('STOP: expected a fresh local PostgreSQL database with no YOUMBIA baseline tables')
        if time.monotonic() >= ready_deadline:
            raise SystemExit('STOP: local PostgreSQL/Auth did not become ready with auth.jwt() within 60 seconds')
        time.sleep(1)

    records: list[dict[str, str]] = []
    for rel in ('supabase/schema.sql', 'supabase/rls.sql'):
        body = git_bytes(web_root, rel)
        run_psql(args.db_url, body, f'WEB {rel}')
        records.append({'source': f'youmbia@{WEB_REF}:{rel}', 'sha256': hashlib.sha256(body).hexdigest()})

    migration_paths = subprocess.check_output(
        ['git', 'ls-tree', '-r', '--name-only', WEB_REF, 'supabase/migrations'],
        cwd=web_root, text=True,
    ).splitlines()
    if len(migration_paths) != 39:
        raise SystemExit(f'STOP: expected all 39 pinned Web migrations, found {len(migration_paths)}')

    with tempfile.TemporaryDirectory(prefix='ymb-baseline-') as temp:
        corrected = Path(temp) / 'web-reports-status.sql'
        for rel in migration_paths:
            name = Path(rel).name
            if name in EXCLUDED_WEB:
                print(f'SKIP PERSONAL/ADMIN {rel}', flush=True)
                continue
            body = git_bytes(web_root, rel)
            if name == ENUM_FIX_VERSION:
                if hashlib.sha256(body).hexdigest() != ENUM_FIX_SHA256:
                    raise SystemExit('STOP: Web enum migration content changed; review local cast correction')
                source = body.decode('utf-8')
                replacements = (
                    (
                        "when status::text in ('open', 'reviewed', 'action_taken', 'dismissed') then status::text",
                        "when status::text in ('open', 'reviewed', 'action_taken', 'dismissed') then status::text::public.report_status",
                    ),
                    (
                        "then 'open'\n  when status::text in ('accepted') then 'action_taken'\n"
                        "  when status::text in ('rejected', 'closed') then 'dismissed'\n  else 'open'",
                        "then 'open'::public.report_status\n  when status::text in ('accepted') then 'action_taken'::public.report_status\n"
                        "  when status::text in ('rejected', 'closed') then 'dismissed'::public.report_status\n"
                        "  else 'open'::public.report_status",
                    ),
                )
                for before, after in replacements:
                    if source.count(before) != 1:
                        raise SystemExit('STOP: expected one exact enum CASE pattern; inspect source before correcting')
                    source = source.replace(before, after)
                if any(source.count(after) != 1 for _, after in replacements):
                    raise SystemExit('STOP: enum cast correction postcondition failed')
                body = source.encode('utf-8')
                run_psql(args.db_url, body, f'WEB local enum cast correction {name}', corrected)
                records.append({
                    'source': f'youmbia@{WEB_REF}:{rel}',
                    'sha256': hashlib.sha256(git_bytes(web_root, rel)).hexdigest(),
                    'local_correction': 'cast CASE results to public.report_status; source hash preserved above',
                })
            else:
                run_psql(args.db_url, body, f'WEB {name}')
                records.append({'source': f'youmbia@{WEB_REF}:{rel}', 'sha256': hashlib.sha256(body).hexdigest()})

    for name in ('observed-grants.sql', 'observed-columns.sql'):
        body = (E2E / name).read_bytes()
        run_psql(args.db_url, body, f'CATALOG COMPLEMENT {name}')
        records.append({'source': name, 'sha256': hashlib.sha256(body).hexdigest()})

    if hashlib.sha256(MARKETING_PROVENANCE.read_bytes()).hexdigest() != MARKETING_SHA256:
        raise SystemExit('STOP: sourced marketing-consent SQL hash changed')
    mobile = sorted((ROOT / 'supabase/migrations').glob('*.sql'))
    if len(mobile) != 33:
        raise SystemExit(f'STOP: expected 33 mobile migrations, found {len(mobile)}')
    timeline = [(p.name, p, p.read_bytes()) for p in mobile]
    timeline.append((
        '20261019000100_mobile_marketing_consent_prompt.sql',
        MARKETING_PROVENANCE,
        MARKETING_PROVENANCE.read_bytes(),
    ))
    for name, path, body in sorted(timeline, key=lambda row: row[0]):
        run_psql(args.db_url, body, f'MOBILE/PROVENANCE {name}')
        source = f'youmbia-mobile@{MARKETING_SOURCE_COMMIT}:{name}' if path == MARKETING_PROVENANCE else name
        records.append({'source': source, 'sha256': hashlib.sha256(body).hexdigest()})

    network_safety = (E2E / 'qa-network-safety.sql').read_bytes()
    run_psql(args.db_url, network_safety, 'QA disable cron and assert empty Vault/pg_net')
    records.append({'source': 'YOUMBIA QA complement: disable cron and block network targets',
                    'sha256': hashlib.sha256(network_safety).hexdigest()})

    shop_grants = (E2E / 'qa-shops-grants.sql').read_bytes()
    run_psql(args.db_url, shop_grants, 'QA least-privilege shops grants')
    records.append({'source': 'YOUMBIA QA complement: least-privilege shops grants',
                    'sha256': hashlib.sha256(shop_grants).hexdigest()})

    args.manifest_out.parent.mkdir(parents=True, exist_ok=True)
    args.manifest_out.write_text(json.dumps(records, indent=2) + '\n')
    print(f'PASS full source-based baseline; source manifest: {args.manifest_out}; no migration registry rows or seed/data written', flush=True)


if __name__ == '__main__':
    main()
