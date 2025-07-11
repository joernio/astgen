import Options from "./Options"
import * as Defaults from "./Defaults"
import * as FileUtils from "./FileUtils"
import * as JsonUtils from "./JsonUtils"
import * as VueCodeCleaner from "./VueCodeCleaner"
import TscUtils, {TypeMap} from "./TscUtils"

import * as babelParser from "@babel/parser"
import * as path from "node:path"
import * as fs from "node:fs"

/**
 * Convert a single JS/TS file to AST
 */
function fileToJsAst(file: string): babelParser.ParseResult {
    try {
        return babelParser.parse(fs.readFileSync(file, "utf-8"), Defaults.BABEL_PARSER_OPTIONS);
    } catch {
        return babelParser.parse(fs.readFileSync(file, "utf-8"), Defaults.SAFE_BABEL_PARSER_OPTIONS);
    }
}

/**
 * Convert a single JS/TS code snippet to AST
 */
function codeToJsAst(code: string): babelParser.ParseResult {
    try {
        return babelParser.parse(code, Defaults.BABEL_PARSER_OPTIONS);
    } catch {
        return babelParser.parse(code, Defaults.SAFE_BABEL_PARSER_OPTIONS);
    }
}

/**
 * Convert a single vue file to AST
 */
function toVueAst(file: string): babelParser.ParseResult {
    const code = fs.readFileSync(file, "utf-8");
    const cleanedCode = VueCodeCleaner.cleanVueCode(code)
    return codeToJsAst(cleanedCode);
}

function buildTscUtils(files: string[]): TscUtils | undefined {
    try {
        return new TscUtils(files)
    } catch (err) {
        if (err instanceof Error) {
            console.warn("Retrieving types:", err.message);
        }
        return undefined;
    }
}

/**
 * Generate AST for JavaScript or TypeScript
 */
async function createJSAst(options: Options) {
    try {
        const srcFiles: string[] = await FileUtils.filesWithExtensions(options, Defaults.JS_EXTENSIONS);
        const tscUtils: TscUtils | undefined = (options.tsTypes && srcFiles.length > 0) ? buildTscUtils(srcFiles) : undefined;
        for (const file of srcFiles) {
            try {
                const ast: babelParser.ParseResult = fileToJsAst(file);
                writeAstFile(file, ast, options);
                try {
                    let typeMap: TypeMap | undefined = tscUtils ? tscUtils.typeMapForFile(file) : undefined;
                    if (typeMap && typeMap.size !== 0) {
                        writeTypesFile(file, typeMap, options);
                    }
                } catch (err) {
                    if (err instanceof Error) {
                        console.warn("Retrieving types", file, ":", err.message);
                    }
                }
            } catch (err) {
                if (err instanceof Error) {
                    console.error("Parsing", file, ":", err.message);
                }
            }
        }
    } catch (err) {
        console.error(err);
    }
}

/**
 * Generate AST for .vue files
 */
async function createVueAst(options: Options) {
    const srcFiles: string[] = await FileUtils.filesWithExtensions(options, [".vue"]);
    for (const file of srcFiles) {
        try {
            const ast: babelParser.ParseResult = toVueAst(file);
            if (ast) {
                writeAstFile(file, ast, options);
            }
        } catch (err) {
            if (err instanceof Error) {
                console.error(file, err.message);
            }
        }
    }
}

/**
 * Write AST data to a json file
 */
function writeAstFile(file: string, ast: babelParser.ParseResult, options: Options) {
    const relativePath: string = path.relative(options.src, file)
    const outAstFile: string = path.join(options.output, relativePath + ".json");
    const data = {
        fullName: file,
        relativeName: relativePath,
        ast: ast,
    };
    fs.mkdirSync(path.dirname(outAstFile), {recursive: true});
    fs.writeFileSync(outAstFile, JsonUtils.stringifyCircular(data));
    console.log("Converted AST for", relativePath, "to", outAstFile);
}

/**
 * Write tsc type data to a json file
 */
function writeTypesFile(file: string, seenTypes: TypeMap, options: Options) {
    const relativePath: string = path.relative(options.src, file)
    const outTypeFile: string = path.join(options.output, relativePath + ".typemap");
    fs.mkdirSync(path.dirname(outTypeFile), {recursive: true});
    fs.writeFileSync(outTypeFile, JsonUtils.stringify(Object.fromEntries(seenTypes)));
    console.log("Converted types for", relativePath, "to", outTypeFile);
}

async function createXAst(options: Options) {
    const srcDir: string = options.src;
    try {
        fs.accessSync(srcDir, fs.constants.R_OK);
    } catch (err) {
        console.error(srcDir, "is invalid");
        process.exit(1);
    }
    if (
        fs.existsSync(path.join(srcDir, "package.json")) ||
        fs.existsSync(path.join(srcDir, "rush.json"))
    ) {
        return await createJSAst(options);
    }
    console.error(srcDir, "unknown project type");
    process.exit(1);
}

/**
 * Method to start the ast generation process
 *
 * @args options CLI arguments
 */
export default async function start(options: Options) {
    const type: string = (options.type || "").toLowerCase()
    switch (type) {
        case "nodejs":
        case "js":
        case "javascript":
        case "typescript":
        case "ts":
            return await createJSAst(options);
        case "vue":
            return await createVueAst(options);
        default:
            return await createXAst(options);
    }
}
