#!/usr/bin/env python3
"""
Regression harness for astgen.

Usage:
    python3 scripts/regression.py --base-dist ./dist-base --pr-dist ./dist-pr
"""

import argparse
import difflib
import filecmp
import json
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


def _normalize_json(path: pathlib.Path) -> list[str]:
    """Parse a JSON file and re-serialize it with stable formatting for diffing."""
    try:
        obj = json.loads(path.read_text(errors="replace"))
        return (json.dumps(obj, indent=2, sort_keys=True) + "\n").splitlines(keepends=True)
    except Exception:
        # Fall back to raw text if JSON is malformed
        return path.read_text(errors="replace").splitlines(keepends=True)


def _json_diff_summary(base_path: pathlib.Path, pr_path: pathlib.Path) -> str:
    """
    Return a one-line human-readable summary of what changed between two JSON files,
    e.g. '3 keys added, 1 key removed, 7 values changed'.
    Falls back to an empty string on parse error.
    """
    try:
        base_obj = json.loads(base_path.read_text(errors="replace"))
        pr_obj = json.loads(pr_path.read_text(errors="replace"))
    except Exception:
        return ""

    added = removed = changed = 0

    def _walk(b, p, depth: int = 0) -> None:
        nonlocal added, removed, changed
        if depth > 20:
            return
        if isinstance(b, dict) and isinstance(p, dict):
            for k in set(b) | set(p):
                if k not in b:
                    added += 1
                elif k not in p:
                    removed += 1
                else:
                    _walk(b[k], p[k], depth + 1)
        elif isinstance(b, list) and isinstance(p, list):
            for i in range(min(len(b), len(p))):
                _walk(b[i], p[i], depth + 1)
            extra = len(p) - len(b)
            if extra > 0:
                added += extra
            elif extra < 0:
                removed += -extra
        else:
            if b != p:
                changed += 1

    _walk(base_obj, pr_obj)

    parts = []
    if added:
        parts.append(f"{added} added")
    if removed:
        parts.append(f"{removed} removed")
    if changed:
        parts.append(f"{changed} changed")
    return ", ".join(parts) if parts else "whitespace/ordering only"


def compare_outputs(base_dir: pathlib.Path, pr_dir: pathlib.Path) -> dict:
    """
    Compare two output directories.

    Returns:
        {
            "only_in_base": [relative_path, ...],
            "only_in_pr": [relative_path, ...],
            "ast_diffs": [(rel_path, diff_lines, summary), ...],
            "typemap_diffs": [(rel_path, diff_lines, summary), ...],
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

        base_text = _normalize_json(bp)
        pr_text = _normalize_json(pp)
        summary = _json_diff_summary(bp, pp)

        diff_lines = list(
            difflib.unified_diff(
                base_text,
                pr_text,
                fromfile=f"out-base/{rel}",
                tofile=f"out-pr/{rel}",
            )
        )

        if rel.endswith(".typemap"):
            typemap_diffs.append((rel, diff_lines, summary))
        elif rel.endswith(".json"):
            ast_diffs.append((rel, diff_lines, summary))

    return {
        "only_in_base": only_in_base,
        "only_in_pr": only_in_pr,
        "ast_diffs": ast_diffs,
        "typemap_diffs": typemap_diffs,
    }


def write_diff_files(diffs_dir: pathlib.Path, corpus_results: list) -> None:
    """
    Write full (untruncated) diff content to files in diffs_dir.

    For each corpus that has diffs, creates:
      <corpus-name>-ast.diff      — if AST diffs exist
      <corpus-name>-typemap.diff  — if typemap diffs exist
    """
    diffs_dir.mkdir(parents=True, exist_ok=True)
    for result in corpus_results:
        name = result["name"]
        cmp = result["comparison"]

        for kind, key in (("ast", "ast_diffs"), ("typemap", "typemap_diffs")):
            diffs = cmp[key]
            if not diffs:
                continue
            parts = []
            for rel, diff_lines, summary in diffs:
                header = f"# {rel}"
                if summary:
                    header += f"  [{summary}]"
                parts.append(header + "\n")
                parts.append("".join(diff_lines))
            (diffs_dir / f"{name}-{kind}.diff").write_text("".join(parts))


def build_diff_details(diffs: list, kind: str, max_total_lines: int = 200) -> str:
    """
    Render a collapsible <details> block with truncated normalized diffs.
    kind is 'AST' or 'typemap'.
    Each entry in diffs is a (rel_path, diff_lines, summary) tuple.
    """
    n = len(diffs)
    if n == 0:
        return ""

    lines_used = 0
    diff_text_parts = []

    for rel, diff_lines, summary in diffs:
        if lines_used >= max_total_lines:
            remaining = n - len(diff_text_parts)
            diff_text_parts.append(f"\n... ({remaining} more files not shown)\n")
            break
        header = f"# {rel}"
        if summary:
            header += f"  [{summary}]"
        diff_text_parts.append(header + "\n")
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
    parser.add_argument(
        "--base-ref",
        default=None,
        metavar="REF",
        help="Human-readable base ref label (e.g. 'main @ abc1234').",
    )
    parser.add_argument(
        "--pr-ref",
        default=None,
        metavar="REF",
        help="Human-readable PR ref label (e.g. 'my-branch @ def5678').",
    )
    parser.add_argument(
        "--output-diffs",
        default=None,
        metavar="PATH",
        help="Directory to write full (untruncated) diff files into.",
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
    provenance = []
    if args.base_ref:
        provenance.append(f"**Base:** `{args.base_ref}`")
    if args.pr_ref:
        provenance.append(f"**PR:** `{args.pr_ref}`")

    report_parts = [
        "<!-- astgen-regression -->",
        "## astgen Regression Report",
        "",
    ]
    if provenance:
        report_parts.append(" | ".join(provenance))
        report_parts.append("")

    for result in corpus_results:
        section = render_corpus_section(result["name"], result["label"], result, pr_label)
        report_parts.append(section)
        report_parts.append("")

    if args.output_diffs:
        write_diff_files(pathlib.Path(args.output_diffs), corpus_results)

    print("\n".join(report_parts))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"WARNING: regression harness encountered an unexpected error: {exc}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
    sys.exit(0)
