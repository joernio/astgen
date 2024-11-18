import * as Defaults from "./Defaults.js";

import {readdirpPromise} from 'readdirp';
import * as fs from "node:fs";
import nReadlines from "n-readlines";

function countFileLines(filePath: string): number {
    const broadbandLines = new nReadlines(filePath);
    let lineNumber = 1;
    while (broadbandLines.next()) {
        lineNumber++;
    }
    return lineNumber
}

function ignoreDirectory(dirName: string): boolean {
    return dirName.startsWith(".") ||
        dirName.startsWith("__") ||
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

function ignoreFile(fileName: string, fileWithDir: string, extensions: string[]): boolean {
    return !extensions.some((e: string) => fileName.endsWith(e)) ||
        fileName.startsWith(".") ||
        fileName.startsWith("__") ||
        Defaults.IGNORE_FILE_PATTERN.test(fileName) ||
        isEmscripten(fileWithDir) ||
        isTooLarge(fileWithDir)
}

export async function filesWithExtensions(dir: string, extensions: string[]): Promise<string[]> {
    const files = await readdirpPromise(dir, {
        fileFilter: (f) => !ignoreFile(f.basename, f.fullPath, extensions),
        directoryFilter: (d) => !ignoreDirectory(d.basename),
        lstat: true
    });
    // @ts-ignore
    return files.map(file => file.fullPath);
}
