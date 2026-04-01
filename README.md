# AST generator

This script creates Abstract Syntax Tree (AST) of all JS/TS files in JSON format.
The AST is created by using the bundled babel parser (for JavaScript, TypeScript).
Type maps are generated using the Typescript compiler / type checker API.

## Supported languages

| Language   | Tool used                   | Notes         |
| ---------- | --------------------------- | ------------- |
| JavaScript | babel                       | types via tsc |
| TypeScript | babel                       | types via tsc |
| Vue        | babel                       |               |
| JSX        | babel                       |               |
| TSX        | babel                       |               |

## Usage

## Building

```bash
yarn install
yarn build
```

Platform-specific binaries can now be build using [pkg](https://github.com/yao-pkg/pkg):

```bash
yarn binary
```

## Testing

```bash
yarn install
yarn build
yarn test
```

This will use `jest` with `ts-jest` to run the tests in `test/`.

## Regression Testing

The regression harness compares AST and type-map output between two versions of astgen (base branch vs. PR) across two real-world TypeScript corpora: [typeorm@0.3.21](https://github.com/typeorm/typeorm) and [fastify@v5.3.3](https://github.com/fastify/fastify).

**Run locally** (compares current branch against `main`):

```bash
yarn regression
```

To compare against a different base branch:

```bash
python3 scripts/regression-local.py --base-branch <branch>
```

The script builds both versions, clones the corpora, runs astgen on each, and prints a Markdown report to stdout showing:

- AST and typemap file counts and total sizes
- Wall-clock execution time
- Per-file content diffs (collapsible, truncated to 200 lines)

**CI:** The regression workflow runs automatically on every pull request (`.github/workflows/regression.yml`) and posts or updates a comment on the PR with the full report.

## Getting Help

```bash
./astgen -h
Options:
  -v, --version  Print version number                                  [boolean]
  -i, --src      Source directory                                 [default: "."]
  -o, --output   Output directory for generated AST json files
                                                            [default: "ast_out"]
  -t, --type     Project type. Default auto-detect
  -r, --recurse  Recurse mode suitable for mono-repos  [boolean] [default: true]
  -h             Show help                                             [boolean]
```

## Example

Navigate to the project and run `astgen` command.

```bash
cd <path to project>
astgen
```

To specify the project type and the path to the project.

```bash
astgen -t js -i <path to project>
astgen -t vue -i <path containing .vue files>
```
