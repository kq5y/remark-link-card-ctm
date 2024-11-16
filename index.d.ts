import type { Literal, Parent } from "unist";
interface RemarkLinkCardCtmOptions {
    shortenUrl?: boolean;
    imgAsyncLazy?: boolean;
}
declare const remarkLinkCardCtm: (options?: RemarkLinkCardCtmOptions) => (tree: Parent<Literal>) => Promise<Parent<Literal<unknown, import("unist").Data>, import("unist").Data>>;
export default remarkLinkCardCtm;
