import he from "he";
import getOpenGraph from "open-graph-scraper";
import type { Plugin } from "unified";
import type { Literal, Parent } from "unist";
import { visit } from "unist-util-visit";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const YOUTUBE_USER_AGENT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

interface RemarkLinkCardCtmOptions {
	shortenUrl?: boolean;
	imgAsyncLazy?: boolean;
	fallbackImageSrc?: string;
	fallbackImageAlt?: string;
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

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 500;

function getFaviconUrl(url: string) {
	return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64`;
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry<T>(
	fn: () => Promise<T>,
	retries = MAX_RETRIES,
	delayMs = RETRY_BASE_DELAY
): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < retries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (attempt === retries - 1) {
				break;
			}
			const waitMs = delayMs * Math.pow(2, attempt); // simple exponential backoff
			await sleep(waitMs);
		}
	}
	throw lastError;
}

async function getYoutubeMetadata(url: string) {
	try {
		const data = await retry(async () => {
			const response = await fetch(
				`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}`,
				{
					headers: {
						"User-Agent": USER_AGENT,
					},
				}
			);
			if (!response.ok) {
				throw new Error(
					`YouTube oEmbed request failed: ${response.status} ${response.statusText}`
				);
			}
			return response.json();
		});
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
		console.error(`Error fetching YouTube metadata: ${url}`, error);
		return undefined;
	}
}

function isYoutubeUrl(url: string): boolean {
	return url.includes("youtube.com") || url.includes("youtu.be");
}

async function getOpenGraphResult(url: string) {
	try {
		let { result } = await retry(async () => {
			return getOpenGraph({
				url,
				timeout: 10000,
				fetchOptions: {
					headers: {
						"User-Agent": isYoutubeUrl(url) ? YOUTUBE_USER_AGENT : USER_AGENT,
					},
				},
			});
		});
		if (isYoutubeUrl(url)) {
			const youtubeMetadata = await getYoutubeMetadata(url);
			if (youtubeMetadata) {
				result = { ...result, ...youtubeMetadata };
			}
		}
		return result;
	} catch (error) {
		console.error(`Error fetching Open Graph data: ${url}`, error);
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

	const imageSrc = data.ogImageSrc || options.fallbackImageSrc || "";
	const imageAlt = data.ogImageSrc
		? data.ogImageAlt
		: (options.fallbackImageAlt || data.title);

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
      ${imageSrc
			? `<div class="rlc-image-container">
        <img
          class="rlc-image"
          src="${imageSrc}"
          alt="${imageAlt}"
          ${options.imgAsyncLazy ? `decoding="async" loading="lazy"` : ""}
        />
      </div>`
			: ""
		}
    </a>
  `.trim();
}

const remarkLinkCardCtm: Plugin<[RemarkLinkCardCtmOptions], Parent> = (options = {}) => {
	return async (tree) => {
		const blocks: Block[] = [];
		visit(tree, "paragraph", (node: Parent, index: number) => {
			if (node.children.length !== 1) {
				return;
			}
			if (node.data !== undefined) {
				return;
			}
			visit(node, "text", (textNode: Literal) => {
				const urls = (textNode.value as string).match(
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
			} as unknown as any);
		}
		return tree;
	};
};

export default remarkLinkCardCtm;
