const vueCleaningRegex = /<\/*script.*>|<style[\s\S]*style>|<\/*br>/ig;
const vueTemplateRegex = /(<template.*>)([\s\S]*)(<\/template>)/ig;
const vueCommentRegex = /<!--[\s\S]*?-->/ig;
const vueBindRegex = /(:\[)(\S*?)(])/ig;
const vuePropRegex = /\s([.:@])(\S*?=)/ig;
const vueOpenImgTag = /(<img)((?!>)[\s\S]+?)( [^\/]>)/ig;

export function cleanVueCode(code: string): string {
    return code.replace(vueCommentRegex, function (match: string): string {
        return match.replaceAll(/\S/g, " ")
    }).replace(vueCleaningRegex, function (match: string): string {
        return match.replaceAll(/\S/g, " ").substring(1) + ";"
    }).replace(vueBindRegex, function (_: string, grA: string, grB: string, grC: string): string {
        return grA.replaceAll(/\S/g, " ") +
            grB +
            grC.replaceAll(/\S/g, " ")
    }).replace(vueTemplateRegex, function (_: string, grA: string, grB: string, grC: string): string {
        return grA +
            grB.replace(vuePropRegex, function (_: string, grA: string, grB: string): string {
                return " " + grA.replace(/[.:@]/g, " ") + grB.replaceAll(".", "-")
            })
                .replace(vueOpenImgTag, function (_: string, grA: string, grB: string, grC: string): string {
                    return grA + grB + grC.replace(" >", "/>")
                })
                .replaceAll("{{", "{ ")
                .replaceAll("}}", " }") +
            grC
    });
}
