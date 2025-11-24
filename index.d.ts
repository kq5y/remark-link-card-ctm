import type { Parent } from "unist";
interface RemarkLinkCardCtmOptions {
    shortenUrl?: boolean;
    imgAsyncLazy?: boolean;
    fallbackImageSrc?: string;
    fallbackImageAlt?: string;
}
declare const remarkLinkCardCtm: (options?: RemarkLinkCardCtmOptions) => (tree: Parent) => Promise<Parent>;
export default remarkLinkCardCtm;
