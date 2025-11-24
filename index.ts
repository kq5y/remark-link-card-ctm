import he from "he";
import getOpenGraph from "open-graph-scraper";
import type { Literal, Parent } from "unist";
import visit from "unist-util-visit";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

interface RemarkLinkCardCtmOptions {
	shortenUrl?: boolean;
	imgAsyncLazy?: boolean;
}

interface Block {
	url: string;
	index: number;
}

interface ResultData {
	title: string;
	description: string;
	faviconUrl: string;
	ogImageSrc: string;
	ogImageAlt: string;
	hostname: string;
}

function getFaviconUrl(url: string) {
	return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64`;
}

async function getYoutubeMetadata(url: string) {
	try {
		const response = await fetch(
			`https://www.youtube.com/oembed?url=${encodeURIComponent(
				url
			)}`,
			{
				headers: {
					"User-Agent": USER_AGENT,
				},
			}
		);
		if (!response.ok) {
			throw new Error(`YouTube oEmbed request failed: ${response.statusText}`);
		}
		const data = await response.json();
		return {
			ogTitle: `${data.title} - YouTube`,
			ogImage: [
				{
					url: data.thumbnail_url,
					alt: data.title,
				}
			]
		};
	} catch (error) {
		console.error(`Error fetching YouTube metadata: ${error}`);
		return undefined;
	}
}

async function getOpenGraphResult(url: string) {
	try {
		let { result } = await getOpenGraph({
			url,
			timeout: 10000,
			fetchOptions: {
				headers: {
					"User-Agent": USER_AGENT,
				},
			},
		});
		if (url.includes("youtube.com") || url.includes("youtu.be")) {
			const youtubeMetadata = await getYoutubeMetadata(url);
			if (youtubeMetadata) {
				result = { ...result, ...youtubeMetadata };
			}
		}
		return result;
	} catch (error) {
		console.error(`Error fetching Open Graph data: ${url}`);
		return undefined;
	}
}

async function fetchData(url: string): Promise<ResultData> {
	const ogResult = await getOpenGraphResult(url);
	const parsedUrl = new URL(url);
	const title =
		(ogResult?.ogTitle && he.encode(ogResult.ogTitle)) || parsedUrl.hostname;
	const description =
		(ogResult?.ogDescription && he.encode(ogResult.ogDescription)) || "";
	const faviconUrl = getFaviconUrl(url);
	let ogImageSrc: string;
	let ogImageAlt: string;
	if (ogResult?.ogImage && ogResult.ogImage.length >= 1) {
		const ogImage = ogResult.ogImage[0];
		ogImageSrc = ogImage.url;
		if (ogImageSrc.startsWith("/")) {
			ogImageSrc = new URL(ogImageSrc, url).href;
		}
		ogImageAlt = (ogImage.alt && he.encode(ogImage.alt)) || "";
	} else {
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
}

function generateHtml(
	url: string,
	data: ResultData,
	options: RemarkLinkCardCtmOptions,
): string {
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
			: ""
		}
    </a>
  `.trim();
}

const remarkLinkCardCtm = (options: RemarkLinkCardCtmOptions = {}) => {
	return async (tree: Parent<Literal>) => {
		const blocks: Block[] = [];
		visit<Parent>(tree, "paragraph", (node, index) => {
			if (node.children.length !== 1) {
				return;
			}
			if (node.data !== undefined) {
				return;
			}
			visit<Literal<string>>(node, "text", (textNode) => {
				const urls = textNode.value.match(
					/(https?:\/\/|www(?=\.))([-.\w]+)([^ \t\r\n]*)/g,
				);
				if (urls && urls.length === 1) {
					blocks.push({
						url: urls[0],
						index: index,
					});
				}
			});
		});
		for (const { url, index } of blocks) {
			const data = await fetchData(url);
			const linkCardHtml = generateHtml(url, data, options);
			tree.children.splice(index, 1, {
				type: "html",
				value: linkCardHtml,
			});
		}
		return tree;
	};
};

export default remarkLinkCardCtm;
