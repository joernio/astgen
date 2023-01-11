const babelParser = require("@babel/parser");
const execFileSync = require("child_process");
const tsc = require("typescript");

const path = require("path");
const { join } = require("path");
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

const IGNORE_FILE_PATTERN = new RegExp("(conf|test|spec)\\.(js|ts)$", "i");

const getAllFiles = (dir, extn, files, result, regex) => {
  files = files || fs.readdirSync(dir);
  result = result || [];
  regex = regex || new RegExp(`\\${extn}$`);

  for (let i = 0; i < files.length; i++) {
    if (IGNORE_FILE_PATTERN.test(files[i])) {
      continue;
    }
    let file = join(dir, files[i]);
    if (fs.statSync(file).isDirectory()) {
      // Ignore directories
      const dirName = path.basename(file);
      if (
        dirName.startsWith(".") ||
        dirName.startsWith("__") ||
        IGNORE_DIRS.includes(dirName.toLowerCase())
      ) {
        continue;
      }
      try {
        result = getAllFiles(file, extn, fs.readdirSync(file), result, regex);
      } catch (error) {
        continue;
      }
    } else {
      if (regex.test(file)) {
        result.push(file);
      }
    }
  }
  return result;
};

const babelParserOptions = {
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
    "jsx",
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
const toJSAst = (file) => {
  const ast = babelParser.parse(
    fs.readFileSync(file, "utf-8"),
    babelParserOptions
  );
  return ast;
};

const vueCleaningRegex = /<\/*script.*>|<style[\s\S]*style>|<\/*br>/ig;
const vueTemplateRegex = /(<template.*>)([\s\S]*)(<\/template>)/ig;
const vueCommentRegex = /<\!--[\s\S]*?-->/ig;
const vueBindRegex = /(:\[)([\s\S]*?)(\])/ig;
const vuePropRegex = /(<[\sa-zA-Z]*?)(:|@|\.)([\s\S]*?=)/ig;


/**
 * Convert a single vue file to AST
 */
const toVueAst = (file) => {
  const code = fs.readFileSync(file, "utf-8");
  const cleanedCode = code
    .replace(vueCommentRegex, function(match){ return match.replaceAll(/\S/g, " ") })
    .replace(vueCleaningRegex, function(match){ return match.replaceAll(/\S/g, " ").substring(1) + ";" })
    .replace(vueBindRegex, function(match, grA, grB, grC){
      return grA.replaceAll(/\S/g, " ") +
             grB +
             grC.replaceAll(/\S/g, " ")
    })
    .replace(vuePropRegex, function(match, grA, grB, grC){
      return grA +
             grB.replaceAll(/\S/g, " ") +
             grC.replace(/\.|:|@/g, "-")
    })
    .replace(vueTemplateRegex, function(match, grA, grB, grC){
      return grA +
             grB
               .replaceAll("{{", "{ ")
               .replaceAll("}}", " }") +
             grC
    });
  const ast = babelParser.parse(
    cleanedCode,
    babelParserOptions
  );
  return ast;
};


function createTsc(srcFiles) {
  try {
    const program = tsc.createProgram(srcFiles, {
      target: tsc.ScriptTarget.ES6,
      module: tsc.ModuleKind.CommonJS,
      allowJs: true
    });
    const typeChecker = program.getTypeChecker();
    const seenTypes = new Map();

    function addType(node) {
      let typeStr;
      if (tsc.isFunctionLike(node)) {
        const funcType = typeChecker.getTypeAtLocation(node);
        const funcSignature = typeChecker.getSignaturesOfType(funcType, tsc.SignatureKind.Call)[0];
        typeStr = typeChecker.typeToString(funcSignature.getReturnType(),
          tsc.TypeFormatFlags.NoTruncation | tsc.TypeFormatFlags.InTypeAlias
        );
      } else {
        typeStr = typeChecker.typeToString(typeChecker.getTypeAtLocation(node), node,
          tsc.TypeFormatFlags.NoTruncation | tsc.TypeFormatFlags.InTypeAlias
        );
      }
      const nodeLocation = node.pos + 1
      seenTypes.set(nodeLocation, typeStr);
      tsc.forEachChild(node, addType);
    }

    return {
      program: program,
      typeChecker: typeChecker,
      addType: addType,
      seenTypes: seenTypes
    };
  } catch (err) {
    console.error(err);
    undefined;
  }
}


/**
 * Generate AST for JavaScript or TypeScript
 */
const createJSAst = async (options) => {
  try {
    const promiseMap = await getAllSrcJSAndTSFiles(options.src);
    const srcFiles = promiseMap.flatMap((d) => d);
    const ts = createTsc(srcFiles);

    for (const file of srcFiles) {
      try {
        const ast = toJSAst(file);
        writeAstFile(file, ast, options);
        if (ts) {
          const tsAst = ts.program.getSourceFile(file);
          tsc.forEachChild(tsAst, ts.addType);
          writeTypesFile(tsAst.fileName, ts.seenTypes, options);
        }
      } catch (err) {
        console.error(file, err.message);
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
  const srcFiles = getAllFiles(options.src, ".vue");
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

function mapToObj(map) {
  let obj = Object.create(null);
  for (let [k,v] of map) {
    obj[k.toString()] = v;
  }
  return obj;
}

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
  fs.mkdirSync(path.dirname(outAstFile), { recursive: true });
  fs.writeFileSync(
    outAstFile,
    JSON.stringify(data, getCircularReplacer(), "  ")
  );
  console.log("Converted", relativePath, "to", outAstFile);
};

const writeTypesFile = (file, seenTypes, options) => {
  const relativePath = file.replace(new RegExp("^" + options.src + "/"), "");
  const outAstFile = path.join(options.output, relativePath + ".typemap");
  fs.mkdirSync(path.dirname(outAstFile), { recursive: true });
  fs.writeFileSync(
    outAstFile,
    JSON.stringify(mapToObj(seenTypes))
  );
};


const createXAst = async (options) => {
  const src_dir = options.src;
  try {
    fs.accessSync(src_dir, fs.constants.R_OK);
  } catch (err) {
    console.error(src_dir, "is invalid");
    process.exit(1);
  }
  const { projectType } = options;
  // node.js - package.json
  if (
    fs.existsSync(path.join(src_dir, "package.json")) ||
    fs.existsSync(path.join(src_dir, "rush.json"))
  ) {
    return await createJSAst(options);
  }
  console.error(src_dir, "unkown project type");
  process.exit(1);
};

/**
 * Method to start the ast generation process
 *
 * @args options CLI arguments
 */
const start = async (options) => {
  let { type } = options;
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

module.exports = { start: start }
