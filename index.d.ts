import type { Root } from "mdast";
import type { Plugin } from "unified";
interface RemarkLinkCardCtmOptions {
    shortenUrl?: boolean;
    imgAsyncLazy?: boolean;
    fallbackImageSrc?: string;
    fallbackImageAlt?: string;
}
declare const remarkLinkCardCtm: Plugin<[RemarkLinkCardCtmOptions], Root>;
export default remarkLinkCardCtm;
