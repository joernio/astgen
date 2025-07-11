import babelParser from "@babel/parser";
import tsc from "typescript";

export const JS_EXTENSIONS: string[] = [
    ".js",
    ".jsx",
    ".cjs",
    ".mjs",
    ".xsjs",
    ".xsjslib",
    ".ts",
    ".tsx"
]

export const IGNORE_DIRS: string[] = [
    "node_modules",
    "venv",
    "docs",
    "test",
    "tests",
    "e2e",
    "e2e-beta",
    "examples",
    "cypress",
    "jest-cache",
    "eslint-rules",
    "codemods",
    "flow-typed",
    "i18n",
    "vendor",
    "www",
    "dist",
    "build",
];

export const IGNORE_FILE_PATTERN: RegExp =
    new RegExp("(chunk-vendors|app~|mock|e2e|conf|test|spec|[.-]min|\\.d)\\.(js|jsx|cjs|mjs|xsjs|xsjslib|ts|tsx)$", "i");

export const MAX_LOC_IN_FILE: number = 50000;

export const BABEL_PARSER_OPTIONS: babelParser.ParserOptions = {
    sourceType: "unambiguous",
    allowImportExportEverywhere: true,
    allowAwaitOutsideFunction: true,
    allowNewTargetOutsideFunction: true,
    allowReturnOutsideFunction: true,
    allowSuperOutsideMethod: true,
    allowUndeclaredExports: true,
    errorRecovery: true,
    plugins: [
        "optionalChaining",
        "classProperties",
        "decorators-legacy",
        "exportDefaultFrom",
        "doExpressions",
        "numericSeparator",
        "dynamicImport",
        "jsx",
        "typescript",
    ],
};

export const SAFE_BABEL_PARSER_OPTIONS: babelParser.ParserOptions = {
    sourceType: "module",
    allowImportExportEverywhere: true,
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    errorRecovery: true,
    plugins: [
        "optionalChaining",
        "classProperties",
        "decorators-legacy",
        "exportDefaultFrom",
        "doExpressions",
        "numericSeparator",
        "dynamicImport",
        "typescript",
    ],
};

export const DEFAULT_TSC_OPTIONS: tsc.CompilerOptions = {
    target: tsc.ScriptTarget.ES2020,
    module: tsc.ModuleKind.CommonJS,
    allowJs: true,
    allowUnreachableCode: true,
    allowUnusedLabels: true,
    alwaysStrict: false,
    ignoreDeprecations: "5.0",
    noStrictGenericChecks: true,
    noUncheckedIndexedAccess: false,
    noPropertyAccessFromIndexSignature: false,
    removeComments: true
}

export const DEFAULT_TSC_TYPE_OPTIONS: number = tsc.TypeFormatFlags.NoTruncation | tsc.TypeFormatFlags.InTypeAlias

export const ANY: string = "any"
export const UNKNOWN: string = "unknown"
export const UNRESOLVED: string = "/*unresolved*/"

export const STRING_REGEX: RegExp = /^["'`].*["'`]$/
export const ARRAY_REGEX: RegExp = /.+\[]$/
