import { marked } from 'marked';
import DOMPurify from 'dompurify';

/** Parses markdown to HTML and sanitizes with DOMPurify to prevent XSS. */
export function renderMarkdown(text: string): string {
	const html = marked.parse(text, { async: false }) as string;
	return DOMPurify.sanitize(html);
}

/** Abbreviates an Ethereum address: 0x1234…abcd */
export function shortAddr(addr: string): string {
	return addr.slice(0, 6) + '…' + addr.slice(-4);
}
