#!/usr/bin/env python3
"""Fail-closed runner for the pinned YOUMBIA QA Supabase bootstrap.

Default mode verifies the immutable 77-entry manifest and source bytes without
opening a database connection. Remote writes require --apply, a QA-only direct
Postgres URL, a QA Management API token, TLS verify-full, and a confirmed project
identity. This runner is not a general-purpose Supabase migration tool.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from typing import Any, Callable, Iterable, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlsplit
from urllib.request import Request, urlopen
import uuid


ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "docs/push/qa-deployment-manifest-925eb312.json"
EXPECTED_MANIFEST_SHA256 = "d8675dfd03f6dea2986c6c49f8574ec14741a533afcc8a7bdc4822d88f04bb7c"
EXPECTED_BRANCH = "feat/ymb-transactional-push-p0-p1"
PINNED_MOBILE_COMMIT = "925eb312ad46b40e6ee541bdabb03f92052087cd"
PINNED_WEB_COMMIT = "c0de54189ad9cb6a6968e186e387731a4a759f7d"
QA_PROJECT_REF = "wagvrytcguutgbjzhvak"
PROD_PROJECT_REF = "ainzxommczlyjhymuwgu"
QA_PROJECT_NAME = "YOUMBIA-PUSH-QA"
QA_ORGANIZATION_SLUG = "youmbia-push-qa"
QA_REGION = "eu-west-1"
QA_DB_HOST = f"db.{QA_PROJECT_REF}.supabase.co"
QA_API_URL = f"https://{QA_PROJECT_REF}.supabase.co"
ENUM_MIGRATION = "2026_04_28_reports_status_align_open_reviewed_action_taken_dismissed.sql"
ENUM_SOURCE_SHA256 = "f65985464a6a6d26400c34820090e7a12fd92bbcae554b5082b18b2fd074c759"
ENUM_PATCHES: tuple[tuple[str, str], ...] = (
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
PUSH_MIGRATIONS = (
    "20261023200527_transactional_push_outbox.sql",
    "20261023202544_conversation_identity_security.sql",
    "20261023205854_explicit_push_token_grants.sql",
)
ADVISORY_LOCK_A = 0x594F554D  # "YOUM"
ADVISORY_LOCK_B = 0x42494151  # "BIAQ"
NETWORK_SQL_ALLOWLIST = {
    "20260908250000_saved_search_alerts_v1.sql",
    "20261017150000_lifecycle_email_p0.sql",
}
NON_TRANSACTIONAL_PATTERNS = (
    re.compile(r"(?im)^\s*(?:create\s+(?:unique\s+)?index|reindex\s+index)\s+concurrently\b"),
    re.compile(r"(?im)^\s*(?:vacuum|create\s+database|alter\s+system)\b"),
    re.compile(r"(?im)^\s*\\(?:connect|copy|include|i|!|gexec)\b"),
)
DIRECT_NETWORK_PATTERN = re.compile(r"(?i)\bnet\.http_[a-z_]+\s*\(")
TRANSACTION_LINE_PATTERN = re.compile(r"(?im)^\s*(begin|commit|rollback)(?:\s+(?:work|transaction))?\s*;\s*(?:--.*)?$")


class RunnerError(RuntimeError):
    """Safe-to-display error. Never include connection strings or SQL output."""


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _git_bytes(repo: Path, revision: str, relative_path: str) -> bytes:
    if Path(relative_path).is_absolute() or ".." in Path(relative_path).parts:
        raise RunnerError("source path escapes the pinned repository")
    try:
        return subprocess.check_output(
            ["git", "-C", str(repo), "show", f"{revision}:{relative_path}"],
            stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise RunnerError("a pinned source file is unavailable") from exc


def _git_commit(repo: Path, revision: str) -> str:
    try:
        value = subprocess.check_output(
            ["git", "-C", str(repo), "rev-parse", f"{revision}^{{commit}}"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        raise RunnerError("the pinned Web source commit is unavailable") from exc
    return value


@dataclasses.dataclass(frozen=True)
class Migration:
    order: int
    phase: str
    path: str
    source_sha256: str
    applied_sha256: str
    sql: bytes = dataclasses.field(repr=False, compare=False)
    correction: str | None = None

    @property
    def name(self) -> str:
        return Path(self.path).name


@dataclasses.dataclass(frozen=True)
class Manifest:
    digest: str
    entries: tuple[Migration, ...]


def resolve_source(entry: dict[str, Any], web_repo: Path) -> bytes:
    """Read source at its pinned object, never from mutable Web worktree files."""
    phase = entry["phase"]
    rel = entry["path"]
    name = Path(rel).name
    if phase in {"web-foundation-schema", "web-foundation-rls", "web-migrations"}:
        return _git_bytes(web_repo, PINNED_WEB_COMMIT, rel)
    if phase == "mobile-migrations":
        return _git_bytes(ROOT, PINNED_MOBILE_COMMIT, f"supabase/migrations/{name}")
    if phase == "recovered-web-migration":
        return _git_bytes(ROOT, PINNED_MOBILE_COMMIT, f"supabase/tests/e2e/provenance/{name}")
    if phase == "catalog-complements":
        return _git_bytes(ROOT, PINNED_MOBILE_COMMIT, f"supabase/tests/e2e/{name}")
    if phase == "qa-network-safety":
        return _git_bytes(ROOT, PINNED_MOBILE_COMMIT, "supabase/tests/e2e/qa-network-safety.sql")
    if phase == "qa-shops-acl":
        return _git_bytes(ROOT, PINNED_MOBILE_COMMIT, "supabase/tests/e2e/qa-shops-grants.sql")
    raise RunnerError(f"unknown manifest source phase at entry {entry.get('order')}")


def patch_enum_source(source: bytes, migration_name: str, source_hash: str) -> tuple[bytes, str | None]:
    if migration_name != ENUM_MIGRATION:
        return source, None
    if source_hash != ENUM_SOURCE_SHA256:
        raise RunnerError("entry 35 is not the approved pinned enum migration")
    try:
        text = source.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RunnerError("entry 35 is not UTF-8 SQL") from exc
    for before, after in ENUM_PATCHES:
        if text.count(before) != 1:
            raise RunnerError("entry 35 no longer matches the qualified enum correction")
        text = text.replace(before, after)
        if text.count(after) != 1:
            raise RunnerError("entry 35 enum correction postcondition failed")
    return text.encode("utf-8"), "cast CASE branches to public.report_status"


def _check_sql_safety(migration: Migration) -> None:
    text = migration.sql.decode("utf-8", errors="strict")
    for pattern in NON_TRANSACTIONAL_PATTERNS:
        if pattern.search(text):
            raise RunnerError(f"entry {migration.order} contains a non-transactional or psql-only command")
    if DIRECT_NETWORK_PATTERN.search(text):
        if migration.name not in NETWORK_SQL_ALLOWLIST:
            raise RunnerError(f"entry {migration.order} contains a direct pg_net call outside the reviewed allowlist")
        if "functions_url IS NULL OR dispatch_secret IS NULL" not in text:
            raise RunnerError(f"entry {migration.order} network dispatcher lost its fail-closed Vault guard")
        for match in DIRECT_NETWORK_PATTERN.finditer(text):
            body_start = text.rfind("CREATE OR REPLACE FUNCTION", 0, match.start())
            if body_start < 0 or "vault.decrypted_secrets" not in text[body_start:match.start()]:
                raise RunnerError(f"entry {migration.order} has an unguarded pg_net call")
            if "RETURN;" not in text[body_start:match.start()]:
                raise RunnerError(f"entry {migration.order} network call lacks a fail-closed return")
    controls = [m.group(1).lower() for m in TRANSACTION_LINE_PATTERN.finditer(text)]
    if controls:
        if controls.count("begin") != 1 or controls.count("commit") != 1 or "rollback" in controls:
            raise RunnerError(f"entry {migration.order} has unsupported explicit transaction control")
        last_commit = max(m.end() for m in TRANSACTION_LINE_PATTERN.finditer(text) if m.group(1).lower() == "commit")
        trailing = text[last_commit:]
        if re.sub(r"(?s)(?:\s|--[^\n]*|/\*.*?\*/)*", "", trailing):
            raise RunnerError(f"entry {migration.order} has SQL after its explicit COMMIT")


def load_manifest(path: Path, web_repo: Path) -> Manifest:
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise RunnerError("deployment manifest is unavailable") from exc
    digest = sha256(raw)
    if digest != EXPECTED_MANIFEST_SHA256:
        raise RunnerError("deployment manifest digest differs from the pinned QA manifest")
    try:
        document = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RunnerError("deployment manifest is invalid JSON") from exc
    if document.get("target", {}).get("projectRef") != QA_PROJECT_REF:
        raise RunnerError("manifest target is not the fixed QA project")
    if document.get("productionGuard", {}).get("projectRef") != PROD_PROJECT_REF or document["productionGuard"].get("writable") is not False:
        raise RunnerError("manifest production guard is missing or inconsistent")
    q = document.get("qualification", {})
    if q.get("requestedHead") != PINNED_MOBILE_COMMIT or q.get("webCommit") != PINNED_WEB_COMMIT:
        raise RunnerError("manifest source commits differ from the pinned references")
    if _git_commit(web_repo, PINNED_WEB_COMMIT) != PINNED_WEB_COMMIT:
        raise RunnerError("Web repository does not contain the exact pinned commit")
    entries = document.get("entrySequence")
    if not isinstance(entries, list) or len(entries) != 77:
        raise RunnerError("manifest must contain exactly 77 ordered entries")
    orders = [entry.get("order") for entry in entries]
    paths = [entry.get("path") for entry in entries]
    if orders != list(range(1, 78)) or len(set(paths)) != 77:
        raise RunnerError("manifest order or source paths contain a gap or duplicate")
    if any(not re.fullmatch(r"[0-9a-f]{64}", entry.get("sha256", "")) for entry in entries):
        raise RunnerError("manifest contains an invalid SHA-256")
    push = [entry["path"] for entry in entries if entry.get("pushP0P1") is True]
    if tuple(push) != PUSH_MIGRATIONS or tuple(document.get("pushMigrations", [])) != PUSH_MIGRATIONS:
        raise RunnerError("Push migrations must occur exactly once at manifest positions 73–75")
    mobile_versions = [Path(entry["path"]).name.split("_", 1)[0] for entry in entries if entry.get("phase") == "mobile-migrations"]
    if len(mobile_versions) != 33 or len(set(mobile_versions)) != 33:
        raise RunnerError("mobile migration versions are missing or duplicated")

    resolved: list[Migration] = []
    for entry in entries:
        source = resolve_source(entry, web_repo)
        source_hash = sha256(source)
        if source_hash != entry["sha256"]:
            raise RunnerError(f"source hash mismatch at manifest entry {entry['order']}")
        applied, correction = patch_enum_source(source, Path(entry["path"]).name, source_hash)
        migration = Migration(
            order=entry["order"], phase=entry["phase"], path=entry["path"],
            source_sha256=source_hash, applied_sha256=sha256(applied), sql=applied,
            correction=correction,
        )
        _check_sql_safety(migration)
        resolved.append(migration)
    return Manifest(digest=digest, entries=tuple(resolved))


@dataclasses.dataclass(frozen=True)
class DatabaseTarget:
    host: str
    port: int
    database: str
    user: str
    password: str = dataclasses.field(repr=False)
    sslmode: str = "verify-full"
    sslrootcert: str | None = None

    def libpq_env(self) -> dict[str, str]:
        env = os.environ.copy()
        env.update({
            "PGHOST": self.host,
            "PGPORT": str(self.port),
            "PGDATABASE": self.database,
            "PGUSER": self.user,
            "PGPASSWORD": self.password,
            "PGSSLMODE": self.sslmode,
            "PGCONNECT_TIMEOUT": "10",
            "PGAPPNAME": "youmbia-qa-migration-runner",
        })
        if self.sslrootcert:
            env["PGSSLROOTCERT"] = self.sslrootcert
        return env


def parse_qa_database_url(value: str) -> DatabaseTarget:
    try:
        parsed = urlsplit(value)
        options = parse_qs(parsed.query, strict_parsing=True)
        port = parsed.port or 5432
        user = unquote(parsed.username or "")
        password = unquote(parsed.password or "")
    except (ValueError, UnicodeError) as exc:
        raise RunnerError("QA database URL is malformed") from exc
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise RunnerError("database URL must use PostgreSQL TLS")
    if parsed.hostname != QA_DB_HOST or parsed.hostname == f"db.{PROD_PROJECT_REF}.supabase.co":
        raise RunnerError("database host is not the fixed YOUMBIA QA endpoint")
    if port != 5432 or parsed.path != "/postgres" or user != "postgres" or not password:
        raise RunnerError("database URL must identify the QA postgres database user and database")
    if options.get("sslmode") != ["verify-full"]:
        raise RunnerError("database URL must require TLS certificate and hostname verification")
    if set(options) - {"sslmode"}:
        raise RunnerError("database URL contains unsupported connection options")
    if parsed.fragment:
        raise RunnerError("database URL fragments are not permitted")
    return DatabaseTarget(parsed.hostname, port, "postgres", user, password)


def validate_project_metadata(project: dict[str, Any], organizations: list[dict[str, Any]]) -> None:
    if project.get("id") != QA_PROJECT_REF or project.get("name") != QA_PROJECT_NAME:
        raise RunnerError("Supabase Management API returned an unexpected project identity")
    if project.get("region") != QA_REGION or project.get("status") != "ACTIVE_HEALTHY":
        raise RunnerError("Supabase QA project is not healthy in the expected region")
    org_id = project.get("organization_id")
    matches = [o for o in organizations if o.get("id") == org_id and o.get("slug") == QA_ORGANIZATION_SLUG]
    if len(matches) != 1:
        raise RunnerError("Supabase project is not in the dedicated YOUMBIA QA organization")


class ManagementApi:
    def __init__(self, token: str, opener: Callable[..., Any] = urlopen):
        if not token:
            raise RunnerError("SUPABASE_ACCESS_TOKEN is required for read-only project identity checks")
        self._token = token
        self._opener = opener

    def _get(self, url: str) -> Any:
        request = Request(url, headers={"Authorization": f"Bearer {self._token}", "Accept": "application/json"}, method="GET")
        try:
            with self._opener(request, timeout=10) as response:
                if response.status != 200:
                    raise RunnerError("Supabase Management API identity check failed")
                return json.loads(response.read())
        except (OSError, ValueError, HTTPError, URLError) as exc:
            raise RunnerError("Supabase Management API identity check failed") from exc

    def verify(self) -> None:
        project = self._get(f"https://api.supabase.com/v1/projects/{QA_PROJECT_REF}")
        organizations = self._get("https://api.supabase.com/v1/organizations")
        if not isinstance(organizations, list):
            raise RunnerError("Supabase organization identity response is invalid")
        validate_project_metadata(project, organizations)


class Database(Protocol):
    def query(self, sql: str) -> str: ...
    def execute(self, sql: str) -> None: ...
    def execute_sql(self, sql: bytes, transactional: bool = True) -> None: ...
    def schema_hash(self) -> str: ...
    def advisory_lock(self) -> Any: ...


class PsqlDatabase:
    def __init__(self, target: DatabaseTarget, psql: str = "psql", pg_dump: str = "pg_dump"):
        self.env = target.libpq_env()
        self.psql = psql
        self.pg_dump = pg_dump

    def _run(self, argv: list[str], *, input_text: str | None = None, file: str | None = None) -> str:
        try:
            result = subprocess.run(argv, input=input_text, text=True, capture_output=True, env=self.env, timeout=180)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RunnerError("PostgreSQL client failed or timed out") from exc
        if result.returncode:
            # Do not surface raw psql output; it may contain SQL values or secrets.
            raise RunnerError(f"PostgreSQL operation failed (exit {result.returncode})")
        return result.stdout.strip()

    def query(self, sql: str) -> str:
        return self._run([self.psql, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "--command", sql])

    def execute(self, sql: str) -> None:
        self._run([self.psql, "-X", "-q", "-v", "ON_ERROR_STOP=1", "--command", sql])

    def execute_sql(self, sql: bytes, transactional: bool = True) -> None:
        temp_name = None
        try:
            with tempfile.NamedTemporaryFile(prefix="youmbia-qa-step-", suffix=".sql", delete=False) as tmp:
                os.chmod(tmp.name, 0o600)
                tmp.write(sql)
                temp_name = tmp.name
            argv = [self.psql, "-X", "-q", "-v", "ON_ERROR_STOP=1"]
            if transactional:
                argv.append("--single-transaction")
            argv.extend(["--file", temp_name])
            self._run(argv)
        finally:
            if temp_name:
                try:
                    os.unlink(temp_name)
                except OSError:
                    pass

    def schema_hash(self) -> str:
        try:
            result = subprocess.run(
                [self.pg_dump, "--schema-only", "--no-owner", "--exclude-schema=qa_runner"],
                text=False, capture_output=True, env=self.env, timeout=180,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RunnerError("pg_dump schema fingerprint failed or timed out") from exc
        if result.returncode:
            raise RunnerError("pg_dump schema fingerprint failed")
        lines = [line for line in result.stdout.splitlines(keepends=True)
                 if not line.startswith((b"-- Dumped from database version", b"-- Dumped by pg_dump version",
                                        b"\\restrict ", b"\\unrestrict "))]
        return sha256(b"".join(lines))

    def advisory_lock(self) -> "AdvisoryLock":
        return AdvisoryLock(self.psql, self.env)


class AdvisoryLock:
    def __init__(self, psql: str, env: dict[str, str]):
        self.psql = psql
        self.env = env
        self.process: subprocess.Popen[str] | None = None

    def __enter__(self) -> "AdvisoryLock":
        try:
            self.process = subprocess.Popen(
                [self.psql, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], stdin=subprocess.PIPE,
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1, env=self.env,
            )
        except OSError as exc:
            raise RunnerError("could not open the PostgreSQL runner lock session") from exc
        assert self.process.stdin and self.process.stdout
        self.process.stdin.write(f"SELECT pg_try_advisory_lock({ADVISORY_LOCK_A}, {ADVISORY_LOCK_B});\n")
        self.process.stdin.write("\\echo QA_RUNNER_LOCK_RESULT\n")
        self.process.stdin.flush()
        lines = []
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            line = self.process.stdout.readline()
            if line == "":
                break
            line = line.strip()
            if line == "QA_RUNNER_LOCK_RESULT":
                break
            if line:
                lines.append(line)
        if "t" not in lines:
            self.__exit__(None, None, None)
            raise RunnerError("another QA migration runner holds the database lock")
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        if not self.process:
            return
        try:
            if self.process.stdin and self.process.poll() is None:
                self.process.stdin.write(f"SELECT pg_advisory_unlock({ADVISORY_LOCK_A}, {ADVISORY_LOCK_B});\n\\q\n")
                self.process.stdin.flush()
                self.process.stdin.close()
                self.process.wait(timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            self.process.kill()
            self.process.wait(timeout=5)
        finally:
            if self.process.stdout:
                self.process.stdout.close()
            if self.process.stderr:
                self.process.stderr.close()
            self.process = None


JOURNAL_DDL = f"""
CREATE SCHEMA IF NOT EXISTS qa_runner AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA qa_runner FROM PUBLIC;
DO $roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON SCHEMA qa_runner FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON SCHEMA qa_runner FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN REVOKE ALL ON SCHEMA qa_runner FROM service_role; END IF;
END
$roles$;
CREATE TABLE IF NOT EXISTS qa_runner.manifest_runs (
  manifest_sha256 text PRIMARY KEY CHECK (manifest_sha256 ~ '^[0-9a-f]{{64}}$'),
  target_ref text NOT NULL CHECK (target_ref = '{QA_PROJECT_REF}'),
  initial_schema_sha256 text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','complete','failed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS qa_runner.steps (
  manifest_sha256 text NOT NULL REFERENCES qa_runner.manifest_runs(manifest_sha256),
  step_order integer NOT NULL CHECK (step_order BETWEEN 1 AND 77),
  source_path text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{{64}}$'),
  applied_sha256 text NOT NULL CHECK (applied_sha256 ~ '^[0-9a-f]{{64}}$'),
  status text NOT NULL CHECK (status IN ('pending','started','applied','failed')),
  schema_before_sha256 text,
  schema_after_sha256 text,
  started_at timestamptz,
  finished_at timestamptz,
  error_class text,
  PRIMARY KEY (manifest_sha256, step_order)
);
REVOKE ALL ON ALL TABLES IN SCHEMA qa_runner FROM PUBLIC;
DO $roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON ALL TABLES IN SCHEMA qa_runner FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON ALL TABLES IN SCHEMA qa_runner FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN REVOKE ALL ON ALL TABLES IN SCHEMA qa_runner FROM service_role; END IF;
END
$roles$;
"""


INITIAL_PREFLIGHT_SQL = """
SELECT json_build_object(
  'database', current_database(),
  'user', current_user,
  'server_addr', inet_server_addr()::text,
  'server_port', inet_server_port(),
  'server_version_num', current_setting('server_version_num')::integer,
  'public_app_objects', (
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass
        AND d.objid=c.oid AND d.deptype='e')
  ),
  'public_app_functions', (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass
        AND d.objid=p.oid AND d.deptype='e')
  ),
  'journal_schema_exists', to_regnamespace('qa_runner') IS NOT NULL,
  'migration_log_exists', to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
)::text
"""


NETWORK_QUIET_SQL = """
DO $network_guard$
DECLARE n bigint;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM vault.decrypted_secrets' INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'QA_RUNNER_VAULT_NOT_EMPTY'; END IF;
  END IF;
  IF to_regclass('net.http_request_queue') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM net.http_request_queue' INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'QA_RUNNER_PG_NET_QUEUE_NOT_EMPTY'; END IF;
  END IF;
  IF to_regclass('net._http_response') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM net._http_response' INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'QA_RUNNER_PG_NET_RESPONSE_NOT_EMPTY'; END IF;
  END IF;
