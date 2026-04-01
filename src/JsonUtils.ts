import * as fs from "node:fs"

const STREAM_BUFFER_SIZE = 64 * 1024

/**
 * Writes a Map<string, string> as a JSON object directly to a file using buffered I/O,
 * avoiding both the intermediate plain object from Object.fromEntries and the full JSON string.
 *
 * @param filePath The file path to write to.
 * @param map The map to serialize.
 */
export function writeMapToJsonFile(filePath: string, map: Map<string, string>): void {
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
        if (buffer.length >= STREAM_BUFFER_SIZE) {
            flush()
        }
    }

    try {
        write("{")
        let first = true
        for (const [key, value] of map) {
            if (!first) write(",")
            first = false
            write(JSON.stringify(key))
            write(":")
            write(JSON.stringify(value))
        }
        write("}")
        flush()
    } finally {
        fs.closeSync(fd)
    }
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
    const fd = fs.openSync(filePath, "w")
    let buffer = ""
    const seen = new WeakSet<object>()

    function flush(): void {
        if (buffer.length > 0) {
            fs.writeSync(fd, buffer)
            buffer = ""
        }
    }

    function write(s: string): void {
        buffer += s
        if (buffer.length >= STREAM_BUFFER_SIZE) {
            flush()
        }
    }

    function shouldSkip(v: any): boolean {
        if (v === undefined || typeof v === "function" || typeof v === "symbol") return true
        if (typeof v === "object" && v !== null && seen.has(v)) return true
        return false
    }

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
                    writeValue(value.toJSON())
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

    try {
        writeValue(data)
        flush()
    } finally {
        fs.closeSync(fd)
    }
}
