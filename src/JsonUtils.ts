/**
 * Returns a replacer function for JSON.stringify that handles cyclic references.
 * Objects that have already been seen are omitted to prevent circular structure errors.
 * @returns {(key: any, value: any) => any} A replacer function for JSON.stringify.
 */
const getCircularReplacer = () => {
    const seen = new WeakSet();
    return (_: any, value: any): any => {
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return;
            }
            seen.add(value);
        }
        return value;
    };
};

/**
 * Safely serializes objects with potential circular references to a JSON string.
 * Uses a custom replacer to omit cyclic structures, preventing errors from JSON.stringify.
 * @param data The value to convert to a JSON string.
 * @returns A JSON string representation of the input, with cycles omitted.
 */
export function stringifyCircular(data: any): string {
    return JSON.stringify(data, getCircularReplacer())
}

/**
 * Serializes a JavaScript value to a JSON string.
 * Unlike stringifyCircular, this function does not handle circular references and will throw an TypeError if any are present.
 * @param data The value to convert to a JSON string.
 * @returns A JSON string representation of the input.
 */
export function stringify(data: any): string {
    return JSON.stringify(data)
}
