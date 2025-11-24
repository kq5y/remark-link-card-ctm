import type { Parent } from "unist";
interface RemarkLinkCardCtmOptions {
    shortenUrl?: boolean;
    imgAsyncLazy?: boolean;
}
declare const remarkLinkCardCtm: (options?: RemarkLinkCardCtmOptions) => (tree: Parent) => Promise<Parent>;
export default remarkLinkCardCtm;
