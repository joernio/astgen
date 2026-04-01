#!/usr/bin/env python3
"""
Regression harness for astgen.

Usage:
    python3 scripts/regression.py --base-dist ./dist-base --pr-dist ./dist-pr
"""

import argparse
import difflib
import filecmp
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time


# ---------------------------------------------------------------------------
# Corpus definitions
# ---------------------------------------------------------------------------

CORPORA = [
    {
        "name": "typeorm",
        "label": "typeorm/typeorm@0.3.21",
        "clone_url": "https://github.com/typeorm/typeorm.git",
        "tag": "0.3.21",
        "input_subdir": "src",  # relative to clone root; empty string means clone root
    },
    {
        "name": "fastify",
        "label": "fastify/fastify@v5.3.3",
        "clone_url": "https://github.com/fastify/fastify.git",
        "tag": "v5.3.3",
        "input_subdir": "",  # use repo root
    },
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def human_size(n_bytes: int) -> str:
    """Return a human-readable file size string."""
    for unit in ("B", "KB", "MB", "GB"):
        if n_bytes < 1024.0 or unit == "GB":
            return f"{n_bytes:.1f} {unit}"
        n_bytes /= 1024.0
    return f"{n_bytes:.1f} GB"  # unreachable but makes type checkers happy


def pct_delta(base: float, pr: float) -> str:
    """Return a signed percentage delta string."""
    if base == 0:
        return "+0.0%" if pr == 0 else "+∞%"
    delta = (pr - base) / base * 100.0
    sign = "+" if delta >= 0 else ""
    return f"{sign}{delta:.1f}%"


def signed_int(delta: int) -> str:
    """Return a signed integer string."""
    if delta > 0:
        return f"+{delta}"
    return str(delta)


def collect_metrics(out_dir: pathlib.Path) -> dict:
    """Walk out_dir and collect file counts / sizes."""
    json_count = 0
    json_size = 0
    typemap_count = 0
    typemap_size = 0

    if out_dir.exists():
        for entry in out_dir.rglob("*"):
            if entry.is_file():
                size = entry.stat().st_size
                if entry.suffix == ".json":
                    json_count += 1
                    json_size += size
                elif entry.name.endswith(".typemap"):
                    typemap_count += 1
                    typemap_size += size

    return {
        "json_count": json_count,
        "json_size": json_size,
        "typemap_count": typemap_count,
        "typemap_size": typemap_size,
    }


def run_astgen(dist_dir: str, input_dir: str, output_dir: str) -> tuple[bool, float]:
    """
    Run astgen and return (success, elapsed_seconds).
    Stdout/stderr are captured and not printed to the terminal.
    """
    astgen_js = os.path.join(dist_dir, "astgen.js")
    cmd = ["node", astgen_js, "-i", input_dir, "-o", output_dir, "-t", "ts"]

    os.makedirs(output_dir, exist_ok=True)
    t0 = time.monotonic()
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        elapsed = time.monotonic() - t0
        if result.returncode != 0:
            print(
                f"WARNING: astgen exited {result.returncode} for {output_dir}\n"
                f"  stderr: {result.stderr.decode(errors='replace')[:500]}",
                file=sys.stderr,
            )
            return False, elapsed
        return True, elapsed
    except Exception as exc:
        elapsed = time.monotonic() - t0
        print(f"WARNING: failed to run astgen for {output_dir}: {exc}", file=sys.stderr)
        return False, elapsed


def compare_outputs(base_dir: pathlib.Path, pr_dir: pathlib.Path) -> dict:
    """
    Compare two output directories byte-by-byte.

    Returns:
        {
            "only_in_base": [relative_path, ...],
            "only_in_pr": [relative_path, ...],
            "ast_diffs": [(rel_path, unified_diff_lines), ...],
            "typemap_diffs": [(rel_path, unified_diff_lines), ...],
        }
    """
    only_in_base = []
    only_in_pr = []
    ast_diffs = []
    typemap_diffs = []

    # Build sets of relative paths
    base_files: dict[str, pathlib.Path] = {}
    pr_files: dict[str, pathlib.Path] = {}

    if base_dir.exists():
        for p in base_dir.rglob("*"):
            if p.is_file():
                rel = str(p.relative_to(base_dir))
                base_files[rel] = p

    if pr_dir.exists():
        for p in pr_dir.rglob("*"):
            if p.is_file():
                rel = str(p.relative_to(pr_dir))
                pr_files[rel] = p

    base_set = set(base_files)
    pr_set = set(pr_files)

    only_in_base = sorted(base_set - pr_set)
    only_in_pr = sorted(pr_set - base_set)

    for rel in sorted(base_set & pr_set):
        bp = base_files[rel]
        pp = pr_files[rel]
        if bp.stat().st_size == pp.stat().st_size and filecmp.cmp(str(bp), str(pp), shallow=False):
            continue
        # Files differ — generate unified diff
        try:
            base_text = bp.read_text(errors="replace").splitlines(keepends=True)
            pr_text = pp.read_text(errors="replace").splitlines(keepends=True)
        except Exception:
            base_text = []
            pr_text = []

        diff_lines = list(
            difflib.unified_diff(
                base_text,
                pr_text,
                fromfile=f"out-base/{rel}",
                tofile=f"out-pr/{rel}",
            )
        )

        if rel.endswith(".typemap"):
            typemap_diffs.append((rel, diff_lines))
        elif rel.endswith(".json"):
            ast_diffs.append((rel, diff_lines))

    return {
        "only_in_base": only_in_base,
        "only_in_pr": only_in_pr,
        "ast_diffs": ast_diffs,
        "typemap_diffs": typemap_diffs,
    }


def build_diff_details(diffs: list, kind: str, max_total_lines: int = 200) -> str:
    """
    Render a collapsible <details> block with truncated unified diffs.
    kind is 'AST' or 'typemap'.
    """
    n = len(diffs)
    if n == 0:
        return ""

    lines_used = 0
    diff_text_parts = []

    for rel, diff_lines in diffs:
        if lines_used >= max_total_lines:
            break
        chunk = diff_lines[: max_total_lines - lines_used]
        lines_used += len(chunk)
        diff_text_parts.append("".join(chunk))
        if lines_used >= max_total_lines:
            diff_text_parts.append("\n... (truncated)\n")

    inner = "".join(diff_text_parts)
    return (
        f"<details><summary>{n} {kind} diffs</summary>\n\n"
        f"```diff\n{inner}```\n\n"
        f"</details>\n"
    )


def format_table_row(metric: str, base_val: str, pr_val: str, delta: str) -> str:
    return f"| {metric:<24} | {base_val:>11} | {pr_val:>8} | {delta:>8} |"


def render_corpus_section(name: str, label: str, result: dict, pr_label: str = "PR") -> str:
    """Render the Markdown section for one corpus."""
    bm = result["base_metrics"]
    pm = result["pr_metrics"]
    bt = result["base_time"]
    pt = result["pr_time"]
    cmp = result["comparison"]

    ast_diff_count = len(cmp["ast_diffs"])
    typemap_diff_count = len(cmp["typemap_diffs"])

    rows = [
        format_table_row(
            "AST files generated",
            str(bm["json_count"]),
            str(pm["json_count"]),
            signed_int(pm["json_count"] - bm["json_count"]),
        ),
        format_table_row(
            "Typemap files generated",
            str(bm["typemap_count"]),
            str(pm["typemap_count"]),
            signed_int(pm["typemap_count"] - bm["typemap_count"]),
        ),
        format_table_row(
            "Total AST size",
            human_size(bm["json_size"]),
            human_size(pm["json_size"]),
            pct_delta(bm["json_size"], pm["json_size"]),
        ),
        format_table_row(
            "Total typemap size",
            human_size(bm["typemap_size"]),
            human_size(pm["typemap_size"]),
            pct_delta(bm["typemap_size"], pm["typemap_size"]),
        ),
        format_table_row(
            "Wall-clock time",
            f"{bt:.1f} s",
            f"{pt:.1f} s",
            pct_delta(bt, pt),
        ),
        format_table_row(
            "Files with AST diffs",
            "—",
            str(ast_diff_count),
            "",
        ),
        format_table_row(
            "Files with typemap diffs",
            "—",
            str(typemap_diff_count),
            "",
        ),
    ]

    header = (
        f"### {name} ({label})\n\n"
        f"| {'Metric':<24} | {'base (main)':>11} | {pr_label:>8} | {'Delta':>8} |\n"
        f"|{'-'*26}|{'-'*13}|{'-'*10}|{'-'*10}|"
    )

    table = header + "\n" + "\n".join(rows) + "\n"

    ast_details = build_diff_details(cmp["ast_diffs"], "AST")
    typemap_details = build_diff_details(cmp["typemap_diffs"], "typemap")

    parts = [table]
    if ast_details:
        parts.append(ast_details)
    if typemap_details:
        parts.append(typemap_details)

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Regression harness for astgen: compare base vs PR output across benchmark corpora.",
    )
    parser.add_argument(
        "--base-dist",
        required=True,
        metavar="PATH",
        help="Path to the compiled base branch dist/ directory.",
    )
    parser.add_argument(
        "--pr-dist",
        required=True,
        metavar="PATH",
        help="Path to the compiled PR branch dist/ directory.",
    )
    parser.add_argument(
        "--pr-number",
        default=None,
        metavar="N",
        help="PR number to display in the report header (e.g. 42).",
    )
    args = parser.parse_args()

    base_dist = os.path.abspath(args.base_dist)
    pr_dist = os.path.abspath(args.pr_dist)
    pr_label = f"PR (#{args.pr_number})" if args.pr_number else "PR"

    tmpdir = tempfile.mkdtemp(prefix="astgen-regression-")

    corpus_results = []

    try:
        for corpus in CORPORA:
            name = corpus["name"]
            label = corpus["label"]
            clone_url = corpus["clone_url"]
            tag = corpus["tag"]
            input_subdir = corpus["input_subdir"]

            print(f"[regression] Cloning {label} ...", file=sys.stderr)
            clone_dir = os.path.join(tmpdir, f"corpus-{name}")
            clone_cmd = [
                "git", "clone", "--depth", "1", "--branch", tag, clone_url, clone_dir,
            ]
            try:
                subprocess.run(
                    clone_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    check=True,
                )
            except subprocess.CalledProcessError as exc:
                print(
                    f"WARNING: failed to clone {clone_url}: "
                    f"{exc.stderr.decode(errors='replace')[:500]}",
                    file=sys.stderr,
                )
                corpus_results.append({
                    "name": name,
                    "label": f"{label} [CLONE FAILED]",
                    "base_metrics": {"json_count": 0, "json_size": 0, "typemap_count": 0, "typemap_size": 0},
                    "pr_metrics": {"json_count": 0, "json_size": 0, "typemap_count": 0, "typemap_size": 0},
                    "base_time": 0.0,
                    "pr_time": 0.0,
                    "comparison": {"only_in_base": [], "only_in_pr": [], "ast_diffs": [], "typemap_diffs": []},
                })
                continue

            if input_subdir:
                input_dir = os.path.join(clone_dir, input_subdir)
            else:
                input_dir = clone_dir

            out_base = os.path.join(tmpdir, f"out-base-{name}")
            out_pr = os.path.join(tmpdir, f"out-pr-{name}")

            print(f"[regression] Running base astgen on {name} ...", file=sys.stderr)
            _base_ok, base_time = run_astgen(base_dist, input_dir, out_base)

            print(f"[regression] Running PR astgen on {name} ...", file=sys.stderr)
            _pr_ok, pr_time = run_astgen(pr_dist, input_dir, out_pr)

            base_metrics = collect_metrics(pathlib.Path(out_base))
            pr_metrics = collect_metrics(pathlib.Path(out_pr))

            print(f"[regression] Comparing outputs for {name} ...", file=sys.stderr)
            comparison = compare_outputs(pathlib.Path(out_base), pathlib.Path(out_pr))

            corpus_results.append({
                "name": name,
                "label": label,
                "base_metrics": base_metrics,
                "pr_metrics": pr_metrics,
                "base_time": base_time,
                "pr_time": pr_time,
                "comparison": comparison,
            })

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    # Build report
    report_parts = [
        "<!-- astgen-regression -->",
        "## astgen Regression Report",
        "",
    ]

    for result in corpus_results:
        section = render_corpus_section(result["name"], result["label"], result, pr_label)
        report_parts.append(section)
        report_parts.append("")

    print("\n".join(report_parts))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"WARNING: regression harness encountered an unexpected error: {exc}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
    sys.exit(0)
