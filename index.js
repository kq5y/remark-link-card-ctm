var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import he from "he";
import getOpenGraph from "open-graph-scraper";
import visit from "unist-util-visit";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const YOUTUBE_USER_AGENT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 500;
function getFaviconUrl(url) {
    return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64`;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function retry(fn_1) {
    return __awaiter(this, arguments, void 0, function* (fn, retries = MAX_RETRIES, delayMs = RETRY_BASE_DELAY) {
        let lastError;
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                return yield fn();
            }
            catch (error) {
                lastError = error;
                if (attempt === retries - 1) {
                    break;
                }
                const waitMs = delayMs * Math.pow(2, attempt); // simple exponential backoff
                yield sleep(waitMs);
            }
        }
        throw lastError;
    });
}
function getYoutubeMetadata(url) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const data = yield retry(() => __awaiter(this, void 0, void 0, function* () {
                const response = yield fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}`, {
                    headers: {
                        "User-Agent": USER_AGENT,
                    },
                });
                if (!response.ok) {
                    throw new Error(`YouTube oEmbed request failed: ${response.status} ${response.statusText}`);
                }
                return response.json();
            }));
            return {
                ogTitle: `${data.title} - YouTube`,
                ogImage: [
                    {
                        url: data.thumbnail_url,
                        alt: data.title,
                    }
                ]
            };
        }
        catch (error) {
            console.error(`Error fetching YouTube metadata: ${url}`, error);
            return undefined;
        }
    });
}
function isYoutubeUrl(url) {
    return url.includes("youtube.com") || url.includes("youtu.be");
}
function getOpenGraphResult(url) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let { result } = yield retry(() => __awaiter(this, void 0, void 0, function* () {
                return getOpenGraph({
                    url,
                    timeout: 10000,
                    fetchOptions: {
                        headers: {
                            "User-Agent": isYoutubeUrl(url) ? YOUTUBE_USER_AGENT : USER_AGENT,
                        },
                    },
                });
            }));
            if (isYoutubeUrl(url)) {
                const youtubeMetadata = yield getYoutubeMetadata(url);
                if (youtubeMetadata) {
                    result = Object.assign(Object.assign({}, result), youtubeMetadata);
                }
            }
            return result;
        }
        catch (error) {
            console.error(`Error fetching Open Graph data: ${url}`, error);
            return undefined;
        }
    });
}
function fetchData(url) {
    return __awaiter(this, void 0, void 0, function* () {
        const ogResult = yield getOpenGraphResult(url);
        const parsedUrl = new URL(url);
        const title = ((ogResult === null || ogResult === void 0 ? void 0 : ogResult.ogTitle) && he.encode(ogResult.ogTitle)) || parsedUrl.hostname;
        const description = ((ogResult === null || ogResult === void 0 ? void 0 : ogResult.ogDescription) && he.encode(ogResult.ogDescription)) || "";
        const faviconUrl = getFaviconUrl(url);
        let ogImageSrc;
        let ogImageAlt;
        if ((ogResult === null || ogResult === void 0 ? void 0 : ogResult.ogImage) && ogResult.ogImage.length >= 1) {
            const ogImage = ogResult.ogImage[0];
            ogImageSrc = ogImage.url;
            if (ogImageSrc.startsWith("/")) {
                ogImageSrc = new URL(ogImageSrc, url).href;
            }
            ogImageAlt = (ogImage.alt && he.encode(ogImage.alt)) || "";
        }
        else {
            ogImageSrc = "";
            ogImageAlt = title;
        }
        return {
            title,
            description,
            faviconUrl,
            ogImageSrc,
            ogImageAlt,
            hostname: parsedUrl.hostname,
        };
    });
}
function generateHtml(url, data, options) {
    const displayUrl = decodeURI(options.shortenUrl ? data.hostname : url);
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
      ${data.ogImageSrc
        ? `<div class="rlc-image-container">
        <img
          class="rlc-image"
          src="${data.ogImageSrc}"
          alt="${data.ogImageAlt}"
          ${options.imgAsyncLazy ? `decoding="async" loading="lazy"` : ""}
        />
      </div>`
        : ""}
    </a>
  `.trim();
}
const remarkLinkCardCtm = (options = {}) => {
    return (tree) => __awaiter(void 0, void 0, void 0, function* () {
        const blocks = [];
        visit(tree, "paragraph", (node, index) => {
            if (node.children.length !== 1) {
                return;
            }
            if (node.data !== undefined) {
                return;
            }
            visit(node, "text", (textNode) => {
                const urls = textNode.value.match(/(https?:\/\/|www(?=\.))([-.\w]+)([^ \t\r\n]*)/g);
                if (urls && urls.length === 1) {
                    blocks.push({
                        url: urls[0],
                        index: index,
                    });
                }
            });
        });
        for (const { url, index } of blocks) {
            const data = yield fetchData(url);
            const linkCardHtml = generateHtml(url, data, options);
            tree.children.splice(index, 1, {
                type: "html",
                value: linkCardHtml,
            });
        }
        return tree;
    });
};
export default remarkLinkCardCtm;
