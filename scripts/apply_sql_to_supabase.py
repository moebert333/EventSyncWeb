#!/usr/bin/env python3
"""Apply a SQL file to Supabase Postgres via SUPABASE_DB_URL (or DATABASE_URL).

The publishable/service_role API keys cannot run multi-statement SQL scripts.
Use the database connection string from Supabase → Project Settings → Database.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path


def load_dotenv_files(root: Path) -> None:
    for name in (".env.local", ".env"):
        path = root / name
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = value


def project_ref_from_supabase_url(url: str | None) -> str | None:
    if not url:
        return None
    # https://abcdxyz.supabase.co
    match = re.match(r"^https?://([a-z0-9-]+)\.supabase\.co/?$", url.strip(), re.I)
    return match.group(1) if match else None


def resolve_database_url() -> str:
    for key in (
        "SUPABASE_DB_URL",
        "SUPABASE_DIRECT_CONNECT_STRING",
        "DATABASE_URL",
        "SUPABASE_DB_CONNECTION_STRING",
    ):
        value = os.environ.get(key, "").strip()
        if value:
            return value

    password = os.environ.get("SUPABASE_DB_PASSWORD", "").strip()
    if not password:
        raise SystemExit(
            "Missing database URL/password.\n"
            "Set SUPABASE_DB_URL (preferred) or SUPABASE_DB_PASSWORD in .env.local,\n"
            "or pass --database-url / -DbPassword to the PowerShell script.\n"
            "Find it in Supabase → Project Settings → Database → Connection string (URI).\n"
            "Note: VITE_SUPABASE_PUBLISHABLE_KEY / service_role key cannot apply this SQL file."
        )

    ref = os.environ.get("SUPABASE_PROJECT_REF", "").strip() or project_ref_from_supabase_url(
        os.environ.get("VITE_SUPABASE_URL")
    )
    if not ref:
        raise SystemExit(
            "Have SUPABASE_DB_PASSWORD but no project ref. "
            "Set VITE_SUPABASE_URL or SUPABASE_PROJECT_REF."
        )

    # Direct connection host (session / db role). URL-encode password if needed.
    from urllib.parse import quote_plus

    encoded = quote_plus(password)
    return f"postgresql://postgres:{encoded}@db.{ref}.supabase.co:5432/postgres"


def split_statements(sql: str) -> list[str]:
    """Split simple seed SQL into statements. Strips -- line comments and begin/commit."""
    lines: list[str] = []
    for line in sql.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("--"):
            continue
        lines.append(line)
    text = "\n".join(lines)
    statements: list[str] = []
    for part in text.split(";"):
        stmt = part.strip()
        if not stmt:
            continue
        lower = stmt.lower()
        if lower in {"begin", "commit", "rollback"}:
            continue
        statements.append(stmt)
    return statements


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply SQL file to Supabase Postgres")
    parser.add_argument("--sql", type=Path, required=True, help="Path to .sql file")
    parser.add_argument("--database-url", default=None, help="Override SUPABASE_DB_URL")
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=None,
        help="Repo root for loading .env.local (default: parent of scripts/)",
    )
    args = parser.parse_args()

    root = args.repo_root or Path(__file__).resolve().parent.parent
    load_dotenv_files(root)
    if args.database_url:
        os.environ["SUPABASE_DB_URL"] = args.database_url

    sql_path: Path = args.sql
    if not sql_path.is_absolute():
        sql_path = Path.cwd() / sql_path
    if not sql_path.is_file():
        raise SystemExit(f"SQL file not found: {sql_path}")

    try:
        import psycopg
    except ImportError:
        raise SystemExit(
            "Missing package psycopg. Install with:\n"
            "  py -3 -m pip install \"psycopg[binary]\"\n"
            "Or re-run scripts/seed-moto-challenge.ps1 (it can install automatically)."
        ) from None

    database_url = resolve_database_url()
    sql_text = sql_path.read_text(encoding="utf-8")
    statements = split_statements(sql_text)
    if not statements:
        raise SystemExit(f"No SQL statements found in {sql_path}")

    print(f"Applying {len(statements)} statements from {sql_path.name} ...")
    # connect_timeout helps fail fast on bad host/password
    with psycopg.connect(database_url, connect_timeout=30) as conn:
        with conn.cursor() as cur:
            for index, statement in enumerate(statements, start=1):
                preview = re.sub(r"\s+", " ", statement)[:90]
                try:
                    cur.execute(statement)
                except Exception as exc:  # noqa: BLE001 - show which statement failed
                    conn.rollback()
                    raise SystemExit(
                        f"Statement {index}/{len(statements)} failed:\n  {preview}\n{exc}"
                    ) from exc
        conn.commit()

    print("SQL applied successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
