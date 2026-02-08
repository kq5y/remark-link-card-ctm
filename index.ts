import { gotScraping } from "got-scraping";
import he from "he";
import type { Root } from "mdast";
import getOpenGraph from "open-graph-scraper";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser } from "puppeteer";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

const puppeteer = puppeteerExtra.default ?? puppeteerExtra;
puppeteer.use(StealthPlugin());

const USER_AGENTS = [
	"facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
	"Twitterbot/1.0",
	"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
];
const YOUTUBE_USER_AGENT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

interface RemarkLinkCardCtmOptions {
	shortenUrl?: boolean;
	imgAsyncLazy?: boolean;
	fallbackImageSrc?: string;
	fallbackImageAlt?: string;
}

interface Block {
	url: string;
	index: number | undefined;
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
						"User-Agent": USER_AGENTS[0],
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

function isYoutubeVideoUrl(url: string): boolean {
	if (url.includes("youtu.be/")) {
		return true;
	}
	if (url.includes("youtube.com/watch")) {
		return true;
	}
	if (url.includes("youtube.com/embed/")) {
		return true;
	}
	if (url.includes("youtube.com/v/")) {
		return true;
	}
	return false;
}

function isNpmjsPackageUrl(url: string): boolean {
	return url.includes("npmjs.com/package/");
}

function extractNpmPackageName(url: string): string | null {
	const match = url.match(/npmjs\.com\/package\/(.+?)(?:\?|#|$)/);
	if (match) {
		return decodeURIComponent(match[1]);
	}
	return null;
}

async function getNpmjsMetadata(url: string) {
	const packageName = extractNpmPackageName(url);
	if (!packageName) {
		return undefined;
	}
	try {
		const data = await retry(async () => {
			const response = await fetch(
				`https://registry.npmjs.org/${encodeURIComponent(packageName).replace(/%40/g, "@").replace(/%2F/g, "/")}`,
				{
					headers: {
						"Accept": "application/json",
					},
				}
			);
			if (!response.ok) {
				throw new Error(
					`npm registry request failed: ${response.status} ${response.statusText}`
				);
			}
			return response.json();
		});
		const description = data.description || "";
		return {
			ogTitle: `${packageName} - npm`,
			ogDescription: description,
			ogImage: [
				{
					url: "https://static-production.npmjs.com/338e4905a2684ca96e08c7780fc68412.png",
					alt: packageName,
				}
			]
		};
	} catch (error) {
		console.error(`Error fetching npm metadata: ${url}`, error);
		return undefined;
	}
}

let browserInstance: Browser | null = null;
let browserCleanupRegistered = false;

async function getBrowser(): Promise<Browser> {
	if (!browserInstance) {
		browserInstance = await puppeteer.launch({
			headless: true,
			executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--disable-dev-shm-usage",
				"--disable-gpu",
			],
		});

		if (!browserCleanupRegistered) {
			browserCleanupRegistered = true;
			process.on("exit", () => {
				browserInstance?.close();
			});
		}
	}
	return browserInstance;
}

async function fetchHtmlWithPuppeteer(url: string): Promise<string | null> {
	try {
		const browser = await getBrowser();
		const page = await browser.newPage();
		await page.setUserAgent(
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
		);
		await page.setExtraHTTPHeaders({
			"Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
		});

		const response = await page.goto(url, {
			waitUntil: "networkidle2",
			timeout: 20000,
		});

		// Check if we got a valid response
		if (!response || response.status() >= 400) {
			await page.close();
			return null;
		}

		// Wait a bit for any JS challenges to complete
		await sleep(1000);

		const html = await page.content();
		await page.close();
		return html;
	} catch {
		return null;
	}
}

function hasValidOgTags(html: string): boolean {
	return html.includes('og:title') || html.includes('og:description') || html.includes('<title');
}

async function fetchHtmlDirectly(url: string): Promise<string | null> {
	// First try got-scraping
	try {
		const response = await gotScraping({
			url,
			timeout: { request: 10000 },
			headers: {
				"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
				"Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
			},
		});
		if (response.statusCode === 200 && hasValidOgTags(response.body)) {
			return response.body;
		}
	} catch {
		// ignore, try puppeteer
	}

	// Fallback to Puppeteer for sites with advanced protection
	return await fetchHtmlWithPuppeteer(url);
}

async function getOpenGraphResult(url: string) {
	// npmjs.com uses Cloudflare protection, use Registry API instead
	if (isNpmjsPackageUrl(url)) {
		return await getNpmjsMetadata(url);
	}

	// First, try to fetch HTML directly with multiple User-Agents
	const html = await fetchHtmlDirectly(url);
	if (html) {
		try {
			let { result } = await getOpenGraph({ html });
			if (isYoutubeVideoUrl(url)) {
				const youtubeMetadata = await getYoutubeMetadata(url);
				if (youtubeMetadata) {
					result = { ...result, ...youtubeMetadata };
				}
			}
			return result;
		} catch {
			// ignore parse errors
		}
	}

	// Fallback: use open-graph-scraper directly
	const userAgent = isYoutubeUrl(url) ? YOUTUBE_USER_AGENT : USER_AGENTS[0];
	try {
		let { result } = await retry(async () => {
			return getOpenGraph({
				url,
				timeout: 10000,
				fetchOptions: {
					headers: {
						"User-Agent": userAgent,
						"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
						"Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
					},
				},
			});
		});
		if (isYoutubeVideoUrl(url)) {
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

const remarkLinkCardCtm: Plugin<[RemarkLinkCardCtmOptions], Root> = (options = {}) => {
	return async (tree) => {
		const blocks: Block[] = [];
		visit(tree, "paragraph", (node, index) => {
			if (node.children.length !== 1) {
				return;
			}
			if (node.data !== undefined) {
				return;
			}
			visit(node, "text", (textNode) => {
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
			if (index === undefined) {
				tree.children.push({
					type: "html",
					value: linkCardHtml,
				} as unknown as any);
			} else {
				tree.children.splice(index, 1, {
					type: "html",
					value: linkCardHtml,
				} as unknown as any);
			}
		}
		return tree;
	};
};

export default remarkLinkCardCtm;
