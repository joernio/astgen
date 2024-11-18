import * as Defaults from "./Defaults.js";

import fs from "node:fs";
import path from "node:path";

function countFileLines(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        let lineCount = 0;
        fs.createReadStream(filePath)
            .on("data", (buffer: Buffer) => {
                let idx = -1;
                lineCount--; // Because the loop will run once for idx=-1
                do {
                    idx = buffer.indexOf(10, idx + 1);
                    lineCount++;
                } while (idx !== -1);
            }).on("end", () => {
            resolve(lineCount);
        }).on("error", reject);
    });
}

function ignoreDirectory(dirName: string): boolean {
    return dirName.startsWith(".") || dirName.startsWith("__") || Defaults.IGNORE_DIRS.includes(dirName.toLowerCase())
}

function isEmscripten(fileWithDir: string): boolean {
    if (fs.readFileSync(fileWithDir, "utf-8").toString().includes("// EMSCRIPTEN_START_ASM")) {
        console.warn("Parsing", fileWithDir, ":", "File skipped as it contains EMSCRIPTEN code");
        return true;
    }
    return false;
}

function ignoreFile(fileName: string, fileWithDir: string): boolean {
    return fileName.startsWith(".") || fileName.startsWith("__") || Defaults.IGNORE_FILE_PATTERN.test(fileName) || isEmscripten(fileWithDir)
}

export async function filesWithExtensions(dir: string, extensions: string[], files?: string[], result?: string[]): Promise<string[]> {
    const allFiles = files || fs.readdirSync(dir);
    let allResults = result || [];

    for (let file of allFiles) {
        const fileWithDir = path.join(dir, file);
        if (extensions.some((e: string) => fileWithDir.endsWith(e)) && ignoreFile(file, fileWithDir)) {
            continue;
        }
        if (fs.statSync(fileWithDir).isDirectory()) {
            if (ignoreDirectory(path.basename(fileWithDir))) {
                continue;
            }
            try {
                allResults = await filesWithExtensions(fileWithDir, extensions, fs.readdirSync(fileWithDir), allResults);
            } catch (error) {
            }
        } else {
            if (extensions.some((e: string) => fileWithDir.endsWith(e))) {
                let lines = await countFileLines(fileWithDir);
                if (lines > Defaults.MAX_LOC_IN_FILE) {
                    console.warn(fileWithDir, "more than", Defaults.MAX_LOC_IN_FILE, "lines of code");
                } else allResults.push(fileWithDir);
            }
        }
    }
    return allResults;
}
