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


def git_short_sha(repo_root: pathlib.Path, ref: str) -> str:
    result = subprocess.run(
        ["git", "rev-parse", "--short", ref],
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

    pr_sha = git_short_sha(repo_root, "HEAD")
    print(f"[local-regression] Current branch: {branch} @ {pr_sha}", file=sys.stderr)
    print(f"[local-regression] Base branch:    {args.base_branch}", file=sys.stderr)

    worktree_path = str(repo_root / ".worktrees" / "regression-base")
    dist_pr = str(repo_root / "dist")
    dist_base = os.path.join(worktree_path, "dist")

    try:
        # Build PR version (current working tree)
        print("[local-regression] Building PR version (current tree)...", file=sys.stderr)
        run(["yarn", "install"], cwd=str(repo_root))
        run(["yarn", "build"], cwd=str(repo_root))

        # Build base version via git worktree
        print(f"[local-regression] Fetching {args.base_branch} from origin...", file=sys.stderr)
        run(["git", "fetch", "origin", args.base_branch], cwd=str(repo_root))
        base_sha = git_short_sha(repo_root, f"origin/{args.base_branch}")
        print(f"[local-regression] Checking out origin/{args.base_branch} @ {base_sha} into worktree...", file=sys.stderr)
        run(
            ["git", "worktree", "add", worktree_path, f"origin/{args.base_branch}"],
            cwd=str(repo_root),
        )
        print("[local-regression] Building base version...", file=sys.stderr)
        run(["yarn", "install"], cwd=worktree_path)
        run(["yarn", "build"], cwd=worktree_path)

        # Run regression script with each binary served from its own build directory
        # so that Node resolves node_modules relative to each binary's location,
        # not from the shared repo root. This matters when dependencies change between
        # base and PR.
        print("[local-regression] Running regression harness...\n", file=sys.stderr)
        subprocess.run(
            [
                sys.executable, str(regression_script),
                "--base-dist", dist_base,
                "--pr-dist", dist_pr,
                "--base-ref", f"{args.base_branch} @ {base_sha}",
                "--pr-ref", f"{branch} @ {pr_sha}",
            ],
            check=False,
        )

    finally:
        # Clean up worktree registration (also removes worktree_path/node_modules)
        subprocess.run(
            ["git", "worktree", "remove", "--force", worktree_path],
            cwd=str(repo_root),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )


if __name__ == "__main__":
    main()
