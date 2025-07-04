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

This will generate the bundled and minified `astgen.js` in `bundle/`.

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