END
$network_guard$;
"""


DISABLE_CRON_SQL = """
DO $disable_cron$
DECLARE v_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR v_job_id IN EXECUTE 'SELECT jobid FROM cron.job WHERE active' LOOP
      EXECUTE format('SELECT cron.alter_job(%s, active := false)', v_job_id);
    END LOOP;
    IF EXISTS (SELECT 1 FROM cron.job WHERE active) THEN
      RAISE EXCEPTION 'QA_RUNNER_ACTIVE_CRON_REMAINS';
    END IF;
  END IF;
END
$disable_cron$;
"""


FLAGS_SQL = """
DO $push_flags$
DECLARE v_messages boolean; v_favorites boolean; v_tokens bigint;
BEGIN
  IF to_regclass('public.transactional_push_config') IS NOT NULL THEN
    EXECUTE 'SELECT messages_enabled, favorites_enabled FROM public.transactional_push_config WHERE singleton'
      INTO v_messages, v_favorites;
    IF COALESCE(v_messages, false) OR COALESCE(v_favorites, false) THEN
      RAISE EXCEPTION 'QA_RUNNER_PUSH_FLAG_ENABLED';
    END IF;
  END IF;
  IF to_regclass('public.user_push_tokens') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.user_push_tokens' INTO v_tokens;
    IF v_tokens <> 0 THEN RAISE EXCEPTION 'QA_RUNNER_REAL_OR_TEST_TOKENS_PRESENT'; END IF;
  END IF;
