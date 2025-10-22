import Options from "./Options"
import * as Defaults from "./Defaults"
import * as FileUtils from "./FileUtils"
import * as JsonUtils from "./JsonUtils"
import * as VueCodeCleaner from "./VueCodeCleaner"
import TscUtils, {TypeMap} from "./TscUtils"

import {Option as O, pipe} from "effect"
import * as babelParser from "@babel/parser"
import * as path from "node:path"
import * as fs from "node:fs"

/**
 * Executes a function that returns an Option<T> and catches any exceptions.
 * Returns O.none() in case of error and logs a warning with the error message and argument.
 *
 * @template T - The return type of the Option.
 * @param errMessage - The error message to be logged when an exception occurs.
 * @param arg - An argument that provides better identification in the log.
 * @param f - The function to execute that returns an Option<T>.
 * @returns O.some<T> on success, otherwise O.none().
 */
function TWithTry<T>(errMessage: string, arg: string, f: () => O.Option<T>): O.Option<T> {
    try {
        return f()
    } catch (err) {
        if (err instanceof Error) {
            console.warn(errMessage, arg, ":", err.message)
        }
        return O.none()
    }
}

/**
 * Executes a void function and catches any exceptions.
 * In case of an error, logs a warning with the error message and argument.
 * This is a wrapper around TWithTry for functions that don't return a value.
 *
 * @param errMessage - The error message to be logged when an exception occurs.
 * @param arg - An argument that provides better identification in the log.
 * @param f - The void function to execute.
 */
function VoidWithTry(errMessage: string, arg: string, f: () => void): void {
    TWithTry(errMessage, arg, () => {
        f()
        return O.none()
    })
}

/**
 * Converts a single JavaScript or TypeScript file to an Abstract Syntax Tree (AST).
 * Reads the file content from the filesystem and passes it to the codeToJsAst function
 * for parsing with Babel.
 *
 * @param file - The absolute or relative path to the JS/TS file to be parsed
 * @returns A Babel ParseResult object representing the AST of the file's content
 * @throws Will throw an error if the file cannot be read or if parsing fails
 * @see codeToJsAst - The underlying function used for parsing code strings
 */
function fileToJsAst(file: string): babelParser.ParseResult {
    return codeToJsAst(fs.readFileSync(file, "utf-8"))
}

/**
 * Converts a JavaScript or TypeScript code string to an Abstract Syntax Tree (AST).
 *
 * The function first attempts to parse the code with standard Babel parser options.
 * If the initial parsing fails (e.g., with experimental syntax), it automatically
 * falls back to a more permissive set of parsing options.
 *
 * @param code - The JavaScript or TypeScript code string to be parsed
 * @returns A Babel ParseResult object representing the AST of the provided code
 * @throws May throw an error if parsing fails with both standard and fallback options
 * @see Defaults.BABEL_PARSER_OPTIONS - The primary parsing configuration
 * @see Defaults.SAFE_BABEL_PARSER_OPTIONS - The fallback parsing configuration
 */
function codeToJsAst(code: string): babelParser.ParseResult {
    try {
        return babelParser.parse(code, Defaults.BABEL_PARSER_OPTIONS)
    } catch {
        return babelParser.parse(code, Defaults.SAFE_BABEL_PARSER_OPTIONS)
    }
}

/**
 * Converts a single Vue file to an Abstract Syntax Tree (AST).
 *
 * This function reads the Vue file content from the filesystem, cleans the code
 * using the VueCodeCleaner utility to extract and process the script section,
 * and then parses the cleaned code into an AST using the Babel parser.
 *
 * @param file - The absolute or relative path to the Vue file to be parsed
 * @returns A Babel ParseResult object representing the AST of the Vue file's script content
 * @throws Will throw an error if the file cannot be read or if parsing fails
 * @see VueCodeCleaner.cleanVueCode - The utility used to extract script content from Vue files
 * @see codeToJsAst - The underlying function used for parsing the extracted code
 */
function toVueAst(file: string): babelParser.ParseResult {
    const code = fs.readFileSync(file, "utf-8")
    const cleanedCode = VueCodeCleaner.cleanVueCode(code)
    return codeToJsAst(cleanedCode)
}

/**
 * Builds a TscUtils instance to process TypeScript type information for the given files.
 *
 * This function creates a TscUtils object that can be used to extract and analyze
 * TypeScript type information. It only proceeds if type extraction is enabled in
 * the options and there are files to process.
 *
 * @param files - An array of file paths to be analyzed for TypeScript types
 * @param options - Configuration options object that controls the behavior
 * @returns An Option containing a TscUtils instance if successful, or none if type
 *          extraction is disabled, files array is empty, or an error occurs during initialization
 * @see TscUtils - The utility class used for TypeScript type extraction
 */
function buildTscUtils(files: string[], options: Options): O.Option<TscUtils> {
    if (!options.tsTypes || files.length === 0) return O.none()
    return TWithTry("Retrieving types", "", () => {
        return O.some(new TscUtils(files))
    })
}

/**
 * Generates Abstract Syntax Trees (ASTs) for JavaScript and TypeScript source files.
 *
 * This function collects all source files with JavaScript or TypeScript extensions,
 * optionally builds a TscUtils instance for type extraction, and processes each file:
 * - Parses the file into an AST and writes it to a JSON file.
 * - If type extraction is enabled, retrieves and writes type information for each file.
 *
 * All operations are wrapped with error handling to log warnings without interrupting the process.
 *
 * @param options - Configuration options controlling source location, output, and type extraction.
 * @returns A Promise that resolves when all files have been processed.
 */
