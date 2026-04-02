import * as fs from "node:fs"
import { decodePos } from "./TscUtils"

const STREAM_BUFFER_SIZE = 64 * 1024

function withBufferedWriter(filePath: string, fn: (write: (s: string) => void) => void): void {
    const fd = fs.openSync(filePath, "w")
    let buffer = ""

    function flush(): void {
        if (buffer.length > 0) {
            fs.writeSync(fd, buffer)
            buffer = ""
        }
    }

    function write(s: string): void {
        buffer += s
        if (buffer.length >= STREAM_BUFFER_SIZE) flush()
    }

    try {
        fn(write)
        flush()
    } finally {
        fs.closeSync(fd)
    }
}

/**
 * Writes a Map<number, string> as a JSON object directly to a file using buffered I/O,
 * avoiding both the intermediate plain object from Object.fromEntries and the full JSON string.
 * Keys are decoded from packed (start, end) positions to "start:end" strings in the output.
 *
 * @param filePath The file path to write to.
 * @param map The map to serialize.
 */
export function writeMapToJsonFile(filePath: string, map: Map<number, string>): void {
    withBufferedWriter(filePath, (write) => {
        write("{")
        let first = true
        for (const [key, value] of map) {
            if (!first) write(",")
            first = false
            const [start, end] = decodePos(key)
            write(`"${start}:${end}"`)
            write(":")
            write(JSON.stringify(value))
        }
        write("}")
    })
}

/**
 * Writes a value as JSON directly to a file using buffered streaming,
 * handling circular references without materializing the full JSON string in memory.
 * Semantics match JSON.stringify with getCircularReplacer:
 * - Circular/duplicate object references are omitted (skipped in objects, null in arrays)
 * - undefined, functions, and symbols are omitted in objects and become null in arrays
 *
 * @param filePath The file path to write to.
 * @param data The value to serialize.
 */
export function writeJsonStreamCircular(filePath: string, data: any): void {
    const seen = new WeakSet<object>()

    function shouldSkip(v: any): boolean {
        return v === undefined || typeof v === "function" || typeof v === "symbol" ||
            (typeof v === "object" && v !== null && seen.has(v))
    }

    withBufferedWriter(filePath, (write) => {
        function writeValue(value: any): void {
            if (value === null) { write("null"); return }
            switch (typeof value) {
                case "string":
                    write(JSON.stringify(value))
                    return
                case "number":
                    write(isFinite(value) ? String(value) : "null")
                    return
                case "boolean":
                    write(value ? "true" : "false")
                    return
                case "object":
                    seen.add(value)
                    if (typeof value.toJSON === "function") {
                        const resolved = value.toJSON()
                        if (typeof resolved === "object" && resolved !== null) seen.add(resolved)
                        writeValue(resolved)
                        return
                    }
                    if (Array.isArray(value)) {
                        writeArray(value)
                    } else {
                        writeObject(value)
                    }
                    return
                default:
                    write("null")
                    return
            }
        }

        function writeArray(arr: any[]): void {
            write("[")
            for (let i = 0; i < arr.length; i++) {
                if (i > 0) write(",")
                if (shouldSkip(arr[i])) {
                    write("null")
                } else {
                    writeValue(arr[i])
                }
            }
            write("]")
        }

        function writeObject(obj: object): void {
            write("{")
            let first = true
            for (const key of Object.keys(obj)) {
                const v = (obj as any)[key]
                if (shouldSkip(v)) continue
                if (!first) write(",")
                first = false
                write(JSON.stringify(key))
                write(":")
                writeValue(v)
            }
            write("}")
        }

        writeValue(data)
    })
}
