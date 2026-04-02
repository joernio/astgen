import Options from "./Options"
import * as Defaults from "./Defaults"

import {readdirp} from 'readdirp'
import * as fs from "node:fs"
import * as path from "node:path"

export type FileEntry = { path: string; content: string }

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

function ignoreFileByName(options: Options, fileName: string, fullPath: string, extensions: string[]): boolean {
    return !extensions.some((e: string) => fileName.endsWith(e)) ||
        fileName.startsWith(".") ||
        fileName.startsWith("__") ||
        Defaults.IGNORE_FILE_PATTERN.test(fileName) ||
        options["exclude-file"].some((e: string) => fileIsInIgnorePath(options, fullPath, e)) ||
        (options["exclude-regex"]?.test(fullPath) ?? false)
}

// Reads the file content if it passes all size/content guards, or returns null with a warning.
// Uses the stats object already populated by readdirp (lstat: true) to avoid a redundant stat call.
// Files that pass the size check are read once here; the content is returned to avoid a second
// read during parsing.
function readFileIfValid(fileWithDir: string, stats: fs.Stats): string | null {
    if (stats.size > Defaults.MAX_FILE_SIZE_BYTES) {
        console.warn(fileWithDir, "exceeds maximum file size of", Defaults.MAX_FILE_SIZE_BYTES, "bytes")
        return null
    }
    const content = fs.readFileSync(fileWithDir, "utf-8")
    if (content.includes("// EMSCRIPTEN_START_ASM")) {
        console.warn("Parsing", fileWithDir, ":", "File skipped as it contains EMSCRIPTEN code")
        return null
    }
    let lineStart = 0
    let lineCount = 0
    for (let i = 0; i <= content.length; i++) {
        if (i === content.length || content[i] === "\n") {
            if (i - lineStart > Defaults.MAX_LINE_LENGTH) {
                console.warn(fileWithDir, "line", lineCount + 1, "exceeds", Defaults.MAX_LINE_LENGTH, "bytes")
                return null
            }
            if (++lineCount >= Defaults.MAX_LOC_IN_FILE) {
                console.warn(fileWithDir, "more than", Defaults.MAX_LOC_IN_FILE, "lines of code")
                return null
            }
            lineStart = i + 1
        }
    }
    return content
}

/**
 * Asynchronously retrieves all files with the specified extensions from the source directory,
 * applying exclusion rules defined in the provided options.
 *
 * Uses the streaming readdirp API so that entry objects can be GC'd incrementally.
 * Cheap name-based filters run during traversal; expensive I/O checks (file size,
 * line scanning) run per-entry as entries stream in. The file content is read once and
 * returned with each entry to avoid a second read during parsing.
 * When `options.recurse` is false, only files in the top-level source directory are returned.
 *
 * @param options - The options object containing source directory and exclusion patterns.
 * @param extensions - An array of file extensions to include (e.g., ['.js', '.ts']).
 * @returns An async generator that yields FileEntry objects for matching files.
 */
export async function* filesWithExtensions(options: Options, extensions: string[]): AsyncGenerator<FileEntry> {
    const dir = options.src
    const stream = readdirp(dir, {
        fileFilter: (f) => !ignoreFileByName(options, f.basename, f.fullPath, extensions),
        directoryFilter: (d) => !ignoreDirectory(options, d.basename, d.fullPath),
        lstat: true,
        alwaysStat: true,
        depth: options.recurse ? undefined : 0,
    })
    for await (const entry of stream) {
        const content = readFileIfValid(entry.fullPath, entry.stats as fs.Stats)
        if (content !== null) {
            yield { path: entry.fullPath, content }
        }
    }
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
