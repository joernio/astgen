import * as Defaults from "./Defaults";
import {DEFAULT_IGNORED_TYPES} from "./Defaults";

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
        if (/^["'`].*["'`]$/.test(tpe)) {
            return "string";
        }
        return tpe;
    } catch (err) {
        return Defaults.ANY;
    }
}

function isSignatureDeclaration(node: tsc.Node): node is tsc.SignatureDeclaration {
    return tsc.isSetAccessor(node) || tsc.isGetAccessor(node) ||
        tsc.isConstructSignatureDeclaration(node) || tsc.isMethodDeclaration(node) ||
        tsc.isFunctionDeclaration(node) || tsc.isConstructorDeclaration(node)
}

export function typeMapForFile(file: string): TypeMap {
    function addType(node: tsc.Node): void {
        if (tsc.isSourceFile(node)) return;
        let typeStr;
        if (isSignatureDeclaration(node)) {
            const signature: tsc.Signature = typeChecker.getSignatureFromDeclaration(node)!;
            const returnType: tsc.Type = typeChecker.getReturnTypeOfSignature(signature);
            typeStr = safeTypeToString(returnType, typeChecker);
        } else if (tsc.isFunctionLike(node)) {
            const funcType: tsc.Type = typeChecker.getTypeAtLocation(node);
            const funcSignature: tsc.Signature = typeChecker.getSignaturesOfType(funcType, tsc.SignatureKind.Call)[0];
            if (funcSignature) {
                typeStr = safeTypeToString(funcSignature.getReturnType(), typeChecker);
            } else {
                typeStr = safeTypeToString(typeChecker.getTypeAtLocation(node), typeChecker);
            }
        } else {
            typeStr = safeTypeToString(typeChecker.getTypeAtLocation(node), typeChecker);
        }
        if (!DEFAULT_IGNORED_TYPES.includes(typeStr)) {
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

