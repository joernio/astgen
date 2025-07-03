#!/usr/bin/env node

import start from "./index"
import Options from "./Options"

import * as path from "node:path"
import yargs from "yargs"
import {hideBin} from "yargs/helpers"

export const version: string = '[VI]{{inject}}[/VI]';

async function main(argv: string[]) {
    const args: Options = yargs(hideBin(argv))
        .option("src", {
            alias: "i",
            default: ".",
            coerce: (arg: any): string => {
                return path.resolve(arg.toString())
            },
            description: "Source directory",
        })
        .option("output", {
            alias: "o",
            default: "ast_out",
            description: "Output directory for generated AST json files",
        })
        .option("type", {
            alias: "t",
            type: "string",
            description: "Project type. Default auto-detect",
        })
        .option("recurse", {
            alias: "r",
            default: true,
            type: "boolean",
            description: "Recurse mode suitable for mono-repos",
        })
        .option("tsTypes", {
            default: true,
            type: "boolean",
            description: "Generate type mappings using the Typescript Compiler API",
        })
        .option("exclude-file", {
            default: [],
            type: "string",
            array: true,
            description: "Exclude this file. Can be specified multiple times. Default is empty."
        })
        .option("exclude-regex", {
            coerce: (arg: any): RegExp | undefined => {
                try {
                    return new RegExp(arg.toString(), "i")
                } catch (err) {
                    return undefined;
                }
            },
            description: "Exclude files matching this regex (matches the absolute path)."
        })
        .version(version)
        .help("h").parseSync();

    try {
        if (args.output === "ast_out") {
            args.output = path.join(args.src, args.output);
        }
        await start(args);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main(process.argv)
