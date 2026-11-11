#!/usr/bin/env python3
"""Validate the exact GitHub Actions artifact ZIP and extract its release.tar.gz.

The artifact ZIP and its SHA-256 digest come from GitHub Actions for the exact
approved release. No archive member is extracted by pathname except the single
expected release.tar.gz entry. This script never publishes application files.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import shutil
import sys
import tarfile
from pathlib import Path
from zipfile import BadZipFile, ZipFile

MAX_RELEASE_BYTES = 2_000_000_000


def verify_and_extract(artifact_zip: Path, destination: Path, expected_zip_sha256: str, release_sha: str) -> None:
    if not re.fullmatch(r"[0-9a-f]{64}", expected_zip_sha256):
        raise ValueError("Expected artifact SHA-256 must be 64 lowercase hex characters")
    if not re.fullmatch(r"[0-9a-f]{40}", release_sha):
        raise ValueError("Expected release SHA must be 40 lowercase hex characters")

    digest = hashlib.sha256()
    with artifact_zip.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != expected_zip_sha256:
        raise ValueError("GitHub Actions artifact ZIP SHA-256 mismatch")

    with ZipFile(artifact_zip, "r") as archive:
        if archive.namelist() != ["release.tar.gz"]:
            raise ValueError("GitHub Actions artifact must contain exactly release.tar.gz")
        member = archive.getinfo("release.tar.gz")
        if member.is_dir() or member.file_size == 0 or member.file_size > MAX_RELEASE_BYTES:
            raise ValueError("Invalid release archive size")
        with archive.open(member, "r") as source, destination.open("wb") as target:
            shutil.copyfileobj(source, target, length=1024 * 1024)

    with tarfile.open(destination, mode="r:gz") as release:
        try:
            marker = release.extractfile(".release-sha")
        except KeyError as exc:
            raise ValueError("Release archive is missing .release-sha") from exc
        if marker is None:
            raise ValueError("Release archive is missing .release-sha")
        embedded_sha = marker.read(100).decode("utf-8").strip()
        if embedded_sha != release_sha:
            raise ValueError("Release archive SHA does not match the approved commit")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-zip", required=True, type=Path)
    parser.add_argument("--destination", required=True, type=Path)
    parser.add_argument("--expected-zip-sha256", required=True)
    parser.add_argument("--release-sha", required=True)
    args = parser.parse_args()
    try:
        verify_and_extract(
            args.artifact_zip,
            args.destination,
            args.expected_zip_sha256,
            args.release_sha,
        )
    except (OSError, ValueError, BadZipFile, tarfile.TarError, UnicodeError) as exc:
        args.destination.unlink(missing_ok=True)
        print(f"Artifact validation failed: {type(exc).__name__}", file=sys.stderr)
        return 1
    print("Verified GitHub artifact checksum and embedded release identity.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
