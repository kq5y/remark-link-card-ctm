import type { Root } from "mdast";
interface RemarkLinkCardCtmOptions {
    shortenUrl?: boolean;
    imgAsyncLazy?: boolean;
}
declare const remarkLinkCardCtm: (options?: RemarkLinkCardCtmOptions) => (tree: Root) => Promise<void>;
export default remarkLinkCardCtm;