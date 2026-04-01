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

    it('should skip files with more than 50000 lines', async () => {
        const lines = Array(50001).fill('const x = 1;').join('\n')

        await setupTestFixture(lines, "huge.ts", {}, (tmpDir: string, testFile: string) => {
            const outFile = path.join(tmpDir, "ast_out", "huge.ts.json")
            expect(fs.existsSync(outFile)).toBe(false)
        })
    })

    it('should skip files with a line longer than 10000 bytes', async () => {
        const longLine = 'const x = "' + 'a'.repeat(10001) + '";'
        const code = `const y = 1;\n${longLine}\nconst z = 2;`

        await setupTestFixture(code, "longline.ts", {}, (tmpDir: string, testFile: string) => {
            const outFile = path.join(tmpDir, "ast_out", "longline.ts.json")
            expect(fs.existsSync(outFile)).toBe(false)
        })
    })

    it('should skip files larger than 5MB', async () => {
        const bigContent = 'x'.repeat(5 * 1024 * 1024 + 1)

        await setupTestFixture(bigContent, "huge.ts", {}, (tmpDir: string, testFile: string) => {
            const outFile = path.join(tmpDir, "ast_out", "huge.ts.json")
            expect(fs.existsSync(outFile)).toBe(false)
        })
    })

    it('should process files just under all size thresholds', async () => {
        const normalLine = 'const x = "' + 'a'.repeat(9980) + '";'
        const code = `${normalLine}\nconst y = 1;`

        await setupTestFixture(code, "borderline.ts", {}, (tmpDir: string, testFile: string) => {
            const outFile = path.join(tmpDir, "ast_out", "borderline.ts.json")
            expect(fs.existsSync(outFile)).toBe(true)
        })
    })

    it('should produce bounded-length type strings for complex union types', async () => {
        // Validates that the pipeline produces short type strings for complex types.
        // TypeScript's own truncation (~160 chars) handles this; the 500-char guard in
        // safeTypeToString is a defense-in-depth layer for future TS version changes.
        const code = `
type Long = "a1"|"a2"|"a3"|"a4"|"a5"|"a6"|"a7"|"a8"|"a9"|"a10"|
            "b1"|"b2"|"b3"|"b4"|"b5"|"b6"|"b7"|"b8"|"b9"|"b10"|
            "c1"|"c2"|"c3"|"c4"|"c5"|"c6"|"c7"|"c8"|"c9"|"c10"|
            "d1"|"d2"|"d3"|"d4"|"d5"|"d6"|"d7"|"d8"|"d9"|"d10"|
            "e1"|"e2"|"e3"|"e4"|"e5"|"e6"|"e7"|"e8"|"e9"|"e10"|
            "f1"|"f2"|"f3"|"f4"|"f5"|"f6"|"f7"|"f8"|"f9"|"f10";
const x: Long = "a1";
`
        await setupTestFixture(code, "main.ts", {tsTypes: true}, (tmpDir: string) => {
            const resultTypes = fs.readFileSync(path.join(tmpDir, "ast_out", "main.ts.typemap")).toString()
            const parsed = JSON.parse(resultTypes)
            const values = Object.values(parsed) as string[]
            expect(values.every(v => (v as string).length <= 500)).toBe(true)
        })
    })

})
