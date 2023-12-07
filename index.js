const babelParser = require("@babel/parser");
const tsc = require("typescript");

const path = require("path");
const {join} = require("path");
const fs = require("fs");

const IGNORE_DIRS = [
    "node_modules",
    "venv",
    "docs",
    "test",
    "tests",
    "e2e",
    "e2e-beta",
    "examples",
    "cypress",
    "jest-cache",
    "eslint-rules",
    "codemods",
    "flow-typed",
    "i18n",
    "vendor",
    "www",
    "dist",
    "build",
];

const IGNORE_FILE_PATTERN = new RegExp("(conf|test|spec|[.-]min|\\.d)\\.(js|ts|jsx|tsx)$", "i");
const MAX_LOC_IN_FILE = 50000;

function countFileLines(filePath){
  return new Promise((resolve, reject) => {
    let lineCount = 0;
    fs.createReadStream(filePath)
      .on("data", (buffer) => {
        let idx = -1;
        lineCount--; // Because the loop will run once for idx=-1
        do {
          idx = buffer.indexOf(10, idx+1);
          lineCount++;
        } while (idx !== -1);
      }).on("end", () => {
        resolve(lineCount);
      }).on("error", reject);
    });
};

async function getAllFiles(dir, extn, files, result, regex) {
    var allFiles = files || fs.readdirSync(dir);
    var allResults = result || [];
    var extRegex = regex || new RegExp(`\\${extn}$`);

    for (let i = 0; i < allFiles.length; i++) {
        const file = allFiles[i];
        if (
            file.startsWith(".") ||
            file.startsWith("__") ||
            IGNORE_FILE_PATTERN.test(file)
        ) {
            continue;
        }
        const fileWithDir = join(dir, file);
        if (fs.statSync(fileWithDir).isDirectory()) {
            // Ignore directories
            const dirName = path.basename(fileWithDir);
            if (
                dirName.startsWith(".") ||
                dirName.startsWith("__") ||
                IGNORE_DIRS.includes(dirName.toLowerCase())
            ) {
                continue;
            }
            try {
                allResults = await getAllFiles(fileWithDir, extn, fs.readdirSync(fileWithDir), allResults, extRegex);
            } catch (error) {
            }
        } else {
            let lines = await countFileLines(fileWithDir);
            if (extRegex.test(fileWithDir)) {
                if (lines > MAX_LOC_IN_FILE) {
                    console.warn(fileWithDir, "more than", MAX_LOC_IN_FILE, "lines of code");   
                } else allResults.push(fileWithDir);
            }
        }
    }
    return allResults;
};

const babelParserOptions = {
    sourceType: "unambiguous",
    allowImportExportEverywhere: true,
    allowAwaitOutsideFunction: true,
    allowNewTargetOutsideFunction: true,
    allowReturnOutsideFunction: true,
    allowSuperOutsideMethod: true,
    allowUndeclaredExports: true,
    errorRecovery: true,
    plugins: [
        "optionalChaining",
        "classProperties",
        "decorators-legacy",
        "exportDefaultFrom",
        "doExpressions",
        "numericSeparator",
        "dynamicImport",
        "jsx",
        "typescript",
    ],
};

const babelSafeParserOptions = {
    sourceType: "module",
    allowImportExportEverywhere: true,
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    errorRecovery: true,
    plugins: [
        "optionalChaining",
        "classProperties",
        "decorators-legacy",
        "exportDefaultFrom",
        "doExpressions",
        "numericSeparator",
        "dynamicImport",
        "typescript",
    ],
};

/**
 * Return paths to all (j|tsx?) files.
 */
const getAllSrcJSAndTSFiles = (src) =>
    Promise.all([
        getAllFiles(src, ".js"),
        getAllFiles(src, ".jsx"),
        getAllFiles(src, ".cjs"),
        getAllFiles(src, ".mjs"),
        getAllFiles(src, ".ts"),
        getAllFiles(src, ".tsx"),
    ]);

/**
 * Convert a single JS/TS file to AST
 */
const fileToJsAst = (file) => {
    try {
        return babelParser.parse(
            fs.readFileSync(file, "utf-8"),
            babelParserOptions
        );
    } catch {
        return babelParser.parse(
            fs.readFileSync(file, "utf-8"),
            babelSafeParserOptions
        );
    }
};