END
$push_flags$;
"""


def _quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _json_line(event: dict[str, Any]) -> str:
    event = {"timestamp": utc_now(), **event}
    return json.dumps(event, ensure_ascii=False, sort_keys=True)


class SafeReporter:
    def __init__(self, path: Path | None):
        self.path = path
        self.file = None
        if path:
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
            fd = os.open(path, flags, 0o600)
            self.file = os.fdopen(fd, "w", encoding="utf-8")

    def emit(self, event: dict[str, Any]) -> None:
        line = _json_line(event)
        print(line, flush=True)
        if self.file:
            self.file.write(line + "\n")
            self.file.flush()

    def close(self) -> None:
        if self.file:
            self.file.close()


class RemoteIdentity:
    def __init__(self, api: ManagementApi, database: Database):
        self.api = api
        self.database = database

    def verify(self) -> dict[str, Any]:
        self.api.verify()
        try:
            row = json.loads(self.database.query(INITIAL_PREFLIGHT_SQL))
        except (json.JSONDecodeError, TypeError) as exc:
            raise RunnerError("database identity query returned invalid metadata") from exc
        if row.get("database") != "postgres" or row.get("user") != "postgres":
            raise RunnerError("database connection is not the expected QA postgres database")
        if not row.get("server_addr") or not row.get("server_port"):
            raise RunnerError("database server identity could not be verified")
        if row.get("migration_log_exists"):
            try:
                row["migration_log_count"] = int(self.database.query(
                    "SELECT count(*) FROM supabase_migrations.schema_migrations"
                ))
            except Exception as exc:
                raise RunnerError("Supabase migration history could not be inspected") from exc
        else:
            row["migration_log_count"] = 0
        return row


def _check_pristine(row: dict[str, Any]) -> None:
    if row.get("journal_schema_exists"):
        raise RunnerError("QA runner journal exists but no matching deployment state was loaded")
    if row.get("public_app_objects") != 0 or row.get("public_app_functions") != 0:
        raise RunnerError("QA database contains application objects before the pinned baseline")
    if row.get("migration_log_count") != 0:
        raise RunnerError("QA database already has migration history; refusing a baseline replay")


def _journal_state(db: Database, digest: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    count = int(db.query("SELECT count(*) FROM qa_runner.manifest_runs"))
    if count > 1:
        raise RunnerError("QA runner journal contains multiple baselines")
    if count == 0:
        return None, []
    raw_run = db.query(
        "SELECT json_build_object('manifest_sha256',manifest_sha256,'target_ref',target_ref,'status',status,"
        "'initial_schema_sha256',initial_schema_sha256)::text FROM qa_runner.manifest_runs"
    )
    run = json.loads(raw_run)
    if run["manifest_sha256"] != digest or run["target_ref"] != QA_PROJECT_REF:
        raise RunnerError("QA runner journal belongs to a different manifest or project")
    raw_steps = db.query(
        "SELECT COALESCE(json_agg(row_to_json(s) ORDER BY step_order),'[]'::json)::text "
        "FROM (SELECT step_order,source_path,source_sha256,applied_sha256,status,schema_before_sha256,"
        "schema_after_sha256,error_class FROM qa_runner.steps) s"
    )
    steps = json.loads(raw_steps)
    return run, steps


def _insert_journal(db: Database, manifest: Manifest, initial_schema_sha: str, reporter: SafeReporter) -> None:
    statements = [JOURNAL_DDL, "INSERT INTO qa_runner.manifest_runs(manifest_sha256,target_ref,initial_schema_sha256,status) VALUES ("
        f"{_quote(manifest.digest)},{_quote(QA_PROJECT_REF)},{_quote(initial_schema_sha)},'running');"]
    values = []
    for m in manifest.entries:
        values.append(
            f"({_quote(manifest.digest)},{m.order},{_quote(m.path)},{_quote(m.source_sha256)},"
            f"{_quote(m.applied_sha256)},'pending')"
        )
    # 77 rows are metadata only; the SQL source itself is still applied one file at a time.
    statements.append(
        "INSERT INTO qa_runner.steps(manifest_sha256,step_order,source_path,source_sha256,applied_sha256,status) VALUES "
        + ",".join(values) + ";"
    )
    db.execute_sql("\n".join(statements).encode("utf-8"), transactional=True)
    reporter.emit({"event": "journal_initialized", "project_ref": QA_PROJECT_REF, "manifest_sha256": manifest.digest,
                   "step_count": len(manifest.entries), "initial_schema_sha256": initial_schema_sha})


def _mark_step(db: Database, digest: str, migration: Migration, status: str, *, before: str | None = None,
               after: str | None = None, error_class: str | None = None) -> None:
    if status == "started":
        sql = (
            "UPDATE qa_runner.steps SET status='started',started_at=clock_timestamp(),schema_before_sha256="
            f"{_quote(before or '')} WHERE manifest_sha256={_quote(digest)} AND step_order={migration.order} AND status='pending'"
        )
    elif status in {"applied", "failed"}:
        sql = (
            f"UPDATE qa_runner.steps SET status={_quote(status)},finished_at=clock_timestamp(),"
            f"schema_after_sha256={_quote(after or '')},error_class={_quote(error_class or '')} "
            f"WHERE manifest_sha256={_quote(digest)} AND step_order={migration.order} AND status='started'"
        )
    else:
        raise RunnerError("invalid runner journal transition")
    db.execute(sql)
    state = db.query(
        f"SELECT count(*) FROM qa_runner.steps WHERE manifest_sha256={_quote(digest)} AND step_order={migration.order} "
        f"AND status={_quote(status)}"
    )
    if state != "1":
        raise RunnerError("runner journal state transition did not persist")


def _step_rows_by_order(rows: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    by_order: dict[int, dict[str, Any]] = {}
    for row in rows:
        order = int(row["step_order"])
        if order in by_order:
            raise RunnerError("runner journal has duplicate migration orders")
        by_order[order] = row
    return by_order


def _assert_resume_state(run: dict[str, Any] | None, rows: list[dict[str, Any]], manifest: Manifest,
                         schema_now: str) -> tuple[dict[int, dict[str, Any]], int, str]:
    by_order = _step_rows_by_order(rows)
    if run is None:
        return {}, 1, schema_now
    if len(by_order) != 77:
        raise RunnerError("QA runner journal is incomplete")
    if run.get("status") not in {"running", "complete"}:
        raise RunnerError("QA runner journal is not in a resumable state")
    last_applied = 0
    expected_schema = run["initial_schema_sha256"]
    reached_pending = False
    for migration in manifest.entries:
        row = by_order.get(migration.order)
        if not row or row["source_path"] != migration.path or row["source_sha256"] != migration.source_sha256 or row["applied_sha256"] != migration.applied_sha256:
            raise RunnerError(f"runner journal provenance differs at entry {migration.order}")
        status = row["status"]
        if status == "applied":
            if reached_pending:
                raise RunnerError("runner journal has an applied migration after a pending step")
            if migration.order != last_applied + 1:
                raise RunnerError("runner journal has a non-contiguous applied prefix")
            if row["schema_after_sha256"] is None:
                raise RunnerError(f"entry {migration.order} has no post-application schema fingerprint")
            expected_schema = row["schema_after_sha256"]
            last_applied = migration.order
            continue
        if status in {"started", "failed"}:
            raise RunnerError(f"entry {migration.order} has uncertain or failed state; manual reconciliation is required")
        if status != "pending":
            raise RunnerError(f"runner journal cannot safely resume at entry {migration.order}")
        reached_pending = True
    if run["status"] == "complete" and last_applied != 77:
        raise RunnerError("completed runner journal has pending migrations")
    if schema_now != expected_schema:
        raise RunnerError("live schema fingerprint differs from the last completed runner checkpoint")
    return by_order, last_applied + 1, expected_schema


def _assert_database_guards(db: Database, identity: RemoteIdentity) -> None:
    identity.verify()
    db.execute(NETWORK_QUIET_SQL)
    db.execute(FLAGS_SQL)


class MigrationRunner:
    def __init__(self, db: Database, identity: RemoteIdentity, manifest: Manifest, reporter: SafeReporter,
                 *, after_sql_hook: Callable[[Migration], None] | None = None):
        self.db = db
        self.identity = identity
        self.manifest = manifest
        self.reporter = reporter
        self.after_sql_hook = after_sql_hook

    def run(self, max_steps: int | None = None) -> None:
        with self.db.advisory_lock():
            row = self.identity.verify()
            db_state = self.db.query("SELECT to_regnamespace('qa_runner') IS NOT NULL") == "t"
            if not db_state:
                _check_pristine(row)
                self.db.execute(NETWORK_QUIET_SQL)
                initial_schema = self.db.schema_hash()
                _insert_journal(self.db, self.manifest, initial_schema, self.reporter)
                run, steps = _journal_state(self.db, self.manifest.digest)
            else:
                run, steps = _journal_state(self.db, self.manifest.digest)
                if run is None:
                    raise RunnerError("runner journal schema exists without its manifest record")
            current_schema = self.db.schema_hash()
            _, next_order, _ = _assert_resume_state(run, steps, self.manifest, current_schema)
            completed_this_run = 0
            for migration in self.manifest.entries[next_order - 1:]:
                # Re-read identity and guards before every migration.
                _assert_database_guards(self.db, self.identity)
                before = self.db.schema_hash()
                refreshed_run, refreshed_steps = _journal_state(self.db, self.manifest.digest)
                _, expected_order, expected_before = _assert_resume_state(refreshed_run, refreshed_steps, self.manifest, before)
                if expected_order != migration.order or before != expected_before:
                    raise RunnerError(f"pre-step schema or journal check failed at entry {migration.order}")
                _mark_step(self.db, self.manifest.digest, migration, "started", before=before)
                self.reporter.emit({"event": "migration_started", "project_ref": QA_PROJECT_REF,
                                    "order": migration.order, "source": migration.path,
                                    "source_sha256": migration.source_sha256,
                                    "applied_sha256": migration.applied_sha256,
                                    "correction": migration.correction})
                try:
                    self.db.execute_sql(migration.sql, transactional=True)
                    self.db.execute(DISABLE_CRON_SQL)
                    _assert_database_guards(self.db, self.identity)
                    after = self.db.schema_hash()
                    if self.after_sql_hook:
                        self.after_sql_hook(migration)
                    _mark_step(self.db, self.manifest.digest, migration, "applied", after=after)
                except Exception as exc:
                    error_class = type(exc).__name__
                    try:
                        self.db.execute(
                            "UPDATE qa_runner.steps SET status='failed',finished_at=clock_timestamp(),error_class="
                            f"{_quote(error_class)} WHERE manifest_sha256={_quote(self.manifest.digest)} "
                            f"AND step_order={migration.order} AND status='started'"
                        )
                    except Exception:
                        pass
                    self.reporter.emit({"event": "migration_failed", "project_ref": QA_PROJECT_REF,
                                        "order": migration.order, "source": migration.path,
                                        "source_sha256": migration.source_sha256,
                                        "error_class": error_class})
                    raise RunnerError(f"entry {migration.order} failed; execution stopped and automatic retry is blocked") from None
                self.reporter.emit({"event": "migration_applied", "project_ref": QA_PROJECT_REF,
                                    "order": migration.order, "source": migration.path,
                                    "source_sha256": migration.source_sha256,
                                    "applied_sha256": migration.applied_sha256,
                                    "schema_after_sha256": after})
                completed_this_run += 1
                if max_steps is not None and completed_this_run >= max_steps:
                    self.reporter.emit({"event": "stopped_at_test_checkpoint", "order": migration.order})
                    return
            _assert_database_guards(self.db, self.identity)
            status = self.db.query(
                f"SELECT count(*) FROM qa_runner.steps WHERE manifest_sha256={_quote(self.manifest.digest)} AND status='applied'"
            )
            if status != "77":
                raise RunnerError("final runner journal is incomplete")
            self.db.execute(
                f"UPDATE qa_runner.manifest_runs SET status='complete',completed_at=clock_timestamp() "
                f"WHERE manifest_sha256={_quote(self.manifest.digest)} AND status='running'"
            )
            self.reporter.emit({"event": "baseline_complete", "project_ref": QA_PROJECT_REF,
                                "manifest_sha256": self.manifest.digest, "step_count": 77})


def _dry_run(manifest: Manifest, reporter: SafeReporter) -> None:
    reporter.emit({"event": "dry_run", "database_connection": "none", "project_ref": QA_PROJECT_REF,
                   "manifest_sha256": manifest.digest, "step_count": len(manifest.entries)})
    for migration in manifest.entries:
        reporter.emit({"event": "planned_migration", "order": migration.order, "source": migration.path,
                       "source_sha256": migration.source_sha256, "applied_sha256": migration.applied_sha256,
                       "correction": migration.correction})


def _remote_database_from_environment(environ: dict[str, str] | None = None) -> DatabaseTarget:
    env = os.environ if environ is None else environ
    url = env.get("YOUMBIA_QA_DATABASE_URL", "")
    token = env.get("SUPABASE_ACCESS_TOKEN", "")
    if not url or not token:
        raise RunnerError("--apply requires QA-only YOUMBIA_QA_DATABASE_URL and SUPABASE_ACCESS_TOKEN environment variables")
    target = parse_qa_database_url(url)
    ca_file = env.get("YOUMBIA_QA_SSLROOTCERT")
    if not ca_file or not Path(ca_file).is_file():
        raise RunnerError("--apply requires YOUMBIA_QA_SSLROOTCERT pointing to a trusted CA bundle")
    return dataclasses.replace(target, sslrootcert=ca_file)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--dry-run", action="store_true", help="verify all sources and print order; no database connection (default)")
    modes.add_argument("--apply", action="store_true", help="apply to the pinned QA project; remote write mode")
    parser.add_argument("--web-repo", type=Path, default=os.environ.get("YOUMBIA_WEB_REPO"),
                        help="local Git checkout containing the pinned Web commit")
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH,
                        help="must be the pinned 77-entry manifest")
    parser.add_argument("--report", type=Path, help="new local JSONL report file; created mode 0600")
    args = parser.parse_args(argv)
    reporter = SafeReporter(args.report)
    try:
        if not args.web_repo:
            raise RunnerError("--web-repo or YOUMBIA_WEB_REPO is required")
        manifest = load_manifest(args.manifest, Path(args.web_repo))
        if not args.apply:
            _dry_run(manifest, reporter)
            return 0
        target = _remote_database_from_environment()
        db = PsqlDatabase(target)
        api = ManagementApi(os.environ["SUPABASE_ACCESS_TOKEN"])
        identity = RemoteIdentity(api, db)
        identity.verify()
        reporter.emit({"event": "remote_preflight_pass", "project_ref": QA_PROJECT_REF,
                       "project_name": QA_PROJECT_NAME, "organization": QA_ORGANIZATION_SLUG,
                       "region": QA_REGION, "database_host": QA_DB_HOST,
                       "sslmode": "verify-full", "manifest_sha256": manifest.digest})
        MigrationRunner(db, identity, manifest, reporter).run()
        return 0
    except RunnerError as exc:
        reporter.emit({"event": "blocked", "reason": str(exc)})
        return 2
    finally:
        reporter.close()


if __name__ == "__main__":
    sys.exit(main())
