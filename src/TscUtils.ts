import * as Defaults from "./Defaults";

import tsc from "typescript";

export type TypeMap = Map<string, string>;

function forEachNode(ast: tsc.Node, callback: (node: tsc.Node) => void): void {
    function visit(node: tsc.Node) {
        tsc.forEachChild(node, visit);
        callback(node);
    }

    visit(ast);
}

function safeTypeToString(node: tsc.Type, typeChecker: tsc.TypeChecker): string {
    try {
        const tpe: string = typeChecker.typeToString(node, undefined, Defaults.DEFAULT_TSC_TYPE_OPTIONS);
        if (tpe.length === 0) return Defaults.ANY
        if (tpe == Defaults.UNKNOWN) return Defaults.ANY
        if (Defaults.STRING_REGEX.test(tpe)) return "string";
        if (Defaults.ARRAY_REGEX.test(tpe)) return "__ecma.Array";
        return tpe;
    } catch (err) {
        return Defaults.ANY;
    }
}

export function typeMapForFile(file: string): TypeMap {
    function addType(node: tsc.Node): void {
        if (tsc.isSourceFile(node)) return;
        const typeStr = safeTypeToString(typeChecker.getTypeAtLocation(node), typeChecker);
        if (typeStr !== Defaults.ANY) {
            const pos = `${node.getStart()}:${node.getEnd()}`;
            seenTypes.set(pos, typeStr);
        }
    }

    const program: tsc.Program = tsc.createProgram([file], Defaults.DEFAULT_TSC_OPTIONS);
    const typeChecker: tsc.TypeChecker = program.getTypeChecker();
    const seenTypes = new Map<string, string>();

    forEachNode(program.getSourceFile(file)!, addType)
    return seenTypes
}

