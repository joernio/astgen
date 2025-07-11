import * as Defaults from "./Defaults";

import tsc from "typescript";

export type TypeMap = Map<string, string>;

export default class TscUtils {
    private readonly program: tsc.Program;
    private readonly typeChecker: tsc.TypeChecker;

    constructor(files: string[]) {
        this.program = tsc.createProgram(files, Defaults.DEFAULT_TSC_OPTIONS);
        this.typeChecker = this.program.getTypeChecker();
    }

    typeMapForFile(file: string): TypeMap {
        let addType: (node: tsc.Node) => void = (node: tsc.Node): void => {
            if (tsc.isSourceFile(node)) return;
            let typeStr;
            if (this.isSignatureDeclaration(node)) {
                const signature: tsc.Signature = this.typeChecker.getSignatureFromDeclaration(node)!;
                const returnType: tsc.Type = this.typeChecker.getReturnTypeOfSignature(signature);
                typeStr = this.safeTypeToString(returnType);
            } else if (tsc.isFunctionLike(node)) {
                const funcType: tsc.Type = this.typeChecker.getTypeAtLocation(node);
                const funcSignature: tsc.Signature = this.typeChecker.getSignaturesOfType(funcType, tsc.SignatureKind.Call)[0];
                if (funcSignature) {
                    typeStr = this.safeTypeToString(funcSignature.getReturnType());
                } else {
                    typeStr = this.safeTypeToString(this.typeChecker.getTypeAtLocation(node));
                }
            } else {
                typeStr = this.safeTypeToString(this.typeChecker.getTypeAtLocation(node));
            }
            if (typeStr !== Defaults.ANY) {
                const pos = `${node.getStart()}:${node.getEnd()}`;
                seenTypes.set(pos, typeStr);
            }
        }

        const seenTypes = new Map<string, string>();
        this.forEachNode(this.program.getSourceFile(file)!, addType)
        return seenTypes
    }

    private forEachNode(ast: tsc.Node, callback: (node: tsc.Node) => void): void {
        function visit(node: tsc.Node) {
            tsc.forEachChild(node, visit);
            callback(node);
        }

        visit(ast);
    }

    private safeTypeToString(node: tsc.Type): string {
        try {
            const tpe: string = this.typeChecker.typeToString(node, undefined, Defaults.DEFAULT_TSC_TYPE_OPTIONS);
            if (tpe.length === 0) return Defaults.ANY
            if (tpe == Defaults.UNKNOWN) return Defaults.ANY
            if (tpe.startsWith(Defaults.UNRESOLVED)) return Defaults.ANY
            if (Defaults.STRING_REGEX.test(tpe)) return "string";
            if (Defaults.ARRAY_REGEX.test(tpe)) return "__ecma.Array";
            return tpe;
        } catch (err) {
            return Defaults.ANY;
        }
    }

    private isSignatureDeclaration(node: tsc.Node): node is tsc.SignatureDeclaration {
        return tsc.isSetAccessor(node) || tsc.isGetAccessor(node) ||
            tsc.isConstructSignatureDeclaration(node) || tsc.isMethodDeclaration(node) ||
            tsc.isFunctionDeclaration(node) || tsc.isConstructorDeclaration(node)
    }

}

