/**
 * Deal with cyclic reference in json
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

export function stringifyCircular(data: any): string {
    return JSON.stringify(data, getCircularReplacer())
}

export function stringify(data: any): string {
    return JSON.stringify(data)
}
