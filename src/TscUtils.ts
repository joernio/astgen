import * as Defaults from "./Defaults";

import tsc from "typescript";

export interface TscResult {
    program: tsc.Program,
    typeChecker: tsc.TypeChecker,
    addType: (node: tsc.Node) => (void),
    seenTypes: Map<number, string>
}

export function tscForFile(file: string): TscResult {
    const program = tsc.createProgram([file], Defaults.DEFAULT_TSC_OPTIONS);
    const typeChecker = program.getTypeChecker();
    const seenTypes = new Map<number, string>();

    function safeTypeToString(node: tsc.Type): string {
        try {
            return typeChecker.typeToString(node, undefined, tsc.TypeFormatFlags.NoTruncation | tsc.TypeFormatFlags.InTypeAlias);
        } catch (err) {
            return "any";
        }
    }

    function addType(node: tsc.Node) {
        let typeStr;
        if (tsc.isSetAccessor(node) ||
            tsc.isGetAccessor(node) ||
            tsc.isConstructSignatureDeclaration(node) ||
            tsc.isMethodDeclaration(node) ||
            tsc.isFunctionDeclaration(node) ||
            tsc.isConstructorDeclaration(node)) {
            const signature: tsc.Signature = typeChecker.getSignatureFromDeclaration(node)!;
            const returnType = typeChecker.getReturnTypeOfSignature(signature);
            typeStr = safeTypeToString(returnType);
        } else if (tsc.isFunctionLike(node)) {
            const funcType = typeChecker.getTypeAtLocation(node);
            const funcSignature = typeChecker.getSignaturesOfType(funcType, tsc.SignatureKind.Call)[0];
            if (funcSignature) {
                typeStr = safeTypeToString(funcSignature.getReturnType());
            } else {
                typeStr = safeTypeToString(typeChecker.getTypeAtLocation(node));
            }
        } else {
            typeStr = safeTypeToString(typeChecker.getTypeAtLocation(node));
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
}
