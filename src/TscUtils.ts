import * as Defaults from "./Defaults"

import tsc from "typescript"

export type TypeMap = Map<number, string>

// Packs (start, end) positions into a single number key.
// Using a Map<number, string> avoids per-entry string allocation; at the scale of a full
// TypeMap (one entry per AST node), packed doubles (~12B each) are ~4x cheaper than
// equivalent "start:end" strings (~50B each) and avoid the N inner-Map overhead of a
// nested Map<number, Map<number, string>>.
//
// POS_SHIFT = 2^26: supports positions up to 64MB per file.
// The 5MB file size guard (MAX_FILE_SIZE_BYTES) ensures this assumption holds.
const POS_SHIFT = 0x4000000
export function encodePos(start: number, end: number): number {
    return start * POS_SHIFT + end
}
export function decodePos(key: number): [number, number] {
    const start = Math.floor(key / POS_SHIFT)
    return [start, key - start * POS_SHIFT]
}

/**
 * Utility class for working with the TypeScript compiler API.
 *
 * `TscUtils` provides methods to analyze TypeScript source files, extract type information,
 * and map AST nodes to their inferred types. It leverages the TypeScript compiler's
 * `Program` and `TypeChecker` to perform type analysis.
 *
 * Main features:
 * - Generates a map of node positions to their type strings for a given file.
 * - Safely converts TypeScript types to string representations.
 * - Identifies signature declarations and function-like nodes.
 */
export default class TscUtils {
    private readonly program: tsc.Program
    private readonly typeChecker: tsc.TypeChecker

    constructor(files: string[]) {
        this.program = tsc.createProgram(files, Defaults.DEFAULT_TSC_OPTIONS)
        this.typeChecker = this.program.getTypeChecker()
    }

    /**
     * Generates a map of node positions to their inferred type strings for a given TypeScript source file.
     *
     * This method traverses the AST of the specified file, analyzes each node using the TypeScript compiler API,
     * and records the type information for relevant nodes. The resulting map uses a string key in the format
     * "start:end" (representing the node's position in the file) and maps it to the node's type as a string.
     *
     * @param file - The path to the TypeScript source file to analyze.
     * @returns A `TypeMap` mapping node positions to their inferred type strings.
     */
    typeMapForFile(file: string): TypeMap {
        const addType: (node: tsc.Node) => void = (node: tsc.Node): void => {
            if (!this.shouldResolveType(node)) return
            let typeStr
            if (this.isSignatureDeclaration(node)) {
                const signature = this.typeChecker.getSignatureFromDeclaration(node)
                if (signature) {
                    const returnType: tsc.Type = this.typeChecker.getReturnTypeOfSignature(signature)
                    typeStr = this.safeTypeToString(returnType)
                } else {
                    typeStr = this.safeTypeToString(this.typeChecker.getTypeAtLocation(node))
                }
            } else if (tsc.isFunctionLike(node)) {
                const funcType: tsc.Type = this.typeChecker.getTypeAtLocation(node)
                const funcSignature: tsc.Signature = this.typeChecker.getSignaturesOfType(funcType, tsc.SignatureKind.Call)[0]
                typeStr = funcSignature
                    ? this.safeTypeToString(funcSignature.getReturnType())
                    : this.safeTypeToString(funcType)
            } else {
                typeStr = this.safeTypeToString(this.typeChecker.getTypeAtLocation(node))
            }
            if (typeStr !== Defaults.ANY) {
                seenTypes.set(encodePos(node.getStart(), node.getEnd()), typeStr)
            }
        }

        const seenTypes = new Map<number, string>()
        this.forEachNode(this.program.getSourceFile(file)!, addType)
        return seenTypes
    }

    private forEachNode(ast: tsc.Node, callback: (node: tsc.Node) => void): void {
        function visit(node: tsc.Node) {
            tsc.forEachChild(node, visit)
            callback(node)
        }

        visit(ast)
    }

    private safeTypeToString(node: tsc.Type): string {
        try {
            const tpe: string = this.typeChecker.typeToString(node, undefined, Defaults.DEFAULT_TSC_TYPE_OPTIONS)
            if (tpe.length === 0) return Defaults.ANY
            if (tpe.length > Defaults.MAX_TYPE_STRING_LENGTH) return Defaults.ANY
            if (tpe == Defaults.UNKNOWN) return Defaults.ANY
            if (tpe.startsWith(Defaults.UNRESOLVED)) return Defaults.ANY
            if (Defaults.STRING_REGEX.test(tpe)) return "string"
            if (Defaults.ARRAY_REGEX.test(tpe)) return "__ecma.Array"
            return tpe
        } catch (err) {
            return Defaults.ANY
        }
    }

    private isSignatureDeclaration(node: tsc.Node): node is tsc.SignatureDeclaration {
        return tsc.isSetAccessor(node) || tsc.isGetAccessor(node) ||
            tsc.isConstructSignatureDeclaration(node) || tsc.isMethodDeclaration(node) ||
            tsc.isFunctionDeclaration(node) || tsc.isConstructorDeclaration(node)
    }

    private shouldResolveType(node: tsc.Node): boolean {
        const k = node.kind
        if (k === tsc.SyntaxKind.SourceFile) return false
        if (k === tsc.SyntaxKind.EndOfFileToken) return false
        if (k === tsc.SyntaxKind.SyntaxList) return false
        if (k >= tsc.SyntaxKind.FirstKeyword && k <= tsc.SyntaxKind.LastKeyword) return false
        if (k >= tsc.SyntaxKind.FirstPunctuation && k <= tsc.SyntaxKind.LastPunctuation) return false
        if (k === tsc.SyntaxKind.Decorator) return false
        if (k >= tsc.SyntaxKind.FirstStatement && k <= tsc.SyntaxKind.LastStatement) return false
        return true
    }

}

