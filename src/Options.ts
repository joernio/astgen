export default interface Options {
    src: string,
    output: string,
    type?: string,
    recurse: boolean,
    tsTypes: boolean,
    "exclude-file": string[],
    "exclude-regex"?: RegExp
}
