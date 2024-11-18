#!/usr/bin/env node

import start from "./index.js"
import Options from "./Options.js"

import path from "path"
import yargs from "yargs"
import {hideBin} from "yargs/helpers"

async function main(argv: string[]) {
    const args: Options = yargs(hideBin(argv))
        .option("src", {
            alias: "i",
            default: ".",
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
        .version()
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