async function createJSAst(options: Options): Promise<void> {
    try {
        const srcFiles: string[] = await FileUtils.filesWithExtensions(options, Defaults.JS_EXTENSIONS)
        const tscUtils: O.Option<TscUtils> = buildTscUtils(srcFiles, options)
        for (const file of srcFiles) {
            VoidWithTry("Parsing", file, () => {
                const ast: babelParser.ParseResult = fileToJsAst(file)
                writeAstFile(file, ast, options)
                VoidWithTry("Retrieving types", file, () => {
                    pipe(
                        tscUtils,
                        O.map(t => t.typeMapForFile(file)),
                        O.filter(m => m.size !== 0),
                        O.toArray
                    ).forEach(m => writeTypesFile(file, m, options))
                })
            })
        }
    } catch (err) {
        console.error(err)
    }
}

/**
 * Generates Abstract Syntax Trees (ASTs) for all `.vue` files in the specified source directory.
 *
 * This function collects all Vue files, processes each file by extracting and cleaning the script section,
 * parses the cleaned code into an AST, and writes the resulting AST to a JSON file in the output directory.
 * All operations are wrapped with error handling to log warnings without interrupting the process.
 *
 * @param options - Configuration options controlling source location and output directory.
 * @returns A Promise that resolves when all Vue files have been processed.
 */
async function createVueAst(options: Options): Promise<void> {
    const srcFiles: string[] = await FileUtils.filesWithExtensions(options, [".vue"])
    for (const file of srcFiles) {
        VoidWithTry("", file, () => {
            writeAstFile(file, toVueAst(file), options)
        })
    }
}

/**
 * Writes the AST (Abstract Syntax Tree) data of a source file to a JSON file.
 *
 * The output file is created in the output directory specified in the options,
 * preserving the relative path structure from the source directory. The AST data
 * is serialized using a utility that handles circular references.
 *
 * @param file - The absolute path to the source file.
 * @param ast - The Babel ParseResult object representing the AST of the file.
 * @param options - Configuration options containing source and output directories.
 */
function writeAstFile(file: string, ast: babelParser.ParseResult, options: Options): void {
    const relativePath: string = path.relative(options.src, file)
    const outAstFile: string = path.join(options.output, relativePath + ".json")
    const data = {
        fullName: file,
        relativeName: relativePath,
        ast: ast,
    }
    fs.mkdirSync(path.dirname(outAstFile), {recursive: true})
    fs.writeFileSync(outAstFile, JsonUtils.stringifyCircular(data))
    console.log("Converted AST for", relativePath, "to", outAstFile)
}

/**
 * Writes TypeScript type information to a JSON file.
 *
 * The function serializes the provided `TypeMap` and writes it to a `.typemap` file
 * in the output directory, preserving the relative path structure from the source directory.
 *
 * @param file - The absolute path to the source file.
 * @param seenTypes - The `TypeMap` containing type information to be written.
 * @param options - Configuration options containing source and output directories.
 */
function writeTypesFile(file: string, seenTypes: TypeMap, options: Options): void {
    const relativePath: string = path.relative(options.src, file)
    const outTypeFile: string = path.join(options.output, relativePath + ".typemap")
    fs.mkdirSync(path.dirname(outTypeFile), {recursive: true})
    fs.writeFileSync(outTypeFile, JsonUtils.stringify(Object.fromEntries(seenTypes)))
    console.log("Converted types for", relativePath, "to", outTypeFile)
}

/**
 * Determines the project type in the given source directory and triggers AST generation accordingly.
 *
 * This function checks if the provided source directory contains a `package.json` or `rush.json` file
 * to identify it as a Node.js or JavaScript/TypeScript project. If so, it calls `createJSAst` to generate
 * ASTs for the source files. If neither file is found, it logs an error and exits the process.
 *
 * @param options - Configuration options containing the source directory and output settings.
 * @returns A Promise that resolves when AST generation is complete or the process exits on error.
 */
async function createXAst(options: Options): Promise<void> {
    const srcDir: string = options.src
    if (
        FileUtils.fileExistsAndIsReadable(path.join(srcDir, "package.json")) ||
        FileUtils.fileExistsAndIsReadable(path.join(srcDir, "rush.json"))
    ) {
        return await createJSAst(options)
    }
    console.error("Unknown project type:", srcDir)
    process.exit(1)
}

/**
 * Entry point for starting the AST generation process based on the provided options.
 *
 * This function determines the type of project or files to process by inspecting the `type` property
 * in the options object. Depending on the type, it delegates to the appropriate AST generation function:
 * - For Node.js, JavaScript, or TypeScript projects, it calls `createJSAst`.
 * - For Vue projects, it calls `createVueAst`.
 * - For any other or unspecified type, it calls `createXAst` to auto-detect the project type.
 *
 * @param options - Configuration options and CLI arguments controlling source location, output, and processing type.
 * @returns A Promise that resolves when the AST generation process is complete.
 */
export default async function start(options: Options): Promise<void> {
    const srcDir = options.src
    if (!FileUtils.fileExistsAndIsReadable(srcDir)) {
        console.error("Source directory does not exist or is not readable:", srcDir)
        process.exit(1)
    }

    const type: string = (options.type || "").toLowerCase()
    switch (type) {
        case "nodejs":
        case "js":
        case "javascript":
        case "typescript":
        case "ts":
            return await createJSAst(options)
        case "vue":
            return await createVueAst(options)
        default:
            return await createXAst(options)
    }
}
