const vueCleaningRegex = /<\/*script.*>|<style[\s\S]*style>|<\/*br>/ig;
const vueTemplateRegex = /(<template.*>)([\s\S]*)(<\/template>)/ig;
const vueCommentRegex = /<!--[\s\S]*?-->/ig;
const vueBindRegex = /(:\[)(\S*?)(])/ig;
const vuePropRegex = /\s([.:@])(\S*?=)/ig;
const vueOpenImgTag = /(<img)((?!>)[\s\S]+?)( [^\/]>)/ig;

/**
 * Cleans and normalizes Vue single-file component (SFC) code.
 *
 * This function performs the following operations on the input code:
 * - Removes Vue comments, replacing their content with spaces.
 * - Replaces `<script>`, `<style>`, and `<br>` tags with spaces and a semicolon.
 * - Normalizes dynamic bindings and props syntax.
 * - Adjusts template content, including property names and image tags.
 * - Replaces double curly braces with spaced versions.
 *
 * @param code The raw Vue SFC code as a string.
 * @returns The cleaned and normalized code as a string.
 */
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
