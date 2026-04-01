#!/usr/bin/env python3
"""
Local regression runner for astgen.

Builds the current working tree (PR version) and the main branch (base version),
then runs the regression harness and prints the Markdown report to stdout.

Usage:
    python3 scripts/regression-local.py [--base-branch BRANCH]

Or via yarn:
    yarn regression
"""

import argparse
import os
import pathlib
import shutil
import subprocess
import sys


def run(cmd: list, cwd: str = None, capture: bool = False) -> subprocess.CompletedProcess:
    kwargs = {"cwd": cwd, "check": True}
    if capture:
        kwargs["stdout"] = subprocess.PIPE
        kwargs["stderr"] = subprocess.PIPE
    return subprocess.run(cmd, **kwargs)


def find_repo_root() -> pathlib.Path:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    return pathlib.Path(result.stdout.decode().strip())


def current_branch(repo_root: pathlib.Path) -> str:
    result = subprocess.run(
        ["git", "branch", "--show-current"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
        cwd=str(repo_root),
    )
    return result.stdout.decode().strip()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build current branch and base branch, then run regression harness.",
    )
    parser.add_argument(
        "--base-branch",
        default="main",
        metavar="BRANCH",
        help="Base branch to compare against (default: main).",
    )
    args = parser.parse_args()

    repo_root = find_repo_root()
    branch = current_branch(repo_root)
    scripts_dir = repo_root / "scripts"
    regression_script = scripts_dir / "regression.py"

    if not regression_script.exists():
        print(f"ERROR: {regression_script} not found.", file=sys.stderr)
        sys.exit(1)

    print(f"[local-regression] Current branch: {branch}", file=sys.stderr)
    print(f"[local-regression] Base branch:    {args.base_branch}", file=sys.stderr)

    # Keep dist-pr and dist-base inside the repo root so that Node can resolve
    # node_modules by walking up the directory tree (same as the CI workflow).
    worktree_path = str(repo_root / ".worktrees" / "regression-base")
    dist_pr = str(repo_root / "dist-pr")
    dist_base = str(repo_root / "dist-base")

    try:
        # Build PR version (current working tree)
        print("[local-regression] Building PR version (current tree)...", file=sys.stderr)
        run(["yarn", "install"], cwd=str(repo_root))
        run(["yarn", "build"], cwd=str(repo_root))
        if os.path.exists(dist_pr):
            shutil.rmtree(dist_pr)
        shutil.copytree(str(repo_root / "dist"), dist_pr)

        # Build base version via git worktree
        print(f"[local-regression] Checking out {args.base_branch} into worktree...", file=sys.stderr)
        run(
            ["git", "worktree", "add", worktree_path, args.base_branch],
            cwd=str(repo_root),
        )
        print("[local-regression] Building base version...", file=sys.stderr)
        run(["yarn", "install"], cwd=worktree_path)
        run(["yarn", "build"], cwd=worktree_path)
        if os.path.exists(dist_base):
            shutil.rmtree(dist_base)
        shutil.copytree(os.path.join(worktree_path, "dist"), dist_base)

        # Remove worktree before running regression
        run(["git", "worktree", "remove", worktree_path], cwd=str(repo_root))

        # Run regression script — output goes directly to stdout
        print("[local-regression] Running regression harness...\n", file=sys.stderr)
        subprocess.run(
            [sys.executable, str(regression_script), "--base-dist", dist_base, "--pr-dist", dist_pr],
            check=False,
        )

    finally:
        shutil.rmtree(dist_pr, ignore_errors=True)
        shutil.rmtree(dist_base, ignore_errors=True)
        # Clean up worktree registration if it still exists (e.g. on early failure)
        subprocess.run(
            ["git", "worktree", "remove", "--force", worktree_path],
            cwd=str(repo_root),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )


if __name__ == "__main__":
    main()
