import { describe, it, expect } from "vitest";
import remarkLinkCardCtm from "./index.js";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
async function processMarkdown(markdown, options = {}) {
    const result = await unified()
        .use(remarkParse)
        .use(remarkLinkCardCtm, options)
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeStringify, { allowDangerousHtml: true })
        .process(markdown);
    return String(result);
}
describe("remarkLinkCardCtm", () => {
    describe("npmjs.com packages", () => {
        it("should generate link card for npm package URL", async () => {
            const markdown = "https://www.npmjs.com/package/react";
            const result = await processMarkdown(markdown);
            expect(result).toContain('class="rlc-container"');
            expect(result).toContain('href="https://www.npmjs.com/package/react"');
            expect(result).toContain('class="rlc-title"');
            expect(result).toContain("npmjs.com");
        }, 30000);
        it("should generate link card for scoped npm package", async () => {
            const markdown = "https://www.npmjs.com/package/@types/node";
            const result = await processMarkdown(markdown);
            expect(result).toContain('class="rlc-container"');
            expect(result).toContain('href="https://www.npmjs.com/package/@types/node"');
            expect(result).toContain('class="rlc-title"');
        }, 30000);
    });
    describe("YouTube URLs", () => {
        it("should generate link card for YouTube channel URL with @", async () => {
            const markdown = "https://www.youtube.com/@Google";
            const result = await processMarkdown(markdown);
            expect(result).toContain('class="rlc-container"');
            expect(result).toContain('href="https://www.youtube.com/@Google"');
            expect(result).toContain('class="rlc-title"');
            expect(result).toContain("youtube.com");
        }, 30000);
        it("should generate link card for YouTube video URL", async () => {
            const markdown = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
            const result = await processMarkdown(markdown);
            expect(result).toContain('class="rlc-container"');
            expect(result).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
            expect(result).toContain('class="rlc-title"');
            expect(result).toContain("YouTube");
        }, 30000);
    });
    describe("options", () => {
        it("should shorten URL when shortenUrl option is true", async () => {
            const markdown = "https://www.npmjs.com/package/react";
            const result = await processMarkdown(markdown, { shortenUrl: true });
            expect(result).toContain('class="rlc-url"');
            expect(result).toContain("www.npmjs.com");
            expect(result).not.toContain('class="rlc-url">https://');
        }, 30000);
        it("should add async lazy attributes when imgAsyncLazy option is true", async () => {
            const markdown = "https://www.npmjs.com/package/react";
            const result = await processMarkdown(markdown, { imgAsyncLazy: true });
            expect(result).toContain('decoding="async"');
            expect(result).toContain('loading="lazy"');
        }, 30000);
    });
    describe("various sites", () => {
        it("should generate link card for tech-lagoon.com", async () => {
            const markdown = "https://tech-lagoon.com/imagechef/image-to-monochrome.html";
            const result = await processMarkdown(markdown);
            expect(result).toContain('class="rlc-container"');
            expect(result).toContain('href="https://tech-lagoon.com/imagechef/image-to-monochrome.html"');
            expect(result).toContain('class="rlc-title"');
        }, 30000);
        it("should generate link card for atwiki.jp", async () => {
            const markdown = "https://w.atwiki.jp/115series/pages/12.html#id_75839f1f";
            const result = await processMarkdown(markdown);
            expect(result).toContain('class="rlc-container"');
            expect(result).toContain('href="https://w.atwiki.jp/115series/pages/12.html#id_75839f1f"');
            expect(result).toContain('class="rlc-title"');
        }, 30000);
    });
    describe("edge cases", () => {
        it("should not convert inline links", async () => {
            const markdown = "Check out [this package](https://www.npmjs.com/package/react)";
            const result = await processMarkdown(markdown);
            expect(result).not.toContain('class="rlc-container"');
            expect(result).toContain("<a");
        });
        it("should not convert multiple URLs in same paragraph", async () => {
            const markdown = "https://www.npmjs.com/package/react https://www.npmjs.com/package/vue";
            const result = await processMarkdown(markdown);
            expect(result).not.toContain('class="rlc-container"');
        });
    });
});
