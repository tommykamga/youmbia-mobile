#!/usr/bin/env python3
"""Local-only tests for the pinned QA runner and its fail-closed database journal."""

from __future__ import annotations

import dataclasses
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import qa_migration_runner as runner


WEB_REPO = Path("/Users/tommysk/APP TESKA/YOUMBIA/Youmbia-web")
PG_BIN = Path("/opt/homebrew/bin")


class FakeIdentity:
    def verify(self):
        return {
            "database": "postgres", "user": "postgres", "server_addr": "127.0.0.1",
            "server_port": 5432, "public_app_objects": 0, "public_app_functions": 0,
            "journal_schema_exists": False, "migration_log_count": 0,
        }


class NullReporter:
    def emit(self, _event):
        pass


class LocalPostgres(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for binary in ("initdb", "pg_ctl", "psql", "pg_dump"):
            if not (PG_BIN / binary).is_file():
                raise unittest.SkipTest("local PostgreSQL toolchain unavailable")
        cls.cluster = Path(tempfile.mkdtemp(prefix="youmbia-qa-runner-pg-", dir="/private/tmp"))
        cls.data = cls.cluster / "data"
        cls.log = cls.cluster / "postgres.log"
        cls.socket_dir = cls.cluster / "socket"
        cls.socket_dir.mkdir(mode=0o700)
        cls.port = 55439
        subprocess.run([str(PG_BIN / "initdb"), "-D", str(cls.data), "-U", "postgres", "-A", "trust",
                        "--no-locale", "--encoding=UTF8"], check=True, capture_output=True, text=True)
        options = f"-F -p {cls.port} -c listen_addresses='' -c unix_socket_directories={cls.socket_dir}"
        subprocess.run([str(PG_BIN / "pg_ctl"), "-D", str(cls.data), "-l", str(cls.log), "-o", options,
                        "-w", "start"], check=True, capture_output=True, text=True)
        target = runner.DatabaseTarget(str(cls.socket_dir), cls.port, "postgres", "postgres", "local-only", "disable")
        cls.db = runner.PsqlDatabase(target, psql=str(PG_BIN / "psql"), pg_dump=str(PG_BIN / "pg_dump"))

    @classmethod
    def tearDownClass(cls):
        if getattr(cls, "data", None):
            subprocess.run([str(PG_BIN / "pg_ctl"), "-D", str(cls.data), "-m", "immediate", "-w", "stop"],
                           check=False, capture_output=True, text=True)
        if getattr(cls, "cluster", None):
            shutil.rmtree(cls.cluster, ignore_errors=True)

    def setUp(self):
        self.db.execute("DROP SCHEMA IF EXISTS qa_runner CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")

    @staticmethod
    def synthetic_manifest(fail_at=None):
        entries = []
        for order in range(1, 78):
            sql = f"CREATE TABLE public.fixture_{order:02d}(id integer);".encode()
            if order == fail_at:
                sql = b"CREATE TABLE public.partial_should_rollback(id integer); SELECT 1 / 0;"
            digest = hashlib.sha256(sql).hexdigest()
            entries.append(runner.Migration(order, "fixture", f"fixture/{order:02d}.sql", digest, digest, sql))
        return runner.Manifest("a" * 64, tuple(entries))

    def make_runner(self, manifest=None, after_sql_hook=None):
        return runner.MigrationRunner(self.db, FakeIdentity(), manifest or self.synthetic_manifest(),
                                      NullReporter(), after_sql_hook=after_sql_hook)

    def test_manifest_dry_run_checks_all_pinned_sources_and_order(self):
        manifest = runner.load_manifest(runner.MANIFEST_PATH, WEB_REPO)
        self.assertEqual(len(manifest.entries), 77)
        self.assertEqual([m.order for m in manifest.entries], list(range(1, 78)))
        self.assertEqual(tuple(m.path for m in manifest.entries if m.name in runner.PUSH_MIGRATIONS),
                         tuple(next(entry.path for entry in manifest.entries if entry.name == name)
                               for name in runner.PUSH_MIGRATIONS))
        enum = manifest.entries[34]
        self.assertEqual(enum.source_sha256, runner.ENUM_SOURCE_SHA256)
        self.assertNotEqual(enum.source_sha256, enum.applied_sha256)

    def test_changed_manifest_hash_is_rejected(self):
        with tempfile.TemporaryDirectory(dir="/private/tmp") as directory:
            path = Path(directory) / "manifest.json"
            data = json.loads(runner.MANIFEST_PATH.read_text())
            data["qualification"]["requestedHead"] = "0" * 40
            path.write_text(json.dumps(data))
            with self.assertRaises(runner.RunnerError):
                runner.load_manifest(path, WEB_REPO)

    def test_missing_pinned_source_is_rejected(self):
        with self.assertRaises(runner.RunnerError):
            runner.load_manifest(runner.MANIFEST_PATH, Path("/private/tmp/no-web-repository"))

    def test_wrong_project_and_production_database_urls_are_rejected(self):
        for url in (
            "postgresql://postgres:secret@db.ainzxommczlyjhymuwgu.supabase.co:5432/postgres?sslmode=verify-full",
            "postgresql://postgres:secret@other.supabase.co:5432/postgres?sslmode=verify-full",
            "postgresql://postgres:secret@db.wagvrytcguutgbjzhvak.supabase.co:5432/postgres?sslmode=require",
        ):
            with self.assertRaises(runner.RunnerError):
                runner.parse_qa_database_url(url)

    def test_missing_secret_fails_before_database_construction(self):
        with self.assertRaises(runner.RunnerError):
            runner._remote_database_from_environment({})

    def test_dry_run_never_constructs_a_database_connection(self):
        original = runner.PsqlDatabase
        runner.PsqlDatabase = lambda *_args, **_kwargs: self.fail("dry-run attempted database construction")
        try:
            with contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(runner.main(["--web-repo", str(WEB_REPO)]), 0)
            self.assertIn('"database_connection": "none"', output.getvalue())
        finally:
            runner.PsqlDatabase = original

    def test_project_and_organization_identity_are_exact(self):
        good_org = {"id": "org-qa", "slug": runner.QA_ORGANIZATION_SLUG}
        project = {"id": runner.QA_PROJECT_REF, "name": runner.QA_PROJECT_NAME, "region": runner.QA_REGION,
                   "status": "ACTIVE_HEALTHY", "organization_id": "org-qa"}
        runner.validate_project_metadata(project, [good_org])
        for bad_project, orgs in ((dict(project, id="ainzxommczlyjhymuwgu"), [good_org]),
                                  (project, [{"id": "org-qa", "slug": "teska-sas"}])):
            with self.assertRaises(runner.RunnerError):
                runner.validate_project_metadata(bad_project, orgs)

    def test_wrong_database_identity_is_rejected(self):
        class Api:
            def verify(self):
                return None
        class DatabaseIdentity:
            def query(self, _sql):
                return json.dumps({"database": "production", "user": "postgres", "server_addr": "127.0.0.1",
                                   "server_port": 5432, "migration_log_exists": False})
        with self.assertRaisesRegex(runner.RunnerError, "expected QA postgres"):
            runner.RemoteIdentity(Api(), DatabaseIdentity()).verify()

    def test_forbidden_network_sql_is_rejected(self):
        sql = b"SELECT net.http_post('https://exp.host/--/api/v2/push/send', '{}');"
        digest = hashlib.sha256(sql).hexdigest()
        migration = runner.Migration(1, "fixture", "fixture.sql", digest, digest, sql)
        with self.assertRaises(runner.RunnerError):
            runner._check_sql_safety(migration)

    def test_nontransactional_migration_is_rejected(self):
        sql = b"CREATE INDEX CONCURRENTLY unsafe_idx ON public.example(id);"
        digest = hashlib.sha256(sql).hexdigest()
        with self.assertRaisesRegex(runner.RunnerError, "non-transactional"):
            runner._check_sql_safety(runner.Migration(1, "fixture", "fixture.sql", digest, digest, sql))

    def test_fresh_baseline_completes_and_replay_is_idempotent(self):
        migration_runner = self.make_runner()
        migration_runner.run()
        self.assertEqual(self.db.query("SELECT count(*) FROM qa_runner.steps WHERE status='applied'"), "77")
        migration_runner.run()
        self.assertEqual(self.db.query("SELECT count(*) FROM public.fixture_01"), "0")
        self.assertEqual(self.db.query("SELECT status FROM qa_runner.manifest_runs"), "complete")

    def test_clean_interruption_at_step_boundary_resumes_without_replay(self):
        self.make_runner().run(max_steps=3)
        self.assertEqual(self.db.query("SELECT count(*) FROM qa_runner.steps WHERE status='applied'"), "3")
        self.make_runner().run(max_steps=2)
        self.assertEqual(self.db.query("SELECT count(*) FROM qa_runner.steps WHERE status='applied'"), "5")
        self.assertEqual(self.db.query("SELECT count(*) FROM pg_class WHERE relname LIKE 'fixture_%' AND relkind='r'"), "5")

    def test_sql_failure_rolls_back_partial_migration_and_blocks_resume(self):
        with self.assertRaises(runner.RunnerError):
            self.make_runner(self.synthetic_manifest(fail_at=2)).run(max_steps=2)
        self.assertEqual(self.db.query("SELECT to_regclass('public.partial_should_rollback') IS NULL"), "t")
        with self.assertRaises(runner.RunnerError):
            self.make_runner(self.synthetic_manifest(fail_at=2)).run()

    def test_interruption_after_sql_before_journal_update_fails_closed(self):
        def interrupt(_migration):
            raise KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            self.make_runner(after_sql_hook=interrupt).run(max_steps=1)
        self.assertEqual(self.db.query("SELECT status FROM qa_runner.steps WHERE step_order=1"), "started")
        with self.assertRaisesRegex(runner.RunnerError, "manual reconciliation"):
            self.make_runner().run()

    def test_journal_provenance_change_is_rejected(self):
        self.make_runner().run(max_steps=1)
        self.db.execute("UPDATE qa_runner.steps SET source_sha256 = repeat('0',64) WHERE step_order=1")
        with self.assertRaisesRegex(runner.RunnerError, "provenance"):
            self.make_runner().run()


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    unittest.main()