/**
 * Convert a single JS/TS code snippet to AST
 */
const codeToJsAst = (code) => {
    try {
        return babelParser.parse(
            code,
            babelParserOptions
        );
    } catch {
        return babelParser.parse(
            code,
            babelSafeParserOptions
        );
    }
};

const vueCleaningRegex = /<\/*script.*>|<style[\s\S]*style>|<\/*br>/ig;
const vueTemplateRegex = /(<template.*>)([\s\S]*)(<\/template>)/ig;
const vueCommentRegex = /<\!--[\s\S]*?-->/ig;
const vueBindRegex = /(:\[)([\S]*?)(\])/ig;
const vuePropRegex = /\s([.:@])([\S]*?=)/ig;
const vueOpenImgTag = /(<img)((?!>)[\s\S]+?)( [^\/]>)/ig;

/**
 * Convert a single vue file to AST
 */
const toVueAst = (file) => {
    const code = fs.readFileSync(file, "utf-8");
    const cleanedCode = code
        .replace(vueCommentRegex, function (match) {
            return match.replaceAll(/\S/g, " ")
        })
        .replace(vueCleaningRegex, function (match) {
            return match.replaceAll(/\S/g, " ").substring(1) + ";"
        })
        .replace(vueBindRegex, function (match, grA, grB, grC) {
            return grA.replaceAll(/\S/g, " ") +
                grB +
                grC.replaceAll(/\S/g, " ")
        })
        .replace(vueTemplateRegex, function (match, grA, grB, grC) {
            return grA +
                grB.replace(vuePropRegex, function (match, grA, grB) {
                        return " " + grA.replace(/[.:@]/g, " ") + grB.replaceAll(".", "-")
                    })
                    .replace(vueOpenImgTag, function (match, grA, grB, grC) {
                        return grA + grB + grC.replace(" >", "/>")
                    })
                    .replaceAll("{{", "{ ")
                    .replaceAll("}}", " }") +
                grC
        });
    return codeToJsAst(cleanedCode);
};

function createTsc(srcFiles) {
    try {
        const program = tsc.createProgram(srcFiles, {
            target: tsc.ScriptTarget.ES2020,
            module: tsc.ModuleKind.CommonJS,
            allowJs: true,
            allowUnreachableCode: true,
            allowUnusedLabels: true,
            alwaysStrict: false,
            emitDecoratorMetadata: true,
            exactOptionalPropertyTypes: true,
            experimentalDecorators: false,
            ignoreDeprecations: true,
            noStrictGenericChecks: true,
            noUncheckedIndexedAccess: false,
            noPropertyAccessFromIndexSignature: false,
            removeComments: true
        });
        const typeChecker = program.getTypeChecker();
        const seenTypes = new Map();

        function safeTypeToString(node) {
            try {
                return typeChecker.typeToString(node,
                    tsc.TypeFormatFlags.NoTruncation | tsc.TypeFormatFlags.InTypeAlias
                );
            } catch (err) {
                return "any";
            }
        }

        function safeTypeWithContextToString(node, context) {
            try {
                return typeChecker.typeToString(node, context,
                    tsc.TypeFormatFlags.NoTruncation | tsc.TypeFormatFlags.InTypeAlias
                );
            } catch (err) {
                return "any";
            }
        }

        function addType(node) {
            let typeStr;
            if (tsc.isSetAccessor(node) ||
                tsc.isGetAccessor(node) ||
                tsc.isConstructSignatureDeclaration(node) ||
                tsc.isMethodDeclaration(node) ||
                tsc.isFunctionDeclaration(node) ||
                tsc.isConstructorDeclaration(node)) {
                const signature = typeChecker.getSignatureFromDeclaration(node);
                const returnType = typeChecker.getReturnTypeOfSignature(signature);
                typeStr = safeTypeToString(returnType);
            } else if (tsc.isFunctionLike(node)) {
                const funcType = typeChecker.getTypeAtLocation(node);
                const funcSignature = typeChecker.getSignaturesOfType(funcType, tsc.SignatureKind.Call)[0];
                if (funcSignature) {
                    typeStr = safeTypeToString(funcSignature.getReturnType());
                } else {
                    typeStr = safeTypeWithContextToString(typeChecker.getTypeAtLocation(node), node);
                }
            } else {
                typeStr = safeTypeWithContextToString(typeChecker.getTypeAtLocation(node), node);
            }
            if (!["any", "unknown", "any[]", "unknown[]"].includes(typeStr)) seenTypes.set(node.getStart(), typeStr);
            tsc.forEachChild(node, addType);
        }

        return {
            program: program,
            typeChecker: typeChecker,
            addType: addType,
            seenTypes: seenTypes
        };
    } catch (err) {
        console.warn("Retrieving types", err.message);
        return undefined;
    }
}

