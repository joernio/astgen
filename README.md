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
```

This will invoke `pgk` after `yarn install` and generates a native binary for Windows, MacOS, and Linux.

## Getting Help

```bash
bin/astgen -h
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
