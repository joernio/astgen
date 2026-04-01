import Options from "./Options"
import * as Defaults from "./Defaults"

import {readdirp} from 'readdirp'
import * as fs from "node:fs"
import nReadlines from "n-readlines"
import * as path from "node:path"

function dirIsInIgnorePath(options: Options, fullPath: string, ignorePath: string): boolean {
    if (path.isAbsolute(ignorePath)) {
        return fullPath.startsWith(ignorePath)
    } else {
        const absIgnorePath = path.join(options.src, ignorePath)
        return fullPath.startsWith(absIgnorePath)
    }
}

function fileIsInIgnorePath(options: Options, fullPath: string, ignorePath: string): boolean {
    if (path.isAbsolute(ignorePath)) {
        return fullPath == ignorePath
    } else {
        const absIgnorePath = path.join(options.src, ignorePath)
        return fullPath == absIgnorePath
    }
}

function ignoreDirectory(options: Options, dirName: string, fullPath: string): boolean {
    return dirName.startsWith(".") ||
        dirName.startsWith("__") ||
        options["exclude-file"].some((e: string) => dirIsInIgnorePath(options, fullPath, e)) ||
        options["exclude-regex"]?.test(fullPath) ||
        Defaults.IGNORE_DIRS.includes(dirName.toLowerCase())
}

function isTooBig(fileWithDir: string): boolean {
    if (fs.statSync(fileWithDir).size > Defaults.MAX_FILE_SIZE_BYTES) {
        console.warn(fileWithDir, "exceeds maximum file size of", Defaults.MAX_FILE_SIZE_BYTES, "bytes")
        return true
    }
    return false
}

const EMSCRIPTEN_MARKER = Buffer.from("// EMSCRIPTEN_START_ASM")

function shouldSkipFileContent(fileWithDir: string): boolean {
    const lines = new nReadlines(fileWithDir)
    let lineNumber = 0
    let line: Buffer | false
    while ((line = lines.next()) !== false) {
        lineNumber++
        if (line.length > Defaults.MAX_LINE_LENGTH) {
            console.warn(fileWithDir, "line", lineNumber, "exceeds", Defaults.MAX_LINE_LENGTH, "bytes")
            return true
        }
        if (lineNumber > Defaults.MAX_LOC_IN_FILE) {
            console.warn(fileWithDir, "more than", Defaults.MAX_LOC_IN_FILE, "lines of code")
            return true
        }
        if (line.includes(EMSCRIPTEN_MARKER)) {
            console.warn("Parsing", fileWithDir, ":", "File skipped as it contains EMSCRIPTEN code")
            return true
        }
    }
    return false
}

function ignoreFileByName(options: Options, fileName: string, fullPath: string, extensions: string[]): boolean {
    return !extensions.some((e: string) => fileName.endsWith(e)) ||
        fileName.startsWith(".") ||
        fileName.startsWith("__") ||
        Defaults.IGNORE_FILE_PATTERN.test(fileName) ||
        options["exclude-file"].some((e: string) => fileIsInIgnorePath(options, fullPath, e)) ||
        (options["exclude-regex"]?.test(fullPath) ?? false)
}

function shouldSkipFileIO(fullPath: string): boolean {
    return isTooBig(fullPath) || shouldSkipFileContent(fullPath)
}

/**
 * Asynchronously retrieves all files with the specified extensions from the source directory,
 * applying exclusion rules defined in the provided options.
 *
 * Uses the streaming readdirp API so that entry objects can be GC'd incrementally.
 * Cheap name-based filters run during traversal; expensive I/O checks (file size,
 * line scanning) run per-entry as entries stream in.
 *
 * @param options - The options object containing source directory and exclusion patterns.
 * @param extensions - An array of file extensions to include (e.g., ['.js', '.ts']).
 * @returns A promise that resolves to an array of absolute file paths matching the extensions and not excluded.
 */
export async function filesWithExtensions(options: Options, extensions: string[]): Promise<string[]> {
    const dir = options.src
    const stream = readdirp(dir, {
        fileFilter: (f) => !ignoreFileByName(options, f.basename, f.fullPath, extensions),
        directoryFilter: (d) => !ignoreDirectory(options, d.basename, d.fullPath),
        lstat: true
    })
    const files: string[] = []
    for await (const entry of stream) {
        if (!shouldSkipFileIO(entry.fullPath)) {
            files.push(entry.fullPath)
        }
    }
    return files
}

/**
 * Checks if the folder or file at the given path exists and is readable.
 *
 * @param path - The path to the folder or file to check.
 * @returns True if the folder or file exists and is readable; false otherwise.
 */
export function fileExistsAndIsReadable(path: string): boolean {
    try {
        fs.accessSync(path, fs.constants.R_OK)
        return true
    } catch (err) {
        return false
    }
}