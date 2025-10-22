import * as path from "node:path"
import * as os from "node:os"
import * as fs from "node:fs"
import start from "../src/AstGenerator"
import Options from "../src/Options"

async function setupTestFixture(code: string,
                                filename: string,
                                options: Object,
                                testFunc: (dir: string, testFile: string) => void,
                                excludeFiles: (dir: string, testFile: string) => string[] = (): string[] => {
                                    return []
                                }) {
    const tmpDir: string = fs.mkdtempSync(path.join(os.tmpdir(), "astgen-tests"))
    const testFile: string = path.join(tmpDir, filename)
    if (!fs.existsSync((path.dirname(testFile)))) {
        fs.mkdirSync(path.dirname(testFile), {recursive: true})
    }
    fs.writeFileSync(testFile, code)

    const defaultOptions: Options = {
        src: tmpDir,
        type: "js",
        output: path.join(tmpDir, "ast_out"),
        recurse: true,
        tsTypes: true,
        "exclude-file": excludeFiles(tmpDir, testFile),
    }
    await start({...defaultOptions, ...options})
    testFunc(tmpDir, testFile)
    fs.rmSync(tmpDir, {recursive: true})
}


describe('astgen basic functionality', () => {
    it('should parse another js file correctly', async () => {
        const code = `const somedata = require('../../package.json');
          const foo = "Something";
          const bar = {
            foo
          };
          exports.foo = bar.foo;
          module.exports = bar;`;

        await setupTestFixture(code, "main.js", {}, (tmpDir: string, testFile: string) => {
            const resultAst = fs.readFileSync(path.join(tmpDir, "ast_out", "main.js.json")).toString()
            expect(resultAst).toContain("\"fullName\":\"" + testFile.replaceAll("\\", "\\\\") + "\"")
            expect(resultAst).toContain("\"relativeName\":\"main.js\"")
            const resultTypes = fs.readFileSync(path.join(tmpDir, "ast_out", "main.js.typemap")).toString()
            expect(resultTypes).toEqual("{" +
                "\"17:24\":\"Require\"," +
                "\"25:45\":\"string\"," +
                "\"64:67\":\"string\"," +
                "\"70:81\":\"string\"," +
                "\"64:81\":\"string\"," +
                "\"99:102\":\"{ foo: string; }\"," +
                "\"119:122\":\"string\"," +
                "\"105:134\":\"{ foo: string; }\"," +
                "\"99:134\":\"{ foo: string; }\"," +
                "\"146:153\":\"{ foo: any; }\"," +
                "\"160:163\":\"{ foo: string; }\"," +
                "\"164:167\":\"string\"," +
                "\"160:167\":\"string\"," +
                "\"146:167\":\"string\"," +
                "\"179:185\":\"{ exports: { foo: any; }; }\"," +
                "\"186:193\":\"{ foo: any; }\"," +
                "\"179:193\":\"{ foo: any; }\"," +
                "\"196:199\":\"{ foo: string; }\"," +
                "\"179:199\":\"{ foo: any; }\"" +
                "}")
        })
    })

    it('should parse a simple js file correctly', async () => {
        const code = "console.log(\"Hello, world!\");"

        await setupTestFixture(code, "main.js", {}, (tmpDir: string, testFile: string) => {
            const resultAst = fs.readFileSync(path.join(tmpDir, "ast_out", "main.js.json")).toString()
            expect(resultAst).toContain("\"fullName\":\"" + testFile.replaceAll("\\", "\\\\") + "\"")
            expect(resultAst).toContain("\"relativeName\":\"main.js\"")
            const resultTypes = fs.readFileSync(path.join(tmpDir, "ast_out", "main.js.typemap")).toString()
            expect(resultTypes).toEqual("{" +
                "\"0:7\":\"Console\"," +
                "\"8:11\":\"{ (...data: any[]): void; (message?: any, ...optionalParams: any[]): void; }\"," +
                "\"0:11\":\"{ (...data: any[]): void; (message?: any, ...optionalParams: any[]): void; }\"," +
                "\"12:27\":\"string\",\"0:28\":\"void\"" +
                "}")
        })
    })

    it('should exclude files by relative file path correctly', async () => {
        const code = "console.log(\"Hello, world!\");"
        const config = {
            tsTypes: false,
            "exclude-file": ["main.js"]
        }
        await setupTestFixture(code, "main.js", config, (tmpDir: string, _: string) => {
            expect(fs.existsSync(path.join(tmpDir, "ast_out", "main.js.json"))).toBeFalsy()
        })
    })

    it('should exclude files by absolute file path correctly', async () => {
        const code = "console.log(\"Hello, world!\");"
        const config = {tsTypes: false}

        await setupTestFixture(code, "main.js", config, (tmpDir: string, _: string) => {
            expect(fs.existsSync(path.join(tmpDir, "ast_out", "main.js.json"))).toBeFalsy()
        }, (_, testFile): string[] => {
            return [testFile]
        })
    })

    it('should exclude files by relative file path with dir correctly', async () => {
        const code = "console.log(\"Hello, world!\");"
        const config = {
            tsTypes: false,
            "exclude-file": [path.join("src", "main.js")]
        }
        await setupTestFixture(code, "src/main.js", config, (tmpDir: string, _: string) => {
            expect(fs.existsSync(path.join(tmpDir, "ast_out", "src", "main.js.json"))).toBeFalsy()
        })
    })

    it('should exclude files by relative dir path correctly', async () => {
        const code = "console.log(\"Hello, world!\");"
        const config = {
            tsTypes: false,
            "exclude-file": ["src"]
        }
        await setupTestFixture(code, "src/main.js", config, (tmpDir: string, _: string) => {
            expect(fs.existsSync(path.join(tmpDir, "ast_out", "src", "main.js.json"))).toBeFalsy()
        })
    })

    it('should exclude files by absolute dir path correctly', async () => {
        const code = "console.log(\"Hello, world!\");"
        const config = {tsTypes: false}

        await setupTestFixture(code, "src/main.js", config, (tmpDir: string, _: string) => {
            expect(fs.existsSync(path.join(tmpDir, "ast_out", "src", "main.js.json"))).toBeFalsy()
        }, (tmpDir, _): string[] => {
            return [path.join(tmpDir, "src")]
        })
    })

    it('should exclude files by regex correctly', async () => {
        const code = "console.log(\"Hello, world!\");"
        const config = {
            tsTypes: false,
            "exclude-file": [],
            "exclude-regex": new RegExp(".*main.*", "i")
        }
        await setupTestFixture(code, "main.js", config, (tmpDir: string, _: string) => {
            expect(fs.existsSync(path.join(tmpDir, "ast_out", "main.js.json"))).toBeFalsy()
        })
    })

})
