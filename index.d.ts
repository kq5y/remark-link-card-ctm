import type { Plugin } from "unified";
import type { Parent } from "unist";
interface RemarkLinkCardCtmOptions {
    shortenUrl?: boolean;
    imgAsyncLazy?: boolean;
    fallbackImageSrc?: string;
    fallbackImageAlt?: string;
}
declare const remarkLinkCardCtm: Plugin<[RemarkLinkCardCtmOptions], Parent>;
export default remarkLinkCardCtm;
