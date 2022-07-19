#!/usr/bin/env node

const { start } = require("../index.js");
const fs = require("fs");
const path = require("path");
const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");

async function main(argvs) {
  const args = yargs(hideBin(argvs))
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
      description: "Project type. Default auto-detect",
    })
    .option("recurse", {
      alias: "r",
      default: true,
      type: "boolean",
      description: "Recurse mode suitable for mono-repos",
    })
    .version()
    .help("h").argv;

  if (args.version) {
    const packageJsonAsString = fs.readFileSync(
      path.join(__dirname, "../", "package.json"),
      "utf-8"
    );
    const packageJson = JSON.parse(packageJsonAsString);

    console.log(packageJson.version);
    process.exit(0);
  }

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
