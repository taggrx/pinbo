import { marked } from 'marked';
import DOMPurify from 'dompurify';

/** Parses markdown to HTML and sanitizes with DOMPurify to prevent XSS. */
export function renderMarkdown(text: string): string {
	const html = marked.parse(text, { async: false }) as string;
	return DOMPurify.sanitize(html);
}