/**
 * Generate AST for JavaScript or TypeScript
 */
const createJSAst = async (options) => {
    try {
        const promiseMap = await getAllSrcJSAndTSFiles(options.src);
        const srcFiles = promiseMap.flatMap((d) => d);
        let ts;
        if (options.tsTypes) {
            ts = createTsc(srcFiles);
        }

        for (const file of srcFiles) {
            try {
                const ast = fileToJsAst(file);
                writeAstFile(file, ast, options);
            } catch (err) {
                console.error(file, err.message);
            }
            if (ts) {
                try {
                    const tsAst = ts.program.getSourceFile(file);
                    tsc.forEachChild(tsAst, ts.addType);
                    writeTypesFile(file, ts.seenTypes, options);
                    ts.seenTypes.clear();
                } catch (err) {
                    console.warn("Retrieving types", file, ":", err.message);
                }
            }
        }
    } catch (err) {
        console.error(err);
    }
};

/**
 * Generate AST for .vue files
 */
const createVueAst = async (options) => {
    const srcFiles = await getAllFiles(options.src, ".vue");
    for (const file of srcFiles) {
        try {
            const ast = toVueAst(file);
            if (ast) {
                writeAstFile(file, ast, options);
            }
        } catch (err) {
            console.error(file, err.message);
        }
    }
};

/**
 * Deal with cyclic reference in json
 */
const getCircularReplacer = () => {
    const seen = new WeakSet();
    return (key, value) => {
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
 * Write AST data to a json file
 */
const writeAstFile = (file, ast, options) => {
    const relativePath = file.replace(new RegExp("^" + options.src + "/"), "");
    const outAstFile = path.join(options.output, relativePath + ".json");
    const data = {
        fullName: file,
        relativeName: relativePath,
        ast: ast,
    };
    fs.mkdirSync(path.dirname(outAstFile), {recursive: true});
    fs.writeFileSync(
        outAstFile,
        JSON.stringify(data, getCircularReplacer(), "  ")
    );
    console.log("Converted AST for", relativePath, "to", outAstFile);
};

const writeTypesFile = (file, seenTypes, options) => {
    const relativePath = file.replace(new RegExp("^" + options.src + "/"), "");
    const outTypeFile = path.join(options.output, relativePath + ".typemap");
    fs.mkdirSync(path.dirname(outTypeFile), {recursive: true});
    fs.writeFileSync(
        outTypeFile,
        JSON.stringify(Object.fromEntries(seenTypes), undefined, "  ")
    );
    console.log("Converted types for", relativePath, "to", outTypeFile);
};

const createXAst = async (options) => {
    const src_dir = options.src;
    try {
        fs.accessSync(src_dir, fs.constants.R_OK);
    } catch (err) {
        console.error(src_dir, "is invalid");
        process.exit(1);
    }
    if (
        fs.existsSync(path.join(src_dir, "package.json")) ||
        fs.existsSync(path.join(src_dir, "rush.json"))
    ) {
        return await createJSAst(options);
    }
    console.error(src_dir, "unknown project type");
    process.exit(1);
};

/**
 * Method to start the ast generation process
 *
 * @args options CLI arguments
 */
const start = async (options) => {
    let {type} = options;
    if (!type) {
        type = "";
    }
    type = type.toLowerCase();
    switch (type) {
        case "nodejs":
        case "js":
        case "javascript":
        case "typescript":
        case "ts":
            return await createJSAst(options);
        case "vue":
            return await createVueAst(options);
        default:
            return await createXAst(options);
    }
};

module.exports = {start: start}
