import Options from "./Options";
import * as Defaults from "./Defaults";

import {readdirpPromise} from 'readdirp';
import * as fs from "node:fs";
import nReadlines from "n-readlines";
import * as path from "node:path"

function countFileLines(filePath: string): number {
    const broadbandLines = new nReadlines(filePath);
    let lineNumber = 1;
    while (broadbandLines.next()) {
        lineNumber++;
    }
    return lineNumber
}

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

function isEmscripten(fileWithDir: string): boolean {
    if (fs.readFileSync(fileWithDir, "utf-8").toString().includes("// EMSCRIPTEN_START_ASM")) {
        console.warn("Parsing", fileWithDir, ":", "File skipped as it contains EMSCRIPTEN code");
        return true;
    }
    return false;
}

function isTooLarge(fileWithDir: string): boolean {
    if (countFileLines(fileWithDir) > Defaults.MAX_LOC_IN_FILE) {
        console.warn(fileWithDir, "more than", Defaults.MAX_LOC_IN_FILE, "lines of code");
        return true;
    }
    return false;
}

function ignoreFile(options: Options, fileName: string, fullPath: string, extensions: string[]): boolean {
    return !extensions.some((e: string) => fileName.endsWith(e)) ||
        fileName.startsWith(".") ||
        fileName.startsWith("__") ||
        Defaults.IGNORE_FILE_PATTERN.test(fileName) ||
        options["exclude-file"].some((e: string) => fileIsInIgnorePath(options, fullPath, e)) ||
        options["exclude-regex"]?.test(fullPath) ||
        isEmscripten(fullPath) ||
        isTooLarge(fullPath)
}

/**
 * Asynchronously retrieves all files with the specified extensions from the source directory,
 * applying exclusion rules defined in the provided options.
 *
 * @param options - The options object containing source directory and exclusion patterns.
 * @param extensions - An array of file extensions to include (e.g., ['.js', '.ts']).
 * @returns A promise that resolves to an array of absolute file paths matching the extensions and not excluded.
 */
export async function filesWithExtensions(options: Options, extensions: string[]): Promise<string[]> {
    const dir = options.src
    const files = await readdirpPromise(dir, {
        fileFilter: (f) => !ignoreFile(options, f.basename, f.fullPath, extensions),
        directoryFilter: (d) => !ignoreDirectory(options, d.basename, d.fullPath),
        lstat: true
    });
    // @ts-ignore
    return files.map(file => file.fullPath);
}
