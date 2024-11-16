import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import getOpenGraph from "open-graph-scraper";
import he from "he";

interface RemarkLinkCardCtmOptions {
  shortenUrl?: boolean;
  imgAsyncLazy?: boolean;
}

interface Block {
  url: string;
  index: number;
}

interface ResultData {
  title: string,
  description: string,
  faviconUrl: string,
  ogImageSrc: string,
  ogImageAlt: string,
  hostname: string
}

function getFaviconUrl(url: string) {
  return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64`;
}

async function getOpenGraphResult(url: string) {
  try {
    const { result } = await getOpenGraph({url, timeout: 10000});
    return result;
  } catch (error) {
    return undefined;
  }
}

async function fetchData(url: string): Promise<ResultData> {
  const ogResult = await getOpenGraphResult(url);
  const parsedUrl = new URL(url);
  const title = (
    ogResult && ogResult.ogTitle && he.encode(ogResult.ogTitle) ||
    parsedUrl.hostname
  );
  const description = (
    ogResult && ogResult.ogDescription && he.encode(ogResult.ogDescription) ||
    ""
  );
  const faviconUrl = getFaviconUrl(parsedUrl.hostname);
  let ogImageSrc, ogImageAlt;
  if(ogResult && ogResult.ogImage && ogResult.ogImage.length >= 1){
    const ogImage = ogResult.ogImage[0];
    ogImageSrc = ogImage.url;
    ogImageAlt = (ogImage.alt && he.encode(ogImage.alt) || "");
  } else {
    ogImageSrc = "";
    ogImageAlt = title;
  }
  return {
    title, description, faviconUrl, ogImageSrc, ogImageAlt, hostname: parsedUrl.hostname
  }
}

function generateHtml(url: string, data: ResultData, options: RemarkLinkCardCtmOptions): string {
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
      <div class="rlc-image-container">
        <img
          class="rlc-image"
          src="${data.ogImageSrc}"
          alt="${data.ogImageAlt}"
          ${options.imgAsyncLazy ? `decoding="async" loading="lazy"` : ""}
        />
      </div>
    </a>
  `.trim();
}

const remarkLinkCardCtm = (options: RemarkLinkCardCtmOptions = {}) => {
  return async (tree: Root) => {
    const blocks: Block[] = [];
    visit(tree, "paragraph", (node, index) => {
      if(node.children.length !== 1 || !index){
        return;
      }
      if(node.data !== undefined){
        return;
      }
      visit(node, "text", (textNode) => {
        const urls = textNode.value.match(
          /(https?:\/\/|www(?=\.))([-.\w]+)([^ \t\r\n]*)/g
        );
        if (urls && urls.length === 1) {
          blocks.push({
            url: urls[0],
            index: index
          });
        }
      })
    });
    for(const {url, index} of blocks){
      const data = await fetchData(url);
      const linkCardHtml = generateHtml(url, data, options);
      tree.children.splice(index, 1, {
        type: "html",
        value: linkCardHtml
      });
    }
    return tree;
  };
};

export default remarkLinkCardCtm;
