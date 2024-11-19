import * as path from "node:path"
import * as os from "node:os"
import * as fs from "node:fs"
import start from "../src/index"

describe('astgen basic functionality', () => {
    it('should parse simple js file correctly', async () => {
        const tmpDir: string = fs.mkdtempSync(path.join(os.tmpdir(), "astgen-tests"));
        const testFile = path.join(tmpDir, "main.js");
        fs.writeFileSync(testFile, "console.log(\"Hello, world!\");");

        await start({
            src: tmpDir,
            type: "js",
            output: path.join(tmpDir, "ast_out"),
            recurse: true,
            tsTypes: true
        });
        const resultAst = fs.readFileSync(path.join(tmpDir, "ast_out", "main.js.json")).toString();
        expect(resultAst).toContain("\"fullName\":\"" + testFile.replaceAll("\\", "\\\\") + "\"");
        expect(resultAst).toContain("\"relativeName\":\"main.js\"");
        const resultTypes = fs.readFileSync(path.join(tmpDir, "ast_out", "main.js.typemap")).toString();
        expect(resultTypes).toEqual("{\"0\":\"Console\",\"8\":\"{ (...data: any[]): void; (message?: any, ...optionalParams: any[]): void; }\",\"12\":\"\\\"Hello, world!\\\"\"}");

        fs.rmSync(tmpDir, {recursive: true});
    });
});
