var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { visit } from "unist-util-visit";
import getOpenGraph from "open-graph-scraper";
import { encode } from "he";
function getFaviconUrl(url) {
    return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64`;
}
function getOpenGraphResult(url) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { result } = yield getOpenGraph({ url, timeout: 10000 });
            return result;
        }
        catch (error) {
            return undefined;
        }
    });
}
function fetchData(url) {
    return __awaiter(this, void 0, void 0, function* () {
        const ogResult = yield getOpenGraphResult(url);
        const parsedUrl = new URL(url);
        const title = (ogResult && ogResult.ogTitle && encode(ogResult.ogTitle) ||
            parsedUrl.hostname);
        const description = (ogResult && ogResult.ogDescription && encode(ogResult.ogDescription) ||
            "");
        const faviconUrl = getFaviconUrl(parsedUrl.hostname);
        let ogImageSrc, ogImageAlt;
        if (ogResult && ogResult.ogImage && ogResult.ogImage.length >= 1) {
            const ogImage = ogResult.ogImage[0];
            ogImageSrc = ogImage.url;
            ogImageAlt = (ogImage.alt && encode(ogImage.alt) || "");
        }
        else {
            ogImageSrc = "";
            ogImageAlt = title;
        }
        return {
            title, description, faviconUrl, ogImageSrc, ogImageAlt, hostname: parsedUrl.hostname
        };
    });
}
function generateHtml(url, data, options) {
    const displayUrl = options.shortenUrl ? data.hostname : url;
    return `
    <a class="rlc-container" href="${url}">
      <div class="rlc-info">
        <div class="rlc-title">${data.title}</div>
        <div class="rlc-description">${data.description}</div>
        <div class="rlc-url-container">
          <img
            class="rlc-favicon"
            src="${data.faviconUrl}"
            alt="${data.title} favicon"
            width="16"
            height="16"
            ${options.imgAsyncLazy ? `decoding="async" loading="lazy"` : ""}
          />
          <span class="rlc-url">${displayUrl}</span>
        </div>
      </div>
      <div class="rlc-image-container">
        <img
          class="rlc-image"
          src="${data.ogImageSrc}"
          alt="${data.ogImageAlt}"
          ${options.imgAsyncLazy ? `decoding="async" loading="lazy"` : ""}
        />
      </div>
    </a>
  `;
}
const remarkLinkCardCtm = (options = {}) => {
    return (tree) => __awaiter(void 0, void 0, void 0, function* () {
        const blocks = [];
        visit(tree, "paragraph", (node, index) => {
            if (node.children.length !== 1 || !node.data || !index) {
                return;
            }
            visit(node, "text", (textNode) => {
                const urls = textNode.value.match(/(https?:\/\/|www(?=\.))([-.\w]+)([^ \t\r\n]*)/g);
                if (urls && urls.length === 1) {
                    blocks.push({
                        url: urls[0],
                        index: index
                    });
                }
            });
        });
        for (const { url, index } of blocks) {
            const data = yield fetchData(url);
            const linkCardHtml = generateHtml(url, data, options);
            tree.children.splice(index, 1, {
                type: "html",
                value: linkCardHtml
            });
        }
    });
};
export default remarkLinkCardCtm;
